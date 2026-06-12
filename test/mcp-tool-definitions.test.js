import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { callTool, mcpToolNames, mcpTools } from "../src/mcp/tool-definitions.js";
import { expectedMcpToolNames } from "./support/mcp-tools.js";

describe("MCP tool definitions", () => {
  it("declares the expected deterministic tools", () => {
    assert.deepEqual(mcpTools.map((tool) => tool.name), expectedMcpToolNames);
    assert.deepEqual(mcpToolNames, expectedMcpToolNames);

    for (const tool of mcpTools) {
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(tool.inputSchema.additionalProperties, false);
      assert.ok(Array.isArray(tool.inputSchema.required));
    }
  });

  it("dispatches audit, plan, explanation, and ranking tools", () => {
    const audit = callTool("audit_repo", {
      repoRoot: path.resolve("examples/node-vitest-basic")
    });
    const graph = callTool("get_audit_graph", { audit });
    const plan = callTool("generate_test_plan", { audit, itemId: "add-test:src/authService.ts" });
    const explanation = callTool("explain_target", { audit, targetId: "src/authService.ts" });
    const ranking = callTool("rank_test_candidates", { audit });
    const deferredGeneration = callTool("generate_selected_test", { planItemId: "add-test:src/authService.ts" });

    assert.equal(graph, audit);
    assert.equal(plan.schemaVersion, "plan/v1");
    assert.deepEqual(plan.items.map((item) => item.id), ["add-test:src/authService.ts"]);
    assert.equal(explanation.schemaVersion, "target-explanation/v1");
    assert.equal(ranking.schemaVersion, "candidate-ranking/v1");
    assert.equal(deferredGeneration.schemaVersion, "generation-deferred/v1");
    assert.equal(deferredGeneration.status, "deferred");
  });

  it("validates tool input before dispatch", () => {
    assert.throws(() => callTool("audit_repo", {}), /repoRoot is required for audit_repo/);
    assert.throws(() => callTool("missing_tool", {}), /Unknown MCP tool/);
  });

  it("enforces declared required and allowed arguments", () => {
    for (const tool of mcpTools) {
      for (const requiredKey of tool.inputSchema.required) {
        const args = minimalArgsFor(tool.name);
        delete args[requiredKey];

        assert.throws(
          () => callTool(tool.name, args),
          new RegExp(`${requiredKey} is required for ${tool.name}`)
        );
      }

      assert.throws(
        () => callTool(tool.name, { ...minimalArgsFor(tool.name), extra: true }),
        new RegExp(`extra is not a supported argument for ${tool.name}`)
      );
    }
  });
});

function minimalArgsFor(toolName) {
  if (toolName === "audit_repo") return { repoRoot: "." };
  if (toolName === "explain_target") return { audit: {}, targetId: "src/example.ts" };
  if (toolName === "generate_selected_test") return { planItemId: "add-test:src/example.ts" };
  return { audit: {} };
}
