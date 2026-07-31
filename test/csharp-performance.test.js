import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  csharpPerformanceFixture,
  validateCSharpPerformanceObservations
} from "../scripts/check-csharp-performance.js";

describe("C# performance regression gate", () => {
  it("locks the generated fixture scale and broad timing ceiling", () => {
    assert.deepEqual(csharpPerformanceFixture, {
      sourceCount: 400,
      testCount: 200,
      expectedCoveredCount: 200,
      expectedUntestedCount: 200,
      expectedSkippedCount: 0,
      expectedEvidenceRelationshipCount: 200,
      maxAuditDurationMs: 5000
    });
  });

  it("accepts the exact semantic baseline within the timing budget", () => {
    assert.deepEqual(validateCSharpPerformanceObservations({
      auditDurationMs: 5000,
      coveredCount: 200,
      untestedCount: 200,
      skippedCount: 0,
      skippedPaths: [],
      evidenceRelationshipCount: 200
    }), []);
  });

  it("reports every semantic and timing regression", () => {
    assert.deepEqual(validateCSharpPerformanceObservations({
      auditDurationMs: 5001,
      coveredCount: 199,
      untestedCount: 201,
      skippedCount: 1,
      skippedPaths: ["src/FeatureKit/Feature399.cs"],
      evidenceRelationshipCount: 199
    }), [
      "Expected 200 covered C# targets, got 199.",
      "Expected 200 untested C# targets, got 201.",
      "Expected 0 skipped C# targets, got 1: src/FeatureKit/Feature399.cs.",
      "Expected 200 C# evidence relationships, got 199.",
      "C# audit took 5001 ms; the deterministic 400-source/200-test fixture budget is 5000 ms."
    ]);
  });
});
