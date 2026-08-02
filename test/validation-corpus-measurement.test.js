import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalAuditDigest,
  medianInteger,
  summarizeAuditPhaseRuns,
  summarizeCorpusRuns
} from "../scripts/measure-validation-corpus.js";
import { AUDIT_PROFILE_PHASES } from "../src/core/audit-phase-timing.js";

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

  it("summarizes five complete audit-phase samples in pipeline order", () => {
    const runs = [1, 2, 3, 4, 5].map((sample) => ({
      phaseDurationMs: Object.fromEntries(
        AUDIT_PROFILE_PHASES.map((phase, index) => [phase, sample + index])
      )
    }));

    const summary = summarizeAuditPhaseRuns(runs);
    assert.deepEqual(summary.phases, AUDIT_PROFILE_PHASES);
    assert.deepEqual(summary.samplesMs["traversal-and-text-read"], [1, 2, 3, 4, 5]);
    assert.equal(summary.mediansMs["traversal-and-text-read"], 3);
    assert.equal(summary.mediansMs["evidence-classification-and-artifact"], 7);
  });

  it("rejects incomplete or missing audit-phase samples", () => {
    assert.throws(() => summarizeAuditPhaseRuns([]), /at least five runs/);
    assert.throws(
      () => summarizeAuditPhaseRuns(Array.from({ length: 5 }, () => ({ phaseDurationMs: {} }))),
      /Missing or invalid audit phase timing/
    );
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
