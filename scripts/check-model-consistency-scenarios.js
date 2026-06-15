#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  readModelConsistencyScenario,
  runModelConsistencyScenario,
  summarizeModelConsistencyResults
} from "../src/core/model-consistency-runner.js";

const outputJson = process.argv.includes("--json");
const scenarioDir = path.resolve("evals/model-consistency");
const scenarioPaths = fs
  .readdirSync(scenarioDir)
  .filter((fileName) => fileName.endsWith(".scenario.json"))
  .map((fileName) => path.join(scenarioDir, fileName))
  .sort();

const results = scenarioPaths.map((scenarioPath) => {
  const scenario = readModelConsistencyScenario(scenarioPath);
  return runModelConsistencyScenario(scenario);
});
const summary = summarizeModelConsistencyResults(
  scenarioPaths.map((scenarioPath) => readModelConsistencyScenario(scenarioPath)),
  results
);

let failureCount = 0;

if (outputJson) {
  console.log(JSON.stringify(summary, null, 2));

  if (summary.summary.failureCount > 0) {
    process.exitCode = 1;
  }

  process.exit();
}

for (const result of results) {
  if (result.failures.length === 0) {
    console.log(`PASS ${result.scenarioId} (${result.checkedFieldCount} locked field(s))`);
    continue;
  }

  failureCount += result.failures.length;
  console.log(`FAIL ${result.scenarioId}`);

  for (const failure of result.failures) {
    console.log(`  ${failure.path}: expected ${JSON.stringify(failure.expected)}, got ${JSON.stringify(failure.actual)}`);
    console.log(`    ${failure.reason}`);
  }
}

if (failureCount > 0) {
  console.error(`${failureCount} locked model-consistency field(s) drifted.`);
  process.exitCode = 1;
} else {
  console.log(
    `${summary.summary.passedScenarioCount} of ${summary.summary.scenarioCount} model-consistency scenario(s) passed.`
  );
}
