import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MAX_RESULT_CHARS,
  MAX_RESULT_CHARS_ENV,
  fromMcpToolResult,
  resolveMaxResultChars,
  toMcpToolResult
} from "../src/mcp/responses.js";

describe("MCP responses", () => {
  it("wraps structured artifacts as MCP structured and compact text content", () => {
    const artifact = {
      schemaVersion: "audit/v1",
      profile: { confidence: "high" }
    };
    const result = toMcpToolResult(artifact);

    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "text");
    // Compact JSON: the text carries the same artifact as structuredContent without whitespace padding.
    assert.equal(result.content[0].text, JSON.stringify(artifact));
    assert.deepEqual(result.structuredContent, artifact);
    assert.deepEqual(fromMcpToolResult(result), artifact);
  });

  it("rejects results above the serialized character budget before they reach the transport", () => {
    const artifact = { schemaVersion: "audit/v1", padding: "x".repeat(200) };
    const serializedLength = JSON.stringify(artifact).length;

    assert.throws(
      () => toMcpToolResult(artifact, { toolName: "audit_repo", maxChars: 100 }),
      (error) =>
        error.kind === "result-too-large" &&
        error.details.toolName === "audit_repo" &&
        error.details.resultChars === serializedLength &&
        error.details.maxResultChars === 100 &&
        /above the 100-character limit/.test(error.message) &&
        new RegExp(MAX_RESULT_CHARS_ENV).test(error.message) &&
        !/x{10}/.test(error.message)
    );
    assert.doesNotThrow(() => toMcpToolResult(artifact, { maxChars: serializedLength }));
    assert.doesNotThrow(() => toMcpToolResult(artifact, { maxChars: 0 }));
  });

  it("reads the result budget from the environment with a safe default", () => {
    assert.equal(resolveMaxResultChars({}), DEFAULT_MAX_RESULT_CHARS);
    assert.equal(resolveMaxResultChars({ [MAX_RESULT_CHARS_ENV]: "" }), DEFAULT_MAX_RESULT_CHARS);
    assert.equal(resolveMaxResultChars({ [MAX_RESULT_CHARS_ENV]: "lots" }), DEFAULT_MAX_RESULT_CHARS);
    assert.equal(resolveMaxResultChars({ [MAX_RESULT_CHARS_ENV]: "-5" }), DEFAULT_MAX_RESULT_CHARS);
    assert.equal(resolveMaxResultChars({ [MAX_RESULT_CHARS_ENV]: "1e6" }), DEFAULT_MAX_RESULT_CHARS);
    assert.equal(resolveMaxResultChars({ [MAX_RESULT_CHARS_ENV]: " 250000 " }), 250000);
    assert.equal(resolveMaxResultChars({ [MAX_RESULT_CHARS_ENV]: "0" }), 0);
    assert.equal(DEFAULT_MAX_RESULT_CHARS, 1_000_000);
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
