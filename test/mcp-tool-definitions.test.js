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
      assert.equal(typeof tool.title, "string");
      assert.ok(tool.title.length > 0);
      assert.deepEqual(tool.annotations, {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      });
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

  it("declares non-empty changed path items", () => {
    const changedPathTools = ["analyze_repository", "audit_projects", "audit_repo"];

    for (const toolName of changedPathTools) {
      const tool = mcpTools.find((candidate) => candidate.name === toolName);

      assert.equal(tool.inputSchema.properties.changedPaths.items.minLength, 1);
    }
  });

  it("declares non-empty project exclusion items", () => {
    const projectExclusionTools = ["analyze_repository", "detect_projects", "audit_projects"];

    for (const toolName of projectExclusionTools) {
      const tool = mcpTools.find((candidate) => candidate.name === toolName);

      assert.equal(tool.inputSchema.properties.excludeProjectRoots.items.minLength, 1);
    }
  });

  it("declares bounded Go target objects on repository audit tools", () => {
    for (const toolName of ["analyze_repository", "audit_projects", "audit_repo"]) {
      const target = mcpTools.find((tool) => tool.name === toolName).inputSchema.properties.goTarget;

      assert.equal(target.type, "object");
      assert.equal(target.additionalProperties, false);
      assert.deepEqual(target.required, ["goos", "goarch"]);
      assert.equal(target.properties.tags.items.minLength, 1);
    }
  });

  it("passes explicit Go targets through direct and project MCP tools", () => {
    const repoRoot = path.resolve("examples/go-build-target-basic");
    const goTarget = { goos: "darwin", goarch: "arm64", tags: ["integration"] };
    const direct = callTool("audit_repo", { repoRoot, adapterId: "go", goTarget });
    const projects = callTool("audit_projects", { repoRoot, goTarget });
    const analysis = callTool("analyze_repository", { repoRoot, goTarget });

    assert.equal(direct.profile.testCommand, "GOOS=darwin GOARCH=arm64 go test -tags=integration ./...");
    assert.equal(projects.audits[0].audit.profile.testCommand, direct.profile.testCommand);
    assert.deepEqual(analysis.verificationCommands, [{ command: direct.profile.testCommand, projectCount: 1 }]);
    assert.throws(
      () => callTool("audit_repo", { repoRoot, adapterId: "go", goTarget: { goos: "darwin", goarch: "arm64", extra: true } }),
      (error) => error.kind === "invalid-arguments" && error.details.argument === "goTarget"
    );
  });

  it("calls the supported Rust adapter through direct and project MCP tools", () => {
    const repoRoot = path.resolve("examples/rust-cargo-basic");
    const direct = callTool("audit_repo", { repoRoot, adapterId: "rust" });
    const projects = callTool("audit_projects", { repoRoot });

    assert.equal(direct.profile.testCommand, "cargo test");
    assert.equal(projects.audits[0].adapterId, "rust");
    assert.deepEqual(projects.audits[0].audit, direct);
  });

  it("dispatches adapter registry, project detection rules, project detection, project audits, audit, plan, explanation, and ranking tools", () => {
    const repositoryAnalysis = callTool("analyze_repository", {
      repoRoot: path.resolve("examples/polyglot-workspace")
    });
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
    const projectFindings = callTool("collect_project_findings", { projectAudits });
    const projectPlacement = callTool("analyze_project_test_placement", { projectAudits });
    const projectStats = callTool("collect_project_stats", { projectAudits });
    const audit = callTool("audit_repo", {
      repoRoot: path.resolve("examples/node-vitest-basic"),
      adapterId: "javascript"
    });
    const graph = callTool("get_audit_graph", { audit });
    const plan = callTool("generate_test_plan", { audit, itemId: "add-test:src/authService.ts" });
    const executionHints = callTool("get_plan_execution_hints", { plan });
    const explanation = callTool("explain_target", { audit, targetId: "src/authService.ts" });
    const ranking = callTool("rank_test_candidates", { audit });
    const placement = callTool("analyze_test_placement", { audit, owner: "node-vitest-basic" });
    const deferredGeneration = callTool("generate_selected_test", { planItemId: "add-test:src/authService.ts" });

    assert.equal(repositoryAnalysis.schemaVersion, "repository-analysis/v1");
    assert.equal(repositoryAnalysis.summary.projectCount, 3);
    assert.equal(repositoryAnalysis.summary.planItemCount, 3);
    assert.deepEqual(repositoryAnalysis.verificationCommands, [
      { command: "gradle test", projectCount: 1 },
      { command: "npm run test", projectCount: 1 }
    ]);
    assert.equal(repositoryAnalysis.projectAudits.schemaVersion, "project-audits/v1");
    assert.equal(repositoryAnalysis.findings.schemaVersion, "project-findings/v1");
    assert.equal(adapterRegistry.schemaVersion, "adapter-registry/v1");
    assert.deepEqual(adapterRegistry.adapters.map((adapter) => adapter.id), ["javascript", "csharp", "go", "kotlin", "python", "rust", "swift"]);
    assert.equal(projectDetectionRules.schemaVersion, "project-detection-rules/v1");
    assert.ok(projectDetectionRules.markers.some((marker) => marker.fileName === "package.json"));
    assert.equal(projectDetection.schemaVersion, "project-detection/v1");
    assert.equal(projectDetection.summary.projectCount, 3);
    assert.equal(projectAudits.schemaVersion, "project-audits/v1");
    assert.equal(projectAudits.summary.auditedProjectCount, 3);
    assert.equal(projectAuditSummary.schemaVersion, "project-audit-summary/v1");
    assert.equal(projectAuditSummary.summary.auditCoverage, "complete");
    assert.equal(projectAuditSummary.summary.untestedCandidateCount, 3);
    assert.deepEqual(projectAuditSummary.summary.unsupportedReasons, []);
    assert.equal(projectCandidateRanking.schemaVersion, "project-candidate-ranking/v1");
    assert.equal(projectCandidateRanking.summary.candidateCount, 3);
    assert.equal(projectTestPlan.schemaVersion, "project-test-plan/v1");
    assert.equal(projectTestPlan.summary.itemCount, 3);
    assert.equal(projectFindings.schemaVersion, "project-findings/v1");
    assert.equal(projectFindings.summary.findingCount, 5);
    assert.equal(projectPlacement.schemaVersion, "test-placement-findings/v1");
    assert.equal(projectPlacement.findings.length, 0);
    assert.equal(projectStats.schemaVersion, "project-stats/v1");
    assert.equal(projectStats.counts.untestedCandidateCount, 3);
    assert.equal(graph, audit);
    assert.equal(plan.schemaVersion, "plan/v1");
    assert.deepEqual(plan.items.map((item) => item.id), ["add-test:src/authService.ts"]);
    assert.equal(executionHints.schemaVersion, "plan-execution-hints/v1");
    assert.equal(executionHints.items[0].planItemId, "add-test:src/authService.ts");
    assert.equal(executionHints.items[0].parallelizable, false);
    assert.equal(executionHints.items[0].recommendedAgentRole, "implementation");
    assert.equal(explanation.schemaVersion, "target-explanation/v1");
    assert.equal(ranking.schemaVersion, "candidate-ranking/v1");
    assert.equal(placement.schemaVersion, "test-placement-findings/v1");
    assert.equal(placement.findings[0].testFile, "src/deckParser.test.ts");
    assert.equal(deferredGeneration.schemaVersion, "generation-deferred/v1");
    assert.equal(deferredGeneration.status, "deferred");
  });

  it("passes Kotlin changed paths through audit_repo", () => {
    const audit = callTool("audit_repo", {
      repoRoot: path.resolve("examples/kotlin-junit-basic"),
      adapterId: "kotlin",
      changedPaths: ["src/main/java/com/example/checkout/MoneyFormatter.java"]
    });

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.testFrameworks, ["junit", "kotlin-test"]);
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["MoneyFormatter"]
    );
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
  });

  it("passes changed paths through audit_projects", () => {
    const projectAudits = callTool("audit_projects", {
      repoRoot: path.resolve("examples/polyglot-workspace"),
      changedPaths: ["apps/web/src/sessionClient.ts"]
    });

    assert.equal(projectAudits.schemaVersion, "project-audits/v1");
    assert.deepEqual(
      projectAudits.audits.map((entry) => ({
        projectId: entry.projectId,
        untested: entry.audit.untestedCandidates.map((target) => target.path)
      })),
      [
        {
          projectId: "apps/android",
          untested: []
        },
        {
          projectId: "apps/web",
          untested: ["src/sessionClient.ts"]
        },
        {
          projectId: "services/api",
          untested: []
        }
      ]
    );
  });

  it("passes repository scope controls through analyze_repository", () => {
    const analysis = callTool("analyze_repository", {
      repoRoot: path.resolve("examples/polyglot-workspace"),
      changedPaths: ["services/api/app.py"],
      excludeProjectRoots: ["apps/**"]
    });

    assert.equal(analysis.schemaVersion, "repository-analysis/v1");
    assert.deepEqual(analysis.projectAudits.audits.map((entry) => entry.projectId), ["services/api"]);
    assert.deepEqual(
      analysis.candidateRanking.candidates.map((candidate) => candidate.projectId),
      ["services/api"]
    );
  });

  it("passes project exclusion roots through detect_projects", () => {
    const detection = callTool("detect_projects", {
      repoRoot: path.resolve("examples/polyglot-workspace"),
      excludeProjectRoots: ["apps/**"]
    });

    assert.equal(detection.schemaVersion, "project-detection/v1");
    assert.deepEqual(
      detection.projects.map((project) => project.root),
      ["services/api"]
    );
    assert.equal(detection.summary.projectCount, 1);
  });

  it("passes project exclusion roots through audit_projects", () => {
    const projectAudits = callTool("audit_projects", {
      repoRoot: path.resolve("examples/polyglot-workspace"),
      excludeProjectRoots: ["apps/**"]
    });

    assert.equal(projectAudits.schemaVersion, "project-audits/v1");
    assert.deepEqual(
      projectAudits.audits.map((entry) => entry.projectId),
      ["services/api"]
    );
    assert.equal(projectAudits.summary.projectCount, 1);
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
    assert.throws(
      () => callTool("audit_repo", { repoRoot: ".", changedPaths: [""] }),
      (error) =>
        error.kind === "invalid-arguments" &&
        error.details.toolName === "audit_repo" &&
        error.details.argument === "changedPaths" &&
        /changedPaths must be an array of non-empty strings/.test(error.message)
    );
    assert.throws(
      () => callTool("audit_projects", { repoRoot: ".", changedPaths: [""] }),
      (error) =>
        error.kind === "invalid-arguments" &&
        error.details.toolName === "audit_projects" &&
        error.details.argument === "changedPaths" &&
        /changedPaths must be an array of non-empty strings/.test(error.message)
    );
    assert.throws(
      () => callTool("detect_projects", { repoRoot: ".", excludeProjectRoots: [""] }),
      (error) =>
        error.kind === "invalid-arguments" &&
        error.details.toolName === "detect_projects" &&
        error.details.argument === "excludeProjectRoots" &&
        /excludeProjectRoots must be an array of non-empty strings/.test(error.message)
    );
    assert.throws(
      () => callTool("audit_projects", { repoRoot: ".", excludeProjectRoots: [""] }),
      (error) =>
        error.kind === "invalid-arguments" &&
        error.details.toolName === "audit_projects" &&
        error.details.argument === "excludeProjectRoots" &&
        /excludeProjectRoots must be an array of non-empty strings/.test(error.message)
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
  if (toolName === "analyze_repository") return { repoRoot: "." };
  if (toolName === "list_adapters") return {};
  if (toolName === "list_project_detection_rules") return {};
  if (toolName === "detect_projects") return { repoRoot: "." };
  if (toolName === "audit_projects") return { repoRoot: "." };
  if (toolName === "summarize_project_audits") return { projectAudits: { schemaVersion: "project-audits/v1", audits: [], skippedProjects: [], summary: {} } };
  if (toolName === "rank_project_candidates") return { projectAudits: { schemaVersion: "project-audits/v1", audits: [], skippedProjects: [], summary: {} } };
  if (toolName === "generate_project_test_plan") return { projectAudits: { schemaVersion: "project-audits/v1", audits: [], skippedProjects: [], summary: {} } };
  if (toolName === "collect_project_findings") return { projectAudits: { schemaVersion: "project-audits/v1", audits: [], skippedProjects: [], summary: {} } };
  if (toolName === "analyze_project_test_placement") return { projectAudits: { schemaVersion: "project-audits/v1", audits: [], skippedProjects: [], summary: {} } };
  if (toolName === "collect_project_stats") return { projectAudits: { schemaVersion: "project-audits/v1", audits: [], skippedProjects: [], summary: {} } };
  if (toolName === "audit_repo") return { repoRoot: "." };
  if (toolName === "get_plan_execution_hints") return { plan: { schemaVersion: "plan/v1", items: [] } };
  if (toolName === "explain_target") return { audit: {}, targetId: "src/example.ts" };
  if (toolName === "analyze_test_placement") return { audit: {} };
  if (toolName === "generate_selected_test") return { planItemId: "add-test:src/example.ts" };
  return { audit: {} };
}
