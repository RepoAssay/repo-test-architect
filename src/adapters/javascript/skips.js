import { parser } from "@lezer/javascript";

// Skipped-test detection on real syntax trees. Blanking deletes coverage
// evidence, so every doubt keeps it: files that do not parse cleanly, framework
// names used in any way other than a framework import or a recognised call, and
// calls outside top level or suite callbacks are never treated as skipped.

const TYPESCRIPT_PARSER = parser.configure({ dialect: "ts" });
const TSX_PARSER = parser.configure({ dialect: "ts jsx" });
const JSX_PARSER = parser.configure({ dialect: "jsx" });

const TEST_CALLEES = new Set(["it", "test", "describe", "suite", "context", "specify"]);
const EXCLUDED_CALLEES = new Set(["xit", "xtest", "xdescribe", "xcontext", "xspecify"]);
const SUITE_CALLEES = new Set(["describe", "context", "suite", "fdescribe"]);
const NODE_OPTION_CALLEES = new Set(["it", "test", "describe", "suite"]);
const FRAMEWORK_MODULES = new Set(["node:test", "vitest", "@jest/globals", "mocha", "@playwright/test", "ava", "bun:test"]);
const FRAMEWORK_NAMES = new Set([...TEST_CALLEES, ...EXCLUDED_CALLEES, ...SUITE_CALLEES]);
// Framework members that may sit between a framework name and the call that uses
// it. Anything else (e.g. `test.skip.mockImplementation(...)`) is not a
// recognised read-only use, so the name is no longer trusted.
const FRAMEWORK_MEMBERS = new Set([
  "skip", "only", "todo", "each", "concurrent", "sequential", "serial", "parallel", "skipIf", "runIf", "describe",
  "fixme", "fail", "fails", "failing", "slow", "step", "extend", "use", "info", "setTimeout", "configure", "shuffle",
  "beforeEach", "afterEach", "beforeAll", "afterAll", "before", "after"
]);
const SKIP_HINT = /\b(?:skip|skipIf|runIf|x(?:it|test|describe|context|specify))\b/;
const COMMENTS = new Set(["LineComment", "BlockComment"]);
const FUNCTIONS = new Set(["ArrowFunction", "FunctionExpression"]);
const MAX_NESTING = 256;

// Returns sorted, non-overlapping [from, to) ranges to blank for statically skipped
// test calls: the callee's own tokens and the callback arguments. Other arguments
// (titles, options, tables) are evaluated eagerly, so they stay.
export function findSkippedJavaScriptTestRanges(filePath, content) {
  if (!SKIP_HINT.test(content) || exceedsNestingLimit(content)) return [];
  const tree = parseWithoutErrors(filePath, content);
  if (!tree) return [];
  const text = (node) => content.slice(node.from, node.to);
  const untrusted = collectUntrustedFrameworkNames(tree, text);
  const ranges = [];
  // Statement lists to inspect: the program, then callback bodies of suite calls.
  const pending = [tree.topNode];
  while (pending.length > 0) {
    const container = pending.pop();
    for (let statement = container.firstChild; statement; statement = statement.nextSibling) {
      if (statement.name !== "ExpressionStatement" || statement.firstChild?.name !== "CallExpression") continue;
      const chain = calleeChain(statement.firstChild, text);
      if (!chain || untrusted.has(chain.base)) continue;
      const finalArgs = chain.steps.at(-1).args;
      if (isSkippedChain(chain, text)) {
        ranges.push(...chain.calleeRanges);
        for (const callback of argumentsOf(finalArgs).filter((argument) => FUNCTIONS.has(argument.name))) ranges.push([callback.from, callback.to]);
      } else if (isSuiteChain(chain)) {
        pending.push(...callbackBodies(finalArgs));
      }
    }
  }
  return ranges.sort((left, right) => left[0] - right[0]);
}

