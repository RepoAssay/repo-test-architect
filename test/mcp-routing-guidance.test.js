import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mcpServerInstructions } from "../src/mcp/server-info.js";
import { mcpTools } from "../src/mcp/tool-definitions.js";

describe("MCP routing guidance", () => {
  it("makes the bounded repository review the first and clearest entrypoint", () => {
    const review = mcpTools[0];

    assert.equal(review.name, "review_repository");
    assert.match(review.description, /Start here/i);
    assert.match(review.description, /unfamiliar repository/i);
    assert.match(review.description, /bounded/i);
    assert.match(review.description, /large monorepos/i);
    assert.match(review.description, /explain_target/);
    assert.match(review.description, /analyze_repository/);
    assert.equal(review._meta["anthropic/maxResultSizeChars"], 200_000);
  });

  it("positions the complete analysis bundle as the explicit second step", () => {
    const analyze = mcpTools[1];

    assert.equal(analyze.name, "analyze_repository");
    assert.match(analyze.description, /complete/i);
    assert.match(analyze.description, /exceed client limits/i);
    assert.match(analyze.description, /prefer review_repository/i);
    assert.doesNotMatch(analyze.description, /Start here/i);
    assert.equal(analyze._meta, undefined);
  });

  it("distinguishes focused artifact tools from repository scanning", () => {
    const auditRepo = mcpTools.find((tool) => tool.name === "audit_repo");
    const graph = mcpTools.find((tool) => tool.name === "get_audit_graph");
    const generation = mcpTools.find((tool) => tool.name === "generate_selected_test");
    const explain = mcpTools.find((tool) => tool.name === "explain_target");

    assert.match(auditRepo.description, /explicitly selected/i);
    assert.match(auditRepo.description, /defaults to javascript/i);
    assert.match(auditRepo.description, /review_repository/i);
    assert.match(graph.description, /existing audit/i);
    assert.match(graph.description, /does not scan/i);
    assert.match(generation.description, /does not generate or write/i);
    assert.match(explain.description, /repoRoot plus the projectRoot and targetId/i);
  });

  it("tells models to pass repoRoot instead of echoing artifacts", () => {
    for (const name of [
      "summarize_project_audits",
      "rank_project_candidates",
      "generate_project_test_plan",
      "collect_project_findings",
      "analyze_project_test_placement",
      "collect_project_stats",
      "get_plan_execution_hints"
    ]) {
      const tool = mcpTools.find((candidate) => candidate.name === name);
      assert.ok(tool.inputSchema.properties.repoRoot, `${name} accepts repoRoot`);
      assert.match(tool.inputSchema.properties.repoRoot.description, /instead of passing/i);
    }

    for (const name of ["generate_test_plan", "explain_target", "rank_test_candidates", "analyze_test_placement"]) {
      const tool = mcpTools.find((candidate) => candidate.name === name);
      assert.ok(tool.inputSchema.properties.repoRoot, `${name} accepts repoRoot`);
      assert.ok(tool.inputSchema.properties.projectRoot, `${name} accepts projectRoot`);
      assert.match(tool.description, /repoRoot plus (the )?projectRoot/);
    }
  });

  it("gives connected models stable server-level workflow instructions", () => {
    assert.match(mcpServerInstructions, /Start with review_repository/i);
    assert.match(mcpServerInstructions, /analyze_repository only when the complete bundle/i);
    assert.match(mcpServerInstructions, /explicit audit coverage gaps/i);
    assert.match(mcpServerInstructions, /single project root/i);
    assert.match(mcpServerInstructions, /pass repoRoot/i);
    assert.match(mcpServerInstructions, /Do not reclassify/i);
    assert.match(mcpServerInstructions, /deferred/i);
  });
});
