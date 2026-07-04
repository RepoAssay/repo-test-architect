#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNpmScripts } from "./support/npm-runner.js";

export const demoChecks = [
  "audit:example",
  "audit:kotlin-fixture",
  "rank:example",
  "plan:example",
  "plan:kotlin-fixture",
  "detect:example",
  "audit-projects:example",
  "summarize-projects:example",
  "rank-projects:example",
  "plan-projects:example",
  "placement-projects:split-example:json",
  "stats-projects:example",
  "mcp:tools",
  "mcp:audit-projects:example",
  "mcp:audit:kotlin-fixture",
  "mcp:rank-projects:example",
  "mcp:plan-projects:example",
  "mcp:placement-split:example",
  "model-consistency:check",
  "model-consistency:compare:profiles"
];

if (isMainModule()) {
  runDemoChecks();
}

export function runDemoChecks() {
  runNpmScripts(demoChecks, "Demo script check passed.");
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
