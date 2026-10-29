import { parser } from "@lezer/javascript";

// Skipped-test detection on real syntax trees. Blanking deletes coverage
// evidence, so every doubt keeps it: files that do not parse cleanly, callees
// that are rebound locally, and calls outside top level or suite callbacks are
// never treated as skipped.

const TYPESCRIPT_PARSER = parser.configure({ dialect: "ts" });
const TSX_PARSER = parser.configure({ dialect: "ts jsx" });
const JSX_PARSER = parser.configure({ dialect: "jsx" });

const TEST_CALLEES = new Set(["it", "test", "describe", "suite", "context", "specify"]);
const EXCLUDED_CALLEES = new Set(["xit", "xtest", "xdescribe", "xcontext", "xspecify"]);
const SUITE_CALLEES = new Set(["describe", "context", "suite", "fdescribe"]);
const NODE_OPTION_CALLEES = new Set(["it", "test", "describe", "suite"]);
const FRAMEWORK_MODULES = new Set(["node:test", "vitest", "@jest/globals", "mocha", "@playwright/test", "ava", "bun:test"]);
const FRAMEWORK_NAMES = new Set([...TEST_CALLEES, ...EXCLUDED_CALLEES, ...SUITE_CALLEES]);
const SKIP_HINT = /\b(?:skip|skipIf|runIf|x(?:it|test|describe|context|specify))\b/;
const COMMENTS = new Set(["LineComment", "BlockComment"]);
const MAX_NESTING = 256;

// Returns sorted, non-overlapping [from, to) ranges of statically skipped test calls.
export function findSkippedJavaScriptTestRanges(filePath, content) {
  if (!SKIP_HINT.test(content) || exceedsNestingLimit(content)) return [];
  const tree = parseWithoutErrors(filePath, content);
  if (!tree) return [];
  const text = (node) => content.slice(node.from, node.to);
  const rebound = collectReboundFrameworkNames(tree, text);
  const ranges = [];
  // Statement lists to inspect: the program, then callback bodies of suite calls.
  const pending = [tree.topNode];
  while (pending.length > 0) {
    const container = pending.pop();
    for (let statement = container.firstChild; statement; statement = statement.nextSibling) {
      if (statement.name !== "ExpressionStatement" || statement.firstChild?.name !== "CallExpression") continue;
      const call = statement.firstChild;
      const chain = calleeChain(call, text);
      if (!chain || rebound.has(chain.base)) continue;
      if (isSkippedChain(chain, text)) ranges.push([call.from, call.to]);
      else if (isSuiteChain(chain)) pending.push(...callbackBodies(chain.steps.at(-1).args));
    }
  }
  return ranges.sort((left, right) => left[0] - right[0]);
}

// The parser recovers with error nodes (slowly) beyond a few hundred nesting
// levels, and error trees are never used, so give up early. Over-counting
// brackets inside strings only makes this keep more evidence.
function exceedsNestingLimit(content) {
  let depth = 0;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    if (code === 40 || code === 91 || code === 123) {
      depth += 1;
      if (depth > MAX_NESTING) return true;
    } else if (code === 41 || code === 93 || code === 125) depth -= 1;
  }
  return false;
}

function parseWithoutErrors(filePath, content) {
  const parsers = /\.[cm]?ts$/.test(filePath) ? [TYPESCRIPT_PARSER]
    : /\.tsx$/.test(filePath) ? [TSX_PARSER]
      : /\.jsx$/.test(filePath) ? [JSX_PARSER]
        : /<[A-Za-z>]/.test(content) ? [parser, JSX_PARSER] : [parser];
  for (const candidate of parsers) {
    const tree = candidate.parse(content);
    let clean = true;
    tree.iterate({ enter: (node) => (clean &&= !node.type.isError) });
    if (clean) return tree;
  }
  return undefined;
}

function childrenOf(node) {
  const children = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (!COMMENTS.has(child.name)) children.push(child);
  }
  return children;
}

function argumentsOf(argList) {
  return childrenOf(argList).filter((child) => !["(", ")", ","].includes(child.name));
}

// `a.b(...).c\`...\`(...)` as { base: "a", steps: [{ property }, { args }, ...] } in
// source order. Optional chaining, computed members and type arguments are rejected.
function calleeChain(call, text) {
  const steps = [];
  let node = call;
  for (;;) {
    const children = childrenOf(node);
    if (node.name === "VariableName") {
      steps.reverse();
      return { base: text(node), steps };
    }
    if (node.name === "CallExpression" && children.length === 2 && children[1].name === "ArgList") {
      steps.push({ args: children[1] });
    } else if (node.name === "TaggedTemplateExpression" && children.length === 2 && children[1].name === "TemplateString") {
      steps.push({ template: true });
    } else if (node.name === "MemberExpression" && children.length === 3 && children[1].name === "." && children[2].name === "PropertyName") {
      steps.push({ property: text(children[2]) });
    } else {
      return undefined;
    }
    node = children[0];
  }
}

