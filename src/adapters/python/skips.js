import { parser } from "@lezer/python";

// Skipped-test detection on real syntax trees. A false "skipped" deletes real
// coverage evidence, so only exact, definitely-skipping forms count, every name
// they rely on must be used only in recognised read-only ways, and a file that
// does not parse cleanly reports no skips at all.

const NO_SKIPS = Object.freeze({
  moduleSkipped: false,
  allTestsSkipped: false,
  skippedDefinitionLines: new Set(),
  truncatedDefinitionLines: new Map(),
  liveDecoratorLines: new Map()
});
const SKIP_HINT = /skip/;
const COMMENTS = new Set(["Comment"]);
const DEFINITE_DECORATORS = new Map([
  ["pytest.mark.skip", "always"],
  ["pytest.mark.skipif", "True"],
  ["unittest.skip", "always"],
  ["unittest.skipIf", "True"],
  ["unittest.skipUnless", "False"]
]);
const UNITTEST_SKIP_NAMES = new Map([["skip", "always"], ["skipIf", "True"], ["skipUnless", "False"]]);
const MODULE_NAMES = new Set(["pytest", "unittest"]);
const WATCHED_NAMES = new Set([...MODULE_NAMES, ...UNITTEST_SKIP_NAMES.keys(), "pytestmark"]);

// Returns the module-level skip state, whether every test definition in the tree
// is skipped, and 0-based `def` line indexes of skipped functions and of functions
// whose body stops at an unconditional skip statement.
export function analyzePythonSkips(content) {
  if (!SKIP_HINT.test(content)) return NO_SKIPS;
  const tree = parser.parse(content);
  let clean = true;
  tree.iterate({ enter: (node) => (clean &&= !node.type.isError) });
  if (!clean) return NO_SKIPS;

  const text = (node) => content.slice(node.from, node.to);
  const lineStarts = [0];
  for (let index = content.indexOf("\n"); index >= 0; index = content.indexOf("\n", index + 1)) lineStarts.push(index + 1);
  const lineOf = (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (lineStarts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low;
  };

  const context = {
    text,
    trusted: collectTrustedNames(tree, text),
    skipTestOverridden: isSkipTestOverridden(tree, text),
    liveSkipArguments: false
  };
  const moduleSkipped = isModuleSkipped(tree, context);
  const skippedDefinitionLines = new Set();
  const truncatedDefinitionLines = new Map();
  const liveDecoratorLines = new Map();
  const testsSkipped = [];
  let definesFixture = false;
  let skippedTestRequestsFixtures = false;
  const visit = (container, inheritedSkip) => {
    for (let child = container.firstChild; child; child = child.nextSibling) {
      const decorated = child.name === "DecoratedStatement";
      const definition = decorated ? child.getChild("FunctionDefinition") ?? child.getChild("ClassDefinition") : child;
      if (definition?.name !== "FunctionDefinition" && definition?.name !== "ClassDefinition") {
        visit(child, inheritedSkip);
        continue;
      }
      const decorators = decorated ? child.getChildren("Decorator") : [];
      if (decorators.some((decorator) => /^@\s*(?:pytest\s*\.\s*)?fixture\b/.test(text(decorator)))) definesFixture = true;
      const skipDecorators = decorators.filter((decorator) => isDefiniteSkipDecorator(decorator, context));
      const skipped = inheritedSkip || skipDecorators.length > 0;
      const body = definition.getChild("Body");
      if (definition.name === "ClassDefinition") {
        if (body) visit(body, skipped);
        continue;
      }
      const definitionLine = lineOf(definition.from);
      // A skipped body is excluded whatever the skip's arguments are; an imperative
      // skip keeps its own statement (whose arguments run) and drops what follows.
      const imperative = skipped ? undefined : body && imperativeSkip(body, context);
      if (skipped) skippedDefinitionLines.add(definitionLine);
      else if (imperative?.truncatable) truncatedDefinitionLines.set(definitionLine, lineOf(imperative.statement.to) + 1);
      // Calls in a skip decorator's arguments run at import: the decorator lines stay
      // as the skipped function's only evidence.
      const liveDecorators = skipDecorators.filter((decorator) => {
        const argList = decorator.getChild("ArgList");
        return argList && !hasInertArguments(argList);
      });
      if (liveDecorators.length > 0) liveDecoratorLines.set(definitionLine, [lineOf(liveDecorators[0].from), lineOf(liveDecorators.at(-1).to - 1) + 1]);
      // Module- and class-level definitions are the ones pytest/unittest collect.
      const testSkipped = moduleSkipped || skipped || Boolean(imperative?.first && imperative.truncatable);
      if (!text(definition.getChild("VariableName") ?? definition).startsWith("test")) continue;
      testsSkipped.push(testSkipped);
      // Requested fixtures run before the test body reaches an imperative skip.
      const parameters = definition.getChild("ParamList")?.getChildren("VariableName") ?? [];
      if (testSkipped && parameters.some((parameter) => !["self", "cls"].includes(text(parameter)))) skippedTestRequestsFixtures = true;
    }
  };
  visit(tree.topNode, false);
  return {
    moduleSkipped,
    // Code that still runs keeps the module (and that evidence) alive: skip
    // arguments that call code, and fixtures that tests may request.
    allTestsSkipped: !context.liveSkipArguments && !definesFixture && !skippedTestRequestsFixtures &&
      testsSkipped.length > 0 && testsSkipped.every(Boolean),
    skippedDefinitionLines,
    truncatedDefinitionLines,
    liveDecoratorLines
  };
}

function childrenOf(node) {
  const children = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (!COMMENTS.has(child.name)) children.push(child);
  }
  return children;
}

