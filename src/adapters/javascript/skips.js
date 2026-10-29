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
const SKIPPED_SUITE_CALLEES = new Set([...SUITE_CALLEES, "xdescribe", "xcontext"]);
const HOOK_CALLEES = new Set(["before", "after", "beforeEach", "afterEach", "beforeAll", "afterAll"]);
const NODE_OPTION_CALLEES = new Set(["it", "test", "describe", "suite"]);
const FRAMEWORK_MODULES = new Set(["node:test", "vitest", "@jest/globals", "mocha", "@playwright/test", "ava", "bun:test"]);
const FRAMEWORK_NAMES = new Set([...TEST_CALLEES, ...EXCLUDED_CALLEES, ...SUITE_CALLEES, ...HOOK_CALLEES]);
// Documented framework members (Jest, Vitest, node:test, Mocha, Playwright, Bun)
// that may sit between a framework name and the call that uses it. Anything else
// (e.g. `test.skip.mockImplementation(...)`) is not a recognised read-only use,
// so the name is no longer trusted.
const FRAMEWORK_MEMBERS = new Set([
  "skip", "only", "todo", "each", "for", "concurrent", "sequential", "serial", "parallel", "shuffle", "skipIf", "runIf",
  "if", "todoIf", "describe", "fixme", "fail", "fails", "failing", "slow", "step", "extend", "scoped", "use", "info",
  "setTimeout", "configure", "beforeEach", "afterEach", "beforeAll", "afterAll", "before", "after"
]);
const SKIP_HINT = /\b(?:skip|skipIf|runIf|x(?:it|test|describe|context|specify))\b/;
const COMMENTS = new Set(["LineComment", "BlockComment"]);
const FUNCTIONS = new Set(["ArrowFunction", "FunctionExpression"]);
const EAGER_CALLS = new Set(["CallExpression", "NewExpression", "TaggedTemplateExpression"]);
const MAX_NESTING = 256;

// Runners that never call a skipped suite's callback; elsewhere (Mocha, Jest,
// Vitest, Playwright, globals) the callback runs to collect tests.
const NON_COLLECTING_MODULES = new Set(["node:test", "bun:test"]);

// Returns sorted, non-overlapping [from, to) ranges to blank for statically skipped
// test calls: the callee's own tokens and function expressions in its arguments
// that are never called while the arguments are built (callbacks, functions in
// `.each` tables). Everything else in the arguments is evaluated eagerly, so it
// stays. Where a skipped suite still runs its callback to collect tests, that
// callback stays and the tests and hooks registered inside it are skipped instead.
export function findSkippedJavaScriptTestRanges(filePath, content) {
  if (!SKIP_HINT.test(content) || exceedsNestingLimit(content)) return [];
  const tree = parseWithoutErrors(filePath, content);
  if (!tree) return [];
  const text = (node) => content.slice(node.from, node.to);
  const { untrusted, nonCollecting } = collectFrameworkNameTrust(tree, text);
  const soleCallbacks = collectSoleUseFunctions(tree, text);
  const ranges = [];
  const skippedSuiteBodies = [];
  const skip = (chain) => {
    ranges.push(...chain.calleeRanges);
    const collecting = isSuiteLikeChain(chain) && !nonCollecting.has(chain.base);
    for (const [index, step] of chain.steps.entries()) {
      if (!step.args) continue;
      const final = index === chain.steps.length - 1;
      for (const argument of argumentsOf(step.args)) {
        const block = collecting && final && FUNCTIONS.has(argument.name) ? argument.getChild("Block") : undefined;
        if (block) skippedSuiteBodies.push(block);
        else if (final && argument.name === "VariableName" && soleCallbacks.has(text(argument))) ranges.push(soleCallbacks.get(text(argument)));
        else ranges.push(...dormantFunctionRanges(argument));
      }
    }
  };

  // Statement lists of active code: the program, then callback bodies of suite calls.
  const pending = [tree.topNode];
  while (pending.length > 0) {
    const container = pending.pop();
    for (let statement = container.firstChild; statement; statement = statement.nextSibling) {
      if (statement.name !== "ExpressionStatement" || statement.firstChild?.name !== "CallExpression") continue;
      const chain = calleeChain(statement.firstChild, text);
      if (!chain || untrusted.has(chain.base)) continue;
      if (isSkippedChain(chain, text)) skip(chain);
      else if (isSuiteChain(chain)) pending.push(...callbackBodies(chain.steps.at(-1).args));
    }
  }
  // Every framework call anywhere inside a collected skipped suite (loops, helper
  // callbacks such as `cases.forEach(...)`) registers a skipped test or hook.
  // Framework names are trusted file-wide, so these calls are the framework's.
  while (skippedSuiteBodies.length > 0) {
    const stack = [skippedSuiteBodies.pop()];
    while (stack.length > 0) {
      const node = stack.pop();
      const chain = node.name === "CallExpression" ? calleeChain(node, text) : undefined;
      if (chain && FRAMEWORK_NAMES.has(chain.base) && !untrusted.has(chain.base)) {
        skip(chain);
        continue;
      }
      for (let child = node.firstChild; child; child = child.nextSibling) stack.push(child);
    }
  }
  return mergeRanges(ranges);
}

