#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const requests = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      clientInfo: {
        name: "repo-test-architect-smoke",
        version: "0.1.0"
      }
    }
  },
  {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list"
  },
  {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "detect_projects",
      arguments: {
        repoRoot: "./examples/polyglot-workspace"
      }
    }
  }
];

const result = spawnSync(process.execPath, ["./src/mcp/stdio.js"], {
  input: requests.map((request) => JSON.stringify(request)).join("\n") + "\n",
  encoding: "utf8"
});

if (result.error) {
  throw result.error;
}

assert.equal(result.status, 0, result.stderr);

const responses = result.stdout
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

assert.equal(responses.length, 3);

const [initialize, tools, detectedProjects] = responses;

assert.equal(initialize.id, 1);
assert.equal(initialize.result.serverInfo.name, "repo-test-architect");
assert.deepEqual(initialize.result.capabilities.tools, {});

assert.equal(tools.id, 2);
assert.ok(tools.result.tools.some((tool) => tool.name === "detect_projects"));
assert.ok(tools.result.tools.some((tool) => tool.name === "audit_projects"));

assert.equal(detectedProjects.id, 3);
assert.equal(detectedProjects.result.content.length, 1);
assert.equal(detectedProjects.result.content[0].type, "text");

const artifact = JSON.parse(detectedProjects.result.content[0].text);
assert.equal(artifact.schemaVersion, "project-detection/v1");
assert.equal(artifact.summary.projectCount, 3);
assert.ok(artifact.projects.some((project) => project.root === "apps/web" && project.supported));
assert.ok(artifact.projects.some((project) => project.root === "services/api" && !project.supported));

console.log("MCP stdio smoke check passed.");
