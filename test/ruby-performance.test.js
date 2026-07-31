import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rubyPerformanceFixture,
  validateRubyPerformanceObservations
} from "../scripts/check-ruby-performance.js";

describe("Ruby performance regression gate", () => {
  it("locks the conventional source/test scale and cross-platform ceiling", () => {
    assert.deepEqual(rubyPerformanceFixture, {
      sourceCount: 400,
      testCount: 200,
      expectedCoveredCount: 200,
      expectedUntestedCount: 200,
      expectedEvidenceRelationshipCount: 200,
      maxAuditDurationMs: 5000
    });
    assert.deepEqual(validateRubyPerformanceObservations({
      auditDurationMs: 5000,
      coveredCount: 200,
      untestedCount: 200,
      evidenceRelationshipCount: 200
    }), []);
  });

  it("reports every semantic and timing regression", () => {
    assert.deepEqual(validateRubyPerformanceObservations({
      auditDurationMs: 5001,
      coveredCount: 199,
      untestedCount: 201,
      evidenceRelationshipCount: 199
    }), [
      "Expected 200 covered Ruby targets, got 199.",
      "Expected 200 untested Ruby targets, got 201.",
      "Expected 200 Ruby evidence relationships, got 199.",
      "Ruby audit took 5001 ms; the deterministic 400-source/200-test fixture budget is 5000 ms."
    ]);
  });
});
