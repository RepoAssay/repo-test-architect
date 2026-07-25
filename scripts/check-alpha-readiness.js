#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNpmScripts } from "./support/npm-runner.js";

export const alphaChecks = [
  "test",
  "adapter:coverage:check",
  "corpus:check",
  "javascript:performance:check",
  "eval:check",
  "model-consistency:check",
  "demo:check",
  "mcp:smoke"
];

if (isMainModule()) {
  runAlphaChecks();
}

export function runAlphaChecks() {
  runNpmScripts(alphaChecks, "Alpha readiness check passed.");
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
