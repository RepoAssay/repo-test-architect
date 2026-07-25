import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";

const exampleRoot = path.resolve("examples/node-vitest-basic");
const noTestsRoot = path.resolve("examples/node-no-tests-yet");
const jestServiceRoot = path.resolve("examples/node-jest-service");
const expressSupertestRoot = path.resolve("examples/express-supertest");
const reactTestingLibraryRoot = path.resolve("examples/react-testing-library");

describe("JavaScript audit adapter", () => {
  it("detects package, framework, command, and repository conventions", () => {
    const audit = auditJavaScriptRepo(exampleRoot);

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.languages, ["typescript"]);
    assert.deepEqual(audit.profile.packageManagers, ["npm"]);
    assert.deepEqual(audit.profile.testFrameworks, ["vitest"]);
    assert.equal(audit.profile.testCommand, "npm run test");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.existingTestLocations.includes("colocated with source"));
    assert.ok(audit.profile.detectedConventions.includes("*.test files"));
    assert.ok(audit.profile.detectedConventions.includes("fixture folders"));
    assert.ok(audit.profile.setupSignals.includes("tsconfig"));
    assert.ok(audit.profile.setupSignals.includes("vitest config"));
  });

  it("detects node:test without inheriting nested package signals or candidates", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-package-boundary-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.mkdirSync(path.join(root, "examples", "nested", "src"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "root-package", scripts: { demo: "node ./examples/node-vitest-basic/demo.js" } })
    );
    fs.writeFileSync(
      path.join(root, "src", "rootParser.js"),
      "export function parse(value) { return value ? value.trim() : ''; }\n"
    );
    fs.writeFileSync(
      path.join(root, "test", "rootParser.test.js"),
      "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { parse } from '../src/rootParser.js';\ntest('parse', () => assert.equal(parse(' ok '), 'ok'));\n"
    );
    fs.writeFileSync(
      path.join(root, "examples", "nested", "package.json"),
      JSON.stringify({ devDependencies: { vitest: "latest" } })
    );
    fs.writeFileSync(path.join(root, "examples", "nested", "vitest.config.js"), "export default {};\n");
    fs.writeFileSync(
      path.join(root, "examples", "nested", "src", "nestedParser.js"),
      "export function nestedParse(value) { return value ? value.trim() : ''; }\n"
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(audit.profile.testFrameworks, ["node-test"]);
    assert.equal(audit.profile.testCommand, "node --test");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(!audit.profile.setupSignals.includes("vitest config"));
    assert.deepEqual(
      [...audit.untestedCandidates, ...audit.coveredButRisky, ...audit.skipped].map((target) => target.path),
      ["src/rootParser.js"]
    );
  });

  it("separates untested targets from already-tested risky targets", () => {
    const audit = auditJavaScriptRepo(exampleRoot);

    const untestedNames = audit.untestedCandidates.map((target) => target.name);
    const coveredRiskNames = audit.coveredButRisky.map((target) => target.name);

    assert.deepEqual(untestedNames, ["authService"]);
    assert.deepEqual(coveredRiskNames, ["deckParser"]);

    const deckParser = audit.coveredButRisky[0];
    assert.deepEqual(deckParser.existingTestPaths, ["src/deckParser.test.ts"]);
    assert.equal(deckParser.riskReductionScore, 9);
    assert.equal(deckParser.maintenanceCost, 2);
    assert.deepEqual(deckParser.signals, ["pure-logic", "edge-case-surface", "matching-test"]);
    assert.ok(deckParser.reasons.includes("Existing test file detected; review missing edge cases"));
  });

  it("can limit candidates to changed source files while keeping repo profile", () => {
    const audit = auditJavaScriptRepo(exampleRoot, {
      changedPaths: ["src/authService.ts"]
    });

    assert.deepEqual(audit.profile.testFrameworks, ["vitest"]);
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["authService"]
    );
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
  });

  it("normalizes absolute changed source paths from the audited root", () => {
    const audit = auditJavaScriptRepo(exampleRoot, {
      changedPaths: [path.join(exampleRoot, "src", "authService.ts")]
    });

    assert.deepEqual(audit.profile.testFrameworks, ["vitest"]);
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["authService"]
    );
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
  });

  it("normalizes current-directory changed source paths", () => {
    const audit = auditJavaScriptRepo(exampleRoot, {
      changedPaths: ["./src/authService.ts"]
    });

    assert.deepEqual(audit.profile.testFrameworks, ["vitest"]);
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["authService"]
    );
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
  });

  it("ignores changed test files for source target selection", () => {
    const audit = auditJavaScriptRepo(exampleRoot, {
      changedPaths: ["src/deckParser.test.ts"]
    });

    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
  });

  it("skips low-value source files with an explicit reason", () => {
    const audit = auditJavaScriptRepo(exampleRoot);

    assert.deepEqual(
      audit.skipped.map((target) => target.name),
      ["constants", "userDto"]
    );

    const constants = audit.skipped.find((target) => target.name === "constants");
    assert.equal(constants.kind, "constants");
    assert.match(constants.reason, /Constants-only files/);
    assert.match(constants.preferredCoveragePath, /uses these constants/);

    const userDto = audit.skipped.find((target) => target.name === "userDto");
    assert.equal(userDto.kind, "dto");
    assert.deepEqual(userDto.signals, ["dto-only"]);
    assert.match(userDto.reason, /DTO-only models/);
    assert.match(userDto.preferredCoveragePath, /API\/client parsing/);
  });

  it("reports blockers honestly when no test framework exists yet", () => {
    const audit = auditJavaScriptRepo(noTestsRoot);

    assert.deepEqual(audit.profile.languages, ["typescript"]);
    assert.deepEqual(audit.profile.packageManagers, ["npm"]);
    assert.deepEqual(audit.profile.testFrameworks, []);
    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "low");
    assert.ok(audit.profile.setupSignals.includes("tsconfig"));
    assert.ok(audit.profile.blockers.includes("No supported JS test framework detected."));
    assert.ok(audit.profile.blockers.includes("No runnable test command detected from package scripts or framework config."));
  });

  it("still identifies useful candidates in a repo without tests", () => {
    const audit = auditJavaScriptRepo(noTestsRoot);

    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["paymentClient", "paymentParser"]
    );
    assert.deepEqual(audit.coveredButRisky, []);

    const paymentClient = audit.untestedCandidates.find((target) => target.name === "paymentClient");
    assert.equal(paymentClient.kind, "service");
    assert.equal(paymentClient.riskReductionScore, 8);
    assert.ok(paymentClient.reasons.includes("external dependency boundary"));

    const paymentParser = audit.untestedCandidates.find((target) => target.name === "paymentParser");
    assert.equal(paymentParser.kind, "pure-logic");
    assert.equal(paymentParser.riskReductionScore, 9);
  });

  it("skips DTOs and constants in a repo without tests", () => {
    const audit = auditJavaScriptRepo(noTestsRoot);

    assert.deepEqual(
      audit.skipped.map((target) => target.name),
      ["config", "paymentResponseDto"]
    );
  });

  it("detects Jest service conventions", () => {
    const audit = auditJavaScriptRepo(jestServiceRoot);

    assert.deepEqual(audit.profile.languages, ["typescript", "javascript"]);
    assert.deepEqual(audit.profile.packageManagers, ["npm"]);
    assert.deepEqual(audit.profile.testFrameworks, ["jest"]);
    assert.equal(audit.profile.testCommand, "npm run test");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(audit.profile.detectedConventions.includes("*.spec files"));
    assert.ok(audit.profile.setupSignals.includes("jest config"));
  });

  it("separates Jest service candidates by existing test coverage", () => {
    const audit = auditJavaScriptRepo(jestServiceRoot);

    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["invoiceService"]
    );
    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.name),
      ["invoiceParser"]
    );

    const invoiceService = audit.untestedCandidates[0];
    assert.equal(invoiceService.kind, "service");
    assert.ok(invoiceService.reasons.includes("external dependency boundary"));
    assert.ok(invoiceService.reasons.includes("auth or permission branches"));

    const invoiceParser = audit.coveredButRisky[0];
    assert.deepEqual(invoiceParser.existingTestPaths, ["src/invoiceParser.spec.ts"]);
  });

  it("skips Jest fixture DTOs and constants", () => {
    const audit = auditJavaScriptRepo(jestServiceRoot);

    assert.deepEqual(
      audit.skipped.map((target) => target.name),
      ["constants", "invoiceDto"]
    );
  });

  it("detects Express and Supertest integration conventions", () => {
    const audit = auditJavaScriptRepo(expressSupertestRoot);

    assert.deepEqual(audit.profile.testFrameworks, ["jest", "supertest"]);
    assert.equal(audit.profile.testCommand, "npm run test");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(audit.profile.architectures.includes("http-routes"));
    assert.ok(audit.profile.architectures.includes("service-layer"));
    assert.ok(audit.profile.setupSignals.includes("supertest"));
  });

  it("classifies covered routes as integration-risk targets", () => {
    const audit = auditJavaScriptRepo(expressSupertestRoot);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.name),
      ["userRoutes", "userService"]
    );

    const userRoutes = audit.coveredButRisky[0];
    assert.equal(userRoutes.kind, "http-route");
    assert.equal(userRoutes.recommendedTestLevel, "integration");
    assert.ok(userRoutes.signals.includes("http-route"));
    assert.ok(userRoutes.signals.includes("matching-test"));
    assert.deepEqual(userRoutes.existingTestPaths, ["src/routes/userRoutes.test.ts"]);
  });

  it("keeps Express wiring and DTOs out of direct test recommendations", () => {
    const audit = auditJavaScriptRepo(expressSupertestRoot);

    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      []
    );
    assert.deepEqual(
      audit.skipped.map((target) => target.name),
      ["app", "userDto"]
    );
    assert.equal(audit.skipped.find((target) => target.name === "app").kind, "app-wiring");
  });

  it("detects React Testing Library conventions", () => {
    const audit = auditJavaScriptRepo(reactTestingLibraryRoot);

    assert.deepEqual(audit.profile.testFrameworks, ["vitest", "react-testing-library"]);
    assert.equal(audit.profile.testCommand, "npm run test");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(audit.profile.architectures.includes("react"));
    assert.ok(audit.profile.existingTestLocations.includes("colocated with source"));
  });

  it("classifies tested interactive React components as covered but risky", () => {
    const audit = auditJavaScriptRepo(reactTestingLibraryRoot);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.name),
      ["LoginForm"]
    );

    const loginForm = audit.coveredButRisky[0];
    assert.equal(loginForm.kind, "component");
    assert.equal(loginForm.recommendedTestLevel, "component");
    assert.deepEqual(loginForm.existingTestPaths, ["src/components/LoginForm.test.tsx"]);
  });

  it("does not recommend presentational React components directly", () => {
    const audit = auditJavaScriptRepo(reactTestingLibraryRoot);

    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["sessionService"]
    );

    const avatar = audit.skipped.find((target) => target.name === "Avatar");
    assert.equal(avatar.kind, "presentational-component");
    assert.match(avatar.reason, /Presentational components/);
  });

  it("classifies tested React hooks before generic controller heuristics", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-react-hook-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: { test: "vitest run" },
        dependencies: { react: "latest" },
        devDependencies: { "@testing-library/react": "latest", vitest: "latest" }
      })
    );
    fs.writeFileSync(
      path.join(root, "src", "useCheckoutController.ts"),
      `import React from "react";
export function useCheckoutController(initial = 0) {
  const [count, setCount] = React.useState(initial);
  if (count < 0) throw new Error("invalid count");
  return { count, increment: () => setCount(count + 1) };
}
`
    );
    fs.writeFileSync(
      path.join(root, "src", "useCheckoutController.test.tsx"),
      `import { renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { useCheckoutController } from "./useCheckoutController";
test("returns the initial count", () => {
  const { result } = renderHook(() => useCheckoutController(2));
  expect(result.current.count).toBe(2);
});
`
    );

    const audit = auditJavaScriptRepo(root);
    const hook = audit.coveredButRisky.find((target) => target.name === "useCheckoutController");

    assert.equal(hook.kind, "react-hook");
    assert.equal(hook.recommendedTestLevel, "component");
    assert.deepEqual(hook.signals, ["react-hook", "rtl-convention", "matching-test"]);
    assert.deepEqual(hook.existingTestPaths, ["src/useCheckoutController.test.tsx"]);
  });

  it("skips TypeScript reference mirrors when a matching runtime JavaScript module exists", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-mirror-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: { test: "vitest run" },
        devDependencies: { vitest: "^1.0.0" }
      })
    );
    fs.writeFileSync(
      path.join(root, "src", "paymentClient.js"),
      `
export async function loadPayment(token) {
  if (!token) {
    throw new Error("missing token");
  }

  return fetch("/payments", { headers: { Authorization: token } });
}
`
    );
    fs.writeFileSync(
      path.join(root, "src", "paymentClient.ts"),
      `
export interface PaymentClientRequest {
  token: string;
}

export type PaymentClientResult = {
  ok: boolean;
};
`
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.path),
      ["src/paymentClient.js"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.path}:${target.kind}`),
      ["src/paymentClient.ts:reference-mirror"]
    );

    const mirror = audit.skipped[0];
    assert.deepEqual(mirror.signals, ["type-reference-mirror"]);
    assert.match(mirror.reason, /mirrors a runtime JavaScript module/);
    assert.match(mirror.preferredCoveragePath, /runtime JavaScript module/);
  });

  it("skips TypeScript implementation mirrors when package runtime entrypoints use source JavaScript", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-impl-mirror-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src", "cli"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        bin: { sample: "./src/cli/index.js" },
        scripts: { test: "vitest run" },
        devDependencies: { vitest: "^1.0.0" }
      })
    );
    fs.writeFileSync(
      path.join(root, "src", "cli", "index.js"),
      `
