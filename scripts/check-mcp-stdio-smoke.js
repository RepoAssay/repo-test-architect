#!/usr/bin/env node
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import readline from "node:readline";

const child = spawn(process.execPath, ["./src/mcp/stdio.js"], {
  stdio: ["pipe", "pipe", "pipe"]
});

let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const output = readline.createInterface({
  input: child.stdout,
  crlfDelay: Infinity
});

try {
  const initialize = await sendRequest({
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
  });

  const tools = await sendRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list"
  });

  const detectedProjects = await sendRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "detect_projects",
      arguments: {
        repoRoot: "./examples/polyglot-workspace"
      }
    }
  });

  const projectAuditsResponse = await sendRequest({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "audit_projects",
      arguments: {
        repoRoot: "./examples/polyglot-workspace"
      }
    }
  });

  const projectAudits = parseToolArtifact(projectAuditsResponse);
  const projectPlan = await sendRequest({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "generate_project_test_plan",
      arguments: {
        projectAudits
      }
    }
  });

  assert.equal(initialize.id, 1);
  assert.equal(initialize.result.serverInfo.name, "repo-test-architect");
  assert.deepEqual(initialize.result.capabilities.tools, {});

  assert.equal(tools.id, 2);
  assert.ok(tools.result.tools.some((tool) => tool.name === "detect_projects"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "audit_projects"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "generate_project_test_plan"));

  const detectionArtifact = parseToolArtifact(detectedProjects);
  assert.equal(detectionArtifact.schemaVersion, "project-detection/v1");
  assert.equal(detectionArtifact.summary.projectCount, 3);
  assert.ok(detectionArtifact.projects.some((project) => project.root === "apps/web" && project.supported));
  assert.ok(detectionArtifact.projects.some((project) => project.root === "services/api" && !project.supported));

  assert.equal(projectAudits.schemaVersion, "project-audits/v1");
  assert.equal(projectAudits.summary.auditedProjectCount, 1);
  assert.equal(projectAudits.summary.skippedProjectCount, 2);

  const planArtifact = parseToolArtifact(projectPlan);
  assert.equal(planArtifact.schemaVersion, "project-test-plan/v1");
  assert.equal(planArtifact.summary.plannedProjectCount, 1);
  assert.equal(planArtifact.summary.unsupportedProjectCount, 2);
  assert.equal(planArtifact.summary.itemCount, 1);
  assert.equal(planArtifact.items[0].projectId, "apps/web");

  child.stdin.end();
  const [exitCode] = await once(child, "close");
  assert.equal(exitCode, 0, stderr);

  console.log("MCP stdio smoke check passed.");
} catch (error) {
  child.kill();
  throw error;
} finally {
  output.close();
}

/**
 * @param {object} request
 * @returns {Promise<object>}
 */
async function sendRequest(request) {
  const responseLine = once(output, "line");
  child.stdin.write(`${JSON.stringify(request)}\n`);
  const [line] = await responseLine;
  return JSON.parse(line);
}

/**
 * @param {object} response
 * @returns {object}
 */
function parseToolArtifact(response) {
  assert.equal(response.result.content.length, 1);
  assert.equal(response.result.content[0].type, "text");
  return JSON.parse(response.result.content[0].text);
}
