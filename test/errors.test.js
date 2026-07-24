import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INTERNAL_ERROR_CODE,
  McpToolError,
  TOOL_ERROR_CODE,
  mcpToolErrorKinds,
  toJsonRpcErrorData,
  toSafeMcpError
} from "../src/mcp/errors.js";

describe("MCP tool errors", () => {
  it("exposes stable tool error kinds", () => {
    assert.deepEqual(mcpToolErrorKinds, [
      "internal-error",
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

  it("does not let details override the stable MCP tool error kind", () => {
    const error = new McpToolError("invalid-arguments", "Invalid tool arguments.", {
      kind: "unknown-tool",
      toolName: "audit_repo"
    });

    assert.deepEqual(toJsonRpcErrorData(error), {
      kind: "invalid-arguments",
      toolName: "audit_repo"
    });
  });

  it("omits JSON-RPC data for generic errors", () => {
    assert.equal(toJsonRpcErrorData(new Error("boom")), undefined);
  });

  it("preserves expected tool errors without assigning report IDs", () => {
    const safeError = toSafeMcpError(new McpToolError("invalid-arguments", "Invalid arguments.", {
      toolName: "audit_repo"
    }));

    assert.deepEqual(safeError, {
      code: TOOL_ERROR_CODE,
      message: "Invalid arguments.",
      data: {
        kind: "invalid-arguments",
        toolName: "audit_repo"
      }
    });
  });

  it("replaces unexpected error details with a stable report ID", () => {
    const safeError = toSafeMcpError(
      new Error("token=secret-token at /Users/private/repo/source.js"),
      { createReportId: () => "report-00000000-0000-4000-8000-000000000001" }
    );

    assert.deepEqual(safeError, {
      code: INTERNAL_ERROR_CODE,
      message: "Internal server error.",
      data: {
        kind: "internal-error",
        reportId: "report-00000000-0000-4000-8000-000000000001"
      }
    });
    assert.doesNotMatch(JSON.stringify(safeError), /secret-token|Users|source\.js/);
  });
});
