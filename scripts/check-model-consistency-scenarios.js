#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  readModelConsistencyScenario,
  runModelConsistencyScenario,
  summarizeModelConsistencyResults
} from "../src/core/model-consistency-runner.js";

const options = parseArgs(process.argv.slice(2));
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
  results,
  { profileName: options.profileName }
);

let failureCount = 0;

if (options.outputJson) {
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

function parseArgs(args) {
  const options = {
    outputJson: false,
    profileName: "deterministic-baseline"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.outputJson = true;
      continue;
    }

    if (arg === "--profile") {
      const profileName = args[index + 1];

      if (!profileName || profileName.startsWith("--")) {
        throw new Error("--profile requires a non-empty profile name.");
      }

      options.profileName = profileName;
      index += 1;
      continue;
    }

    if (arg.startsWith("--profile=")) {
      const profileName = arg.slice("--profile=".length);

      if (!profileName) {
        throw new Error("--profile requires a non-empty profile name.");
      }

      options.profileName = profileName;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}
