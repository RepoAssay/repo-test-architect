#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const releaseChecks = [
  "test",
  "eval:check",
  "model-consistency:check",
  "smoke",
  "pack:check",
  "bin:check"
];

const npm = resolveNpmInvocation();

for (const check of releaseChecks) {
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

console.log("\nRelease readiness check passed.");

function resolveNpmInvocation() {
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
