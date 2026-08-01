import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalAuditDigest,
  medianInteger,
  summarizeCorpusRuns
} from "../scripts/measure-validation-corpus.js";

describe("validation corpus measurement", () => {
  it("normalizes checkout roots and records a repeated semantic baseline", () => {
    const audit = sampleAudit("/tmp/first");
    assert.equal(canonicalAuditDigest(audit), canonicalAuditDigest(sampleAudit("C:\\second")));

    assert.deepEqual(
      summarizeCorpusRuns([
        { audit, durationMs: 13.4 },
        { audit: sampleAudit("/tmp/first"), durationMs: 9.2 },
        { audit: sampleAudit("/tmp/first"), durationMs: 11.8 }
      ]),
      {
        testCommand: "pytest",
        untestedCandidates: 1,
        coveredButRisky: 1,
        skippedTargets: 1,
        auditDurationMs: 12,
        auditDurationSamplesMs: [13, 9, 12],
        evidenceRelationshipCount: 1,
        canonicalAuditSha256: canonicalAuditDigest(audit)
      }
    );
  });

  it("rejects semantic drift and incomplete samples", () => {
    const audit = sampleAudit("/tmp/repo");
    assert.throws(
      () => summarizeCorpusRuns([
        { audit, durationMs: 10 },
        { audit, durationMs: 11 }
      ]),
      /at least three audit runs/
    );
    assert.throws(
      () => summarizeCorpusRuns([
        { audit, durationMs: 10 },
        { audit: { ...audit, risks: ["drift"] }, durationMs: 11 },
        { audit, durationMs: 12 }
      ]),
      /Canonical audit output changed/
    );
  });

  it("records an intentionally withheld verification command as null", () => {
    const audit = sampleAudit("/tmp/repo");
    delete audit.profile.testCommand;

    const summary = summarizeCorpusRuns([
      { audit, durationMs: 10 },
      { audit, durationMs: 11 },
      { audit, durationMs: 12 }
    ]);

    assert.equal(summary.testCommand, null);
  });

  it("uses the middle observed integer as the standardized duration", () => {
    assert.equal(medianInteger([90, 10, 30]), 30);
    assert.throws(() => medianInteger([1.5]), /integer array/);
  });
});

function sampleAudit(root) {
  return {
    schemaVersion: "audit/v1",
    profile: {
      root,
      testCommand: "pytest"
    },
    untestedCandidates: [{ id: "missing" }],
    coveredButRisky: [{
      id: "covered",
      existingTestEvidence: [{ testPath: "tests/test_feature.py", kind: "python-module-import", strength: "direct" }]
    }],
    recommended: [],
    skipped: [{ id: "wiring" }],
    risks: []
  };
}
