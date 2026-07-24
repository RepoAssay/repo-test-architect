#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNpmScripts } from "./support/npm-runner.js";

export const releaseChecks = [
  "audit:prod",
  "test",
  "eval:check",
  "model-consistency:check",
  "demo:check",
  "mcp:smoke",
  "smoke",
  "pack:check",
  "bin:check",
  "installed-package:check",
  "distribution:check"
];

if (isMainModule()) {
  runReleaseChecks();
}

export function runReleaseChecks() {
  runNpmScripts(releaseChecks, "Release readiness check passed.");
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
