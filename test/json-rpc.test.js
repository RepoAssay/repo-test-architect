import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleJsonRpcMessage, handleJsonRpcRequest } from "../src/mcp/json-rpc.js";

describe("JSON-RPC MCP harness", () => {
  it("rejects malformed single requests", () => {
    assert.equal(handleJsonRpcRequest(null).error.code, -32600);
    assert.equal(handleJsonRpcRequest([]).error.code, -32600);
    assert.equal(handleJsonRpcRequest({ jsonrpc: "1.0", id: 1, method: "tools/list" }).error.code, -32600);
    assert.equal(handleJsonRpcRequest({ jsonrpc: "2.0", id: 2 }).error.code, -32600);
  });

  it("does not answer notification batches with no request responses", () => {
    const response = handleJsonRpcMessage([
      {
        jsonrpc: "2.0",
        method: "notifications/initialized"
      }
    ]);

    assert.equal(response, undefined);
  });

  it("returns null ids for invalid request envelopes", () => {
    const response = handleJsonRpcMessage([]);

    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.id, null);
    assert.equal(response.error.code, -32600);
  });
});
