import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  javascriptPerformanceFixture,
  validateJavaScriptPerformanceObservations
} from "../scripts/check-javascript-performance.js";

describe("JavaScript performance regression gate", () => {
  it("locks the generated large-suite shape and cross-platform ceiling", () => {
    assert.deepEqual(javascriptPerformanceFixture, {
      sourceCount: 400,
      testCount: 200,
      expectedCoveredCount: 200,
      expectedUntestedCount: 200,
      expectedEvidenceRelationshipCount: 200,
      maxAuditDurationMs: 5000
    });
    assert.deepEqual(
      validateJavaScriptPerformanceObservations({
        auditDurationMs: 4999,
        coveredCount: 200,
        untestedCount: 200,
        evidenceRelationshipCount: 200
      }),
      []
    );
  });

  it("rejects semantic drift and material duration regressions", () => {
    const errors = validateJavaScriptPerformanceObservations({
      auditDurationMs: 5001,
      coveredCount: 199,
      untestedCount: 201,
      evidenceRelationshipCount: 198
    });

    assert.equal(errors.length, 4);
    assert.ok(errors.some((error) => error.includes("covered targets")));
    assert.ok(errors.some((error) => error.includes("untested targets")));
    assert.ok(errors.some((error) => error.includes("evidence relationships")));
    assert.ok(errors.some((error) => error.includes("5000 ms")));
  });
});
