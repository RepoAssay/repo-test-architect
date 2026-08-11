import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromMcpToolResult, toMcpToolResult } from "../src/mcp/responses.js";

describe("MCP responses", () => {
  it("wraps structured artifacts as MCP structured and text content", () => {
    const artifact = {
      schemaVersion: "audit/v1",
      profile: { confidence: "high" }
    };
    const result = toMcpToolResult(artifact);

    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "text");
    assert.deepEqual(result.structuredContent, artifact);
    assert.deepEqual(fromMcpToolResult(result), artifact);
  });

  it("reads legacy text-only MCP results", () => {
    const result = {
      content: [{ type: "text", text: JSON.stringify({ schemaVersion: "audit/v1" }) }]
    };

    assert.deepEqual(fromMcpToolResult(result), { schemaVersion: "audit/v1" });
  });

  it("rejects malformed MCP tool results", () => {
    assert.throws(() => fromMcpToolResult({ content: [] }), /missing text content/);
  });
});
