import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mcpToolErrorKinds } from "../src/mcp/errors.js";
import { handleJsonRpcMessage, handleJsonRpcRequest } from "../src/mcp/json-rpc.js";
import { expectedMcpToolNames } from "./support/mcp-tools.js";

describe("MCP JSON-RPC scaffold", () => {
  it("handles initialize", () => {
    const response = handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "test-protocol"
      }
    });

    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.id, 1);
    assert.equal(response.result.protocolVersion, "test-protocol");
    assert.equal(response.result.serverInfo.name, "repo-test-architect");
  });

  it("lists tools", () => {
    const response = handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list"
    });

    assert.deepEqual(response.result.tools.map((tool) => tool.name), expectedMcpToolNames);
  });

  it("calls tools with MCP-style content results", () => {
    const response = handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "audit_repo",
        arguments: {
          repoRoot: "./examples/node-vitest-basic"
        }
      }
    });
    const audit = JSON.parse(response.result.content[0].text);

    assert.equal(response.id, 3);
    assert.equal(response.result.content[0].type, "text");
    assert.equal(audit.schemaVersion, "audit/v1");
  });

  it("returns JSON-RPC errors", () => {
    const response = handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "missing_tool"
      }
    });

    assert.equal(response.error.code, -32000);
    assert.match(response.error.message, /Unknown MCP tool/);
    assert.equal(response.error.data.kind, "unknown-tool");
    assert.equal(response.error.data.toolName, "missing_tool");
  });

  it("documents stable MCP tool error kinds", () => {
    assert.deepEqual(mcpToolErrorKinds, [
      "internal-error",
      "unknown-tool",
      "invalid-arguments",
      "missing-required-argument",
      "unsupported-argument"
    ]);
  });

  it("returns JSON-RPC error data for invalid tool arguments", () => {
    const response = handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "audit_repo",
        arguments: {
          unexpected: true
        }
      }
    });

    assert.equal(response.error.code, -32000);
    assert.equal(response.error.data.kind, "missing-required-argument");
    assert.equal(response.error.data.toolName, "audit_repo");
    assert.equal(response.error.data.argument, "repoRoot");
  });

  it("returns JSON-RPC error data for invalid tool argument values", () => {
    const response = handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "audit_repo",
        arguments: {
          repoRoot: ".",
          changedPaths: [""]
        }
      }
    });

    assert.equal(response.error.code, -32000);
    assert.equal(response.error.data.kind, "invalid-arguments");
    assert.equal(response.error.data.toolName, "audit_repo");
    assert.equal(response.error.data.argument, "changedPaths");
    assert.match(response.error.message, /changedPaths must be an array of non-empty strings/);
  });

  it("does not answer notifications", () => {
    const response = handleJsonRpcRequest({
      jsonrpc: "2.0",
      method: "notifications/initialized"
    });

    assert.equal(response, undefined);
  });

  it("handles JSON-RPC batches", () => {
    const response = handleJsonRpcMessage([
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/list"
      },
      {
        jsonrpc: "2.0",
        method: "notifications/initialized"
      },
      {
        jsonrpc: "2.0",
        id: 7,
        method: "missing/method"
      }
    ]);

    assert.equal(response.length, 2);
    assert.equal(response[0].id, 6);
    assert.deepEqual(response[0].result.tools.map((tool) => tool.name), expectedMcpToolNames);
    assert.equal(response[1].id, 7);
    assert.equal(response[1].error.code, -32601);
  });

  it("rejects empty JSON-RPC batches", () => {
    const response = handleJsonRpcMessage([]);

    assert.equal(response.error.code, -32600);
  });
});
