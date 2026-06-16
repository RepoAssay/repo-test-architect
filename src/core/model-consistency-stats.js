import { compareModelConsistencySummaries } from "./model-consistency-runner.js";

/**
 * @typedef {import("./model-consistency-runner.js").ModelConsistencySummary} ModelConsistencySummary
 * @typedef {import("./model-consistency-runner.js").ModelConsistencyComparison} ModelConsistencyComparison
 *
 * @typedef {object} ModelConsistencyStats
 * @property {"model-consistency-stats/v1"} schemaVersion
 * @property {{ profileName: string, comparedProfileName?: string }} source
 * @property {{ scenarioCount: number, passedScenarioCount: number, failedScenarioCount: number, checkedFieldCount: number, failureCount: number, driftedScenarioCount: number, missingScenarioCount: number, unexpectedScenarioCount: number }} counts
 * @property {{ scenariosByStatus: Record<string, number>, scenariosByTool: Record<string, number>, scenariosByAlignment: Record<string, number> }} distributions
 */

/**
 * @param {ModelConsistencySummary} summary
 * @param {{ comparison?: ModelConsistencyComparison, candidateSummary?: ModelConsistencySummary }} [options]
 * @returns {ModelConsistencyStats}
 */
export function collectModelConsistencyStats(summary, options = {}) {
  validateSummary(summary);

  const comparison = options.comparison ?? (options.candidateSummary ? compareModelConsistencySummaries(summary, options.candidateSummary) : undefined);

  if (comparison) {
    validateComparison(comparison);
  }

  return {
    schemaVersion: "model-consistency-stats/v1",
    source: {
      profileName: summary.profileName,
      ...(comparison ? { comparedProfileName: comparison.candidateProfile } : {})
    },
    counts: {
      scenarioCount: summary.summary.scenarioCount,
      passedScenarioCount: summary.summary.passedScenarioCount,
      failedScenarioCount: summary.summary.failedScenarioCount,
      checkedFieldCount: summary.summary.checkedFieldCount,
      failureCount: summary.summary.failureCount,
      driftedScenarioCount: comparison?.summary.driftedScenarioCount ?? 0,
      missingScenarioCount: comparison?.summary.missingScenarioCount ?? 0,
      unexpectedScenarioCount: comparison?.summary.unexpectedScenarioCount ?? 0
    },
    distributions: {
      scenariosByStatus: countBy(summary.scenarios, "status"),
      scenariosByTool: countBy(summary.scenarios, "toolName"),
      scenariosByAlignment: countBy(comparison?.scenarios ?? [], "alignment")
    }
  };
}

function validateSummary(summary) {
  if (summary?.schemaVersion !== "model-consistency-summary/v1") {
    throw new Error("Expected model consistency summary schemaVersion model-consistency-summary/v1.");
  }
}

function validateComparison(comparison) {
  if (comparison?.schemaVersion !== "model-consistency-comparison/v1") {
    throw new Error("Expected model consistency comparison schemaVersion model-consistency-comparison/v1.");
  }
}

function countBy(items, key) {
  const counts = {};

  for (const item of items) {
    counts[item[key]] = (counts[item[key]] ?? 0) + 1;
  }

  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}
