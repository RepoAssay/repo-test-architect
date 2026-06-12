import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { callTool, mcpTools } from "../src/mcp/tool-definitions.js";

describe("MCP tool definitions", () => {
  it("declares the expected deterministic tools", () => {
    assert.deepEqual(
      mcpTools.map((tool) => tool.name),
      ["audit_repo", "get_audit_graph", "generate_test_plan", "explain_target", "rank_test_candidates", "generate_selected_test"]
    );

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
    assert.throws(() => callTool("audit_repo", {}), /repoRoot must be a non-empty string/);
    assert.throws(() => callTool("missing_tool", {}), /Unknown MCP tool/);
  });
});
