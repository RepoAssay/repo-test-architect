#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { auditCSharpRepo } from "../src/adapters/csharp/audit.js";

export const csharpPerformanceFixture = {
  sourceCount: 400,
  testCount: 200,
  expectedCoveredCount: 200,
  expectedUntestedCount: 200,
  expectedSkippedCount: 0,
  expectedEvidenceRelationshipCount: 200,
  maxAuditDurationMs: 5000
};

if (isMainModule()) {
  runCSharpPerformanceCheck();
}

export function runCSharpPerformanceCheck() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-csharp-performance-"));

  try {
    writePerformanceFixture(root);
    const started = performance.now();
    const audit = auditCSharpRepo(root);
    const auditDurationMs = Math.round(performance.now() - started);
    const observations = collectObservations(audit, auditDurationMs);
    const errors = validateCSharpPerformanceObservations(observations);

    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
      return observations;
    }

    console.log(
      `C# performance check passed: ${auditDurationMs} ms, ` +
      `${observations.coveredCount} covered, ${observations.untestedCount} untested, ` +
      `${observations.evidenceRelationshipCount} evidence relationships.`
    );
    return observations;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writePerformanceFixture(root) {
  const sourceRoot = path.join(root, "src", "FeatureKit");
  const testRoot = path.join(root, "tests", "FeatureKit.Tests");
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(testRoot, { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, "FeatureKit.csproj"),
    `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>\n`
  );
  fs.writeFileSync(
    path.join(testRoot, "FeatureKit.Tests.csproj"),
    `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="18.0.1" /><PackageReference Include="xunit.v3" Version="3.2.2" /></ItemGroup><ItemGroup><ProjectReference Include="../../src/FeatureKit/FeatureKit.csproj" /></ItemGroup></Project>\n`
  );

  for (let index = 0; index < csharpPerformanceFixture.sourceCount; index += 1) {
    fs.writeFileSync(
      path.join(sourceRoot, `Feature${index}.cs`),
      `namespace FeatureKit;\n\npublic static class Feature${index}\n{\n    public static int Transform${index}(int value)\n    {\n        if (value < 0) throw new ArgumentOutOfRangeException(nameof(value));\n        return value + ${index};\n    }\n}\n`
    );
  }

  for (let index = 0; index < csharpPerformanceFixture.testCount; index += 1) {
    fs.writeFileSync(
      path.join(testRoot, `Feature${index}Tests.cs`),
      `using FeatureKit;\nusing Xunit;\n\npublic class Feature${index}Tests\n{\n    [Fact]\n    public void Transforms()\n    {\n        Assert.Equal(${index}, Feature${index}.Transform${index}(0));\n    }\n}\n`
    );
  }
}

export function validateCSharpPerformanceObservations(observations) {
  const errors = [];
  const expected = csharpPerformanceFixture;
  if (observations.coveredCount !== expected.expectedCoveredCount) {
    errors.push(`Expected ${expected.expectedCoveredCount} covered C# targets, got ${observations.coveredCount}.`);
  }
  if (observations.untestedCount !== expected.expectedUntestedCount) {
    errors.push(`Expected ${expected.expectedUntestedCount} untested C# targets, got ${observations.untestedCount}.`);
  }
  if (observations.skippedCount !== expected.expectedSkippedCount) {
    errors.push(
      `Expected ${expected.expectedSkippedCount} skipped C# targets, got ${observations.skippedCount}: ` +
      `${observations.skippedPaths.join(", ")}.`
    );
  }
  if (observations.evidenceRelationshipCount !== expected.expectedEvidenceRelationshipCount) {
    errors.push(
      `Expected ${expected.expectedEvidenceRelationshipCount} C# evidence relationships, ` +
      `got ${observations.evidenceRelationshipCount}.`
    );
  }
  if (observations.auditDurationMs > expected.maxAuditDurationMs) {
    errors.push(
      `C# audit took ${observations.auditDurationMs} ms; ` +
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