export function parseArgs(args) {
  if (args.includes("--help")) {
    return { mode: "help" };
  }

  return { mode: "run" };
}
`
    );
    fs.writeFileSync(
      path.join(root, "src", "cli", "index.ts"),
      `
export interface ParsedArgs {
  mode: "help" | "run";
}

export function parseArgs(args: string[]): ParsedArgs {
  if (args.includes("--help")) {
    return { mode: "help" };
  }

  return { mode: "run" };
}
`
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.path),
      ["src/cli/index.js"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.path}:${target.kind}`),
      ["src/cli/index.ts:reference-mirror"]
    );

    const mirror = audit.skipped[0];
    assert.deepEqual(mirror.signals, ["reference-implementation-mirror"]);
    assert.match(mirror.reason, /runtime JavaScript implementation/);
    assert.match(mirror.preferredCoveragePath, /runtime JavaScript module/);
  });

  it("matches directory-qualified tests for generic source basenames", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-qualified-tests-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src", "cli"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "adapters", "kotlin"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "other"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: { test: "node --test" }
      })
    );
    fs.writeFileSync(
      path.join(root, "src", "cli", "index.js"),
      `
export function parseCli(args) {
  if (args.includes("--json")) {
    return { format: "json" };
  }

  return { format: "text" };
}
`
    );
    fs.writeFileSync(
      path.join(root, "src", "adapters", "kotlin", "audit.js"),
      `
export function auditKotlin(files) {
  if (files.some((file) => file.endsWith("pom.xml"))) {
    return { tool: "maven" };
  }

  return { tool: "gradle" };
}
`
    );
    fs.writeFileSync(
      path.join(root, "src", "other", "index.js"),
      `export function other(value) {\n  if (value) return value;\n  return "other";\n}\n`
    );
    fs.writeFileSync(path.join(root, "test", "cli.test.js"), "test('cli', () => {});\n");
    fs.writeFileSync(path.join(root, "test", "index.test.js"), "test('unrelated index', () => {});\n");
    fs.writeFileSync(path.join(root, "test", "kotlin-audit.test.js"), "test('kotlin audit', () => {});\n");

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.path}:${target.existingTestPaths.join(",")}`),
      ["src/adapters/kotlin/audit.js:test/kotlin-audit.test.js", "src/cli/index.js:test/cli.test.js"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.path),
      ["src/other/index.js"]
    );
  });

  it("matches pluralized test filenames", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-plural-tests-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: { test: "vitest --run" },
        devDependencies: { vitest: "latest" }
      })
    );

    for (const sourceName of ["error", "cookie", "policy", "box"]) {
      fs.writeFileSync(
        path.join(root, "src", `${sourceName}.ts`),
        `export function ${sourceName}(value) {\n  if (value) {\n    return "yes";\n  }\n\n  return "no";\n}\n`
      );
    }

    for (const testName of ["errors", "cookies", "policies", "boxes"]) {
      fs.writeFileSync(path.join(root, "test", `${testName}.test.ts`), "test('behavior', () => {});\n");
    }

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.path}:${target.existingTestPaths.join(",")}`),
      [
        "src/box.ts:test/boxes.test.ts",
        "src/cookie.ts:test/cookies.test.ts",
        "src/error.ts:test/errors.test.ts",
        "src/policy.ts:test/policies.test.ts"
      ]
    );
    assert.deepEqual(audit.untestedCandidates, []);
  });

  it("matches tests with runtime direct relative source imports", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-import-tests-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src", "rules"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "formatters"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest --run" }, devDependencies: { vitest: "latest" } })
    );

    for (const sourcePath of ["src/rules/payment-policy.ts", "src/rules/cart-policy.ts", "src/rules/tax-policy.ts", "src/formatters/index.ts", "src/session.ts"]) {
      fs.writeFileSync(
        path.join(root, sourcePath),
        `export function evaluate(value) {\n  if (value) return "yes";\n  return "no";\n}\n`
      );
    }

    fs.writeFileSync(
      path.join(root, "test", "checkout-behavior.test.ts"),
      `import { evaluate as evaluatePayment } from "../src/rules/payment-policy";\nexport { evaluate as formatter } from "../src/formatters";\nexpect(evaluatePayment(true)).toBe("yes");\n`
    );
    fs.writeFileSync(
      path.join(root, "test", "login-flow.test.js"),
      `const { evaluate: evaluateSession } = require("../src/session.ts");\nevaluateSession(true);\n`
    );
    fs.writeFileSync(
      path.join(root, "test", "cart-flow.test.ts"),
      `import { evaluate as evaluateCart } from "../src/rules/cart-policy";\nconst result = evaluateCart(true);\nexpect(result.value).toBe("yes");\n`
    );
    fs.writeFileSync(
      path.join(root, "test", "tax-flow.test.ts"),
      `import { evaluate as evaluateTax } from "../src/rules/tax-policy";\nconst { value: taxValue } = evaluateTax(true);\nexpect(taxValue).toBe("yes");\n`
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.path}:${target.existingTestPaths.join(",")}`),
      [
        "src/rules/cart-policy.ts:test/cart-flow.test.ts",
        "src/rules/payment-policy.ts:test/checkout-behavior.test.ts",
        "src/session.ts:test/login-flow.test.js",
        "src/rules/tax-policy.ts:test/tax-flow.test.ts"
      ]
    );
    assert.deepEqual(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["src/rules/cart-policy.ts", "asserted"],
        ["src/rules/payment-policy.ts", "asserted"],
        ["src/session.ts", "called"],
        ["src/rules/tax-policy.ts", "asserted"]
      ]
    );
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/formatters/index.ts"]);
  });

  it("tracks calls and assertions through default and namespace imports", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-import-shapes-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest --run" }, devDependencies: { vitest: "latest" } })
    );
    fs.writeFileSync(
      path.join(root, "src", "parser.ts"),
      `export default function parse(value) {\n  if (value) return value;\n  return "empty";\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "api.ts"),
      `export function load(value) {\n  if (value) return value;\n  return "empty";\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "test", "behavior.test.ts"),
      `import parse from "../src/parser";\nimport * as api from "../src/api";\nexpect(parse("value")).toBe("value");\napi.load("value");\n`
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["src/parser.ts", "asserted"],
        ["src/api.ts", "called"]
      ]
    );
  });

  it("tracks constructor and CommonJS namespace usage", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-executable-imports-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest --run" }, devDependencies: { vitest: "latest" } })
    );
    fs.writeFileSync(
      path.join(root, "src", "service.ts"),
      `export class Service {\n  constructor(value) {\n    if (!value) throw new Error("missing");\n  }\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "api.ts"),
      `export function load(value) {\n  if (value) return value;\n  return "empty";\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "parser.ts"),
      `export function parse(value) {\n  if (value) return value;\n  return "empty";\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "test", "behavior.test.ts"),
      `import { Service } from "../src/service";\nconst api = require("../src/api");\nconst parser = require("../src/parser");\nnew Service("value");\napi.load("value");\nexpect(parser.parse("value")).toBe("value");\n`
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["src/parser.ts", "asserted"],
        ["src/api.ts", "called"],
        ["src/service.ts", "called"]
      ]
    );
    assert.deepEqual(audit.untestedCandidates, []);
  });

  it("tracks inline and assigned-result assertions through assert APIs", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-assert-api-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest --run" }, devDependencies: { vitest: "latest" } })
    );
    fs.writeFileSync(
      path.join(root, "src", "parser.ts"),
      `export function parse(value) {\n  if (value) return { value };\n  return { value: "empty" };\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "validator.ts"),
      `export function validate(value) {\n  if (!value) throw new Error("missing");\n  return true;\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "test", "behavior.test.ts"),
      `import assert from "node:assert/strict";\nimport { parse } from "../src/parser";\nimport { validate } from "../src/validator";\nconst result = parse("value");\nassert.equal(result.value, "value");\nassert.throws(() => validate(""));\n`
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["src/parser.ts", "asserted"],
        ["src/validator.ts", "asserted"]
      ]
    );
    assert.deepEqual(audit.untestedCandidates, []);
  });

  it("matches tests to source modules re-exported by a relative barrel", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-barrel-tests-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest --run" }, devDependencies: { vitest: "latest" } })
    );
    fs.writeFileSync(
      path.join(root, "src", "error.ts"),
      `export function createError(value) {\n  if (value) return new Error(value);\n  return new Error("unknown");\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "cookie.ts"),
      `export function parseCookie(value) {\n  if (value) return value.split("=");\n  return [];\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "unexported.ts"),
      `export function hidden(value) {\n  if (value) return value;\n  return "hidden";\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "exported-but-unused.ts"),
      `export function unused(value) {\n  if (value) return value;\n  return "unused";\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "index.ts"),
      `export * from "./error";\nexport { parseCookie } from "./cookie.ts";\nexport { unused } from "./exported-but-unused";\n`
    );
    fs.writeFileSync(
      path.join(root, "test", "http-behavior.test.ts"),
      `import { createError as makeError, parseCookie, unused } from "../src";\nexpect(makeError("boom")).toBeInstanceOf(Error);\nparseCookie("a=b");\n`
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.path}:${target.existingTestPaths.join(",")}`),
      [
        "src/cookie.ts:test/http-behavior.test.ts",
        "src/error.ts:test/http-behavior.test.ts"
      ]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.path),
      ["src/exported-but-unused.ts", "src/unexported.ts"]
    );
    assert.deepEqual(audit.coveredButRisky.find((target) => target.path === "src/error.ts").existingTestEvidence, [
      {
        testPath: "test/http-behavior.test.ts",
        kind: "referenced-relative-reexport",
        strength: "referenced",
        usage: "asserted"
      }
    ]);
    assert.equal(
      audit.coveredButRisky.find((target) => target.path === "src/cookie.ts").existingTestEvidence[0].usage,
      "called"
    );
  });

  it("matches exact self-package imports through the source entrypoint", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-package-imports-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "@example/http-kit",
        source: "./src/index.ts",
        main: "./dist/index.js",
        scripts: { test: "vitest --run" },
        devDependencies: { vitest: "latest" }
      })
    );
    fs.writeFileSync(
      path.join(root, "src", "error.ts"),
      `export function createError(value) {\n  if (value) return new Error(value);\n  return new Error("unknown");\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "unexported.ts"),
      `export function hidden(value) {\n  if (value) return value;\n  return "hidden";\n}\n`
    );
    fs.writeFileSync(path.join(root, "src", "index.ts"), `export * from "./error";\n`);
    fs.writeFileSync(
      path.join(root, "test", "public-api.test.ts"),
      `import { createError } from "@example/http-kit";\nexpect(createError("boom")).toBeInstanceOf(Error);\n`
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.path}:${target.existingTestPaths.join(",")}`),
      ["src/error.ts:test/public-api.test.ts"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.path),
      ["src/unexported.ts"]
    );
    assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].usage, "asserted");
  });

  it("matches exact and wildcard declared self-package subpath imports", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-package-subpaths-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "features"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "@example/http-kit",
        exports: {
          "./errors": { import: "./dist/errors.js", types: "./dist/errors.d.ts" },
          "./cookies": "./src/cookies.ts",
          "./features/*": "./dist/features/*.js"
        },
        scripts: { test: "vitest --run" },
        devDependencies: { vitest: "latest" }
      })
    );
    for (const sourceName of ["errors", "cookies", "unexported"]) {
      fs.writeFileSync(
        path.join(root, "src", `${sourceName}.ts`),
        `export function evaluate(value) {\n  if (value) return value;\n  return "${sourceName}";\n}\n`
      );
    }
    fs.writeFileSync(
      path.join(root, "src", "features", "cache.ts"),
      `export function cache(value) {\n  if (value) return value;\n  return "cache";\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "test", "public-subpaths.test.ts"),
      `import { evaluate as createError } from "@example/http-kit/errors";\nimport { cache } from "@example/http-kit/features/cache";\nconst cookies = require("@example/http-kit/cookies");\nexpect(createError("boom")).toBe("boom");\ncache("value");\n`
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.path}:${target.existingTestPaths.join(",")}`),
      [
        "src/features/cache.ts:test/public-subpaths.test.ts",
        "src/cookies.ts:test/public-subpaths.test.ts",
        "src/errors.ts:test/public-subpaths.test.ts"
      ]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.path),
      ["src/unexported.ts"]
    );
    assert.deepEqual(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["src/features/cache.ts", "called"],
        ["src/cookies.ts", undefined],
        ["src/errors.ts", "asserted"]
      ]
    );
  });

  it("keeps conditional package exports on their import and require source branches", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-conditional-exports-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "@example/dual-runtime",
        exports: {
          ".": {
            import: "./dist/esm-entry.mjs",
            require: "./dist/commonjs-entry.cjs"
          }
        },
        scripts: { test: "node --test" }
      })
    );
    fs.writeFileSync(
      path.join(root, "src", "esm-entry.mts"),
      "export function esmFeature(value) { if (!value) throw new Error('missing'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "src", "commonjs-entry.cts"),
      "export function commonjsFeature(value) { if (!value) throw new Error('missing'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "test", "import-branch.test.mts"),
      "import { esmFeature } from '@example/dual-runtime';\nesmFeature('esm');\n"
    );
    fs.writeFileSync(
      path.join(root, "test", "require-branch.test.cts"),
      "const { commonjsFeature } = require('@example/dual-runtime');\ncommonjsFeature('cjs');\n"
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.path}:${target.existingTestPaths.join(",")}`),
      [
        "src/commonjs-entry.cts:test/require-branch.test.cts",
        "src/esm-entry.mts:test/import-branch.test.mts"
      ]
    );
    assert.deepEqual(audit.untestedCandidates, []);
  });

  it("does not collapse explicit mjs and cjs relative imports onto sibling module formats", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-module-formats-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "node --test" } })
    );
    fs.writeFileSync(
      path.join(root, "src", "runtime.mjs"),
      "export function esmRuntime(value) { if (!value) throw new Error('missing'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "src", "runtime.cjs"),
      "exports.commonjsRuntime = function (value) { if (!value) throw new Error('missing'); return value; };\n"
    );
    fs.writeFileSync(
      path.join(root, "test", "loading.test.mjs"),
      "import { esmRuntime } from '../src/runtime.mjs';\nesmRuntime('esm');\n"
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/runtime.mjs"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/runtime.cjs"]);
  });

  it("does not credit ambiguous, default, or type-only export-star barrel members", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-barrel-boundaries-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest --run" }, devDependencies: { vitest: "latest" } })
    );
    fs.writeFileSync(
      path.join(root, "src", "first.ts"),
      "export function collision(value) { if (!value) throw new Error('first'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "src", "second.ts"),
      "export function collision(value) { if (!value) throw new Error('second'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "src", "defaulted.ts"),
      "export default function defaulted(value) { if (!value) throw new Error('default'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "src", "contract.ts"),
      "export interface Contract { value: string }\nexport function validate(value) { if (!value) throw new Error('contract'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "src", "index.ts"),
      "export * from './first';\nexport * from './second';\nexport * from './defaulted';\nexport * from './contract';\n"
    );
    fs.writeFileSync(
      path.join(root, "test", "public-api.test.ts"),
      "import defaulted, { collision, Contract } from '../src';\nconst value: Contract = { value: 'ok' };\ncollision(value.value);\ndefaulted(value.value);\n"
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.path),
      ["src/contract.ts", "src/defaulted.ts", "src/first.ts", "src/second.ts"]
    );
    assert.deepEqual(audit.coveredButRisky, []);
  });

  it("does not treat direct type-only imports as runtime test coverage", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-type-only-imports-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest --run" }, devDependencies: { vitest: "latest" } })
    );
    fs.writeFileSync(
      path.join(root, "src", "contract.ts"),
      "export interface Contract { value: string }\nexport function validate(value) { if (!value) throw new Error('contract'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "test", "typing.test.ts"),
      "import type { Contract } from '../src/contract';\nconst fixture: Contract = { value: 'ok' };\nexpect(fixture.value).toBe('ok');\n"
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/contract.ts"]);
    assert.deepEqual(audit.coveredButRisky, []);
  });

  it("lets an explicit named barrel export resolve an export-star collision", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-explicit-barrel-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest --run" }, devDependencies: { vitest: "latest" } })
    );
    fs.writeFileSync(
      path.join(root, "src", "first.ts"),
      "export function collision(value) { if (!value) throw new Error('first'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "src", "second.ts"),
      "export function collision(value) { if (!value) throw new Error('second'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "src", "index.ts"),
      "export * from './first';\nexport * from './second';\nexport { collision } from './first';\n"
    );
    fs.writeFileSync(
      path.join(root, "test", "public-api.test.ts"),
      "import { collision } from '../src';\ncollision('ok');\n"
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/first.ts"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/second.ts"]);
  });

  it("matches exact and wildcard aliases inherited from a local tsconfig", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-tsconfig-aliases-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const directory of ["config", "src/core", "src/internal", "src/public", "test"]) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest --run" }, devDependencies: { vitest: "latest" } })
    );
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      `{
        "extends": "./config/tsconfig.base",
        "compilerOptions": { "strict": true },
      }`
    );
    fs.writeFileSync(
      path.join(root, "config/tsconfig.base.json"),
      `{
        // Inherited alias evidence should accept normal tsconfig comments and trailing commas.
        "compilerOptions": {
          "baseUrl": "..",
          "paths": {
            "@core/*": ["src/core/*"],
            "@internal/*": ["src/internal/*"],
            "@public": ["src/index.ts"],
          },
        },
      }`
    );
    fs.writeFileSync(
      path.join(root, "src/core/calculator.ts"),
      `import { normalize } from "@internal/normalize";\nexport function calculate(value) {\n  if (value) return normalize(value);\n  return 0;\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src/internal/normalize.ts"),
      `export function normalize(value) {\n  if (value) return Number(value);\n  return 0;\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src/public/published.ts"),
      `export function published(value) {\n  if (value) return value;\n  return "published";\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src/public/unused.ts"),
      `export function unused(value) {\n  if (value) return value;\n  return "unused";\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src/index.ts"),
      `export { published } from "./public/published";\nexport { unused } from "./public/unused";\n`
    );
    fs.writeFileSync(
      path.join(root, "test/behavior.test.ts"),
      `import { calculate } from "@core/calculator";\nimport { published } from "@public";\ncalculate(1);\npublished("yes");\n`
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.path),
      ["src/core/calculator.ts", "src/internal/normalize.ts", "src/public/published.ts"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.path),
      ["src/public/unused.ts"]
    );
    assert.deepEqual(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["src/core/calculator.ts", "called"],
        ["src/internal/normalize.ts", undefined],
        ["src/public/published.ts", "called"]
      ]
    );
  });

  it("honors ordered tsconfig wildcard fallbacks without cross-target alias leakage", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-alias-fallbacks-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const directory of ["src/primary", "src/fallback", "test"]) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest --run" }, devDependencies: { vitest: "latest" } })
    );
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@feature/*": ["src/primary/*", "src/fallback/*"] }
        }
      })
    );
    fs.writeFileSync(
      path.join(root, "src", "primary", "checkout.ts"),
      "export function checkout(value) { if (!value) throw new Error('primary'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "src", "fallback", "checkout.ts"),
      "export function checkout(value) { if (!value) throw new Error('fallback'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "test", "behavior.test.ts"),
      "import { checkout } from '@feature/checkout';\ncheckout('ok');\n"
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/primary/checkout.ts"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/fallback/checkout.ts"]);
  });

  it("matches bounded transitive relative imports", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-transitive-imports-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest --run" }, devDependencies: { vitest: "latest" } })
    );
    fs.writeFileSync(
      path.join(root, "src", "public.ts"),
      `import { service } from "./service";\nexport function publicApi(value) {\n  if (value) return service(value);\n  return "public";\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "service.ts"),
      `import { parse } from "./parser";\nexport function service(value) {\n  if (value) return parse(value);\n  return "service";\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "parser.ts"),
      `import { deep } from "./deep";\nexport function parse(value) {\n  if (value) return deep(value);\n  return "parser";\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "deep.ts"),
      `export function deep(value) {\n  if (value) return value;\n  return "deep";\n}\n`
    );
    fs.writeFileSync(
      path.join(root, "test", "behavior.test.ts"),
      `import { publicApi } from "../src/public";\nexpect(publicApi("value")).toBe("value");\n`
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.path),
      ["src/parser.ts", "src/public.ts", "src/service.ts"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.path),
      ["src/deep.ts"]
    );
    assert.deepEqual(audit.coveredButRisky.find((target) => target.path === "src/parser.ts").existingTestEvidence, [
      {
        testPath: "test/behavior.test.ts",
        kind: "bounded-dependency",
        strength: "indirect",
        viaUsage: "asserted"
      }
    ]);
  });

  it("classifies HTTP framework risks by behavioral role", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-http-risks-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest --run" }, devDependencies: { vitest: "latest" } })
    );
    const sources = {
      "src/router/matcher.ts": "export function match(value) { if (value) return value; return false; }",
      "src/middleware/basic-auth.ts": "export function auth(value) { if (value) return value; return false; }",
      "src/middleware/compress.ts": "export function compress(value) { if (value) return value; return false; }",
      "src/validator/request-validator.ts": "export function validate(value) { if (value) return value; return false; }",
      "src/streaming/sse-writer.ts": "export function write(value) { if (value) return value; return false; }",
      "src/adapter/cloudflare/handler.ts": "export function handle(value) { if (value) return value; return false; }",
      "src/client/fetch-response.ts": "export function parse(value) { if (value) return value; return false; }",
      "src/utils/auth.ts": "export function auth(event: HTTPEvent) { if (event.req) return true; return false; }",
      "src/utils/body.ts": "export function body(event: HTTPEvent) { if (event.req) return true; return false; }",
      "src/utils/cache.ts": "export function cache(event: HTTPEvent) { if (event.res) return true; return false; }",
      "src/utils/cookie.ts": "export function cookie(event: HTTPEvent) { if (event.req) return true; return false; }",
      "src/utils/event.ts": "export function event(current: HTTPEvent) { if (current.req) return true; return false; }",
      "src/utils/proxy.ts": "export function proxy(current: HTTPEvent): Response { if (current.req) return new Response(); return new Response(); }",
      "src/utils/query.ts": "export function query(current: HTTPEvent) { if (current.req) return true; return false; }",
      "src/utils/request.ts": "export function request(current: HTTPEvent) { if (current.req) return true; return false; }",
      "src/utils/response.ts": "export function response(current: HTTPEvent): Response { if (current.res) return new Response(); return new Response(); }",
      "src/utils/route.ts": "export function route(current: EventHandler) { if (current) return true; return false; }",
      "src/utils/session.ts": "export function session(current: HTTPEvent) { if (current.req) return true; return false; }",
      "src/utils/ws.ts": "export function ws(current: H3Event): Response { if (current.req) return new Response(); return new Response(); }",
      "src/handler.ts": "export function handler(current: EventHandler) { if (current) return true; return false; }"
    };
    for (const [sourcePath, content] of Object.entries(sources)) {
      fs.mkdirSync(path.dirname(path.join(root, sourcePath)), { recursive: true });
      fs.writeFileSync(path.join(root, sourcePath), content);
    }

    const audit = auditJavaScriptRepo(root);
    const targets = new Map(audit.untestedCandidates.map((target) => [target.path, target]));

    assert.deepEqual(
      Object.fromEntries([...targets].map(([sourcePath, target]) => [sourcePath, target.kind])),
      {
        "src/adapter/cloudflare/handler.ts": "runtime-adapter",
        "src/client/fetch-response.ts": "response-parser",
        "src/handler.ts": "http-handler",
        "src/middleware/basic-auth.ts": "security-middleware",
        "src/middleware/compress.ts": "http-middleware",
        "src/router/matcher.ts": "http-router",
        "src/streaming/sse-writer.ts": "streaming",
        "src/utils/auth.ts": "security-middleware",
        "src/utils/body.ts": "request-body",
        "src/utils/cache.ts": "http-cache",
        "src/utils/cookie.ts": "cookie-boundary",
        "src/utils/event.ts": "request-event",
        "src/utils/proxy.ts": "http-proxy",
        "src/utils/query.ts": "query-boundary",
        "src/utils/request.ts": "request-access",
        "src/utils/response.ts": "response-construction",
        "src/utils/route.ts": "http-route",
        "src/utils/session.ts": "session-management",
        "src/utils/ws.ts": "websocket",
        "src/validator/request-validator.ts": "request-validation"
      }
    );
    assert.ok(targets.get("src/router/matcher.ts").reasons.includes("Route matching and precedence behavior"));
    assert.ok(targets.get("src/middleware/basic-auth.ts").signals.includes("security-boundary"));
    assert.ok(targets.get("src/streaming/sse-writer.ts").reasons.includes("cancellation, cleanup, and error propagation"));
  });

  it("detects Playwright and Cypress browser E2E conventions without overstating source coverage", (t) => {
    const roots = [];
    t.after(() => roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

    const cases = [
      {
        framework: "playwright",
        config: "playwright.config.ts",
        testPath: "tests/checkout.spec.ts",
        testContent: "import { test, expect } from '@playwright/test';\ntest('checkout', async ({ page }) => { await page.goto('/checkout'); expect(page.url()).toContain('checkout'); });\n",
        command: "npx playwright test",
        setupSignal: "playwright config",
        convention: "*.spec files",
        location: "tests/"
      },
      {
        framework: "cypress",
        config: "cypress.config.ts",
        testPath: "cypress/e2e/checkout.cy.ts",
        testContent: "describe('checkout', () => { it('opens', () => { cy.visit('/checkout'); cy.url().should('include', 'checkout'); }); });\n",
        command: "npx cypress run",
        setupSignal: "cypress config",
        convention: "*.cy files",
        location: "custom test location"
      }
    ];

    for (const entry of cases) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `repo-test-architect-${entry.framework}-`));
      roots.push(root);
      fs.mkdirSync(path.join(root, "src"), { recursive: true });
      fs.mkdirSync(path.dirname(path.join(root, entry.testPath)), { recursive: true });
      fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: `${entry.framework}-app` }));
      fs.writeFileSync(path.join(root, entry.config), "export default {};\n");
      fs.writeFileSync(path.join(root, "src", "checkout.ts"), "export function checkout(value) { if (!value) throw new Error('missing'); return value; }\n");
      fs.writeFileSync(path.join(root, entry.testPath), entry.testContent);

      const audit = auditJavaScriptRepo(root);

      assert.deepEqual(audit.profile.testFrameworks, [entry.framework]);
      assert.equal(audit.profile.testCommand, entry.command);
      assert.equal(audit.profile.confidence, "high");
      assert.ok(audit.profile.setupSignals.includes(entry.setupSignal));
      assert.ok(audit.profile.detectedConventions.includes(entry.convention));
      assert.ok(audit.profile.existingTestLocations.includes(entry.location));
      assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/checkout.ts"]);
      assert.deepEqual(audit.coveredButRisky, []);
    }
  });

  it("matches literal Playwright and Cypress requests to exact static HTTP route registrations", (t) => {
    const roots = [];
    t.after(() => roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

    const cases = [
      {
        framework: "playwright",
        config: "playwright.config.ts",
        testPath: "tests/browser.spec.ts",
        testContent: `import { test } from "@playwright/test";
test("browser routes", async ({ page, request }) => {
  await page.goto("/checkout?source=e2e");
  await request.post("/api/orders");
});
`
      },
      {
        framework: "cypress",
        config: "cypress.config.ts",
        testPath: "cypress/e2e/browser.cy.ts",
        testContent: `describe("browser routes", () => {
  it("covers navigation and network calls", () => {
    cy.visit("/checkout#summary");
    cy.request("POST", "/api/orders");
  });
});
`
      }
    ];

    for (const entry of cases) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `repo-test-architect-${entry.framework}-route-evidence-`));
      roots.push(root);
      fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
      fs.mkdirSync(path.dirname(path.join(root, entry.testPath)), { recursive: true });
      fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: `${entry.framework}-routes` }));
      fs.writeFileSync(path.join(root, entry.config), "export default {};\n");
      fs.writeFileSync(
        path.join(root, "src", "routes", "checkout.ts"),
        `router.get("/checkout", (request, response) => response.send(request.query));\n`
      );
      fs.writeFileSync(
        path.join(root, "src", "routes", "orders.ts"),
        `router.post("/api/orders", (request, response) => response.send(request.body));\n`
      );
      fs.writeFileSync(path.join(root, entry.testPath), entry.testContent);

      const audit = auditJavaScriptRepo(root);

      assert.deepEqual(audit.untestedCandidates, []);
      assert.deepEqual(
        audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence]),
        [
          [
            "src/routes/checkout.ts",
            [{ testPath: entry.testPath, kind: "browser-route-match", strength: "indirect" }]
          ],
          [
            "src/routes/orders.ts",
            [{ testPath: entry.testPath, kind: "browser-route-match", strength: "indirect" }]
          ]
        ]
      );
    }
  });

  it("rejects ambiguous browser route relationships", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-playwright-route-near-misses-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src", "clients"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ devDependencies: { "@playwright/test": "latest" } }));
    fs.writeFileSync(path.join(root, "playwright.config.ts"), "export default {};\n");
    fs.writeFileSync(
      path.join(root, "src", "clients", "checkoutClient.ts"),
      `export function loadCheckout(client) { return client.get("/checkout"); }\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "routes", "computed.ts"),
      `const routePath = "/computed";\nrouter.get(routePath, (request, response) => response.send(request.query));\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "routes", "dynamic.ts"),
      `router.get("/orders/:id", (request, response) => response.send(request.params.id));\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "routes", "documented.ts"),
      `const docs = 'router.get("/documented", handler)';\n// router.get("/commented", handler);\nexport function documentedRoute(value) { if (!value) throw new Error("missing"); return docs; }\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "routes", "proxy.ts"),
      `export function loadCheckout(external) { return external.get("/checkout"); }\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "routes", "wrongMethod.ts"),
      `router.post("/checkout", (request, response) => response.send(request.body));\n`
    );
    fs.writeFileSync(
      path.join(root, "src", "routes", "dynamicRequest.ts"),
      `router.get("/dynamic/42", (request, response) => response.send(request.params));\n`
    );
    fs.writeFileSync(
      path.join(root, "tests", "navigation.spec.ts"),
      `import { test } from "@playwright/test";
test("browser near misses", async ({ page }) => {
  const id = 42;
  await page.goto("/checkout");
  await page.goto("/orders/42");
  await page.goto("/computed");
  await page.goto(\`/dynamic/\${id}\`);
  const docs = "page.goto('/documented')";
  // await page.goto("/commented");
  console.log(docs);
});
`
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.path),
      [
        "src/routes/computed.ts",
        "src/routes/documented.ts",
        "src/routes/dynamic.ts",
        "src/routes/dynamicRequest.ts",
        "src/routes/proxy.ts",
        "src/routes/wrongMethod.ts",
        "src/clients/checkoutClient.ts"
      ]
    );
    assert.deepEqual(audit.coveredButRisky, []);
  });

  it("keeps a nested Cypress test harness in the owning package audit", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-cypress-harness-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test", "specs"), { recursive: true });
    fs.mkdirSync(path.join(root, "test", "cypress", "support"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "echo 'no test specified' && exit 1" }, devDependencies: { cypress: "latest" } }));
    fs.writeFileSync(path.join(root, "src", "checkout.ts"), "export function checkout(value) { if (!value) throw new Error('missing'); return value; }\n");
    fs.writeFileSync(path.join(root, "test", "package.json"), JSON.stringify({ scripts: { test: "mocha specs/*.spec.ts" } }));
    fs.writeFileSync(path.join(root, "test", "cypress.config.js"), "require('../src/checkout');\nmodule.exports = {};\n");
    fs.writeFileSync(path.join(root, "test", "cypress", "support", "e2e.js"), "require('../../../src/checkout');\n");
    fs.writeFileSync(
      path.join(root, "test", "specs", "checkout.spec.ts"),
      "import { checkout } from '../../src/checkout';\ndescribe('checkout', () => it('works', () => checkout('ok')));\n"
    );

    const audit = auditJavaScriptRepo(root);
    const checkout = audit.coveredButRisky.find((target) => target.path === "src/checkout.ts");

    assert.deepEqual(audit.profile.testFrameworks, ["cypress"]);
    assert.equal(audit.profile.testCommand, "npx cypress run --config-file test/cypress.config.js");
    assert.ok(audit.profile.setupSignals.includes("cypress config"));
    assert.deepEqual(checkout.existingTestEvidence, [
      { testPath: "test/specs/checkout.spec.ts", kind: "direct-relative-import", strength: "direct", usage: "called" }
    ]);
  });

  it("audits declared package entrypoints outside conventional source roots", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-root-entrypoints-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ main: "index.js", bin: { sample: "cli.js" }, scripts: { test: "playwright test" }, devDependencies: { "@playwright/test": "latest" } }));
    fs.writeFileSync(path.join(root, "playwright.config.ts"), "export default {};\n");
    fs.writeFileSync(path.join(root, "index.js"), "export function start(value) { if (!value) throw new Error('missing'); return value; }\n");
    fs.writeFileSync(path.join(root, "cli.js"), "export function run(value) { if (!value) throw new Error('missing'); return value; }\n");
    fs.writeFileSync(path.join(root, "tests", "fixtures.ts"), "export { test } from '@playwright/test';\n");
    fs.writeFileSync(path.join(root, "tests", "cli.spec.ts"), "import { test } from './fixtures';\ntest('starts', async () => {});\n");

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["cli.js", "index.js"]);
    assert.deepEqual(audit.coveredButRisky, []);
  });

  it("detects Bun's lockfile, runner import, config, and underscore test naming", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-bun-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "bun-app" }));
    fs.writeFileSync(path.join(root, "bun.lock"), "{}\n");
    fs.writeFileSync(path.join(root, "bunfig.toml"), "[test]\nroot = './test'\n");
    fs.writeFileSync(path.join(root, "src", "checkout.ts"), "export function checkout(value) { if (!value) throw new Error('missing'); return value; }\n");
    fs.writeFileSync(
      path.join(root, "test", "checkout_test.ts"),
      "import { expect, test } from 'bun:test';\nimport { checkout } from '../src/checkout';\ntest('checkout', () => expect(checkout('ok')).toBe('ok'));\n"
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(audit.profile.packageManagers, ["bun"]);
    assert.deepEqual(audit.profile.testFrameworks, ["bun-test"]);
    assert.equal(audit.profile.testCommand, "bun test");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(audit.profile.setupSignals.includes("bunfig"));
    assert.ok(audit.profile.detectedConventions.includes("Bun-style test files"));
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [
      { testPath: "test/checkout_test.ts", kind: "direct-relative-import", strength: "direct", usage: "asserted" }
    ]);
  });

  it("uses the detected package manager for package scripts", (t) => {
    const roots = [];
    t.after(() => roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

    for (const [lockfile, manager, script, expectedCommand] of [
      ["pnpm-lock.yaml", "pnpm", "test:e2e", "pnpm run test:e2e"],
      ["yarn.lock", "yarn", "test", "yarn test"],
      ["bun.lockb", "bun", "test", "bun run test"]
    ]) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `repo-test-architect-${manager}-script-`));
      roots.push(root);
      fs.mkdirSync(path.join(root, "src"), { recursive: true });
      fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { [script]: "vitest run" }, devDependencies: { vitest: "latest" } }));
      fs.writeFileSync(path.join(root, lockfile), "lock\n");
      fs.writeFileSync(path.join(root, "src", "parser.ts"), "export function parse(value) { return value; }\n");

      const audit = auditJavaScriptRepo(root);

      assert.deepEqual(audit.profile.packageManagers, [manager]);
      assert.equal(audit.profile.testCommand, expectedCommand);
    }
  });

  it("inherits package-script ownership only from a statically declared workspace", (t) => {
    const roots = [];
    t.after(() => roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

    const cases = [
      {
        manager: "npm",
        rootPackage: { private: true, workspaces: ["packages/*"] },
        lockfile: "package-lock.json",
        expectedCommand: "npm run test"
      },
      {
        manager: "pnpm",
        rootPackage: { private: true },
        lockfile: "pnpm-lock.yaml",
        workspaceFile: "packages:\n  - 'packages/*'\n  - '!**/fixtures/**'\n",
        expectedCommand: "pnpm run test"
      },
      {
        manager: "yarn",
        rootPackage: { private: true, workspaces: ["packages/*"] },
        lockfile: "yarn.lock",
        expectedCommand: "yarn test"
      },
      {
        manager: "bun",
        rootPackage: { private: true, workspaces: { packages: ["packages/*"] }, packageManager: "bun@1.3.0" },
        lockfile: "bun.lock",
        expectedCommand: "bun run test"
      }
    ];

    for (const entry of cases) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `repo-test-architect-${entry.manager}-workspace-`));
      const packageRoot = path.join(root, "packages", "checkout");
      roots.push(root);
      fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
      fs.mkdirSync(path.join(packageRoot, "test"), { recursive: true });
      fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(entry.rootPackage));
      fs.writeFileSync(path.join(root, entry.lockfile), "lock\n");
      if (entry.workspaceFile) fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), entry.workspaceFile);
      fs.writeFileSync(
        path.join(packageRoot, "package.json"),
        JSON.stringify({ name: "@sample/checkout", scripts: { test: "vitest run" }, devDependencies: { vitest: "latest" } })
      );
      fs.writeFileSync(path.join(packageRoot, "src", "checkout.ts"), "export function checkout(value) { return value; }\n");
      fs.writeFileSync(
        path.join(packageRoot, "test", "checkout.test.ts"),
        "import { expect, test } from 'vitest';\nimport { checkout } from '../src/checkout';\ntest('checkout', () => expect(checkout('ok')).toBe('ok'));\n"
      );

      const audit = auditJavaScriptRepo(packageRoot);

      assert.deepEqual(audit.profile.packageManagers, [entry.manager]);
      assert.equal(audit.profile.testCommand, entry.expectedCommand);
      assert.ok(audit.profile.setupSignals.includes(`${entry.manager} workspace`));
      assert.deepEqual(audit.profile.blockers, []);
    }
  });

  it("does not inherit workspace package-manager evidence into an unrelated sibling", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-workspace-near-miss-"));
    const packageRoot = path.join(root, "tools", "checkout");
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(packageRoot, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ private: true, packageManager: "pnpm@10.0.0", workspaces: ["packages/*"] })
    );
    fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lock\n");
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ scripts: { test: "vitest run" }, devDependencies: { vitest: "latest" } })
    );
    fs.writeFileSync(path.join(packageRoot, "src", "checkout.ts"), "export function checkout(value) { return value; }\n");
    fs.writeFileSync(
      path.join(packageRoot, "test", "checkout.test.ts"),
      "import { test } from 'vitest';\nimport { checkout } from '../src/checkout';\ntest('checkout', () => checkout('ok'));\n"
    );

    const audit = auditJavaScriptRepo(packageRoot);

    assert.deepEqual(audit.profile.packageManagers, ["npm"]);
    assert.equal(audit.profile.testCommand, "npm run test");
    assert.ok(!audit.profile.setupSignals.some((signal) => signal.includes("workspace")));
  });

  it("blocks ambiguous workspace package-script commands unless packageManager resolves ownership", (t) => {
    const roots = [];
    t.after(() => roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

    for (const explicit of [false, true]) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `repo-test-architect-ambiguous-workspace-${explicit}-`));
      const packageRoot = path.join(root, "packages", "checkout");
      roots.push(root);
      fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
      fs.mkdirSync(path.join(packageRoot, "test"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({
          private: true,
          workspaces: ["packages/*"],
          ...(explicit ? { packageManager: "yarn@4.9.2" } : {})
        })
      );
      fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lock\n");
      fs.writeFileSync(path.join(root, "yarn.lock"), "lock\n");
      fs.writeFileSync(
        path.join(packageRoot, "package.json"),
        JSON.stringify({ scripts: { test: "vitest run" }, devDependencies: { vitest: "latest" } })
      );
      fs.writeFileSync(path.join(packageRoot, "src", "checkout.ts"), "export function checkout(value) { return value; }\n");
      fs.writeFileSync(
        path.join(packageRoot, "test", "checkout.test.ts"),
        "import { test } from 'vitest';\nimport { checkout } from '../src/checkout';\ntest('checkout', () => checkout('ok'));\n"
      );

      const audit = auditJavaScriptRepo(packageRoot);

      assert.deepEqual(audit.profile.packageManagers, ["pnpm", "yarn"]);
      if (explicit) {
        assert.equal(audit.profile.testCommand, "yarn test");
        assert.deepEqual(audit.profile.blockers, []);
        assert.ok(audit.profile.setupSignals.includes("yarn workspace"));
      } else {
        assert.equal(audit.profile.testCommand, undefined);
        assert.equal(audit.profile.confidence, "medium");
        assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("Multiple package managers detected (pnpm, yarn)")));
        assert.ok(audit.profile.setupSignals.includes("package workspace"));
      }
    }
  });

  it("uses bounded static runner config fields to recognize custom test locations", (t) => {
    const roots = [];
    t.after(() => roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

    const cases = [
      {
        framework: "vitest",
        config: "vitest.config.ts",
        content: "export default { test: { include: ['quality/**/*.check.ts'] } };\n",
        script: "vitest run"
      },
      {
        framework: "jest",
        config: "jest.config.mjs",
        content: "export default { testMatch: ['<rootDir>/quality/**/*.check.ts'] };\n",
        script: "jest"
      },
      {
        framework: "playwright",
        config: "playwright.config.ts",
        content: "export default { testDir: './quality', testMatch: '**/*.check.ts' };\n",
        script: "playwright test"
      },
      {
        framework: "cypress",
        config: "cypress.config.ts",
        content: "export default { e2e: { specPattern: 'quality/**/*.check.ts' } };\n",
        script: "cypress run"
      },
      {
        framework: "ava",
        config: "ava.config.mjs",
        content: "export default { files: ['quality/**/*.check.ts'] };\n",
        script: "ava"
      },
      {
        framework: "mocha",
        config: ".mocharc.json",
        content: JSON.stringify({ spec: ["quality/**/*.check.ts"] }),
        script: "mocha"
      }
    ];

    for (const entry of cases) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `repo-test-architect-${entry.framework}-custom-tests-`));
      roots.push(root);
      fs.mkdirSync(path.join(root, "src"), { recursive: true });
      fs.mkdirSync(path.join(root, "quality", "checkout"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ scripts: { test: entry.script } })
      );
      fs.writeFileSync(path.join(root, entry.config), entry.content);
      fs.writeFileSync(
        path.join(root, "src", "checkout.ts"),
        "export function checkout(value) { if (!value) throw new Error('missing'); return value; }\n"
      );
      fs.writeFileSync(
        path.join(root, "quality", "checkout", "checkout.check.ts"),
        "import { checkout } from '../../src/checkout';\ncheckout('ok');\n"
      );

      const audit = auditJavaScriptRepo(root);

      assert.deepEqual(audit.profile.testFrameworks, [entry.framework]);
      assert.equal(audit.profile.testCommand, "npm run test");
      assert.deepEqual(audit.profile.existingTestLocations, ["custom test location"]);
      assert.ok(audit.profile.detectedConventions.includes("configured test files"));
      assert.ok(audit.profile.setupSignals.includes(`${entry.framework} config`));
      assert.deepEqual(audit.profile.blockers, []);
      assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/checkout.ts"]);
    }
  });

  it("inherits an explicitly selected runner config only inside the owning workspace", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-inherited-runner-config-"));
    const packageRoot = path.join(root, "packages", "checkout");
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(packageRoot, "quality"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ private: true, packageManager: "pnpm@10.0.0", workspaces: ["packages/*"] })
    );
    fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lock\n");
    fs.writeFileSync(
      path.join(root, "config", "vitest.shared.ts"),
      "export default { test: { include: ['quality/**/*.check.ts'] } };\n"
    );
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ scripts: { test: "vitest run --config ../../config/vitest.shared.ts" } })
    );
    fs.writeFileSync(
      path.join(packageRoot, "src", "checkout.ts"),
      "export function checkout(value) { if (!value) throw new Error('missing'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(packageRoot, "quality", "checkout.check.ts"),
      "import { checkout } from '../src/checkout';\ncheckout('ok');\n"
    );

    const audit = auditJavaScriptRepo(packageRoot);

    assert.deepEqual(audit.profile.packageManagers, ["pnpm"]);
    assert.deepEqual(audit.profile.testFrameworks, ["vitest"]);
    assert.equal(audit.profile.testCommand, "pnpm run test");
    assert.ok(audit.profile.setupSignals.includes("vitest config (owning workspace)"));
    assert.ok(audit.profile.setupSignals.includes("pnpm workspace"));
    assert.deepEqual(audit.profile.existingTestLocations, ["custom test location"]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/checkout.ts"]);
  });

  it("honors bounded static include alternatives and exclusions", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-runner-config-excludes-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const directory of ["src", "quality/checkout", "quality/ignored"]) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    fs.writeFileSync(
      path.join(root, "vitest.config.ts"),
      "export default { test: { include: ['quality/**/*.{check,verify}.ts'], exclude: ['quality/ignored/**'] } };\n"
    );
    fs.writeFileSync(
      path.join(root, "src", "checkout.ts"),
      "export function checkout(value) { if (!value) throw new Error('missing'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "src", "refund.ts"),
      "export function refund(value) { if (!value) throw new Error('missing'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "quality", "checkout", "checkout.check.ts"),
      "import { checkout } from '../../src/checkout';\ncheckout('ok');\n"
    );
    fs.writeFileSync(
      path.join(root, "quality", "ignored", "refund.verify.ts"),
      "import { refund } from '../../src/refund';\nrefund('ok');\n"
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/checkout.ts"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/refund.ts"]);
  });

  it("does not inherit ambient or unowned ancestor runner configuration", (t) => {
    const roots = [];
    t.after(() => roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

    for (const entry of [
      { packagePath: ["packages", "checkout"], script: "vitest run" },
      { packagePath: ["tools", "checkout"], script: "vitest run --config ../../config/vitest.shared.ts" }
    ]) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-runner-config-near-miss-"));
      const packageRoot = path.join(root, ...entry.packagePath);
      roots.push(root);
      fs.mkdirSync(path.join(root, "config"), { recursive: true });
      fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
      fs.mkdirSync(path.join(packageRoot, "quality"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ private: true, workspaces: ["packages/*"] })
      );
      fs.writeFileSync(
        path.join(root, "config", "vitest.shared.ts"),
        "export default { test: { include: ['quality/**/*.check.ts'] } };\n"
      );
      fs.writeFileSync(
        path.join(packageRoot, "package.json"),
        JSON.stringify({ scripts: { test: entry.script } })
      );
      fs.writeFileSync(
        path.join(packageRoot, "src", "checkout.ts"),
        "export function checkout(value) { if (!value) throw new Error('missing'); return value; }\n"
      );
      fs.writeFileSync(
        path.join(packageRoot, "quality", "checkout.check.ts"),
        "import { checkout } from '../src/checkout';\ncheckout('ok');\n"
      );

      const audit = auditJavaScriptRepo(packageRoot);

      assert.ok(!audit.profile.setupSignals.some((signal) => signal.includes("vitest config")));
      assert.deepEqual(audit.profile.existingTestLocations, []);
      assert.deepEqual(audit.coveredButRisky, []);
      assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/checkout.ts"]);
    }
  });

  it("does not treat an arbitrary fixture config as package runner configuration", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-fixture-runner-config-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "fixtures"), { recursive: true });
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "quality"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    fs.writeFileSync(
      path.join(root, "fixtures", "vitest.config.ts"),
      "export default { test: { include: ['quality/**/*.check.ts'] } };\n"
    );
    fs.writeFileSync(
      path.join(root, "src", "checkout.ts"),
      "export function checkout(value) { if (!value) throw new Error('missing'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "quality", "checkout.check.ts"),
      "import { checkout } from '../src/checkout';\ncheckout('ok');\n"
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(audit.profile.testFrameworks, ["vitest"]);
    assert.ok(!audit.profile.setupSignals.includes("vitest config"));
    assert.deepEqual(audit.profile.existingTestLocations, []);
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/checkout.ts"]);
  });
});
