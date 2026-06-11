import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";

const exampleRoot = path.resolve("examples/node-vitest-basic");
const noTestsRoot = path.resolve("examples/node-no-tests-yet");

describe("JavaScript audit adapter", () => {
  it("detects package, framework, command, and repository conventions", () => {
    const audit = auditJavaScriptRepo(exampleRoot);

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
    assert.ok(deckParser.reasons.includes("Existing test file detected; review missing edge cases"));
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
});