// The parser recovers with error nodes (slowly) beyond a few hundred nesting
// levels, and error trees are never used, so give up early. Brackets inside
// strings can only raise the count (closers clamp at zero), which keeps more
// evidence.
function exceedsNestingLimit(content) {
  let depth = 0;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    if (code === 40 || code === 91 || code === 123) {
      depth += 1;
      if (depth > MAX_NESTING) return true;
    } else if (code === 41 || code === 93 || code === 125) depth = Math.max(0, depth - 1);
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

function sameNode(left, right) {
  return Boolean(left && right) && left.from === right.from && left.to === right.to && left.name === right.name;
}

// `a.b(...).c\`...\`(...)` as { base: "a", steps: [{ property }, { args }, ...] } in
// source order, plus the ranges of the callee's own name tokens. Optional
// chaining, computed members and type arguments are rejected.
function calleeChain(call, text) {
  const steps = [];
  const calleeRanges = [];
  let node = call;
  for (;;) {
    const children = childrenOf(node);
    if (node.name === "VariableName") {
      steps.reverse();
      calleeRanges.push([node.from, node.to]);
      return { base: text(node), steps, calleeRanges };
    }
    if (node.name === "CallExpression" && children.length === 2 && children[1].name === "ArgList") {
      steps.push({ args: children[1] });
    } else if (node.name === "TaggedTemplateExpression" && children.length === 2 && children[1].name === "TemplateString") {
      steps.push({ template: true });
    } else if (node.name === "MemberExpression" && children.length === 3 && children[1].name === "." && children[2].name === "PropertyName") {
      steps.push({ property: text(children[2]) });
      calleeRanges.push([children[1].from, children[2].to]);
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
    .filter((argument) => FUNCTIONS.has(argument.name))
    .map((callback) => callback.getChild("Block"))
    .filter(Boolean);
}

// node:test options object passed before the callback, e.g. `test("x", { skip: true }, fn)`.
// Only a single `skip` whose whole value is `true` or a non-empty string literal
// counts; spreads, shorthand, computed keys and duplicate keys leave the test
// active. `{ todo }` is ignored: node:test still runs TODO callbacks.
function hasNodeTestSkipOption(argList, text) {
  for (const argument of argumentsOf(argList)) {
    if (FUNCTIONS.has(argument.name)) return false;
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

// Framework names with any occurrence other than a plain framework import/require
// binding or the base of a recognised call chain (rebinding, parameters, member
// assignment such as `test.skip = ...`, passing `test` as a value, ...).
function collectUntrustedFrameworkNames(tree, text) {
  const untrusted = new Set();
  tree.iterate({
    enter(ref) {
      if (!["VariableName", "VariableDefinition", "PropertyDefinition"].includes(ref.name)) return;
      const name = text(ref);
      if (!FRAMEWORK_NAMES.has(name) || untrusted.has(name)) return;
      const node = ref.node;
      const trusted = ref.name === "VariableDefinition" ? isFrameworkImport(node, text)
        : ref.name === "PropertyDefinition" ? node.parent?.name === "Property" && childrenOf(node.parent).length > 1
          : (node.parent?.name === "ImportGroup" && node.nextSibling?.name === "as") || isRecognisedCallBase(node, text);
      if (!trusted) untrusted.add(name);
    }
  });
  return untrusted;
}

// The name is the base of `name(.member)*(...)...` where every member before the
// first call is a framework member.
function isRecognisedCallBase(node, text) {
  let current = node;
  for (;;) {
    const parent = current.parent;
    if (parent?.name === "MemberExpression" && sameNode(parent.firstChild, current)) {
      const property = parent.getChild("PropertyName");
      if (!property || !FRAMEWORK_MEMBERS.has(text(property))) return false;
      current = parent;
    } else if (parent?.name === "TaggedTemplateExpression" && sameNode(parent.firstChild, current)) {
      current = parent;
    } else {
      return parent?.name === "CallExpression" && sameNode(parent.firstChild, current);
    }
  }
}

function isFrameworkImport(definition, text) {
  const fromFramework = (stringNode) => stringNode?.name === "String" && FRAMEWORK_MODULES.has(text(stringNode).slice(1, -1));
  const parent = definition.parent;
  if (definition.prevSibling?.name === "as") return false;
  if (parent?.name === "ImportDeclaration") return fromFramework(parent.getChild("String"));
  if (parent?.name === "ImportGroup") return fromFramework(parent.parent?.getChild("String"));
  if (parent?.name !== "PatternProperty" || childrenOf(parent).length !== 1) return false;
  // `const { test } = require("node:test")`: the initializer of this declarator only.
  const pattern = parent.parent;
  if (pattern?.name !== "ObjectPattern" || pattern.parent?.name !== "VariableDeclaration") return false;
  const equals = pattern.nextSibling;
  const initializer = equals?.name === "Equals" ? equals.nextSibling : undefined;
  const parts = initializer?.name === "CallExpression" ? childrenOf(initializer) : [];
  const args = parts[1]?.name === "ArgList" ? argumentsOf(parts[1]) : [];
  return parts.length === 2 && parts[0].name === "VariableName" && text(parts[0]) === "require" && args.length === 1 && fromFramework(args[0]);
}