function sameNode(left, right) {
  return Boolean(left && right) && left.from === right.from && left.to === right.to && left.name === right.name;
}

function isTopLevel(node) {
  const parent = node.parent;
  return parent?.name === "Script" || (parent?.name === "StatementGroup" && parent.parent?.name === "Script");
}

// Watched names whose every occurrence is a recognised read-only use:
// - `pytest`/`unittest`: `import pytest`, a `from` module path, a decorator head,
//   or the base of a member read/call outside assignment and `del` targets;
// - bare `skip`/`skipIf`/`skipUnless`: an unaliased `from unittest import`, a
//   decorator head or a call;
// - `pytestmark`: the single target of a plain top-level assignment.
// Any other occurrence (rebinding, parameters, `del`, `pytestmark.clear()`, ...)
// leaves the name untrusted.
function collectTrustedNames(tree, text) {
  const seen = new Set();
  const untrusted = new Set();
  const importedFromUnittest = new Set();
  tree.iterate({
    enter(ref) {
      if (ref.name !== "VariableName") return;
      const name = text(ref);
      if (!WATCHED_NAMES.has(name)) return;
      seen.add(name);
      const node = ref.node;
      const statement = node.parent;
      if (statement?.name === "ImportStatement") {
        const statementText = text(statement);
        const importKeyword = childrenOf(statement).find((child) => child.name === "import");
        if (/\bas\b/.test(statementText)) untrusted.add(name);
        else if (statement.firstChild?.name === "from" && importKeyword && node.from < importKeyword.from) return;
        else if (MODULE_NAMES.has(name) && statement.firstChild?.name === "import") return;
        else if (UNITTEST_SKIP_NAMES.has(name) && /^from\s+unittest\s+import\b/.test(statementText)) importedFromUnittest.add(name);
        else untrusted.add(name);
        return;
      }
      if (statement?.name === "Decorator") {
        // Only the head names a binding; later names are attributes (`@pytest.mark.skip`).
        if (name === "pytestmark" && sameNode(node.prevSibling, statement.firstChild)) untrusted.add(name);
        return;
      }
      if (name === "pytestmark") {
        const parts = statement?.name === "AssignStatement" ? childrenOf(statement) : [];
        const single = parts.filter((part) => part.name === "AssignOp").length === 1 && parts.at(-2)?.name === "AssignOp";
        if (!(single && sameNode(parts[0], node) && isTopLevel(statement))) untrusted.add(name);
        return;
      }
      if (!isReadOnlyUse(node, MODULE_NAMES.has(name))) untrusted.add(name);
    }
  });
  const trusted = new Set([...seen].filter((name) => !untrusted.has(name)));
  for (const name of UNITTEST_SKIP_NAMES.keys()) {
    if (!importedFromUnittest.has(name)) trusted.delete(name);
  }
  for (const name of [...MODULE_NAMES, "pytestmark"]) {
    if (!seen.has(name)) trusted.add(name);
  }
  return trusted;
}

