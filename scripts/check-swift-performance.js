#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { auditSwiftRepo } from "../src/adapters/swift/audit.js";

export const swiftPerformanceFixture = {
  sourceCount: 400,
  testCount: 200,
  expectedCoveredCount: 200,
  expectedUntestedCount: 200,
  expectedEvidenceRelationshipCount: 200,
  maxAuditDurationMs: 5000
};

if (isMainModule()) {
  runSwiftPerformanceCheck();
}

export function runSwiftPerformanceCheck() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-swift-performance-"));

  try {
    writePerformanceFixture(root);
    const started = performance.now();
    const audit = auditSwiftRepo(root);
    const auditDurationMs = Math.round(performance.now() - started);
    const observations = collectObservations(audit, auditDurationMs);
    const errors = validateSwiftPerformanceObservations(observations);

    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
      return observations;
    }

    logPassingObservations("Swift", observations);
    return observations;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writePerformanceFixture(root) {
  const sourceRoot = path.join(root, "Sources", "FeatureKit");
  const testRoot = path.join(root, "Tests", "FeatureKitTests");
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(testRoot, { recursive: true });
  fs.writeFileSync(
    path.join(root, "Package.swift"),
    `// swift-tools-version: 6.0\nimport PackageDescription\n\nlet package = Package(\n    name: "FeatureKit",\n    targets: [\n        .target(name: "FeatureKit"),\n        .testTarget(name: "FeatureKitTests", dependencies: ["FeatureKit"])\n    ]\n)\n`
  );

  for (let index = 0; index < swiftPerformanceFixture.sourceCount; index += 1) {
    fs.writeFileSync(
      path.join(sourceRoot, `Feature${index}.swift`),
      `public struct Feature${index} {\n    public init() {}\n\n    public func transform(_ value: Int) -> Int {\n        if value < 0 { return 0 }\n        return value + ${index}\n    }\n}\n`
    );
  }

  for (let index = 0; index < swiftPerformanceFixture.testCount; index += 1) {
    fs.writeFileSync(
      path.join(testRoot, `Feature${index}Tests.swift`),
      `import XCTest\n@testable import FeatureKit\n\nfinal class Feature${index}Tests: XCTestCase {\n    func testTransform() {\n        XCTAssertEqual(Feature${index}().transform(0), ${index})\n    }\n}\n`
    );
  }
}

export function validateSwiftPerformanceObservations(observations) {
  return validateObservations("Swift", observations, swiftPerformanceFixture);
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
