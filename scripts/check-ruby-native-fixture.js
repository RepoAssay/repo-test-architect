#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const fixtureRoot = path.resolve("examples/ruby-minitest-basic");

if (isMainModule()) runRubyNativeFixtureCheck();

export function runRubyNativeFixtureCheck() {
  const bundle = resolveBundleForRuby();
  run(bundle, ["check"]);
  run(bundle, ["exec", "rake", "test"]);
  console.log("Ruby native fixture check passed (Bundler resolution and Minitest suite).");
}

function resolveBundleForRuby() {
  const result = spawnSync("ruby", ["-e", 'require "rbconfig"; print RbConfig.ruby'], {
    encoding: "utf8",
    stdio: "pipe"
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error("Ruby is required for the native fixture check.");
  }
  return path.join(path.dirname(result.stdout.trim()), process.platform === "win32" ? "bundle.bat" : "bundle");
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: fixtureRoot,
    encoding: "utf8",
    stdio: "pipe"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status}.`);
  }
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
