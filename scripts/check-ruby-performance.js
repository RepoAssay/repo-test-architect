#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { auditRubyRepo } from "../src/adapters/ruby/audit.js";

export const rubyPerformanceFixture = {
  sourceCount: 400,
  testCount: 200,
  expectedCoveredCount: 200,
  expectedUntestedCount: 200,
  expectedEvidenceRelationshipCount: 200,
  maxAuditDurationMs: 5000
};

if (isMainModule()) runRubyPerformanceCheck();

export function runRubyPerformanceCheck() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-ruby-performance-"));
  try {
    writePerformanceFixture(root);
    const started = performance.now();
    const audit = auditRubyRepo(root);
    const auditDurationMs = Math.round(performance.now() - started);
    const observations = collectObservations(audit, auditDurationMs);
    const errors = validateRubyPerformanceObservations(observations);
    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
      return observations;
    }
    console.log(
      `Ruby performance check passed: ${auditDurationMs} ms, ` +
      `${observations.coveredCount} covered, ${observations.untestedCount} untested, ` +
      `${observations.evidenceRelationshipCount} evidence relationships.`
    );
    return observations;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writePerformanceFixture(root) {
  fs.mkdirSync(path.join(root, "lib"), { recursive: true });
  fs.mkdirSync(path.join(root, "test"), { recursive: true });
  fs.writeFileSync(path.join(root, "Gemfile"), 'source "https://rubygems.org"\ngem "minitest"\n');
  for (let index = 0; index < rubyPerformanceFixture.sourceCount; index += 1) {
    fs.writeFileSync(
      path.join(root, "lib", `feature_${index}.rb`),
      `class Feature${index}\n` +
      `  def self.transform(value)\n` +
      `    return 0 if value.nil?\n` +
      `    value + ${index}\n` +
      `  end\n` +
      `end\n`
    );
  }
  for (let index = 0; index < rubyPerformanceFixture.testCount; index += 1) {
    fs.writeFileSync(
      path.join(root, "test", `feature_${index}_test.rb`),
      `require "minitest/autorun"\n` +
      `class Feature${index}Test < Minitest::Test\n` +
      `  def test_transform\n` +
      `    assert_equal ${index}, Feature${index}.transform(0)\n` +
      `  end\n` +
      `end\n`
    );
  }
}

export function validateRubyPerformanceObservations(observations) {
  const errors = [];
  const expected = rubyPerformanceFixture;
  if (observations.coveredCount !== expected.expectedCoveredCount) {
    errors.push(`Expected ${expected.expectedCoveredCount} covered Ruby targets, got ${observations.coveredCount}.`);
  }
  if (observations.untestedCount !== expected.expectedUntestedCount) {
    errors.push(`Expected ${expected.expectedUntestedCount} untested Ruby targets, got ${observations.untestedCount}.`);
  }
  if (observations.evidenceRelationshipCount !== expected.expectedEvidenceRelationshipCount) {
    errors.push(`Expected ${expected.expectedEvidenceRelationshipCount} Ruby evidence relationships, got ${observations.evidenceRelationshipCount}.`);
  }
  if (observations.auditDurationMs > expected.maxAuditDurationMs) {
    errors.push(
      `Ruby audit took ${observations.auditDurationMs} ms; the deterministic ` +
      `${expected.sourceCount}-source/${expected.testCount}-test fixture budget is ${expected.maxAuditDurationMs} ms.`
    );
  }
  return errors;
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

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