function mergeRanges(ranges) {
  const merged = [];
  for (const [start, end] of ranges.sort((left, right) => left[0] - right[0])) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

// Function expressions in an argument that nothing calls while the argument is
// evaluated. Anything under an inner call (`cases.map(fn)`, an IIFE) may run
// eagerly, so it stays.
function dormantFunctionRanges(argument) {
  const ranges = [];
  const stack = [argument];
  while (stack.length > 0) {
    const node = stack.pop();
    if (FUNCTIONS.has(node.name)) ranges.push([node.from, node.to]);
    else if (!EAGER_CALLS.has(node.name)) {
      for (let child = node.firstChild; child; child = child.nextSibling) stack.push(child);
    }
  }
  return ranges;
}

// `const name = () => ...` / `function name() {...}` whose name is defined once and
// referenced exactly once in the file, mapped to the range of the function's
// code. When that one reference is a skipped test's callback, the code never runs.
function collectSoleUseFunctions(tree, text) {
  const definitions = new Map();
  const references = new Map();
  tree.iterate({
    enter(ref) {
      // Shorthand properties (`{ check }`) are references too.
      const shorthand = ref.name === "PropertyDefinition" && ref.node.parent?.name === "Property" && childrenOf(ref.node.parent).length === 1;
      if (ref.name === "VariableName" || shorthand) references.set(text(ref), (references.get(text(ref)) ?? 0) + 1);
      if (ref.name !== "VariableDefinition") return;
      const node = ref.node;
      const parent = node.parent;
      const value = parent?.name === "VariableDeclaration" && node.nextSibling?.name === "Equals" ? node.nextSibling.nextSibling : undefined;
      const body = parent?.name === "FunctionDeclaration" ? parent.getChild("Block") : undefined;
      const range = value && FUNCTIONS.has(value.name) ? [value.from, value.to] : body ? [body.from, body.to] : undefined;
      const name = text(ref);
      definitions.set(name, definitions.has(name) ? undefined : range);
    }
  });
  const sole = new Map();
  for (const [name, range] of definitions) {
    if (range && references.get(name) === 1) sole.set(name, range);
  }
  return sole;
}

// The parser recovers with error nodes (slowly) beyond a few hundred nesting
// levels, and error trees are never used, so give up early. Brackets inside
// strings, template text and comments are ignored, while `${...}` interpolations
// count as code; anything this quick pass misreads (e.g. regex literals) can
// only end the scan with "keep evidence" or reach the parser, never blank more.
function exceedsNestingLimit(content) {
  let depth = 0;
  let inTemplate = false;
  const interpolationDepths = [];
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (inTemplate) {
      if (character === "\\") index += 1;
      else if (character === "`") inTemplate = false;
      else if (character === "$" && content[index + 1] === "{") {
        interpolationDepths.push(depth);
        depth += 1;
        if (depth > MAX_NESTING) return true;
        inTemplate = false;
        index += 1;
      }
    } else if (character === "\"" || character === "'") {
      index += 1;
      while (index < content.length && content[index] !== character && content[index] !== "\n") {
        if (content[index] === "\\") index += 1;
        index += 1;
      }
    } else if (character === "`") {
      inTemplate = true;
    } else if (character === "/" && content[index + 1] === "/") {
      while (index < content.length && content[index] !== "\n") index += 1;
    } else if (character === "/" && content[index + 1] === "*") {
      const end = content.indexOf("*/", index + 2);
      index = end < 0 ? content.length : end + 1;
    } else if (character === "(" || character === "[" || character === "{") {
      depth += 1;
      if (depth > MAX_NESTING) return true;
    } else if (character === ")" || character === "]" || character === "}") {
      depth = Math.max(0, depth - 1);
      if (character === "}" && interpolationDepths.at(-1) === depth) {
        interpolationDepths.pop();
        inTemplate = true;
      }
    }
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

// Suites, skipped or not, run their callback while tests are collected.
function isSuiteLikeChain({ base, steps }) {
  return SKIPPED_SUITE_CALLEES.has(base) || (base === "test" && steps[0]?.property === "describe");
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
// Also reports names imported from runners that never run skipped suite callbacks.
function collectFrameworkNameTrust(tree, text) {
  const untrusted = new Set();
  const nonCollecting = new Set();
  tree.iterate({
    enter(ref) {
      if (!["VariableName", "VariableDefinition", "PropertyDefinition"].includes(ref.name)) return;
      const name = text(ref);
      if (!FRAMEWORK_NAMES.has(name) || untrusted.has(name)) return;
      const node = ref.node;
      const importedFrom = ref.name === "VariableDefinition" ? frameworkImportModule(node, text) : undefined;
      if (NON_COLLECTING_MODULES.has(importedFrom)) nonCollecting.add(name);
      const trusted = ref.name === "VariableDefinition" ? Boolean(importedFrom)
        : ref.name === "PropertyDefinition" ? node.parent?.name === "Property" && childrenOf(node.parent).length > 1
          : (node.parent?.name === "ImportGroup" && node.nextSibling?.name === "as") || isRecognisedCallBase(node, text);
      if (!trusted) untrusted.add(name);
    }
  });
  return { untrusted, nonCollecting };
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

// The framework module a binding is a plain import/require destructuring of.
function frameworkImportModule(definition, text) {
  const fromFramework = (stringNode) => {
    const module = stringNode?.name === "String" ? text(stringNode).slice(1, -1) : undefined;
    return FRAMEWORK_MODULES.has(module) ? module : undefined;
  };
  const parent = definition.parent;
  if (definition.prevSibling?.name === "as") return undefined;
  if (parent?.name === "ImportDeclaration") return fromFramework(parent.getChild("String"));
  if (parent?.name === "ImportGroup") return fromFramework(parent.parent?.getChild("String"));
  if (parent?.name !== "PatternProperty" || childrenOf(parent).length !== 1) return undefined;
  // `const { test } = require("node:test")`: the initializer of this declarator only.
  const pattern = parent.parent;
  if (pattern?.name !== "ObjectPattern" || pattern.parent?.name !== "VariableDeclaration") return undefined;
  const equals = pattern.nextSibling;
  const initializer = equals?.name === "Equals" ? equals.nextSibling : undefined;
  const parts = initializer?.name === "CallExpression" ? childrenOf(initializer) : [];
  const args = parts[1]?.name === "ArgList" ? argumentsOf(parts[1]) : [];
  const isRequire = parts.length === 2 && parts[0].name === "VariableName" && text(parts[0]) === "require" && args.length === 1;
  return isRequire ? fromFramework(args[0]) : undefined;
}
