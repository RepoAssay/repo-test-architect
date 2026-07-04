import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGenerationDeferredResult } from "../src/core/generation-deferred.js";

describe("generation deferred result", () => {
  it("creates a deferred generation artifact for a plan item", () => {
    const artifact = createGenerationDeferredResult("add-test:src/authService.ts");

    assert.equal(artifact.schemaVersion, "generation-deferred/v1");
    assert.equal(artifact.planItemId, "add-test:src/authService.ts");
    assert.equal(artifact.status, "deferred");
    assert.match(artifact.reason, /Native test generation is intentionally disabled/);
    assert.ok(artifact.nextSteps.includes("Use generate_test_plan to select a stable plan item."));
  });

  it("rejects missing plan item ids", () => {
    assert.throws(() => createGenerationDeferredResult(""), /planItemId must be a non-empty string/);
    assert.throws(() => createGenerationDeferredResult("   "), /planItemId must be a non-empty string/);
    assert.throws(() => createGenerationDeferredResult(undefined), /planItemId must be a non-empty string/);
  });
});
