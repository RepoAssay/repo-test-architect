#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";

export const javascriptPerformanceFixture = {
  sourceCount: 400,
  testCount: 200,
  expectedCoveredCount: 200,
  expectedUntestedCount: 200,
  expectedEvidenceRelationshipCount: 200,
  maxAuditDurationMs: 5000
};

if (isMainModule()) {
  runJavaScriptPerformanceCheck();
}

export function runJavaScriptPerformanceCheck() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-javascript-performance-"));

  try {
    writePerformanceFixture(root);
    const started = performance.now();
    const audit = auditJavaScriptRepo(root);
    const auditDurationMs = Math.round(performance.now() - started);
    const evidenceRelationshipCount = audit.coveredButRisky.reduce(
      (total, target) => total + (target.existingTestEvidence?.length ?? 0),
      0
    );
    const observations = {
      auditDurationMs,
      coveredCount: audit.coveredButRisky.length,
      untestedCount: audit.untestedCandidates.length,
      evidenceRelationshipCount
    };
    const errors = validateJavaScriptPerformanceObservations(observations);

    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
      return observations;
    }

    console.log(
      `JavaScript performance check passed: ${auditDurationMs} ms, ` +
      `${observations.coveredCount} covered, ${observations.untestedCount} untested, ` +
      `${evidenceRelationshipCount} evidence relationships.`
    );
    return observations;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writePerformanceFixture(root) {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "test"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      scripts: { test: "vitest --run" },
      devDependencies: { vitest: "latest" }
    })
  );

  for (let index = 0; index < javascriptPerformanceFixture.sourceCount; index += 1) {
    fs.writeFileSync(
      path.join(root, "src", `module-${index}.ts`),
      `export function feature${index}(value) { if (!value) throw new Error("missing"); return value; }\n`
    );
  }

  for (let index = 0; index < javascriptPerformanceFixture.testCount; index += 1) {
    fs.writeFileSync(
      path.join(root, "test", `behavior-${index}.test.ts`),
      `import { feature${index} } from "../src/module-${index}";\n` +
      `expect(feature${index}("ok")).toBe("ok");\n`
    );
  }
}

export function validateJavaScriptPerformanceObservations(observations) {
  const errors = [];
  const expected = javascriptPerformanceFixture;
  if (observations.coveredCount !== expected.expectedCoveredCount) {
    errors.push(`Expected ${expected.expectedCoveredCount} covered targets, got ${observations.coveredCount}.`);
  }
  if (observations.untestedCount !== expected.expectedUntestedCount) {
    errors.push(`Expected ${expected.expectedUntestedCount} untested targets, got ${observations.untestedCount}.`);
  }
  if (observations.evidenceRelationshipCount !== expected.expectedEvidenceRelationshipCount) {
    errors.push(
      `Expected ${expected.expectedEvidenceRelationshipCount} evidence relationships, ` +
      `got ${observations.evidenceRelationshipCount}.`
    );
  }
  if (observations.auditDurationMs > expected.maxAuditDurationMs) {
    errors.push(
      `JavaScript audit took ${observations.auditDurationMs} ms; ` +
      `the deterministic ${expected.sourceCount}-source/${expected.testCount}-test fixture budget is ` +
      `${expected.maxAuditDurationMs} ms.`
    );
  }
  return errors;
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
