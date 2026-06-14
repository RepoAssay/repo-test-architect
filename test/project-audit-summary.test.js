import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditDetectedProjects } from "../src/core/project-auditor.js";
import { summarizeProjectAudits } from "../src/core/project-audit-summary.js";

describe("project audit summary", () => {
  it("summarizes project audits without merging target rankings", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));
    const summary = summarizeProjectAudits(projectAudits);

    assert.equal(summary.schemaVersion, "project-audit-summary/v1");
    assert.deepEqual(summary.summary, {
      projectCount: 3,
      auditedProjectCount: 1,
      unsupportedProjectCount: 2,
      untestedCandidateCount: 1,
      coveredButRiskyCount: 0,
      skippedTargetCount: 0,
      riskCount: 1
    });
    assert.deepEqual(summary.projects[0].topCandidateIds, ["src/sessionClient.ts"]);
    assert.deepEqual(
      summary.unsupportedProjects.map((project) => project.projectId),
      ["apps/android", "services/api"]
    );
  });

  it("rejects non-project-audits artifacts", () => {
    assert.throws(
      () => summarizeProjectAudits({ schemaVersion: "audit/v1" }),
      /Expected project audits schemaVersion project-audits\/v1/
    );
  });
});
