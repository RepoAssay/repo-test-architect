import { parser } from "@lezer/python";

// Skipped-test detection on real syntax trees. A false "skipped" deletes real
// coverage evidence, so only exact, definitely-skipping forms count, and a file
// that does not parse cleanly reports no skips at all.

const NO_SKIPS = Object.freeze({ moduleSkipped: false, skippedDefinitionLines: new Set(), truncatedDefinitionLines: new Map() });
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

// Returns the module-level skip state plus 0-based `def` line indexes of skipped
// functions and of functions whose body stops at an unconditional skip statement.
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
    skipTestOverridden: isSkipTestOverridden(tree, text),
    unittestImports: collectUnittestSkipImports(tree, text)
  };
  const skippedDefinitionLines = new Set();
  const truncatedDefinitionLines = new Map();
  const visit = (container, inheritedSkip) => {
    for (let child = container.firstChild; child; child = child.nextSibling) {
      const decorated = child.name === "DecoratedStatement";
      const definition = decorated ? child.getChild("FunctionDefinition") ?? child.getChild("ClassDefinition") : child;
      if (definition?.name !== "FunctionDefinition" && definition?.name !== "ClassDefinition") {
        visit(child, inheritedSkip);
        continue;
      }
      const skipped = inheritedSkip || (decorated && child.getChildren("Decorator").some((decorator) => isDefiniteSkipDecorator(decorator, context)));
      const body = definition.getChild("Body");
      if (definition.name === "ClassDefinition") {
        if (body) visit(body, skipped);
        continue;
      }
      const definitionLine = lineOf(definition.from);
      const imperative = body && imperativeSkip(body, context);
      if (skipped || imperative?.first) skippedDefinitionLines.add(definitionLine);
      else if (imperative?.truncatable) truncatedDefinitionLines.set(definitionLine, lineOf(imperative.statement.from));
    }
  };
  visit(tree.topNode, false);
  return { moduleSkipped: isModuleSkipped(tree, context), skippedDefinitionLines, truncatedDefinitionLines };
}

function childrenOf(node) {
  const children = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (!COMMENTS.has(child.name)) children.push(child);
  }
  return children;
}

// `a.b.c` from VariableName/MemberExpression nodes; undefined for anything else.
function dottedName(node, text) {
  if (node?.name === "VariableName") return text(node);
  const children = node?.name === "MemberExpression" ? childrenOf(node) : [];
  if (children.length !== 3 || children[1].name !== "." || children[2].name !== "PropertyName") return undefined;
  const object = dottedName(children[0], text);
  return object && `${object}.${text(children[2])}`;
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

function isDefiniteSkip(kind, argList, requireCall, text) {
  if (!kind) return false;
  if (kind === "always") return !requireCall || Boolean(argList);
  return Boolean(argList) && literalCondition(argList, text) === kind;
}

// Decorators are flat `@ Name . Name ... ArgList?` sequences in this grammar.
function isDefiniteSkipDecorator(decorator, { text, unittestImports }) {
  const parts = childrenOf(decorator).slice(1);
  const argList = parts.at(-1)?.name === "ArgList" ? parts.pop() : undefined;
  if (parts.length === 0 || parts.some((part, index) => part.name !== (index % 2 === 0 ? "VariableName" : "."))) return false;
  const name = parts.filter((part) => part.name === "VariableName").map(text).join(".");
  const kind = DEFINITE_DECORATORS.get(name) ?? (unittestImports.has(name) ? UNITTEST_SKIP_NAMES.get(name) : undefined);
  return isDefiniteSkip(kind, argList, !name.startsWith("pytest."), text);
}

// `pytest.mark.skip`, `pytest.mark.skip(...)` or `pytest.mark.skipif(True, ...)` as an expression.
function isDefiniteSkipMark(node, text) {
  if (node.name === "CallExpression") {
    const [callee, argList, ...rest] = childrenOf(node);
    if (rest.length > 0 || argList?.name !== "ArgList") return false;
    const name = dottedName(callee, text);
    return (name === "pytest.mark.skip" || name === "pytest.mark.skipif") && isDefiniteSkip(DEFINITE_DECORATORS.get(name), argList, true, text);
  }
  return dottedName(node, text) === "pytest.mark.skip";
}

// The first statement of the body that is exactly `pytest.skip(...)` or
// `self.skipTest(...)`. `first` when only docstrings precede it; `truncatable` when it
// starts its own line, so the lines from there on never run.
function imperativeSkip(body, { text, skipTestOverridden }) {
  let onlyDocstrings = true;
  let previous;
  for (const statement of childrenOf(body)) {
    if (statement.name === ":") continue;
    const expression = statement.name === "ExpressionStatement" ? childrenOf(statement) : [];
    if (expression.length === 1 && expression[0].name === "CallExpression") {
      const callee = dottedName(expression[0].firstChild, text);
      if (callee === "pytest.skip" || (callee === "self.skipTest" && !skipTestOverridden)) {
        const startsLine = /\n[ \t]*$/.test(text({ from: previous?.to ?? body.from, to: statement.from }));
        return { statement, first: onlyDocstrings, truncatable: startsLine };
      }
    }
    if (!(expression.length === 1 && expression[0].name === "String")) onlyDocstrings = false;
    previous = statement;
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
        member.parent?.name === "CallExpression" && member.parent.firstChild?.from === member.from && member.parent.firstChild?.to === member.to);
    }
  });
  return overridden;
}

