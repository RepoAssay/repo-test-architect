import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";
import { rankTestCandidates } from "../src/core/rank-test-candidates.js";

describe("test candidate ranking", () => {
  it("ranks untested and covered-but-risky candidates by priority", () => {
    const audit = auditJavaScriptRepo(path.resolve("examples/node-vitest-basic"));
    const ranking = rankTestCandidates(audit);

    assert.equal(ranking.schemaVersion, "candidate-ranking/v1");
    assert.equal(ranking.summary.confidence, "high");
    assert.equal(ranking.summary.candidateCount, 2);
    assert.deepEqual(
      ranking.candidates.map((candidate) => `${candidate.category}:${candidate.targetId}`),
      ["covered-but-risky:src/deckParser.ts", "untested:src/authService.ts"]
    );
    assert.deepEqual(ranking.candidates[0].existingTestEvidence, [
      {
        testPath: "src/deckParser.test.ts",
        kind: "direct-relative-import",
        strength: "direct",
        usage: "called"
      }
    ]);
  });

  it("carries blockers when ranking candidates without a runnable test command", () => {
    const audit = auditJavaScriptRepo(path.resolve("examples/node-no-tests-yet"));
    const ranking = rankTestCandidates(audit);

    assert.equal(ranking.summary.confidence, "low");
    assert.equal(ranking.summary.verificationCommand, undefined);
    assert.ok(ranking.blockers.includes("No supported JS test framework detected."));
  });

  it("defaults optional target arrays in ranked candidates", () => {
    const ranking = rankTestCandidates({
      schemaVersion: "audit/v1",
      profile: {
        confidence: "medium",
        blockers: []
      },
      untestedCandidates: [
        {
          id: "src/paymentClient.ts",
          name: "paymentClient",
          path: "src/paymentClient.ts",
          kind: "service",
          recommendedTestLevel: "unit",
          riskReductionScore: 8,
          maintenanceCost: 4,
          signals: ["service-name"]
        }
      ],
      coveredButRisky: []
    });

    assert.deepEqual(ranking.candidates[0].rationale, []);
    assert.deepEqual(ranking.candidates[0].existingTestPaths, []);
  });
});
