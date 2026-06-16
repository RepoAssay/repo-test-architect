import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const scriptPath = "scripts/check-model-consistency-scenarios.js";
const compareScriptPath = "scripts/compare-model-consistency-summaries.js";

describe("model consistency script", () => {
  it("emits a JSON summary for a named profile", () => {
    const output = execFileSync(process.execPath, [scriptPath, "--json", "--profile", "local-small"], {
      encoding: "utf8"
    });
    const summary = JSON.parse(output);

    assert.equal(summary.schemaVersion, "model-consistency-summary/v1");
    assert.equal(summary.profileName, "local-small");
    assert.equal(summary.summary.scenarioCount, 9);
    assert.equal(summary.summary.failureCount, 0);
  });

  it("supports equals-style profile arguments", () => {
    const output = execFileSync(process.execPath, [scriptPath, "--json", "--profile=enterprise-default"], {
      encoding: "utf8"
    });
    const summary = JSON.parse(output);

    assert.equal(summary.profileName, "enterprise-default");
  });

  it("compares aligned summary files successfully", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-model-consistency-"));
    const baselinePath = writeSummary(tempDir, "baseline.json", "deterministic-baseline");
    const candidatePath = writeSummary(tempDir, "candidate.json", "local-small");
    const output = execFileSync(process.execPath, [compareScriptPath, baselinePath, candidatePath], {
      encoding: "utf8"
    });
    const comparison = JSON.parse(output);

    assert.equal(comparison.schemaVersion, "model-consistency-comparison/v1");
    assert.equal(comparison.summary.alignedScenarioCount, 9);
    assert.equal(comparison.summary.driftedScenarioCount, 0);
  });

  it("exits non-zero when compared summary files drift", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-model-consistency-"));
    const baselinePath = writeSummary(tempDir, "baseline.json", "deterministic-baseline");
    const candidate = JSON.parse(createSummary("local-small"));

    candidate.summary.failureCount = 1;
    candidate.summary.failedScenarioCount = 1;
    candidate.summary.passedScenarioCount = 6;
    candidate.scenarios[0] = {
      ...candidate.scenarios[0],
      status: "failed",
      failureCount: 1
    };

    const candidatePath = path.join(tempDir, "candidate-drift.json");
    fs.writeFileSync(candidatePath, `${JSON.stringify(candidate)}\n`);

    const result = spawnSync(process.execPath, [compareScriptPath, baselinePath, candidatePath], {
      encoding: "utf8"
    });
    const comparison = JSON.parse(result.stdout);

    assert.equal(result.status, 1);
    assert.equal(comparison.summary.driftedScenarioCount, 1);
    assert.equal(comparison.summary.failureDelta, 1);
  });
});

function createSummary(profileName) {
  return execFileSync(process.execPath, [scriptPath, "--json", "--profile", profileName], {
    encoding: "utf8"
  });
}

function writeSummary(tempDir, fileName, profileName) {
  const filePath = path.join(tempDir, fileName);

  fs.writeFileSync(filePath, createSummary(profileName));

  return filePath;
}
