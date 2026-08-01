#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const fixtureRoot = path.resolve("examples/php-phpunit-basic");

if (isMainModule()) runPhpNativeFixtureCheck();

export function runPhpNativeFixtureCheck() {
  run("composer", ["install", "--no-interaction", "--no-progress"]);
  run("composer", ["test"]);
  console.log("PHP native fixture check passed (Composer resolution and PHPUnit suite).");
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