function isReadOnlyUse(node, memberReadsAllowed) {
  let current = node;
  while (current.parent?.name === "MemberExpression" && sameNode(current.parent.firstChild, current)) current = current.parent;
  const parent = current.parent;
  const called = parent?.name === "CallExpression" && sameNode(parent.firstChild, current);
  const memberRead = memberReadsAllowed && !sameNode(current, node) && Boolean(parent);
  return (called || memberRead) && !isBindingTarget(current);
}

// Whether the expression is (part of) an assignment, augmented assignment, `del`
// or `for` target, including inside tuple/list/starred/parenthesised patterns such
// as `(pytest.skip,) = ...`.
function isBindingTarget(node) {
  for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.name === "DeleteStatement") return true;
    const children = childrenOf(ancestor);
    if (ancestor.name === "AssignStatement" || ancestor.name === "UpdateStatement") {
      const operator = children.findLast((child) => child.name === "AssignOp" || child.name === "UpdateOp");
      return !operator || node.from < operator.from;
    }
    const forKeyword = children.find((child) => child.name === "for");
    const inKeyword = children.find((child) => child.name === "in" && child.from > (forKeyword?.from ?? Infinity));
    if (forKeyword && inKeyword && node.from > forKeyword.from && node.to <= inKeyword.from) return true;
  }
  return false;
}

// `a.b.c` from VariableName/MemberExpression nodes; undefined for anything else.
function dottedName(node, text) {
  if (node?.name === "VariableName") return text(node);
  const children = node?.name === "MemberExpression" ? childrenOf(node) : [];
  if (children.length !== 3 || children[1].name !== "." || children[2].name !== "PropertyName") return undefined;
  const object = dottedName(children[0], text);
  return object && `${object}.${text(children[2])}`;
}

function isTrustedDottedName(name, trusted) {
  return Boolean(name) && trusted.has(name.split(".")[0]);
}

// The first positional argument (or `condition=`) when it is a bare True/False literal.
function literalCondition(argList, text) {
  const children = childrenOf(argList).filter((child) => child.name !== "(" && child.name !== ")");
  const commaIndex = children.findIndex((child) => child.name === ",");
  const first = commaIndex < 0 ? children : children.slice(0, commaIndex);
  const value = first.length === 1 ? first[0]
    : first.length === 3 && first[0].name === "VariableName" && text(first[0]) === "condition" && first[1].name === "AssignOp" ? first[2]
      : undefined;
  return value?.name === "Boolean" ? text(value) : undefined;
}

// Skip arguments that call code (directly or in f-string replacements) run even
// though the test is skipped, so a module with such skip arguments is never
// dropped as a whole. Literals, names and attribute reads (`reason=REASON`) do not
// call anything.
function hasInertArguments(argList) {
  const stack = [argList];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.name === "CallExpression" || node.name === "FormatReplacement") return false;
    for (let child = node.firstChild; child; child = child.nextSibling) stack.push(child);
  }
  return true;
}

function isDefiniteSkip(kind, argList, requireCall, context) {
  const definite = Boolean(kind) && (kind === "always"
    ? !requireCall || Boolean(argList)
    : Boolean(argList) && literalCondition(argList, context.text) === kind);
  if (definite && argList && !hasInertArguments(argList)) context.liveSkipArguments = true;
  return definite;
}

// Decorators are flat `@ Name . Name ... ArgList?` sequences in this grammar.
function isDefiniteSkipDecorator(decorator, context) {
  const { text, trusted } = context;
  const parts = childrenOf(decorator).slice(1);
  const argList = parts.at(-1)?.name === "ArgList" ? parts.pop() : undefined;
  if (parts.length === 0 || parts.some((part, index) => part.name !== (index % 2 === 0 ? "VariableName" : "."))) return false;
  const name = parts.filter((part) => part.name === "VariableName").map(text).join(".");
  if (!isTrustedDottedName(name, trusted)) return false;
  const kind = DEFINITE_DECORATORS.get(name) ?? UNITTEST_SKIP_NAMES.get(name);
  return isDefiniteSkip(kind, argList, !name.startsWith("pytest."), context);
}

