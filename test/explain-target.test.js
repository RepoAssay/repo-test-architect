import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";
import { explainTarget } from "../src/core/explain-target.js";

describe("target explanation", () => {
  it("explains a recommended audit target", () => {
    const audit = auditJavaScriptRepo(path.resolve("examples/node-vitest-basic"));
    const explanation = explainTarget(audit, "src/authService.ts");

    assert.equal(explanation.schemaVersion, "target-explanation/v1");
    assert.equal(explanation.targetId, "src/authService.ts");
    assert.equal(explanation.target, "authService");
    assert.equal(explanation.category, "untestedCandidates");
    assert.equal(explanation.recommendation, "test");
    assert.equal(explanation.testLevel, "unit");
    assert.deepEqual(explanation.signals, ["service-name", "auth-branch"]);
  });

  it("explains a skipped audit target", () => {
    const audit = auditJavaScriptRepo(path.resolve("examples/node-vitest-basic"));
    const explanation = explainTarget(audit, "src/userDto.ts");

    assert.equal(explanation.category, "skipped");
    assert.equal(explanation.recommendation, "defer");
    assert.equal(explanation.testLevel, "none");
    assert.ok(explanation.rationale.includes("DTO-only models are usually better covered through boundary parsing or mapper tests."));
  });

  it("carries existing test evidence into covered target explanations", () => {
    const audit = auditJavaScriptRepo(path.resolve("examples/node-vitest-basic"));
    const explanation = explainTarget(audit, "src/deckParser.ts");

    assert.deepEqual(explanation.existingTestEvidence, [
      {
        testPath: "src/deckParser.test.ts",
        kind: "direct-relative-import",
        strength: "direct",
        usage: "called"
      }
    ]);
  });

  it("defaults optional target arrays in explanation artifacts", () => {
    const explanation = explainTarget(
      {
        schemaVersion: "audit/v1",
        untestedCandidates: [
          {
            id: "src/paymentClient.ts",
            name: "paymentClient",
            path: "src/paymentClient.ts",
            kind: "service",
            risk: "high",
            testability: "medium",
            recommendedTestLevel: "unit",
            riskReductionScore: 8,
            maintenanceCost: 4,
            signals: ["service-name"]
          }
        ],
        coveredButRisky: [],
        skipped: []
      },
      "src/paymentClient.ts"
    );

    assert.deepEqual(explanation.rationale, []);
    assert.deepEqual(explanation.existingTestPaths, []);
  });

  it("rejects unknown audit targets", () => {
    const audit = auditJavaScriptRepo(path.resolve("examples/node-vitest-basic"));

    assert.throws(() => explainTarget(audit, "src/missing.ts"), /Audit target not found/);
  });
});
