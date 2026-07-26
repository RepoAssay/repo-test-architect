import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  goPerformanceFixture,
  validateGoPerformanceObservations
} from "../scripts/check-go-performance.js";

describe("Go performance regression gate", () => {
  it("locks the generated generic-function suite and cross-platform ceiling", () => {
    assert.deepEqual(goPerformanceFixture, {
      sourceCount: 400,
      testCount: 200,
      expectedCoveredCount: 200,
      expectedUntestedCount: 200,
      expectedSkippedCount: 0,
      expectedEvidenceRelationshipCount: 200,
      maxAuditDurationMs: 5000
    });
    assert.deepEqual(
      validateGoPerformanceObservations({
        auditDurationMs: 4999,
        coveredCount: 200,
        untestedCount: 200,
        skippedCount: 0,
        skippedPaths: [],
        evidenceRelationshipCount: 200
      }),
      []
    );
  });

  it("rejects semantic drift and material duration regressions", () => {
    const errors = validateGoPerformanceObservations({
      auditDurationMs: 5001,
      coveredCount: 199,
      untestedCount: 201,
      skippedCount: 1,
      skippedPaths: ["feature/generated.go"],
      evidenceRelationshipCount: 198
    });

    assert.equal(errors.length, 5);
    assert.ok(errors.some((error) => error.includes("covered Go targets")));
    assert.ok(errors.some((error) => error.includes("untested Go targets")));
    assert.ok(errors.some((error) => error.includes("skipped Go targets")));
    assert.ok(errors.some((error) => error.includes("Go evidence relationships")));
    assert.ok(errors.some((error) => error.includes("5000 ms")));
  });
});
