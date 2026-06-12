import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromMcpToolResult, toMcpToolResult } from "../src/mcp/responses.js";

describe("MCP responses", () => {
  it("wraps structured artifacts as MCP text content", () => {
    const result = toMcpToolResult({
      schemaVersion: "audit/v1",
      profile: { confidence: "high" }
    });

    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "text");
    assert.deepEqual(fromMcpToolResult(result), {
      schemaVersion: "audit/v1",
      profile: { confidence: "high" }
    });
  });

  it("rejects malformed MCP tool results", () => {
    assert.throws(() => fromMcpToolResult({ content: [] }), /missing text content/);
  });
});
