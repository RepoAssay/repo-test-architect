#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { auditRustRepo } from "../src/adapters/rust/audit.js";

export const rustPerformanceFixture = {
  sourceCount: 400,
  testCount: 200,
  expectedCoveredCount: 200,
  expectedUntestedCount: 200,
  expectedSkippedCount: 1,
  expectedSkippedPaths: ["src/lib.rs"],
  expectedEvidenceRelationshipCount: 200,
  maxAuditDurationMs: 5000
};

if (isMainModule()) {
  runRustPerformanceCheck();
}

export function runRustPerformanceCheck() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-rust-performance-"));

  try {
    writePerformanceFixture(root);
    const started = performance.now();
    const audit = auditRustRepo(root);
    const auditDurationMs = Math.round(performance.now() - started);
    const observations = collectObservations(audit, auditDurationMs);
    const errors = validateRustPerformanceObservations(observations);

    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
      return observations;
    }

    console.log(
      `Rust performance check passed: ${auditDurationMs} ms, ` +
      `${observations.coveredCount} covered, ${observations.untestedCount} untested, ` +
      `${observations.skippedCount} skipped, ` +
      `${observations.evidenceRelationshipCount} evidence relationships.`
    );
    return observations;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writePerformanceFixture(root) {
  const sourceRoot = path.join(root, "src");
  const testRoot = path.join(root, "tests");
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(testRoot, { recursive: true });
  fs.writeFileSync(
    path.join(root, "Cargo.toml"),
    `[package]\nname = "rust-performance"\nversion = "0.1.0"\nedition = "2024"\n`
  );
  fs.writeFileSync(
    path.join(sourceRoot, "lib.rs"),
    Array.from(
      { length: rustPerformanceFixture.sourceCount },
      (_, index) => `pub mod feature_${index};`
    ).join("\n") + "\n"
  );

  for (let index = 0; index < rustPerformanceFixture.sourceCount; index += 1) {
    fs.writeFileSync(
      path.join(sourceRoot, `feature_${index}.rs`),
      `pub fn transform_${index}(value: i32) -> i32 {\n` +
      `    if value < 0 { return 0; }\n` +
      `    value + ${index}\n` +
      `}\n`
    );
  }

  for (let index = 0; index < rustPerformanceFixture.testCount; index += 1) {
    fs.writeFileSync(
      path.join(testRoot, `behavior_${index}.rs`),
      `use rust_performance::feature_${index}::transform_${index};\n\n` +
      `#[test]\n` +
      `fn verifies_feature_${index}() {\n` +
      `    assert_eq!(transform_${index}(0), ${index});\n` +
      `}\n`
    );
  }
}

export function validateRustPerformanceObservations(observations) {
  const errors = [];
  const expected = rustPerformanceFixture;
  if (observations.coveredCount !== expected.expectedCoveredCount) {
    errors.push(`Expected ${expected.expectedCoveredCount} covered Rust targets, got ${observations.coveredCount}.`);
  }
  if (observations.untestedCount !== expected.expectedUntestedCount) {
    errors.push(`Expected ${expected.expectedUntestedCount} untested Rust targets, got ${observations.untestedCount}.`);
  }
  if (
    observations.skippedCount !== expected.expectedSkippedCount ||
    !samePaths(observations.skippedPaths, expected.expectedSkippedPaths)
  ) {
    errors.push(
      `Expected ${expected.expectedSkippedCount} skipped Rust target at ${expected.expectedSkippedPaths.join(", ")}, ` +
      `got ${observations.skippedCount}: ${observations.skippedPaths.join(", ")}.`
    );
  }
  if (observations.evidenceRelationshipCount !== expected.expectedEvidenceRelationshipCount) {
    errors.push(
      `Expected ${expected.expectedEvidenceRelationshipCount} Rust evidence relationships, ` +
      `got ${observations.evidenceRelationshipCount}.`
    );
  }
  if (observations.auditDurationMs > expected.maxAuditDurationMs) {
    errors.push(
      `Rust audit took ${observations.auditDurationMs} ms; ` +
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

function samePaths(left, right) {
  return left.length === right.length && left.every((currentPath, index) => currentPath === right[index]);
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
