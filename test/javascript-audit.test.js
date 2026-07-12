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

  it("matches tests with direct relative source imports", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-js-import-tests-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src", "rules"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "formatters"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "vitest --run" }, devDependencies: { vitest: "latest" } })
    );

    for (const sourcePath of ["src/rules/payment-policy.ts", "src/rules/cart-policy.ts", "src/formatters/index.ts", "src/session.ts"]) {
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
      `import { evaluate as evaluateCart } from "../src/rules/cart-policy";\nconst result = evaluateCart(true);\nexpect(result).toBe("yes");\n`
    );

    const audit = auditJavaScriptRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.path}:${target.existingTestPaths.join(",")}`),
      [
        "src/formatters/index.ts:test/checkout-behavior.test.ts",
        "src/rules/cart-policy.ts:test/cart-flow.test.ts",
        "src/rules/payment-policy.ts:test/checkout-behavior.test.ts",
        "src/session.ts:test/login-flow.test.js"
      ]
    );
    assert.deepEqual(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["src/formatters/index.ts", undefined],
        ["src/rules/cart-policy.ts", "asserted"],
        ["src/rules/payment-policy.ts", "asserted"],
        ["src/session.ts", "called"]
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
});
