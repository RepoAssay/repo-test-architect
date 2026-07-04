import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const scriptPath = "scripts/check-model-consistency-scenarios.js";
const compareScriptPath = "scripts/compare-model-consistency-summaries.js";
const execOptions = {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024
};

describe("model consistency script", () => {
  it("emits a JSON summary for a named profile", () => {
    const output = execFileSync(process.execPath, [scriptPath, "--json", "--profile", "local-small"], execOptions);
    const summary = JSON.parse(output);

    assert.equal(summary.schemaVersion, "model-consistency-summary/v1");
    assert.equal(summary.profileName, "local-small");
    assert.equal(summary.summary.scenarioCount, 26);
    assert.equal(summary.summary.failureCount, 0);
  });

  it("supports equals-style profile arguments", () => {
    const output = execFileSync(process.execPath, [scriptPath, "--json", "--profile=enterprise-default"], execOptions);
    const summary = JSON.parse(output);

    assert.equal(summary.profileName, "enterprise-default");
  });

  it("compares current checked-in scenarios for named profiles", () => {
    const output = execFileSync(
      process.execPath,
      [compareScriptPath, "--baseline-profile", "deterministic-baseline", "--candidate-profile", "local-small"],
      execOptions
    );
    const comparison = JSON.parse(output);

    assert.equal(comparison.schemaVersion, "model-consistency-comparison/v1");
    assert.equal(comparison.baselineProfile, "deterministic-baseline");
    assert.equal(comparison.candidateProfile, "local-small");
    assert.equal(comparison.summary.scenarioCount, 26);
    assert.equal(comparison.summary.alignedScenarioCount, 26);
    assert.equal(comparison.summary.driftedScenarioCount, 0);
  });

  it("compares current checked-in scenarios with equals-style profile arguments", () => {
    const output = execFileSync(
      process.execPath,
      [compareScriptPath, "--baseline-profile=deterministic-baseline", "--candidate-profile=enterprise-default"],
      execOptions
    );
    const comparison = JSON.parse(output);

    assert.equal(comparison.candidateProfile, "enterprise-default");
    assert.equal(comparison.summary.failureDelta, 0);
  });

  it("compares aligned summary files successfully", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-model-consistency-"));
    const baselinePath = writeSummary(tempDir, "baseline.json", "deterministic-baseline");
    const candidatePath = writeSummary(tempDir, "candidate.json", "local-small");
    const output = execFileSync(process.execPath, [compareScriptPath, baselinePath, candidatePath], execOptions);
    const comparison = JSON.parse(output);

    assert.equal(comparison.schemaVersion, "model-consistency-comparison/v1");
    assert.equal(comparison.summary.alignedScenarioCount, 26);
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
      encoding: "utf8",
      maxBuffer: execOptions.maxBuffer
    });
    const comparison = JSON.parse(result.stdout);

    assert.equal(result.status, 1);
    assert.equal(comparison.summary.driftedScenarioCount, 1);
    assert.equal(comparison.summary.failureDelta, 1);
  });

  it("rejects partial file comparison arguments", () => {
    const result = spawnSync(process.execPath, [compareScriptPath, "--baseline", "baseline-summary.json"], {
      encoding: "utf8",
      maxBuffer: execOptions.maxBuffer
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /--baseline and --candidate must be provided together/);
  });
});

function createSummary(profileName) {
  return execFileSync(process.execPath, [scriptPath, "--json", "--profile", profileName], execOptions);
}

function writeSummary(tempDir, fileName, profileName) {
  const filePath = path.join(tempDir, fileName);

  fs.writeFileSync(filePath, createSummary(profileName));

  return filePath;
}
