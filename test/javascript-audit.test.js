import assert from "node:assert/strict";
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
      ["userRoutes"]
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
      ["userService"]
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
});
