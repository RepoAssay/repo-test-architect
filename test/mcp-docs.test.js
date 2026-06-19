import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { mcpToolErrorKinds } from "../src/mcp/errors.js";
import { expectedMcpToolNames } from "./support/mcp-tools.js";

describe("MCP docs", () => {
  it("documents every MCP tool and tool error kind", () => {
    const docs = fs.readFileSync("docs/mcp-tools.md", "utf8");

    for (const toolName of expectedMcpToolNames) {
      assert.match(docs, new RegExp(`\\b${toolName}\\b`));
    }

    for (const kind of mcpToolErrorKinds) {
      assert.match(docs, new RegExp(`\\b${kind}\\b`));
    }

    assert.ok(docs.includes("current registered adapters are `javascript` and experimental `kotlin`"));
  });

  it("keeps project status aligned with MCP tool names", () => {
    const status = fs.readFileSync("docs/status.md", "utf8");

    for (const toolName of expectedMcpToolNames) {
      assert.match(status, new RegExp(`\\b${toolName}\\b`));
    }
  });
});