function collectUnittestSkipImports(tree, text) {
  const names = new Set();
  tree.iterate({
    enter(ref) {
      if (ref.name !== "ImportStatement") return;
      const match = text(ref).match(/^from\s+unittest\s+import\s+([\w\s,]+)$/);
      for (const name of match?.[1].split(",").map((part) => part.trim()) ?? []) {
        if (UNITTEST_SKIP_NAMES.has(name)) names.add(name);
      }
    }
  });
  return names;
}

function isTopLevel(node) {
  const parent = node.parent;
  return parent?.name === "Script" || (parent?.name === "StatementGroup" && parent.parent?.name === "Script");
}

function isInsideDefinition(node) {
  for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.name === "FunctionDefinition" || ancestor.name === "ClassDefinition") return true;
  }
  return false;
}

// The last module-scope assignment to `pytestmark` decides; it must be a plain
// top-level assignment whose whole value is a definite skip mark or a list/tuple
// containing one. An unindented `pytest.skip(..., allow_module_level=True)`
// statement also skips the module.
function isModuleSkipped(tree, { text }) {
  let lastPytestmark;
  let moduleLevelSkip = false;
  tree.iterate({
    enter(ref) {
      const node = ref.node;
      if ((ref.name === "AssignStatement" || ref.name === "UpdateStatement") && !isInsideDefinition(node)) {
        const operator = childrenOf(node).findIndex((child) => child.name === "AssignOp" || child.name === "UpdateOp");
        const targets = childrenOf(node).slice(0, Math.max(operator, 0));
        if (targets.some((target) => /\bpytestmark\b/.test(text(target)))) lastPytestmark = node;
      } else if (ref.name === "ExpressionStatement" && isTopLevel(node)) {
        const [call, ...rest] = childrenOf(node);
        if (rest.length > 0 || call?.name !== "CallExpression" || dottedName(call.firstChild, text) !== "pytest.skip") return;
        const argList = call.getChild("ArgList");
        moduleLevelSkip ||= Boolean(argList) && /(?:^|[(,])\s*allow_module_level\s*=\s*True\s*(?:[,)]|$)/.test(text(argList));
      }
    }
  });
  if (moduleLevelSkip) return true;
  if (!lastPytestmark || lastPytestmark.name !== "AssignStatement" || !isTopLevel(lastPytestmark)) return false;
  const parts = childrenOf(lastPytestmark);
  const isTarget = parts[0]?.name === "VariableName" && text(parts[0]) === "pytestmark";
  const operators = parts.filter((part) => part.name === "AssignOp");
  const value = parts.at(-1);
  if (!isTarget || operators.length !== 1 || parts.at(-2)?.name !== "AssignOp") return false;
  if (value.name === "ArrayExpression" || value.name === "TupleExpression") {
    return childrenOf(value).some((element) => isDefiniteSkipMark(element, text));
  }
  return isDefiniteSkipMark(value, text);
}
