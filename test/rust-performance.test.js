import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rustPerformanceFixture,
  validateRustPerformanceObservations
} from "../scripts/check-rust-performance.js";

describe("Rust performance regression gate", () => {
  it("locks the generated module graph, evidence scale, and cross-platform ceiling", () => {
    assert.deepEqual(rustPerformanceFixture, {
      sourceCount: 400,
      testCount: 200,
      expectedCoveredCount: 200,
      expectedUntestedCount: 200,
      expectedSkippedCount: 1,
      expectedSkippedPaths: ["src/lib.rs"],
      expectedEvidenceRelationshipCount: 200,
      maxAuditDurationMs: 5000
    });
    assert.deepEqual(validateRustPerformanceObservations({
      auditDurationMs: 5000,
      coveredCount: 200,
      untestedCount: 200,
      skippedCount: 1,
      skippedPaths: ["src/lib.rs"],
      evidenceRelationshipCount: 200
    }), []);
  });

  it("reports every semantic and timing regression", () => {
    assert.deepEqual(validateRustPerformanceObservations({
      auditDurationMs: 5001,
      coveredCount: 199,
      untestedCount: 201,
      skippedCount: 2,
      skippedPaths: ["src/generated.rs", "src/lib.rs"],
      evidenceRelationshipCount: 199
    }), [
      "Expected 200 covered Rust targets, got 199.",
      "Expected 200 untested Rust targets, got 201.",
      "Expected 1 skipped Rust target at src/lib.rs, got 2: src/generated.rs, src/lib.rs.",
      "Expected 200 Rust evidence relationships, got 199.",
      "Rust audit took 5001 ms; the deterministic 400-source/200-test fixture budget is 5000 ms."
    ]);
  });
});
