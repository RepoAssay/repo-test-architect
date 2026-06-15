import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

const scriptPath = "scripts/check-model-consistency-scenarios.js";

describe("model consistency script", () => {
  it("emits a JSON summary for a named profile", () => {
    const output = execFileSync(process.execPath, [scriptPath, "--json", "--profile", "local-small"], {
      encoding: "utf8"
    });
    const summary = JSON.parse(output);

    assert.equal(summary.schemaVersion, "model-consistency-summary/v1");
    assert.equal(summary.profileName, "local-small");
    assert.equal(summary.summary.scenarioCount, 7);
    assert.equal(summary.summary.failureCount, 0);
  });

  it("supports equals-style profile arguments", () => {
    const output = execFileSync(process.execPath, [scriptPath, "--json", "--profile=enterprise-default"], {
      encoding: "utf8"
    });
    const summary = JSON.parse(output);

    assert.equal(summary.profileName, "enterprise-default");
  });
});
