#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { auditGoRepo } from "../src/adapters/go/audit.js";

export const goPerformanceFixture = {
  sourceCount: 400,
  testCount: 200,
  expectedCoveredCount: 200,
  expectedUntestedCount: 200,
  expectedSkippedCount: 0,
  expectedEvidenceRelationshipCount: 200,
  maxAuditDurationMs: 5000
};

if (isMainModule()) {
  runGoPerformanceCheck();
}

export function runGoPerformanceCheck() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-go-performance-"));

  try {
    writePerformanceFixture(root);
    const started = performance.now();
    const audit = auditGoRepo(root);
    const auditDurationMs = Math.round(performance.now() - started);
    const observations = collectObservations(audit, auditDurationMs);
    const errors = validateGoPerformanceObservations(observations);

    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
      return observations;
    }

    console.log(
      `Go performance check passed: ${auditDurationMs} ms, ` +
      `${observations.coveredCount} covered, ${observations.untestedCount} untested, ` +
      `${observations.evidenceRelationshipCount} evidence relationships.`
    );
    return observations;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writePerformanceFixture(root) {
  fs.mkdirSync(path.join(root, "feature"), { recursive: true });
  fs.writeFileSync(path.join(root, "go.mod"), "module example.com/performance\n\ngo 1.22\n");

  for (let index = 0; index < goPerformanceFixture.sourceCount; index += 1) {
    fs.writeFileSync(
      path.join(root, "feature", `feature_${index}_case.go`),
      `package feature\n\nfunc Transform${index}[T ~int](value T) T {\n` +
      `\tif value < 0 { return 0 }\n` +
      `\treturn value + ${index}\n` +
      `}\n`
    );
  }

  for (let index = 0; index < goPerformanceFixture.testCount; index += 1) {
    fs.writeFileSync(
      path.join(root, "feature", `behavior_${index}_test.go`),
      `package feature\n\nimport "testing"\n\n` +
      `func TestBehavior${index}(t *testing.T) {\n` +
      `\tif Transform${index}[int](0) != ${index} { t.Fatal("unexpected result") }\n` +
      `}\n`
    );
  }
}

export function validateGoPerformanceObservations(observations) {
  const errors = [];
  const expected = goPerformanceFixture;
  if (observations.coveredCount !== expected.expectedCoveredCount) {
    errors.push(`Expected ${expected.expectedCoveredCount} covered Go targets, got ${observations.coveredCount}.`);
  }
  if (observations.untestedCount !== expected.expectedUntestedCount) {
    errors.push(`Expected ${expected.expectedUntestedCount} untested Go targets, got ${observations.untestedCount}.`);
  }
  if (observations.skippedCount !== expected.expectedSkippedCount) {
    errors.push(
      `Expected ${expected.expectedSkippedCount} skipped Go targets, got ${observations.skippedCount}: ` +
      `${observations.skippedPaths.join(", ")}.`
    );
  }
  if (observations.evidenceRelationshipCount !== expected.expectedEvidenceRelationshipCount) {
    errors.push(
      `Expected ${expected.expectedEvidenceRelationshipCount} Go evidence relationships, ` +
      `got ${observations.evidenceRelationshipCount}.`
    );
  }
  if (observations.auditDurationMs > expected.maxAuditDurationMs) {
    errors.push(
      `Go audit took ${observations.auditDurationMs} ms; ` +
      `the deterministic ${expected.sourceCount}-source/${expected.testCount}-test fixture budget is ` +
      `${expected.maxAuditDurationMs} ms.`
    );
  }
  return errors;
}

function collectObservations(audit, auditDurationMs) {
  return {
    auditDurationMs,
    coveredCount: audit.coveredButRisky.length,
    untestedCount: audit.untestedCandidates.length,
    skippedCount: audit.skipped.length,
    skippedPaths: audit.skipped.map((target) => target.path),
    evidenceRelationshipCount: audit.coveredButRisky.reduce(
      (total, target) => total + (target.existingTestEvidence?.length ?? 0),
      0
    )
  };
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
