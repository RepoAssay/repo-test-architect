import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import {
  auditRepoProjects,
  auditRepo,
  detectRepoProjects,
  explainAuditTarget,
  generateTestPlan,
  getAuditGraph,
  rankAuditTestCandidates,
  summarizeRepoProjectAudits,
  validateAudit
} from "../src/core/tool-api.js";

describe("tool API", () => {
  it("detects repository projects", () => {
    const detection = detectRepoProjects(path.resolve("examples/polyglot-workspace"));

    assert.equal(detection.schemaVersion, "project-detection/v1");
    assert.equal(detection.summary.projectCount, 2);
  });

  it("audits detected repository projects", () => {
    const result = auditRepoProjects(path.resolve("examples/polyglot-workspace"));

    assert.equal(result.schemaVersion, "project-audits/v1");
    assert.equal(result.summary.auditedProjectCount, 1);
    assert.equal(result.summary.skippedProjectCount, 1);
  });

  it("summarizes detected repository project audits", () => {
    const projectAudits = auditRepoProjects(path.resolve("examples/polyglot-workspace"));
    const summary = summarizeRepoProjectAudits(projectAudits);

    assert.equal(summary.schemaVersion, "project-audit-summary/v1");
    assert.equal(summary.summary.untestedCandidateCount, 1);
  });

  it("audits a repo and exposes the audit graph", () => {
    const audit = auditRepo(path.resolve("examples/node-vitest-basic"), { adapterId: "javascript" });

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.equal(getAuditGraph(audit), audit);
  });

  it("rejects unsupported audit adapters", () => {
    assert.throws(
      () => auditRepo(path.resolve("examples/node-vitest-basic"), { adapterId: "swift" }),
      /Unsupported adapter: swift/
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

  it("rejects invalid audit artifacts", () => {
    assert.throws(
      () =>
        validateAudit({
          schemaVersion: "audit/v0"
        }),
      /Expected audit schemaVersion audit\/v1/
    );
  });
});
