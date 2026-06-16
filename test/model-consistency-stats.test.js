import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectModelConsistencyStats } from "../src/core/model-consistency-stats.js";
import { compareModelConsistencySummaries } from "../src/core/model-consistency-runner.js";

describe("model consistency stats", () => {
  it("collects local stats from a model consistency summary", () => {
    const stats = collectModelConsistencyStats(summaryFixture());

    assert.equal(stats.schemaVersion, "model-consistency-stats/v1");
    assert.deepEqual(stats.source, { profileName: "deterministic-baseline" });
    assert.deepEqual(stats.counts, {
      scenarioCount: 2,
      passedScenarioCount: 1,
      failedScenarioCount: 1,
      checkedFieldCount: 8,
      failureCount: 2,
      driftedScenarioCount: 0,
      missingScenarioCount: 0,
      unexpectedScenarioCount: 0
    });
    assert.deepEqual(stats.distributions.scenariosByStatus, { failed: 1, passed: 1 });
    assert.deepEqual(stats.distributions.scenariosByTool, {
      collect_project_stats: 1,
      generate_test_plan: 1
    });
    assert.deepEqual(stats.distributions.scenariosByAlignment, {});
  });

  it("collects drift stats from a model consistency comparison", () => {
    const baseline = summaryFixture();
    const candidate = {
      ...summaryFixture("local-small"),
      scenarios: baseline.scenarios.map((scenario, index) =>
        index === 0 ? { ...scenario, status: "failed", failureCount: 1 } : scenario
      )
    };
    const comparison = compareModelConsistencySummaries(baseline, candidate);
    const stats = collectModelConsistencyStats(baseline, { comparison });

    assert.equal(stats.source.comparedProfileName, "local-small");
    assert.equal(stats.counts.driftedScenarioCount, 1);
    assert.deepEqual(stats.distributions.scenariosByAlignment, {
      aligned: 1,
      drifted: 1
    });
  });

  it("rejects non-summary artifacts", () => {
    assert.throws(
      () => collectModelConsistencyStats({ schemaVersion: "model-consistency-comparison/v1" }),
      /Expected model consistency summary schemaVersion model-consistency-summary\/v1/
    );
  });
});

function summaryFixture(profileName = "deterministic-baseline") {
  return {
    schemaVersion: "model-consistency-summary/v1",
    profileName,
    summary: {
      scenarioCount: 2,
      passedScenarioCount: 1,
      failedScenarioCount: 1,
      checkedFieldCount: 8,
      failureCount: 2
    },
    scenarios: [
      {
        scenarioId: "plan",
        toolName: "generate_test_plan",
        checkedFieldCount: 3,
        status: "passed",
        failureCount: 0
      },
      {
        scenarioId: "stats",
        toolName: "collect_project_stats",
        checkedFieldCount: 5,
        status: "failed",
        failureCount: 2
      }
    ],
    allowedVariationThemes: [],
    unexpectedVariationThemes: []
  };
}
