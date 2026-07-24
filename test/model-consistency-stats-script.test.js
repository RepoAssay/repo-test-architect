import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

const scriptPath = "scripts/collect-model-consistency-stats.js";

describe("model consistency stats script", () => {
  it("emits local stats for current checked-in scenarios", () => {
    const output = execFileSync(process.execPath, [scriptPath], {
      encoding: "utf8"
    });
    const stats = JSON.parse(output);

    assert.equal(stats.schemaVersion, "model-consistency-stats/v1");
    assert.equal(stats.source.profileName, "deterministic-baseline");
    assert.equal(stats.counts.scenarioCount, 50);
    assert.equal(stats.counts.checkedFieldCount, 433);
    assert.equal(stats.counts.failureCount, 0);
    assert.equal(stats.distributions.scenariosByStatus.passed, 50);
    assert.equal(stats.distributions.scenariosByTool.get_plan_execution_hints, 4);
    assert.equal(stats.distributions.scenariosByTool.collect_project_findings, 3);
    assert.equal(stats.distributions.scenariosByTool.collect_project_stats, 1);
    assert.equal(stats.distributions.scenariosByTool.analyze_project_test_placement, 2);
  });
});
