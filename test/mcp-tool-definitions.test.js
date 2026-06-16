import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { callTool, mcpToolNames, mcpTools } from "../src/mcp/tool-definitions.js";
import { assertMatchesSchema } from "./support/json-schema-validator.js";
import { expectedMcpToolNames } from "./support/mcp-tools.js";

const toolSchema = JSON.parse(fs.readFileSync("schemas/mcp-tool-v1.schema.json", "utf8"));

describe("MCP tool definitions", () => {
  it("declares the expected deterministic tools", () => {
    assert.deepEqual(mcpTools.map((tool) => tool.name), expectedMcpToolNames);
    assert.deepEqual(mcpToolNames, expectedMcpToolNames);

    for (const tool of mcpTools) {
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(tool.inputSchema.additionalProperties, false);
      assert.ok(Array.isArray(tool.inputSchema.required));
      assert.equal(typeof tool.outputArtifact.schemaVersion, "string");
      assert.equal(typeof tool.outputArtifact.schemaPath, "string");
    }
  });

  it("declares output artifacts with matching schemas", () => {
    for (const tool of mcpTools) {
      const schema = JSON.parse(fs.readFileSync(tool.outputArtifact.schemaPath, "utf8"));

      assert.equal(schema.properties.schemaVersion.const, tool.outputArtifact.schemaVersion);
    }
  });

  it("matches the MCP tool descriptor schema", () => {
    for (const tool of mcpTools) {
      assertMatchesSchema(tool, toolSchema, `${tool.name}.mcp-tool.json`);
    }
  });

  it("dispatches adapter registry, project detection rules, project detection, project audits, audit, plan, explanation, and ranking tools", () => {
    const adapterRegistry = callTool("list_adapters");
    const projectDetectionRules = callTool("list_project_detection_rules");
    const projectDetection = callTool("detect_projects", {
      repoRoot: path.resolve("examples/polyglot-workspace")
    });
    const projectAudits = callTool("audit_projects", {
      repoRoot: path.resolve("examples/polyglot-workspace")
    });
    const projectAuditSummary = callTool("summarize_project_audits", { projectAudits });
    const projectCandidateRanking = callTool("rank_project_candidates", { projectAudits });
    const projectTestPlan = callTool("generate_project_test_plan", { projectAudits });
    const projectPlacement = callTool("analyze_project_test_placement", { projectAudits });
    const projectStats = callTool("collect_project_stats", { projectAudits });
    const audit = callTool("audit_repo", {
      repoRoot: path.resolve("examples/node-vitest-basic"),
      adapterId: "javascript"
    });
    const graph = callTool("get_audit_graph", { audit });
    const plan = callTool("generate_test_plan", { audit, itemId: "add-test:src/authService.ts" });
    const explanation = callTool("explain_target", { audit, targetId: "src/authService.ts" });
    const ranking = callTool("rank_test_candidates", { audit });
    const placement = callTool("analyze_test_placement", { audit, owner: "node-vitest-basic" });
    const deferredGeneration = callTool("generate_selected_test", { planItemId: "add-test:src/authService.ts" });

    assert.equal(adapterRegistry.schemaVersion, "adapter-registry/v1");
    assert.deepEqual(adapterRegistry.adapters.map((adapter) => adapter.id), ["javascript"]);
    assert.equal(projectDetectionRules.schemaVersion, "project-detection-rules/v1");
    assert.ok(projectDetectionRules.markers.some((marker) => marker.fileName === "package.json"));
    assert.equal(projectDetection.schemaVersion, "project-detection/v1");
    assert.equal(projectDetection.summary.projectCount, 3);
    assert.equal(projectAudits.schemaVersion, "project-audits/v1");
    assert.equal(projectAudits.summary.auditedProjectCount, 1);
    assert.equal(projectAuditSummary.schemaVersion, "project-audit-summary/v1");
    assert.equal(projectAuditSummary.summary.auditCoverage, "partial");
    assert.equal(projectAuditSummary.summary.untestedCandidateCount, 1);
    assert.deepEqual(projectAuditSummary.summary.unsupportedReasons, [
      "No registered adapter supports ecosystems jvm with languages java, kotlin.",
      "No registered adapter supports ecosystems python with languages python."
    ]);
    assert.equal(projectCandidateRanking.schemaVersion, "project-candidate-ranking/v1");
    assert.equal(projectCandidateRanking.summary.candidateCount, 1);
    assert.equal(projectTestPlan.schemaVersion, "project-test-plan/v1");
    assert.equal(projectTestPlan.summary.itemCount, 1);
    assert.equal(projectPlacement.schemaVersion, "test-placement-findings/v1");
    assert.equal(projectPlacement.findings.length, 0);
    assert.equal(projectStats.schemaVersion, "project-stats/v1");
    assert.equal(projectStats.counts.untestedCandidateCount, 1);
    assert.equal(graph, audit);
    assert.equal(plan.schemaVersion, "plan/v1");
    assert.deepEqual(plan.items.map((item) => item.id), ["add-test:src/authService.ts"]);
    assert.equal(explanation.schemaVersion, "target-explanation/v1");
    assert.equal(ranking.schemaVersion, "candidate-ranking/v1");
    assert.equal(placement.schemaVersion, "test-placement-findings/v1");
    assert.equal(placement.findings[0].testFile, "src/deckParser.test.ts");
    assert.equal(deferredGeneration.schemaVersion, "generation-deferred/v1");
    assert.equal(deferredGeneration.status, "deferred");
  });

  it("validates tool input before dispatch", () => {
    assert.throws(
      () => callTool("audit_repo", {}),
      (error) => error.kind === "missing-required-argument" && /repoRoot is required for audit_repo/.test(error.message)
    );
    assert.throws(
      () => callTool("missing_tool", {}),
      (error) => error.kind === "unknown-tool" && /Unknown MCP tool/.test(error.message)
    );
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
        (error) =>
          error.kind === "unsupported-argument" &&
          error.details.toolName === tool.name &&
          error.details.argument === "extra" &&
          new RegExp(`extra is not a supported argument for ${tool.name}`).test(error.message)
      );
    }
  });
});

function minimalArgsFor(toolName) {
  if (toolName === "list_adapters") return {};
  if (toolName === "list_project_detection_rules") return {};
  if (toolName === "detect_projects") return { repoRoot: "." };
  if (toolName === "audit_projects") return { repoRoot: "." };
  if (toolName === "summarize_project_audits") return { projectAudits: { schemaVersion: "project-audits/v1", audits: [], skippedProjects: [], summary: {} } };
  if (toolName === "rank_project_candidates") return { projectAudits: { schemaVersion: "project-audits/v1", audits: [], skippedProjects: [], summary: {} } };
  if (toolName === "generate_project_test_plan") return { projectAudits: { schemaVersion: "project-audits/v1", audits: [], skippedProjects: [], summary: {} } };
  if (toolName === "analyze_project_test_placement") return { projectAudits: { schemaVersion: "project-audits/v1", audits: [], skippedProjects: [], summary: {} } };
  if (toolName === "collect_project_stats") return { projectAudits: { schemaVersion: "project-audits/v1", audits: [], skippedProjects: [], summary: {} } };
  if (toolName === "audit_repo") return { repoRoot: "." };
  if (toolName === "explain_target") return { audit: {}, targetId: "src/example.ts" };
  if (toolName === "analyze_test_placement") return { audit: {} };
  if (toolName === "generate_selected_test") return { planItemId: "add-test:src/example.ts" };
  return { audit: {} };
}
