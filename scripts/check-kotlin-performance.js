#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { auditKotlinRepo } from "../src/adapters/kotlin/audit.js";

export const kotlinPerformanceFixture = {
  sourceCount: 400,
  testCount: 200,
  expectedCoveredCount: 200,
  expectedUntestedCount: 200,
  expectedEvidenceRelationshipCount: 200,
  maxAuditDurationMs: 5000
};

if (isMainModule()) {
  runKotlinPerformanceCheck();
}

export function runKotlinPerformanceCheck() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-kotlin-performance-"));

  try {
    writePerformanceFixture(root);
    const started = performance.now();
    const audit = auditKotlinRepo(root);
    const auditDurationMs = Math.round(performance.now() - started);
    const observations = collectObservations(audit, auditDurationMs);
    const errors = validateKotlinPerformanceObservations(observations);

    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
      return observations;
    }

    logPassingObservations("Kotlin", observations);
    return observations;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writePerformanceFixture(root) {
  const sourceRoot = path.join(root, "src", "main", "kotlin", "com", "example", "performance");
  const testRoot = path.join(root, "src", "test", "kotlin", "com", "example", "performance");
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(testRoot, { recursive: true });
  fs.writeFileSync(
    path.join(root, "build.gradle.kts"),
    `plugins { kotlin("jvm") version "2.0.0" }\n\ndependencies { testImplementation(kotlin("test")) }\n`
  );
  fs.writeFileSync(path.join(root, "settings.gradle.kts"), `rootProject.name = "performance-fixture"\n`);

  for (let index = 0; index < kotlinPerformanceFixture.sourceCount; index += 1) {
    fs.writeFileSync(
      path.join(sourceRoot, `Parser${index}.kt`),
      `package com.example.performance\n\nclass Parser${index} {\n    fun transform${index}(value: Int): Int {\n        require(value >= 0)\n        return value + ${index}\n    }\n}\n`
    );
  }

  for (let index = 0; index < kotlinPerformanceFixture.testCount; index += 1) {
    fs.writeFileSync(
      path.join(testRoot, `Parser${index}Test.kt`),
      `package com.example.performance\n\nimport kotlin.test.Test\nimport kotlin.test.assertEquals\n\nclass Parser${index}Test {\n    @Test\n    fun verifiesParser${index}() {\n        assertEquals(${index}, Parser${index}().transform${index}(0))\n    }\n}\n`
    );
  }
}

export function validateKotlinPerformanceObservations(observations) {
  return validateObservations("Kotlin", observations, kotlinPerformanceFixture);
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
