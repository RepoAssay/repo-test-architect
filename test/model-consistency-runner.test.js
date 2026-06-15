import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readModelConsistencyScenario,
  runModelConsistencyScenario
} from "../src/core/model-consistency-runner.js";

const scenarioPath = "evals/model-consistency/node-vitest-basic-auth-explanation.scenario.json";

describe("model consistency runner", () => {
  it("passes when locked fields match the deterministic tool result", () => {
    const scenario = readModelConsistencyScenario(scenarioPath);
    const result = runModelConsistencyScenario(scenario);

    assert.equal(result.scenarioId, "node-vitest-basic-auth-explanation");
    assert.equal(result.toolName, "explain_target");
    assert.equal(result.checkedFieldCount, 4);
    assert.deepEqual(result.failures, []);
  });

  it("reports drift when a locked field differs from the deterministic tool result", () => {
    const scenario = readModelConsistencyScenario(scenarioPath);
    const result = runModelConsistencyScenario({
      ...scenario,
      lockedFields: [
        {
          path: "testLevel",
          expected: "integration",
          reason: "This intentionally differs from the deterministic unit-test recommendation."
        }
      ]
    });

    assert.deepEqual(result.failures, [
      {
        path: "testLevel",
        expected: "integration",
        actual: "unit",
        reason: "This intentionally differs from the deterministic unit-test recommendation."
      }
    ]);
  });

  it("rejects scenarios with the wrong schema version", () => {
    const scenario = readModelConsistencyScenario(scenarioPath);

    assert.throws(
      () => runModelConsistencyScenario({ ...scenario, schemaVersion: "model-consistency-scenario/v0" }),
      /Expected model consistency scenario schemaVersion model-consistency-scenario\/v1/
    );
  });
});
