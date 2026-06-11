import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";

const exampleRoot = path.resolve("examples/node-vitest-basic");

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
    assert.ok(deckParser.reasons.includes("Existing test file detected; review missing edge cases"));
  });

  it("skips low-value source files with an explicit reason", () => {
    const audit = auditJavaScriptRepo(exampleRoot);

    assert.deepEqual(
      audit.skipped.map((target) => target.name),
      ["constants"]
    );
    assert.match(audit.skipped[0].reason, /No meaningful runtime behavior/);
  });
});
