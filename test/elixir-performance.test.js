import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  elixirPerformanceFixture,
  validateElixirPerformanceObservations
} from "../scripts/check-elixir-performance.js";

describe("Elixir performance regression gate", () => {
  it("locks the conventional source/test scale and cross-platform ceiling", () => {
    assert.deepEqual(elixirPerformanceFixture, {
      sourceCount: 400,
      testCount: 200,
      expectedCoveredCount: 200,
      expectedUntestedCount: 200,
      expectedEvidenceRelationshipCount: 200,
      maxAuditDurationMs: 5000
    });
    assert.deepEqual(validateElixirPerformanceObservations({
      auditDurationMs: 5000,
      coveredCount: 200,
      untestedCount: 200,
      evidenceRelationshipCount: 200
    }), []);
  });

  it("reports every semantic and timing regression", () => {
    assert.deepEqual(validateElixirPerformanceObservations({
      auditDurationMs: 5001,
      coveredCount: 199,
      untestedCount: 201,
      evidenceRelationshipCount: 199
    }), [
      "Expected 200 covered Elixir targets, got 199.",
      "Expected 200 untested Elixir targets, got 201.",
      "Expected 200 Elixir evidence relationships, got 199.",
      "Elixir audit took 5001 ms; the deterministic fixture budget is 5000 ms."
    ]);
  });
});
