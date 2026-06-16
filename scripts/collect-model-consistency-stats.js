#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  compareModelConsistencySummaries,
  readModelConsistencyScenario,
  runModelConsistencyScenario,
  summarizeModelConsistencyResults
} from "../src/core/model-consistency-runner.js";
import { collectModelConsistencyStats } from "../src/core/model-consistency-stats.js";

const scenarioDir = path.resolve("evals/model-consistency");
const options = parseArgs(process.argv.slice(2));
const summary = options.summaryPath ? readJson(options.summaryPath) : createCurrentSummary(options.profileName);
const comparison = options.comparisonPath
  ? readJson(options.comparisonPath)
  : options.candidateSummaryPath
    ? compareModelConsistencySummaries(summary, readJson(options.candidateSummaryPath))
    : undefined;

console.log(JSON.stringify(collectModelConsistencyStats(summary, { comparison }), null, 2));

function parseArgs(args) {
  let profileName = "deterministic-baseline";
  let summaryPath;
  let candidateSummaryPath;
  let comparisonPath;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--profile") {
      profileName = args[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--profile=")) {
      profileName = arg.slice("--profile=".length);
      continue;
    }

    if (arg === "--summary") {
      summaryPath = args[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--summary=")) {
      summaryPath = arg.slice("--summary=".length);
      continue;
    }

    if (arg === "--candidate-summary") {
      candidateSummaryPath = args[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--candidate-summary=")) {
      candidateSummaryPath = arg.slice("--candidate-summary=".length);
      continue;
    }

    if (arg === "--comparison") {
      comparisonPath = args[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--comparison=")) {
      comparisonPath = arg.slice("--comparison=".length);
      continue;
    }
  }

  return { profileName, summaryPath, candidateSummaryPath, comparisonPath };
}

function createCurrentSummary(profileName) {
  const scenarios = fs
    .readdirSync(scenarioDir)
    .filter((fileName) => fileName.endsWith(".scenario.json"))
    .sort()
    .map((fileName) => readModelConsistencyScenario(path.join(scenarioDir, fileName)));
  const results = scenarios.map((scenario) => runModelConsistencyScenario(scenario));

  return summarizeModelConsistencyResults(scenarios, results, { profileName });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}
