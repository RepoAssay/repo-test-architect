import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import {
  analyzeRepoTestPlacement,
  analyzeRepoProjectTestPlacement,
  auditRepoProjects,
  auditRepo,
  collectRepoProjectStats,
  createRepoTestPlacementFindings,
  detectRepoProjects,
  explainAuditTarget,
  generateTestPlan,
  generateRepoProjectTestPlan,
  getAdapterRegistry,
  getProjectDetectionRules,
  rankRepoProjectCandidates,
  getAuditGraph,
  rankAuditTestCandidates,
  summarizeRepoProjectAudits,
  validateAudit,
  validateProjectAudits
} from "../src/core/tool-api.js";

describe("tool API", () => {
  it("lists registered adapters", () => {
    const registry = getAdapterRegistry();

    assert.equal(registry.schemaVersion, "adapter-registry/v1");
    assert.deepEqual(registry.adapters.map((adapter) => adapter.id), ["javascript", "kotlin", "python", "swift"]);
    assert.deepEqual(registry.adapters[0].supportedProjectTypes, ["node", "express", "react"]);
    assert.deepEqual(registry.adapters[1].supportedProjectTypes, ["gradle-jvm", "maven-jvm"]);
    assert.deepEqual(registry.adapters[2].supportedProjectTypes, ["fastapi", "python-package"]);
    assert.deepEqual(registry.adapters[3].supportedProjectTypes, ["swift-package", "apple-xcode"]);
  });

  it("detects repository projects", () => {
    const detection = detectRepoProjects(path.resolve("examples/polyglot-workspace"));

    assert.equal(detection.schemaVersion, "project-detection/v1");
    assert.equal(detection.summary.projectCount, 3);
    assert.equal(detection.projects[1].adapterMatches[0].adapterId, "javascript");
  });

  it("lists project detection rules", () => {
    const rules = getProjectDetectionRules();

    assert.equal(rules.schemaVersion, "project-detection-rules/v1");
    assert.ok(rules.markers.some((marker) => marker.fileName === "package.json"));
    assert.ok(rules.ignoredDirectories.includes("node_modules"));
  });

  it("audits detected repository projects", () => {
    const result = auditRepoProjects(path.resolve("examples/polyglot-workspace"));

    assert.equal(result.schemaVersion, "project-audits/v1");
    assert.equal(result.summary.auditedProjectCount, 3);
    assert.equal(result.summary.skippedProjectCount, 0);
  });

  it("passes changed paths into detected repository project audits", () => {
    const result = auditRepoProjects(path.resolve("examples/polyglot-workspace"), {
      changedPaths: ["apps/web/src/sessionClient.ts"]
    });

    assert.equal(result.schemaVersion, "project-audits/v1");
    assert.deepEqual(
      result.audits.map((entry) => ({
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

  it("rejects invalid project audit changed paths", () => {
    assert.throws(
      () => auditRepoProjects(path.resolve("examples/polyglot-workspace"), { changedPaths: [""] }),
      /changedPaths must be an array of non-empty strings/
    );
  });

  it("summarizes detected repository project audits", () => {
    const projectAudits = auditRepoProjects(path.resolve("examples/polyglot-workspace"));
    const summary = summarizeRepoProjectAudits(projectAudits);

    assert.equal(summary.schemaVersion, "project-audit-summary/v1");
    assert.equal(summary.summary.untestedCandidateCount, 3);
  });

  it("ranks detected repository project candidates", () => {
    const projectAudits = auditRepoProjects(path.resolve("examples/polyglot-workspace"));
    const ranking = rankRepoProjectCandidates(projectAudits);

    assert.equal(ranking.schemaVersion, "project-candidate-ranking/v1");
    assert.equal(ranking.summary.candidateCount, 3);
  });

  it("generates detected repository project test plans", () => {
    const projectAudits = auditRepoProjects(path.resolve("examples/polyglot-workspace"));
    const plan = generateRepoProjectTestPlan(projectAudits);

    assert.equal(plan.schemaVersion, "project-test-plan/v1");
    assert.equal(plan.summary.itemCount, 3);
  });

  it("analyzes test placement from detected repository project audits", () => {
    const projectAudits = auditRepoProjects(path.resolve("examples/node-vitest-basic"));
    const placement = analyzeRepoProjectTestPlacement(projectAudits);

    assert.equal(placement.schemaVersion, "test-placement-findings/v1");
    assert.equal(placement.findings[0].id, ".:keep:src/deckParser.test.ts:src/deckParser.ts");
  });

  it("collects project stats from detected repository project audits", () => {
    const projectAudits = auditRepoProjects(path.resolve("examples/polyglot-workspace"));
    const stats = collectRepoProjectStats(projectAudits);

    assert.equal(stats.schemaVersion, "project-stats/v1");
    assert.equal(stats.summary.auditCoverage, "complete");
    assert.equal(stats.counts.untestedCandidateCount, 3);
    assert.deepEqual(stats.distributions.testFrameworks, { "kotlin-test": 1, vitest: 1 });
  });

  it("audits a repo and exposes the audit graph", () => {
    const audit = auditRepo(path.resolve("examples/node-vitest-basic"), { adapterId: "javascript" });

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.equal(getAuditGraph(audit), audit);
  });

  it("passes changed paths to explicit adapters", () => {
    const audit = auditRepo(path.resolve("examples/kotlin-junit-basic"), {
      adapterId: "kotlin",
      changedPaths: ["src/main/java/com/example/checkout/MoneyFormatter.java"]
    });

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["MoneyFormatter"]
    );
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
  });

  it("rejects invalid explicit adapter changed paths", () => {
    assert.throws(
      () => auditRepo(path.resolve("examples/kotlin-junit-basic"), { adapterId: "kotlin", changedPaths: [""] }),
      /changedPaths must be an array of non-empty strings/
    );
  });

  it("rejects unsupported audit adapters", () => {
    assert.throws(
      () => auditRepo(path.resolve("examples/node-vitest-basic"), { adapterId: "ruby" }),
      /Unsupported adapter: ruby\. Available adapters: javascript, kotlin, python, swift\./
    );
  });

  it("generates and filters test plans", () => {
    const audit = auditRepo(path.resolve("examples/node-vitest-basic"));
    const plan = generateTestPlan(audit, { itemId: "add-test:src/authService.ts" });

    assert.equal(plan.schemaVersion, "plan/v1");
    assert.deepEqual(
      plan.items.map((item) => item.id),
      ["add-test:src/authService.ts"]
    );
  });

  it("explains and ranks audit targets", () => {
    const audit = auditRepo(path.resolve("examples/node-vitest-basic"));
    const explanation = explainAuditTarget(audit, "src/authService.ts");
    const ranking = rankAuditTestCandidates(audit);

    assert.equal(explanation.schemaVersion, "target-explanation/v1");
    assert.equal(ranking.schemaVersion, "candidate-ranking/v1");
    assert.equal(ranking.summary.candidateCount, 2);
  });

  it("creates test placement findings artifacts", () => {
    const artifact = createRepoTestPlacementFindings([
      {
        id: "keep:test/authService.test.ts",
        testFile: "test/authService.test.ts",
        currentOwner: "node-vitest-basic",
        suggestedOwner: "node-vitest-basic",
        action: "keep",
        reason: "Test already lives with the project that owns the target behavior.",
        evidence: ["imports ../src/authService.ts"]
      }
    ]);

    assert.equal(artifact.schemaVersion, "test-placement-findings/v1");
    assert.equal(artifact.findings[0].action, "keep");
  });

  it("analyzes test placement from an audit artifact", () => {
    const audit = auditRepo(path.resolve("examples/node-vitest-basic"));
    const artifact = analyzeRepoTestPlacement(audit, { owner: "node-vitest-basic" });

    assert.equal(artifact.schemaVersion, "test-placement-findings/v1");
    assert.equal(artifact.findings[0].testFile, "src/deckParser.test.ts");
  });

  it("rejects invalid audit artifacts", () => {
    assert.throws(
      () =>
        validateAudit({
          schemaVersion: "audit/v0"
        }),
      /Expected audit schemaVersion audit\/v1/
    );
  });

  it("rejects invalid project audits artifacts", () => {
    assert.throws(
      () =>
        validateProjectAudits({
          schemaVersion: "project-audits/v1",
          root: ".",
          summary: {},
          audits: [],
          skippedProjects: []
        }),
      /Project audits summary\.projectCount must be a non-negative integer/
    );
  });
});
