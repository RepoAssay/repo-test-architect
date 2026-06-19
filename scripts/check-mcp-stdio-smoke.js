#!/usr/bin/env node
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import readline from "node:readline";

const RESPONSE_TIMEOUT_MS = 5_000;

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

  await sendNotification({
    jsonrpc: "2.0",
    method: "notifications/initialized"
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

  const missingTool = await sendRequest({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: {
      name: "missing_tool",
      arguments: {}
    }
  });

  const statsAfterError = await sendRequest({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "collect_project_stats",
      arguments: {
        projectAudits
      }
    }
  });

  const batchResponse = await sendBatchRequest([
    {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/list"
    },
    {
      jsonrpc: "2.0",
      method: "notifications/initialized"
    },
    {
      jsonrpc: "2.0",
      id: 9,
      method: "missing/method"
    }
  ]);

  const parseError = await sendRawLine("{");
  const toolsAfterParseError = await sendRequest({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/list"
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

  assert.equal(missingTool.id, 6);
  assert.equal(missingTool.error.code, -32000);
  assert.equal(missingTool.error.data.kind, "unknown-tool");
  assert.equal(missingTool.error.data.toolName, "missing_tool");

  const statsArtifact = parseToolArtifact(statsAfterError);
  assert.equal(statsAfterError.id, 7);
  assert.equal(statsArtifact.schemaVersion, "project-stats/v1");
  assert.equal(statsArtifact.summary.projectCount, 3);
  assert.equal(statsArtifact.summary.auditedProjectCount, 1);

  assert.equal(batchResponse.length, 2);
  assert.equal(batchResponse[0].id, 8);
  assert.ok(batchResponse[0].result.tools.some((tool) => tool.name === "detect_projects"));
  assert.equal(batchResponse[1].id, 9);
  assert.equal(batchResponse[1].error.code, -32601);

  assert.equal(parseError.id, null);
  assert.equal(parseError.error.code, -32700);
  assert.match(parseError.error.message, /Parse error/);
  assert.equal(toolsAfterParseError.id, 10);
  assert.ok(toolsAfterParseError.result.tools.some((tool) => tool.name === "detect_projects"));

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
  const responseLine = readLineWithin(
    RESPONSE_TIMEOUT_MS,
    `Timed out waiting for MCP response to ${request.method} request ${request.id}. Stderr: ${stderr || "<empty>"}`
  );
  child.stdin.write(`${JSON.stringify(request)}\n`);
  const [line] = await responseLine;
  return JSON.parse(line);
}

/**
 * @param {object[]} requests
 * @returns {Promise<object[]>}
 */
async function sendBatchRequest(requests) {
  const responseLine = readLineWithin(
    RESPONSE_TIMEOUT_MS,
    `Timed out waiting for MCP batch response. Stderr: ${stderr || "<empty>"}`
  );
  child.stdin.write(`${JSON.stringify(requests)}\n`);
  const [line] = await responseLine;
  return JSON.parse(line);
}

/**
 * @param {string} line
 * @returns {Promise<object>}
 */
async function sendRawLine(line) {
  const responseLine = readLineWithin(
    RESPONSE_TIMEOUT_MS,
    `Timed out waiting for MCP response to raw input. Stderr: ${stderr || "<empty>"}`
  );
  child.stdin.write(`${line}\n`);
  const [responseLineText] = await responseLine;
  return JSON.parse(responseLineText);
}

/**
 * @param {object} request
 * @returns {Promise<void>}
 */
async function sendNotification(request) {
  child.stdin.write(`${JSON.stringify(request)}\n`);
  await expectNoLineWithin(
    100,
    `Expected no MCP response to ${request.method} notification.`
  );
}

/**
 * @param {number} timeoutMs
 * @param {string} message
 * @returns {Promise<[string]>}
 */
function readLineWithin(timeoutMs, message) {
  return new Promise((resolve, reject) => {
    let timeout;
    const onLine = (line) => {
      clearTimeout(timeout);
      resolve([line]);
    };

    timeout = setTimeout(() => {
      output.off("line", onLine);
      reject(new Error(message));
    }, timeoutMs);

    output.once("line", onLine);
  });
}

/**
 * @param {number} timeoutMs
 * @param {string} message
 * @returns {Promise<void>}
 */
function expectNoLineWithin(timeoutMs, message) {
  return new Promise((resolve, reject) => {
    let timeout;
    const onLine = (line) => {
      clearTimeout(timeout);
      reject(new Error(`${message} Received: ${line}`));
    };

    timeout = setTimeout(() => {
      output.off("line", onLine);
      resolve();
    }, timeoutMs);

    output.once("line", onLine);
  });
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
