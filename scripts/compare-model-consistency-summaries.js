#!/usr/bin/env node

import fs from "node:fs";
import { compareModelConsistencySummaries } from "../src/core/model-consistency-runner.js";

const [baselinePath, candidatePath] = process.argv.slice(2);

if (!baselinePath || !candidatePath) {
  console.error("Usage: node ./scripts/compare-model-consistency-summaries.js <baseline-summary.json> <candidate-summary.json>");
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
const comparison = compareModelConsistencySummaries(baseline, candidate);

console.log(JSON.stringify(comparison, null, 2));

if (
  comparison.summary.driftedScenarioCount > 0 ||
  comparison.summary.missingScenarioCount > 0 ||
  comparison.summary.unexpectedScenarioCount > 0
) {
  process.exitCode = 1;
}
