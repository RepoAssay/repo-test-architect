#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const fixtureRoot = path.resolve("examples/elixir-mix-exunit-basic");

if (isMainModule()) runElixirNativeFixtureCheck();

export function runElixirNativeFixtureCheck() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-elixir-native-"));
  try {
    fs.cpSync(fixtureRoot, root, { recursive: true });
    const result = spawnSync("mix", ["test"], { cwd: root, encoding: "utf8", stdio: "pipe" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      throw new Error(`mix test exited with status ${result.status}.`);
    }
    console.log("Elixir native fixture check passed (Mix compile and ExUnit suite)." );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
