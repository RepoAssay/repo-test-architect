#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { auditDartRepo } from "../src/adapters/dart/audit.js";

export function runDartPerformanceCheck() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rta-dart-performance-"));
  try {
    fs.mkdirSync(path.join(root, "lib"));
    fs.mkdirSync(path.join(root, "test"));
    fs.writeFileSync(path.join(root, "pubspec.yaml"), "name: perf\nenvironment: {sdk: '^3.0.0'}\ndev_dependencies: {test: ^1.25.0}\n");
    for (let index = 0; index < 400; index++) {
      fs.writeFileSync(path.join(root, "lib", `feature_${index}.dart`), `int feature${index}(int n) { if (n < 0) return 0; return n; }\n`);
      if (index < 200) fs.writeFileSync(path.join(root, "test", `feature_${index}_test.dart`),
        `import 'package:test/test.dart';\nimport 'package:perf/feature_${index}.dart';\nvoid main() { test('feature', () { expect(feature${index}(1), 1); }); }\n`);
    }
    const started = performance.now();
    const audit = auditDartRepo(root);
    const durationMs = Math.round(performance.now() - started);
    assert.equal(audit.profile.testCommand, "dart test");
    assert.equal(audit.coveredButRisky.length, 200);
    assert.equal(audit.untestedCandidates.length, 200);
    assert.equal(audit.coveredButRisky.reduce((total, target) => total + target.existingTestEvidence.length, 0), 200);
    assert.ok(durationMs <= 5000, `Dart audit exceeded 5000 ms: ${durationMs} ms`);
    console.log(`Dart performance check passed: ${durationMs} ms, 200 covered, 200 untested, 200 import relationships.`);
    return { durationMs, coveredCount: 200, untestedCount: 200, evidenceRelationshipCount: 200 };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runDartPerformanceCheck();
