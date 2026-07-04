import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { McpToolError, mcpToolErrorKinds, toJsonRpcErrorData } from "../src/mcp/errors.js";

describe("MCP tool errors", () => {
  it("exposes stable tool error kinds", () => {
    assert.deepEqual(mcpToolErrorKinds, [
      "unknown-tool",
      "invalid-arguments",
      "missing-required-argument",
      "unsupported-argument"
    ]);
  });

  it("preserves kind and details on MCP tool errors", () => {
    const error = new McpToolError("invalid-arguments", "repoRoot must be a non-empty string.", {
      toolName: "audit_repo",
      argument: "repoRoot"
    });

    assert.equal(error.name, "McpToolError");
    assert.equal(error.message, "repoRoot must be a non-empty string.");
    assert.equal(error.kind, "invalid-arguments");
    assert.deepEqual(error.details, {
      toolName: "audit_repo",
      argument: "repoRoot"
    });
  });

  it("converts MCP tool errors into JSON-RPC data", () => {
    const error = new McpToolError("missing-required-argument", "repoRoot is required.", {
      toolName: "audit_repo",
      argument: "repoRoot"
    });

    assert.deepEqual(toJsonRpcErrorData(error), {
      kind: "missing-required-argument",
      toolName: "audit_repo",
      argument: "repoRoot"
    });
  });

  it("omits JSON-RPC data for generic errors", () => {
    assert.equal(toJsonRpcErrorData(new Error("boom")), undefined);
  });
});
