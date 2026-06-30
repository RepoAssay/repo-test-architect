#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const testFiles = collectTestFiles(path.resolve("test"));

if (testFiles.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

function collectTestFiles(root) {
  const files = [];

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);

      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".test.js")) {
        files.push(path.relative(process.cwd(), absolute));
      }
    }
  }

  visit(root);
  return files.sort();
}
