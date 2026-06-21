import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  compareModelConsistencySummaries,
  readModelConsistencyScenario,
  runModelConsistencyScenario,
  summarizeModelConsistencyResults
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
    const scenarios = readCheckedInScenarios();
    const results = scenarios.map((scenario) => runModelConsistencyScenario(scenario));

    assert.deepEqual(
      results.map((result) => [result.scenarioId, result.failures]),
      [
        ["express-supertest-plan", []],
        ["kotlin-junit-basic-plan", []],
        ["node-jest-service-plan", []],
        ["node-no-tests-yet-plan", []],
        ["node-vitest-basic-auth-explanation", []],
        ["node-vitest-basic-plan", []],
        ["node-vitest-basic-ranking", []],
        ["polyglot-project-plan", []],
        ["polyglot-project-ranking", []],
        ["polyglot-project-stats", []],
        ["polyglot-project-summary", []],
        ["project-placement-split", []],
        ["react-testing-library-plan", []],
        ["swift-spm-xctest-plan", []]
      ]
    );
  });

  it("summarizes locked-field results for model profile comparisons", () => {
    const scenarios = readCheckedInScenarios();
    const results = scenarios.map((scenario) => runModelConsistencyScenario(scenario));
    const summary = summarizeModelConsistencyResults(scenarios, results, {
      profileName: "deterministic-baseline"
    });

    assert.equal(summary.schemaVersion, "model-consistency-summary/v1");
    assert.equal(summary.profileName, "deterministic-baseline");
    assert.deepEqual(summary.summary, {
      scenarioCount: 14,
      passedScenarioCount: 14,
      failedScenarioCount: 0,
      checkedFieldCount: 100,
      failureCount: 0
    });
    assert.equal(summary.scenarios[2].scenarioId, "node-jest-service-plan");
    assert.equal(summary.scenarios[2].status, "passed");
    assert.ok(summary.allowedVariationThemes.includes("Additional non-locked metadata may be added."));
    assert.ok(summary.unexpectedVariationThemes.includes("Generating a direct DTO test recommendation."));
  });

  it("compares aligned model consistency summaries", () => {
    const baseline = createCurrentSummary("deterministic-baseline");
    const candidate = createCurrentSummary("local-small");
    const comparison = compareModelConsistencySummaries(baseline, candidate);

    assert.equal(comparison.schemaVersion, "model-consistency-comparison/v1");
    assert.equal(comparison.baselineProfile, "deterministic-baseline");
    assert.equal(comparison.candidateProfile, "local-small");
    assert.deepEqual(comparison.summary, {
      scenarioCount: 14,
      alignedScenarioCount: 14,
      driftedScenarioCount: 0,
      missingScenarioCount: 0,
      unexpectedScenarioCount: 0,
      checkedFieldDelta: 0,
      failureDelta: 0
    });
    assert.equal(comparison.scenarios[0].alignment, "aligned");
  });

  it("flags drift, missing scenarios, and unexpected scenarios between summaries", () => {
    const baseline = createCurrentSummary("deterministic-baseline");
    const candidate = {
      ...createCurrentSummary("local-small"),
      summary: {
        scenarioCount: 14,
        passedScenarioCount: 12,
        failedScenarioCount: 2,
        checkedFieldCount: 89,
        failureCount: 3
      },
      scenarios: [
        {
          ...baseline.scenarios[0],
          status: "failed",
          checkedFieldCount: baseline.scenarios[0].checkedFieldCount - 1,
          failureCount: 1
        },
        ...baseline.scenarios.slice(2),
        {
          scenarioId: "unexpected-extra-scenario",
          toolName: "generate_test_plan",
          checkedFieldCount: 1,
          status: "passed",
          failureCount: 0
        }
      ]
    };

    const comparison = compareModelConsistencySummaries(baseline, candidate);

    assert.deepEqual(comparison.summary, {
      scenarioCount: 15,
      alignedScenarioCount: 12,
      driftedScenarioCount: 1,
      missingScenarioCount: 1,
      unexpectedScenarioCount: 1,
      checkedFieldDelta: -11,
      failureDelta: 3
    });
    assert.deepEqual(
      comparison.scenarios.map((scenario) => [scenario.scenarioId, scenario.alignment]),
      [
        ["express-supertest-plan", "drifted"],
        ["kotlin-junit-basic-plan", "missing"],
        ["node-jest-service-plan", "aligned"],
        ["node-no-tests-yet-plan", "aligned"],
        ["node-vitest-basic-auth-explanation", "aligned"],
        ["node-vitest-basic-plan", "aligned"],
        ["node-vitest-basic-ranking", "aligned"],
        ["polyglot-project-plan", "aligned"],
        ["polyglot-project-ranking", "aligned"],
        ["polyglot-project-stats", "aligned"],
        ["polyglot-project-summary", "aligned"],
        ["project-placement-split", "aligned"],
        ["react-testing-library-plan", "aligned"],
        ["swift-spm-xctest-plan", "aligned"],
        ["unexpected-extra-scenario", "unexpected"]
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

  it("rejects wrapped source artifacts missing the configured argument", () => {
    const scenario = readModelConsistencyScenario("evals/model-consistency/polyglot-project-summary.scenario.json");

    assert.throws(
      () =>
        runModelConsistencyScenario({
          ...scenario,
          sourceArtifact: {
            ...scenario.sourceArtifact,
            argumentName: "missingProjectAudits"
          }
        }),
      /Expected source artifact argument missingProjectAudits/
    );
  });
});

function createCurrentSummary(profileName) {
  const scenarios = readCheckedInScenarios();
  const results = scenarios.map((scenario) => runModelConsistencyScenario(scenario));

  return summarizeModelConsistencyResults(scenarios, results, { profileName });
}

function readCheckedInScenarios() {
  return fs
    .readdirSync(scenarioDir)
    .filter((fileName) => fileName.endsWith(".scenario.json"))
    .sort()
    .map((fileName) => readModelConsistencyScenario(path.join(scenarioDir, fileName)));
}