// `pytest.mark.skip`, `pytest.mark.skip(...)` or `pytest.mark.skipif(True, ...)` as an expression.
function isDefiniteSkipMark(node, context) {
  const { text, trusted } = context;
  if (!trusted.has("pytest")) return false;
  if (node.name === "CallExpression") {
    const [callee, argList, ...rest] = childrenOf(node);
    if (rest.length > 0 || argList?.name !== "ArgList") return false;
    const name = dottedName(callee, text);
    return (name === "pytest.mark.skip" || name === "pytest.mark.skipif") && isDefiniteSkip(DEFINITE_DECORATORS.get(name), argList, true, context);
  }
  return dottedName(node, text) === "pytest.mark.skip";
}

// The first statement of the body that is exactly `pytest.skip(...)` or
// `self.skipTest(...)`. The statement itself runs (its arguments are evaluated), so
// only what follows is dropped: `first` (the test is skipped) when only docstrings
// precede it; `truncatable` when it ends its line, so the lines after it never run.
function imperativeSkip(body, context) {
  const { text, trusted, skipTestOverridden } = context;
  let onlyDocstrings = true;
  const statements = childrenOf(body).filter((statement) => statement.name !== ":");
  for (const [index, statement] of statements.entries()) {
    const expression = statement.name === "ExpressionStatement" ? childrenOf(statement) : [];
    if (expression.length === 1 && expression[0].name === "CallExpression") {
      const callee = dottedName(expression[0].firstChild, text);
      if ((callee === "pytest.skip" && trusted.has("pytest")) || (callee === "self.skipTest" && !skipTestOverridden)) {
        const argList = expression[0].getChild("ArgList");
        const next = statements[index + 1];
        const endsLine = !next || text({ from: statement.to, to: next.from }).includes("\n");
        if (onlyDocstrings && argList && !hasInertArguments(argList)) context.liveSkipArguments = true;
        return { statement, first: onlyDocstrings, truncatable: endsLine };
      }
    }
    if (!(expression.length === 1 && expression[0].name === "String")) onlyDocstrings = false;
  }
  return undefined;
}

// `skipTest` may only appear as the callee of `self.skipTest(...)`; any definition,
// assignment or other reference means it may not abort.
function isSkipTestOverridden(tree, text) {
  let overridden = false;
  tree.iterate({
    enter(ref) {
      if (overridden || (ref.name !== "VariableName" && ref.name !== "PropertyName") || text(ref) !== "skipTest") return;
      const member = ref.node.parent;
      overridden = !(ref.name === "PropertyName" && member?.name === "MemberExpression" &&
        member.parent?.name === "CallExpression" && sameNode(member.parent.firstChild, member));
    }
  });
  return overridden;
}

// The last top-level `pytestmark` assignment decides (every occurrence must be such
// an assignment, see collectTrustedNames) and its whole value must be a definite
// skip mark or a list/tuple containing one. An unindented
// `pytest.skip(..., allow_module_level=True)` statement also skips the module.
function isModuleSkipped(tree, context) {
  const { text, trusted } = context;
  if (!trusted.has("pytest")) return false;
  let lastPytestmark;
  let moduleLevelSkip = false;
  tree.iterate({
    enter(ref) {
      const node = ref.node;
      if (ref.name === "AssignStatement" && isTopLevel(node) && node.firstChild?.name === "VariableName" && text(node.firstChild) === "pytestmark") {
        lastPytestmark = node;
      } else if (ref.name === "ExpressionStatement" && isTopLevel(node)) {
        const [call, ...rest] = childrenOf(node);
        if (rest.length > 0 || call?.name !== "CallExpression" || dottedName(call.firstChild, text) !== "pytest.skip") return;
        const argList = call.getChild("ArgList");
        if (!argList || !/(?:^|[(,])\s*allow_module_level\s*=\s*True\s*(?:[,)]|$)/.test(text(argList))) return;
        moduleLevelSkip = true;
        if (!hasInertArguments(argList)) context.liveSkipArguments = true;
      }
    }
  });
  if (moduleLevelSkip) return true;
  if (!lastPytestmark || !trusted.has("pytestmark")) return false;
  const value = childrenOf(lastPytestmark).at(-1);
  if (value.name === "ArrayExpression" || value.name === "TupleExpression") {
    return childrenOf(value).some((element) => isDefiniteSkipMark(element, context));
  }
  return isDefiniteSkipMark(value, context);
}
