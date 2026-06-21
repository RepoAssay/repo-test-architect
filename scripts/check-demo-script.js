#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  "model-consistency:check"
];

if (isMainModule()) {
  runDemoChecks();
}

export function runDemoChecks() {
  const npm = resolveNpmInvocation();

  for (const check of demoChecks) {
    console.log(`\n==> npm run ${check}`);
    const result = spawnSync(npm.command, [...npm.args, "run", check], {
      stdio: "inherit"
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  console.log("\nDemo script check passed.");
}

export function resolveNpmInvocation() {
  if (process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath] };
  }

  if (process.platform === "win32") {
    const npmCliPath = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

    if (fs.existsSync(npmCliPath)) {
      return { command: process.execPath, args: [npmCliPath] };
    }
  }

  return { command: "npm", args: [] };
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