function isSkippedChain({ base, steps }, text) {
  if (EXCLUDED_CALLEES.has(base)) return true;
  if (!TEST_CALLEES.has(base)) return false;
  for (let index = 0; index < steps.length; index += 1) {
    const { property } = steps[index];
    if (property === "skip") return true;
    const literal = property === "skipIf" ? "true" : property === "runIf" ? "false" : undefined;
    const args = steps[index + 1]?.args && argumentsOf(steps[index + 1].args);
    if (literal && args?.length === 1 && args[0].name === "BooleanLiteral" && text(args[0]) === literal) return true;
  }
  return NODE_OPTION_CALLEES.has(base) && steps.length === 1 && steps[0].args !== undefined && hasNodeTestSkipOption(steps[0].args, text);
}

function isSuiteChain({ base, steps }) {
  const properties = steps.flatMap((step) => (step.property ? [step.property] : []));
  if (!steps.at(-1)?.args || properties.includes("skip")) return false;
  return SUITE_CALLEES.has(base) || (base === "test" && properties[0] === "describe");
}

function callbackBodies(argList) {
  return argumentsOf(argList)
    .filter((argument) => argument.name === "ArrowFunction" || argument.name === "FunctionExpression")
    .map((callback) => callback.getChild("Block"))
    .filter(Boolean);
}

// node:test options object passed before the callback, e.g. `test("x", { skip: true }, fn)`.
// Only a single `skip` whose whole value is `true` or a non-empty string literal
// counts; spreads, shorthand, computed keys and duplicate keys leave the test
// active. `{ todo }` is ignored: node:test still runs TODO callbacks.
function hasNodeTestSkipOption(argList, text) {
  for (const argument of argumentsOf(argList)) {
    if (argument.name === "ArrowFunction" || argument.name === "FunctionExpression") return false;
    if (argument.name !== "ObjectExpression") continue;
    const skipValues = [];
    for (const member of childrenOf(argument)) {
      if (["{", "}", ","].includes(member.name)) continue;
      const parts = member.name === "Property" ? childrenOf(member) : [];
      if (parts.length !== 3 || parts[0].name !== "PropertyDefinition" || parts[1].name !== ":") return false;
      if (text(parts[0]) === "skip") skipValues.push(parts[2]);
    }
    if (skipValues.length !== 1) return false;
    const [value] = skipValues;
    return (value.name === "BooleanLiteral" && text(value) === "true") || (value.name === "String" && value.to - value.from > 2);
  }
  return false;
}

// Framework callee names declared or assigned anywhere in the file other than by a
// plain (unaliased) import or `require` destructuring from a known test framework.
function collectReboundFrameworkNames(tree, text) {
  const rebound = new Set();
  tree.iterate({
    enter(ref) {
      if (ref.name === "VariableDefinition") {
        const name = text(ref);
        if (FRAMEWORK_NAMES.has(name) && !isFrameworkImport(ref.node, text)) rebound.add(name);
      } else if (ref.name === "AssignmentExpression") {
        const target = ref.node.firstChild;
        if (target?.name === "VariableName" && FRAMEWORK_NAMES.has(text(target))) rebound.add(text(target));
      }
    }
  });
  return rebound;
}

function isFrameworkImport(definition, text) {
  const fromFramework = (stringNode) => stringNode?.name === "String" && FRAMEWORK_MODULES.has(text(stringNode).slice(1, -1));
  const parent = definition.parent;
  if (definition.prevSibling?.name === "as") return false;
  if (parent?.name === "ImportDeclaration") return fromFramework(parent.getChild("String"));
  if (parent?.name === "ImportGroup") return fromFramework(parent.parent?.getChild("String"));
  if (parent?.name !== "PatternProperty" || childrenOf(parent).length !== 1 || parent.parent?.name !== "ObjectPattern") return false;
  const declaration = parent.parent.parent;
  const initializer = declaration?.name === "VariableDeclaration" ? declaration.getChild("CallExpression") : undefined;
  const callee = initializer?.firstChild;
  const args = initializer?.getChild("ArgList") && argumentsOf(initializer.getChild("ArgList"));
  return callee?.name === "VariableName" && text(callee) === "require" && args?.length === 1 && fromFramework(args[0]);
}
