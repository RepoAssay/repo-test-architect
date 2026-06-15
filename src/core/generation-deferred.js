/**
 * @typedef {object} GenerationDeferredResult
 * @property {"generation-deferred/v1"} schemaVersion
 * @property {string} planItemId
 * @property {"deferred"} status
 * @property {string} reason
 * @property {string[]} nextSteps
 */

/**
 * @param {string} planItemId
 * @returns {GenerationDeferredResult}
 */
export function createGenerationDeferredResult(planItemId) {
  if (!planItemId) {
    throw new Error("planItemId must be a non-empty string.");
  }

  return {
    schemaVersion: "generation-deferred/v1",
    planItemId,
    status: "deferred",
    reason: "Native test generation is intentionally disabled until audit and planning behavior are trustworthy.",
    nextSteps: [
      "Use generate_test_plan to select a stable plan item.",
      "Use explain_target to inspect the audit evidence behind that item.",
      "Implement repo-native generation only after the adapter has fixture coverage for the target test style."
    ]
  };
}
