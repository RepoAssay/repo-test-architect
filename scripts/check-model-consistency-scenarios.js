#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  readModelConsistencyScenario,
  runModelConsistencyScenario
} from "../src/core/model-consistency-runner.js";

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

let failureCount = 0;

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
  console.log(`${results.length} model-consistency scenario(s) passed.`);
}
