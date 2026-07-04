#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  compareModelConsistencySummaries,
  readModelConsistencyScenario,
  runModelConsistencyScenario,
  summarizeModelConsistencyResults
} from "../src/core/model-consistency-runner.js";

const options = parseArgs(process.argv.slice(2));

const baseline = options.baselinePath
  ? JSON.parse(fs.readFileSync(options.baselinePath, "utf8"))
  : createCurrentSummary(options.baselineProfile);
const candidate = options.candidatePath
  ? JSON.parse(fs.readFileSync(options.candidatePath, "utf8"))
  : createCurrentSummary(options.candidateProfile);
const comparison = compareModelConsistencySummaries(baseline, candidate);

console.log(JSON.stringify(comparison, null, 2));

if (
  comparison.summary.driftedScenarioCount > 0 ||
  comparison.summary.missingScenarioCount > 0 ||
  comparison.summary.unexpectedScenarioCount > 0
) {
  process.exitCode = 1;
}

function createCurrentSummary(profileName) {
  const scenarioDir = path.resolve("evals/model-consistency");
  const scenarioPaths = fs
    .readdirSync(scenarioDir)
    .filter((fileName) => fileName.endsWith(".scenario.json"))
    .map((fileName) => path.join(scenarioDir, fileName))
    .sort();
  const scenarios = scenarioPaths.map((scenarioPath) => readModelConsistencyScenario(scenarioPath));
  const results = scenarios.map((scenario) => runModelConsistencyScenario(scenario));

  return summarizeModelConsistencyResults(scenarios, results, { profileName });
}

function parseArgs(args) {
  if (args.length === 2 && !args[0].startsWith("--") && !args[1].startsWith("--")) {
    return {
      baselinePath: args[0],
      candidatePath: args[1],
      baselineProfile: "deterministic-baseline",
      candidateProfile: "candidate"
    };
  }

  const options = {
    baselineProfile: "deterministic-baseline",
    candidateProfile: "local-small"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--baseline") {
      options.baselinePath = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--baseline=")) {
      options.baselinePath = readEqualsValue(arg, "--baseline");
      continue;
    }

    if (arg === "--candidate") {
      options.candidatePath = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--candidate=")) {
      options.candidatePath = readEqualsValue(arg, "--candidate");
      continue;
    }

    if (arg === "--baseline-profile") {
      options.baselineProfile = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--baseline-profile=")) {
      options.baselineProfile = readEqualsValue(arg, "--baseline-profile");
      continue;
    }

    if (arg === "--candidate-profile") {
      options.candidateProfile = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--candidate-profile=")) {
      options.candidateProfile = readEqualsValue(arg, "--candidate-profile");
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (Boolean(options.baselinePath) !== Boolean(options.candidatePath)) {
    throw new Error("--baseline and --candidate must be provided together.");
  }

  return options;
}

function readOptionValue(args, index, optionName) {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${optionName} requires a non-empty value.`);
  }

  return value;
}

function readEqualsValue(arg, optionName) {
  const value = arg.slice(`${optionName}=`.length);

  if (!value) {
    throw new Error(`${optionName} requires a non-empty value.`);
  }

  return value;
}
