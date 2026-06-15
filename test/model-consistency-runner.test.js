import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  readModelConsistencyScenario,
  runModelConsistencyScenario
} from "../src/core/model-consistency-runner.js";

const scenarioPath = "evals/model-consistency/node-vitest-basic-auth-explanation.scenario.json";
const scenarioDir = "evals/model-consistency";

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

  it("supports locked field paths with array indexes", () => {
    const scenario = readModelConsistencyScenario("evals/model-consistency/node-vitest-basic-plan.scenario.json");
    const result = runModelConsistencyScenario({
      ...scenario,
      lockedFields: [
        {
          path: "items[0].id",
          expected: "extend-test:src/deckParser.ts",
          reason: "Array index paths should resolve into deterministic tool output."
        }
      ]
    });

    assert.deepEqual(result.failures, []);
  });

  it("passes every checked-in model consistency scenario", () => {
    const results = fs
      .readdirSync(scenarioDir)
      .filter((fileName) => fileName.endsWith(".scenario.json"))
      .map((fileName) => readModelConsistencyScenario(path.join(scenarioDir, fileName)))
      .map((scenario) => runModelConsistencyScenario(scenario));

    assert.deepEqual(
      results.map((result) => [result.scenarioId, result.failures]),
      [
        ["node-vitest-basic-auth-explanation", []],
        ["node-vitest-basic-plan", []],
        ["node-vitest-basic-ranking", []]
      ]
    );
  });

  it("rejects scenarios with the wrong schema version", () => {
    const scenario = readModelConsistencyScenario(scenarioPath);

    assert.throws(
      () => runModelConsistencyScenario({ ...scenario, schemaVersion: "model-consistency-scenario/v0" }),
      /Expected model consistency scenario schemaVersion model-consistency-scenario\/v1/
    );
  });
});
