#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const allowedTopLevelEntries = new Set([
  "README.md",
  "docs",
  "evals",
  "examples",
  "package.json",
  "schemas",
  "scripts",
  "src"
]);

const requiredFiles = [
  "README.md",
  "package.json",
  "src/cli/index.js",
  "src/mcp/stdio.js",
  "src/mcp/invoke.js",
  "src/mcp/tool-definitions.js",
  "schemas/audit-v1.schema.json",
  "schemas/project-stats-v1.schema.json",
  "schemas/model-consistency-stats-v1.schema.json",
  "scripts/check-pack-contents.js",
  "scripts/check-bin-entrypoints.js",
  "scripts/check-release-readiness.js"
];

const npm = resolveNpmInvocation();
const output = execFileSync(npm.command, [...npm.args, "pack", "--dry-run", "--json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});
const [pack] = JSON.parse(output);
const paths = pack.files.map((file) => normalizePath(file.path));
const topLevelEntries = new Set(paths.map((filePath) => filePath.split("/")[0]));
const unexpectedTopLevelEntries = [...topLevelEntries].filter((entry) => !allowedTopLevelEntries.has(entry)).sort();
const missingRequiredFiles = requiredFiles.filter((filePath) => !paths.includes(filePath));
const leakedTestFiles = paths.filter((filePath) => filePath === "test" || filePath.startsWith("test/")).sort();

if (unexpectedTopLevelEntries.length > 0 || missingRequiredFiles.length > 0 || leakedTestFiles.length > 0) {
  if (unexpectedTopLevelEntries.length > 0) {
    console.error(`Unexpected packed top-level entries: ${unexpectedTopLevelEntries.join(", ")}`);
  }

  if (missingRequiredFiles.length > 0) {
    console.error(`Missing required packed files: ${missingRequiredFiles.join(", ")}`);
  }

  if (leakedTestFiles.length > 0) {
    console.error(`Test files should not be packed: ${leakedTestFiles.join(", ")}`);
  }

  process.exit(1);
}

console.log(`Pack contents check passed (${paths.length} files).`);

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

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
