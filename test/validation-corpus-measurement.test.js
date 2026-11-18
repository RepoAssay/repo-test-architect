import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalAuditDigest,
  canonicalScanDigest,
  medianInteger,
  summarizeAuditPhaseRuns,
  summarizeCorpusRuns,
  selectAdapterScanEntries,
  summarizeCorpusScanRuns
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

describe("validation corpus repository-scan measurement", () => {
  function scanEntries(root, { command = "swift test", extraTarget = false } = {}) {
    const audit = (testCommand, untested, covered) => ({
      schemaVersion: "audit/v1",
      profile: { root, testCommand, confidence: "high", blockers: [], diagnostics: [] },
      untestedCandidates: untested,
      coveredButRisky: covered,
      skipped: [{ id: "s", name: "s", path: "s.swift", kind: "low-value", signals: [], riskReductionScore: 1, maintenanceCost: 1, reason: "r" }],
      recommended: [],
      risks: []
    });
    const covered = [{ id: "a", name: "a", path: "Sources/A/A.swift", existingTestPaths: ["Tests/ATests.swift"], existingTestEvidence: [{ testPath: "Tests/ATests.swift", kind: "swift-symbol-reference", strength: "referenced", usage: "called" }] }];
    const untested = [{ id: "b", name: "b", path: "Sources/B/B.swift", existingTestPaths: [] }, ...(extraTarget ? [{ id: "c", name: "c", path: "Sources/C/C.swift", existingTestPaths: [] }] : [])];
    return [
      { projectId: "p2", projectRoot: "Packages/Models", adapterId: "swift", audit: audit(command, untested, covered) },
      { projectId: "p1", projectRoot: ".", adapterId: "swift", audit: audit(undefined, [], []) }
    ];
  }

  it("sums every project the adapter owns, keeps the single distinct command and digests the sorted scan", () => {
    const summary = summarizeCorpusScanRuns([
      { entries: scanEntries("/tmp/a"), durationMs: 580.4 },
      { entries: scanEntries("C:\\b"), durationMs: 570.2 },
      { entries: scanEntries("/tmp/c"), durationMs: 601 }
    ]);
    assert.deepEqual(summary, {
      testCommand: "swift test",
      projectCount: 2,
      untestedCandidates: 1,
      coveredButRisky: 1,
      skippedTargets: 2,
      auditDurationMs: 580,
      auditDurationSamplesMs: [580, 570, 601],
      evidenceRelationshipCount: 1,
      canonicalAuditSha256: canonicalScanDigest(scanEntries("/anywhere"))
    });
    assert.equal(canonicalScanDigest(scanEntries("/x")), canonicalScanDigest([...scanEntries("/y")].reverse()), "project order does not change the digest");
  });

  it("records no command when projects disagree and rejects drift across scans", () => {
    const mixed = scanEntries("/tmp/a");
    mixed[1].audit.profile.testCommand = "xcodebuild test -scheme App";
    const summary = summarizeCorpusScanRuns([
      { entries: mixed, durationMs: 1 },
      { entries: mixed, durationMs: 2 },
      { entries: mixed, durationMs: 3 }
    ]);
    assert.equal(summary.testCommand, null);

    assert.throws(() => summarizeCorpusScanRuns([
      { entries: scanEntries("/tmp/a"), durationMs: 1 },
      { entries: scanEntries("/tmp/a", { extraTarget: true }), durationMs: 2 },
      { entries: scanEntries("/tmp/a"), durationMs: 3 }
    ]), /Canonical scan output changed/);
    assert.throws(() => summarizeCorpusScanRuns([{ entries: scanEntries("/tmp/a"), durationMs: 1 }]), /at least three scan runs/);
  });
});

describe("validation corpus repository-scan selection", () => {
  it("keeps the adapter's audits and refuses scans with a failed or missing project of that adapter", () => {
    const audit = { profile: {} };
    const scan = { root: "/r", audits: [{ projectRoot: ".", adapterId: "swift", audit }, { projectRoot: "web", adapterId: "javascript", audit }], failedProjects: [] };
    assert.deepEqual(selectAdapterScanEntries(scan, "swift").map((entry) => entry.projectRoot), ["."]);
    assert.throws(() => selectAdapterScanEntries({ ...scan, failedProjects: [{ projectRoot: "Packages/Env", adapterId: "swift" }] }, "swift"), /scan failed for 1 swift project\(s\): Packages\/Env/);
    assert.deepEqual(selectAdapterScanEntries({ ...scan, failedProjects: [{ projectRoot: "web", adapterId: "javascript" }] }, "swift").length, 1, "another adapter's failure does not block the pin");
    assert.throws(() => selectAdapterScanEntries(scan, "kotlin"), /audited no kotlin project/);
  });
});
