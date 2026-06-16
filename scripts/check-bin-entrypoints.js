#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

const checks = {
  "repo-test-architect": checkCli,
  "repo-test-architect-mcp": checkMcpStdio,
  "repo-test-architect-mcp-invoke": checkMcpInvoke
};

const binNames = Object.keys(packageJson.bin ?? {});
const missingChecks = binNames.filter((binName) => !checks[binName]);

if (missingChecks.length > 0) {
  console.error(`Missing bin entrypoint checks: ${missingChecks.join(", ")}`);
  process.exit(1);
}

for (const binName of binNames) {
  const binPath = packageJson.bin[binName];
  checks[binName](binPath);
}

console.log(`Bin entrypoint check passed (${binNames.length} binaries).`);

function checkCli(binPath) {
  const output = execNode(binPath, ["adapters", "--format", "json"]);
  const artifact = parseJson(output, "CLI adapter registry output");

  assertEqual(artifact.schemaVersion, "adapter-registry/v1", "CLI adapter registry schema version");
  assertTrue(Array.isArray(artifact.adapters), "CLI adapter registry should include adapters");
  assertTrue(artifact.adapters.some((adapter) => adapter.id === "javascript"), "CLI should list the JavaScript adapter");
}

function checkMcpInvoke(binPath) {
  const output = execNode(binPath, ["tools"]);
  const artifact = parseJson(output, "MCP invoke tools output");

  assertTrue(Array.isArray(artifact.tools), "MCP invoke should list tools");
  assertTrue(artifact.tools.some((tool) => tool.name === "audit_repo"), "MCP invoke should list audit_repo");
}

function checkMcpStdio(binPath) {
  const request = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list"
  };
  const result = spawnSync(process.execPath, [binPath], {
    input: `${JSON.stringify(request)}\n`,
    encoding: "utf8",
    timeout: 5000
  });

  if (result.error) {
    throw result.error;
  }

  assertEqual(result.status, 0, "MCP stdio exit status");

  const response = parseJson(result.stdout.trim(), "MCP stdio tools/list response");
  assertEqual(response.id, 1, "MCP stdio response id");
  assertTrue(Array.isArray(response.result?.tools), "MCP stdio should list tools");
  assertTrue(response.result.tools.some((tool) => tool.name === "audit_repo"), "MCP stdio should list audit_repo");
}

function execNode(binPath, args) {
  return execFileSync(process.execPath, [binPath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} was not valid JSON: ${error.message}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
