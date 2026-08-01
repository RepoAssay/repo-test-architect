#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { auditPhpRepo } from "../src/adapters/php/audit.js";

export const phpPerformanceFixture = {
  sourceCount: 400,
  testCount: 200,
  expectedCoveredCount: 200,
  expectedUntestedCount: 200,
  expectedEvidenceRelationshipCount: 200,
  maxAuditDurationMs: 5000
};

if (isMainModule()) runPhpPerformanceCheck();

export function runPhpPerformanceCheck() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-php-performance-"));
  try {
    writeFixture(root);
    const started = performance.now();
    const audit = auditPhpRepo(root);
    const observations = {
      auditDurationMs: Math.round(performance.now() - started),
      coveredCount: audit.coveredButRisky.length,
      untestedCount: audit.untestedCandidates.length,
      evidenceRelationshipCount: audit.coveredButRisky.reduce(
        (total, target) => total + (target.existingTestEvidence?.length ?? 0),
        0
      )
    };
    const errors = validatePhpPerformanceObservations(observations);
    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
      return observations;
    }
    console.log(
      `PHP performance check passed: ${observations.auditDurationMs} ms, ` +
      `${observations.coveredCount} covered, ${observations.untestedCount} untested, ` +
      `${observations.evidenceRelationshipCount} evidence relationships.`
    );
    return observations;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeFixture(root) {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "composer.json"), JSON.stringify({
    "require-dev": { "phpunit/phpunit": "^12.0" },
    autoload: { "psr-4": { "Example\\": "src/" } },
    "autoload-dev": { "psr-4": { "Example\\Tests\\": "tests/" } },
    scripts: { test: "phpunit" }
  }));
  for (let index = 0; index < phpPerformanceFixture.sourceCount; index += 1) {
    fs.writeFileSync(path.join(root, "src", `Feature${index}.php`),
      `<?php namespace Example; final class Feature${index} { public static function transform(int $value): int { return $value + ${index}; } }\n`);
  }
  for (let index = 0; index < phpPerformanceFixture.testCount; index += 1) {
    fs.writeFileSync(path.join(root, "tests", `Feature${index}Test.php`),
      `<?php namespace Example\\Tests; use Example\\Feature${index}; use PHPUnit\\Framework\\TestCase; ` +
      `final class Feature${index}Test extends TestCase { public function testTransform(): void { self::assertSame(${index}, Feature${index}::transform(0)); } }\n`);
  }
}

export function validatePhpPerformanceObservations(observations) {
  const errors = [];
  const expected = phpPerformanceFixture;
  if (observations.coveredCount !== expected.expectedCoveredCount) {
    errors.push(`Expected ${expected.expectedCoveredCount} covered PHP targets, got ${observations.coveredCount}.`);
  }
  if (observations.untestedCount !== expected.expectedUntestedCount) {
    errors.push(`Expected ${expected.expectedUntestedCount} untested PHP targets, got ${observations.untestedCount}.`);
  }
  if (observations.evidenceRelationshipCount !== expected.expectedEvidenceRelationshipCount) {
    errors.push(`Expected ${expected.expectedEvidenceRelationshipCount} PHP evidence relationships, got ${observations.evidenceRelationshipCount}.`);
  }
  if (observations.auditDurationMs > expected.maxAuditDurationMs) {
    errors.push(`PHP audit took ${observations.auditDurationMs} ms; the deterministic fixture budget is ${expected.maxAuditDurationMs} ms.`);
  }
  return errors;
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
