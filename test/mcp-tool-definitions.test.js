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
      assert.equal(tool.outputSchema.type, "object");
    }
  });

  it("declares compact output schemas that mirror the top level of the published artifact schemas", () => {
    for (const tool of mcpTools) {
      const schema = JSON.parse(fs.readFileSync(tool.outputArtifact.schemaPath, "utf8"));

      assert.equal(schema.properties.schemaVersion.const, tool.outputArtifact.schemaVersion);
      assert.equal(tool.outputSchema.properties.schemaVersion.const, tool.outputArtifact.schemaVersion);
      assert.deepEqual(tool.outputSchema.required, schema.required);
      assert.equal(tool.outputSchema.additionalProperties, schema.additionalProperties);
      assert.deepEqual(Object.keys(tool.outputSchema.properties), Object.keys(schema.properties));
      assert.ok(tool.outputSchema.description.includes(tool.outputArtifact.schemaPath));
      for (const [name, property] of Object.entries(tool.outputSchema.properties)) {
        assert.ok(Object.keys(property).length > 0, `${tool.name}.${name} declares a type, const, or enum`);
      }
    }
  });

  it("keeps the tools/list payload within its context budget", () => {
    // Every MCP client loads all descriptors into the model context; guard against schema bloat.
    // 1.2.0 raised the budget from 30k when every artifact-consuming tool gained repoRoot inputs.
    assert.ok(JSON.stringify(mcpTools).length < 45000);
  });

  it("declares the Claude Code inline-result hint only on the bounded review tool", () => {
    for (const tool of mcpTools) {
      if (tool.name === "review_repository") {
        assert.deepEqual(tool._meta, { "anthropic/maxResultSizeChars": 200000 });
      } else {
        assert.equal(tool._meta, undefined);
      }
    }
  });

  it("accepts every checked-in expected artifact under the compact schema of each tool that returns it", () => {
    const expectedDir = "evals/expected";
    const artifacts = fs.readdirSync(expectedDir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => ({ name, value: JSON.parse(fs.readFileSync(path.join(expectedDir, name), "utf8")) }))
      .filter(({ value }) => typeof value?.schemaVersion === "string");
    let checked = 0;

    for (const { name, value } of artifacts) {
      for (const tool of mcpTools.filter((candidate) => candidate.outputArtifact.schemaVersion === value.schemaVersion)) {
        assertMatchesSchema(value, tool.outputSchema, `${name} as ${tool.name}`);
        checked += 1;
      }
    }
    assert.ok(checked > 100);
  });

  it("returns live artifacts accepted by the compact schemas, including $ref-resolved properties", () => {
    const repoRoot = path.resolve("examples/polyglot-workspace");
    for (const name of ["review_repository", "analyze_repository", "audit_projects", "detect_projects", "list_adapters", "list_project_detection_rules"]) {
      const tool = mcpTools.find((candidate) => candidate.name === name);
      const args = Object.keys(tool.inputSchema.properties ?? {}).includes("repoRoot") ? { repoRoot } : {};
      assertMatchesSchema(callTool(name, args), tool.outputSchema, `${name}.compact`);
    }
  });

  it("returns artifacts accepted by both the compact and the published output schemas", () => {
    const audit = callTool("audit_repo", { repoRoot: path.resolve("examples/node-vitest-basic") });
    const auditTool = mcpTools.find((tool) => tool.name === "audit_repo");
    const fullSchema = JSON.parse(fs.readFileSync(auditTool.outputArtifact.schemaPath, "utf8"));

    assertMatchesSchema(audit, auditTool.outputSchema, "audit_repo.compact");
    assertMatchesSchema(audit, fullSchema, "audit_repo.full");
  });

  it("matches the MCP tool descriptor schema", () => {
    for (const tool of mcpTools) {
      assertMatchesSchema(tool, toolSchema, `${tool.name}.mcp-tool.json`);
    }
  });

  it("declares non-empty changed path items", () => {
    const changedPathTools = ["review_repository", "analyze_repository", "audit_projects", "audit_repo", "explain_target", "rank_project_candidates"];

    for (const toolName of changedPathTools) {
      const tool = mcpTools.find((candidate) => candidate.name === toolName);

      assert.equal(tool.inputSchema.properties.changedPaths.items.minLength, 1);
    }
  });

  it("declares non-empty project exclusion items", () => {
    const projectExclusionTools = ["review_repository", "analyze_repository", "detect_projects", "audit_projects", "collect_project_stats", "get_plan_execution_hints"];

    for (const toolName of projectExclusionTools) {
      const tool = mcpTools.find((candidate) => candidate.name === toolName);

      assert.equal(tool.inputSchema.properties.excludeProjectRoots.items.minLength, 1);
    }
  });

  it("declares bounded Go target objects on repository audit tools", () => {
    for (const toolName of ["review_repository", "analyze_repository", "audit_projects", "audit_repo", "explain_target", "generate_project_test_plan"]) {
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

  it("calls the supported Ruby adapter through direct and project MCP tools", () => {
    const repoRoot = path.resolve("examples/ruby-minitest-basic");
    const direct = callTool("audit_repo", { repoRoot, adapterId: "ruby" });
    const projects = callTool("audit_projects", { repoRoot });

    assert.equal(direct.profile.testCommand, "bundle exec rake test");
    assert.equal(projects.audits[0].adapterId, "ruby");
    assert.deepEqual(projects.audits[0].audit, direct);
  });

  it("calls the supported PHP adapter through direct and project MCP tools", () => {
    const repoRoot = path.resolve("examples/php-phpunit-basic");
    const direct = callTool("audit_repo", { repoRoot, adapterId: "php" });
    const projects = callTool("audit_projects", { repoRoot });

    assert.equal(direct.profile.testCommand, "composer test");
    assert.equal(projects.audits[0].adapterId, "php");
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
    assert.deepEqual(adapterRegistry.adapters.map((adapter) => adapter.id), ["javascript", "csharp", "elixir", "go", "kotlin", "php", "python", "rust", "ruby", "swift", "dart"]);
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
    assert.equal(projectFindings.summary.findingCount, 4);
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

  it("returns the bounded repository review with capped lists and evidence counts", () => {
    const repoRoot = path.resolve("examples/polyglot-workspace");
    const review = callTool("review_repository", { repoRoot });
    const analysis = callTool("analyze_repository", { repoRoot });
    const reviewTool = mcpTools.find((tool) => tool.name === "review_repository");
    const fullSchema = JSON.parse(fs.readFileSync(reviewTool.outputArtifact.schemaPath, "utf8"));

    assertMatchesSchema(review, reviewTool.outputSchema, "review_repository.compact");
    assertMatchesSchema(review, fullSchema, "review_repository.full");
    assert.equal(review.schemaVersion, "repository-review/v1");
    assert.equal(review.summary.limit, 25);
    assert.equal(review.summary.truncated, false);
    assert.equal(review.summary.candidateCount, analysis.summary.candidateCount);
    assert.deepEqual(review.verificationCommands, analysis.verificationCommands);
    assert.deepEqual(review.findings.summary, analysis.findings.summary);
    assert.deepEqual(review.findings.items.map((item) => item.id), analysis.findings.findings.map((item) => item.id));
    assert.deepEqual(review.stats, analysis.stats);
    assert.deepEqual(review.blockers.map((entry) => entry.projectRoot), ["services/api", "services/api"]);
    assert.equal(Object.hasOwn(review, "projectAudits"), false);
    assert.deepEqual(
      review.topCandidates.map((candidate) => candidate.projectTargetId),
      analysis.candidateRanking.candidates.map((candidate) => candidate.projectTargetId)
    );
    for (const item of [...review.topCandidates, ...review.topPlanItems]) {
      assert.equal(Object.hasOwn(item, "existingTestPaths"), false);
      assert.equal(Object.hasOwn(item, "existingTestEvidence"), false);
      assert.equal(typeof item.existingTestCount, "number");
      assert.equal(typeof item.directEvidenceCount, "number");
    }
    assert.deepEqual(
      review.topExecutionHints.map((hint) => hint.planItemId),
      review.topPlanItems.map((item) => item.projectItemId)
    );

    const limited = callTool("review_repository", { repoRoot, limit: 1 });
    assert.equal(limited.summary.truncated, true);
    assert.equal(limited.topCandidates.length, 1);
    assert.equal(limited.topPlanItems.length, 1);
    assert.equal(limited.topExecutionHints.length, 1);
    assert.equal(limited.summary.candidateCount, review.summary.candidateCount);

    for (const limit of [0, 501, 2.5, "25"]) {
      assert.throws(
        () => callTool("review_repository", { repoRoot, limit }),
        (error) =>
          error.kind === "invalid-arguments" &&
          error.details.toolName === "review_repository" &&
          error.details.argument === "limit" &&
          /between 1 and 500/.test(error.message) &&
          !/501|2\.5/.test(error.message)
      );
    }
  });

  it("keeps the bounded review small on a repository with many project roots", () => {
    // This repository's example fixtures are detected as 60+ project roots, which is the shape that
    // produced a 21 MB complete bundle on a client's monorepo; the review must stay bounded regardless.
    const review = callTool("review_repository", { repoRoot: path.resolve(".") });
    const serialized = JSON.stringify(review);

    assert.ok(review.summary.projectCount > 50, `fixture roots detected: ${review.summary.projectCount}`);
    assert.equal(review.summary.truncated, true);
    assert.ok(serialized.length < 160000, `review is ${serialized.length} characters`);
    assert.doesNotMatch(serialized, /"existingTestEvidence"/);
  });

  it("lets artifact-consuming tools take repoRoot instead of an echoed artifact", () => {
    const repoRoot = path.resolve("examples/polyglot-workspace");
    const projectAudits = callTool("audit_projects", { repoRoot });

    assert.deepEqual(callTool("summarize_project_audits", { repoRoot }), callTool("summarize_project_audits", { projectAudits }));
    assert.deepEqual(callTool("rank_project_candidates", { repoRoot }), callTool("rank_project_candidates", { projectAudits }));
    assert.deepEqual(callTool("generate_project_test_plan", { repoRoot }), callTool("generate_project_test_plan", { projectAudits }));
    assert.deepEqual(callTool("collect_project_findings", { repoRoot }), callTool("collect_project_findings", { projectAudits }));
    assert.deepEqual(callTool("analyze_project_test_placement", { repoRoot }), callTool("analyze_project_test_placement", { projectAudits }));
    assert.deepEqual(callTool("collect_project_stats", { repoRoot }), callTool("collect_project_stats", { projectAudits }));
    assert.deepEqual(
      callTool("get_plan_execution_hints", { repoRoot }),
      callTool("get_plan_execution_hints", { plan: callTool("generate_project_test_plan", { projectAudits }) })
    );

    const scoped = callTool("rank_project_candidates", { repoRoot, excludeProjectRoots: ["apps/**"], changedPaths: ["services/api/app.py"] });
    assert.deepEqual(scoped.candidates.map((candidate) => candidate.projectId), ["services/api"]);

    const audit = projectAudits.audits.find((entry) => entry.projectRoot === "apps/web").audit;
    const targetId = "src/sessionClient.ts";
    assert.deepEqual(
      callTool("explain_target", { repoRoot, projectRoot: "apps/web", targetId }),
      callTool("explain_target", { audit, targetId })
    );
    assert.deepEqual(
      callTool("explain_target", { repoRoot, projectRoot: "./apps/web/", targetId }),
      callTool("explain_target", { audit, targetId })
    );
    assert.deepEqual(callTool("rank_test_candidates", { repoRoot, projectRoot: "apps/web" }), callTool("rank_test_candidates", { audit }));
    assert.deepEqual(callTool("get_audit_graph", { repoRoot, projectRoot: "apps/web" }), audit);
    assert.deepEqual(callTool("generate_test_plan", { repoRoot, projectRoot: "apps/web" }), callTool("generate_test_plan", { audit }));
    assert.deepEqual(
      callTool("analyze_test_placement", { repoRoot, projectRoot: "apps/web", owner: "web" }),
      callTool("analyze_test_placement", { audit, owner: "web" })
    );

    const singleRoot = path.resolve("examples/node-vitest-basic");
    const direct = callTool("audit_repo", { repoRoot: singleRoot });
    assert.deepEqual(callTool("rank_test_candidates", { repoRoot: singleRoot, projectRoot: "." }), callTool("rank_test_candidates", { audit: direct }));
  });

  it("rejects ambiguous or incomplete artifact sources", () => {
    const repoRoot = path.resolve("examples/polyglot-workspace");
    const projectAudits = { schemaVersion: "project-audits/v1", audits: [], skippedProjects: [], summary: {} };

    assert.throws(
      () => callTool("rank_project_candidates", {}),
      (error) =>
        error.kind === "missing-required-argument" &&
        error.details.toolName === "rank_project_candidates" &&
        error.details.argument === "projectAudits" &&
        /projectAudits or repoRoot is required for rank_project_candidates/.test(error.message)
    );
    assert.throws(
      () => callTool("rank_project_candidates", { repoRoot, projectAudits }),
      (error) => error.kind === "invalid-arguments" && error.details.argument === "repoRoot" && /not both/.test(error.message)
    );
    assert.throws(
      () => callTool("rank_project_candidates", { projectAudits, excludeProjectRoots: ["apps/**"] }),
      (error) => error.kind === "invalid-arguments" && error.details.argument === "excludeProjectRoots" && /applies only when/.test(error.message)
    );
    assert.throws(
      () => callTool("explain_target", { targetId: "src/sessionClient.ts" }),
      (error) => error.kind === "missing-required-argument" && error.details.argument === "audit" && /audit or repoRoot is required/.test(error.message)
    );
    assert.throws(
      () => callTool("explain_target", { repoRoot, targetId: "src/sessionClient.ts" }),
      (error) =>
        error.kind === "missing-required-argument" &&
        error.details.toolName === "explain_target" &&
        error.details.argument === "projectRoot" &&
        /projectRoot is required with repoRoot/.test(error.message)
    );
    assert.throws(
      () => callTool("explain_target", { repoRoot, projectRoot: "packages/secret-service", targetId: "src/sessionClient.ts" }),
      (error) =>
        error.kind === "invalid-arguments" &&
        error.details.argument === "projectRoot" &&
        /not an audited project root/.test(error.message) &&
        !/secret-service/.test(error.message)
    );
    assert.throws(
      () => callTool("explain_target", { audit: {}, projectRoot: "apps/web", targetId: "src/sessionClient.ts" }),
      (error) => error.kind === "invalid-arguments" && error.details.argument === "projectRoot" && /applies only when/.test(error.message)
    );
    assert.throws(
      () => callTool("get_plan_execution_hints", {}),
      (error) => error.kind === "missing-required-argument" && error.details.argument === "plan"
    );
    assert.throws(
      () => callTool("get_audit_graph", {}),
      (error) => error.kind === "missing-required-argument" && error.details.argument === "audit"
    );
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
  if (toolName === "review_repository") return { repoRoot: "./examples/polyglot-workspace" };
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

describe("Swift scheme selection inputs (#310)", () => {
  it("declares swiftSchemes on repository and single-project audit tools and rejects it beside saved artifacts", async (t) => {
    const { createAmbiguousSchemeProject, SELECTED_SCHEME_COMMAND } = await import("./support/xcode-schemes-fixture.js");
    for (const toolName of ["review_repository", "analyze_repository", "audit_projects", "audit_repo", "explain_target", "generate_project_test_plan"]) {
      const schema = mcpTools.find((tool) => tool.name === toolName).inputSchema.properties.swiftSchemes;
      assert.equal(schema.type, "object", toolName);
      assert.deepEqual(schema.additionalProperties, { type: "string", minLength: 1 }, toolName);
    }

    const repoRoot = createAmbiguousSchemeProject(t);
    const withheld = callTool("audit_repo", { repoRoot, adapterId: "swift" });
    assert.equal(withheld.profile.testCommand, undefined);
    assert.ok(withheld.profile.diagnostics.some((diagnostic) => diagnostic.code === "ambiguous-xcode-scheme"));

    const direct = callTool("audit_repo", { repoRoot, adapterId: "swift", swiftSchemes: { ".": "Shop Beta" } });
    const projects = callTool("audit_projects", { repoRoot, swiftSchemes: { ".": "Shop Beta" } });
    const review = callTool("review_repository", { repoRoot, swiftSchemes: { ".": "Shop Beta" } });
    assert.equal(direct.profile.testCommand, SELECTED_SCHEME_COMMAND);
    assert.equal(projects.audits[0].audit.profile.testCommand, SELECTED_SCHEME_COMMAND);
    assert.deepEqual(review.verificationCommands, [{ command: SELECTED_SCHEME_COMMAND, projectCount: 1 }]);

    assert.throws(
      () => callTool("audit_repo", { repoRoot, adapterId: "swift", swiftSchemes: { ".": "" } }),
      (error) => error.kind === "invalid-arguments" && /swiftSchemes/.test(error.message)
    );
    assert.throws(
      () => callTool("audit_repo", { repoRoot, adapterId: "swift", swiftSchemes: ["Shop Beta"] }),
      (error) => error.kind === "invalid-arguments" && /swiftSchemes/.test(error.message)
    );
    assert.throws(
      () => callTool("generate_project_test_plan", { projectAudits: projects, swiftSchemes: { ".": "Shop Beta" } }),
      (error) => error.kind === "invalid-arguments" && error.details.argument === "swiftSchemes"
    );
  });
});
