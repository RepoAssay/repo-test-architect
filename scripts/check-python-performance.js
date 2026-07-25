#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { auditPythonRepo } from "../src/adapters/python/audit.js";

export const pythonPerformanceFixture = {
  sourceCount: 400,
  testCount: 200,
  expectedCoveredCount: 200,
  expectedUntestedCount: 200,
  expectedEvidenceRelationshipCount: 200,
  maxAuditDurationMs: 5000
};

if (isMainModule()) {
  runPythonPerformanceCheck();
}

export function runPythonPerformanceCheck() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-performance-"));

  try {
    writePerformanceFixture(root);
    const started = performance.now();
    const audit = auditPythonRepo(root);
    const auditDurationMs = Math.round(performance.now() - started);
    const observations = collectObservations(audit, auditDurationMs);
    const errors = validatePythonPerformanceObservations(observations);

    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
      return observations;
    }

    logPassingObservations("Python", observations);
    return observations;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writePerformanceFixture(root) {
  fs.mkdirSync(path.join(root, "app"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
  fs.writeFileSync(path.join(root, "app", "__init__.py"), "");

  for (let index = 0; index < pythonPerformanceFixture.sourceCount; index += 1) {
    fs.writeFileSync(
      path.join(root, "app", `feature_${index}.py`),
      `def transform_${index}(value):\n    if value < 0:\n        raise ValueError("negative")\n    return value + ${index}\n`
    );
  }

  for (let index = 0; index < pythonPerformanceFixture.testCount; index += 1) {
    fs.writeFileSync(
      path.join(root, "tests", `test_feature_${index}.py`),
      `from app.feature_${index} import transform_${index}\n\n\ndef test_transform_${index}():\n    assert transform_${index}(0) == ${index}\n`
    );
  }
}

export function validatePythonPerformanceObservations(observations) {
  return validateObservations("Python", observations, pythonPerformanceFixture);
}

function collectObservations(audit, auditDurationMs) {
  return {
    auditDurationMs,
    coveredCount: audit.coveredButRisky.length,
    untestedCount: audit.untestedCandidates.length,
    evidenceRelationshipCount: audit.coveredButRisky.reduce(
      (total, target) => total + (target.existingTestEvidence?.length ?? 0),
      0
    )
  };
}

function validateObservations(adapterName, observations, expected) {
  const errors = [];
  if (observations.coveredCount !== expected.expectedCoveredCount) {
    errors.push(`Expected ${expected.expectedCoveredCount} covered ${adapterName} targets, got ${observations.coveredCount}.`);
  }
  if (observations.untestedCount !== expected.expectedUntestedCount) {
    errors.push(`Expected ${expected.expectedUntestedCount} untested ${adapterName} targets, got ${observations.untestedCount}.`);
  }
  if (observations.evidenceRelationshipCount !== expected.expectedEvidenceRelationshipCount) {
    errors.push(
      `Expected ${expected.expectedEvidenceRelationshipCount} ${adapterName} evidence relationships, ` +
      `got ${observations.evidenceRelationshipCount}.`
    );
  }
  if (observations.auditDurationMs > expected.maxAuditDurationMs) {
    errors.push(
      `${adapterName} audit took ${observations.auditDurationMs} ms; ` +
      `the deterministic ${expected.sourceCount}-source/${expected.testCount}-test fixture budget is ` +
      `${expected.maxAuditDurationMs} ms.`
    );
  }
  return errors;
}

function logPassingObservations(adapterName, observations) {
  console.log(
    `${adapterName} performance check passed: ${observations.auditDurationMs} ms, ` +
    `${observations.coveredCount} covered, ${observations.untestedCount} untested, ` +
    `${observations.evidenceRelationshipCount} evidence relationships.`
  );
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
