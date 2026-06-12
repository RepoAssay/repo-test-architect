import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleJsonRpcRequest } from "../src/mcp/json-rpc.js";
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

  it("does not answer notifications", () => {
    const response = handleJsonRpcRequest({
      jsonrpc: "2.0",
      method: "notifications/initialized"
    });

    assert.equal(response, undefined);
  });
});
