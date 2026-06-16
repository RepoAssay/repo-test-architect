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
      auditCoverage: "partial",
      unsupportedReasons: [
        "No registered adapter supports ecosystems jvm with languages java, kotlin.",
        "No registered adapter supports ecosystems python with languages python."
      ],
      untestedCandidateCount: 1,
      coveredButRiskyCount: 0,
      skippedTargetCount: 0,
      riskCount: 1
    });
    assert.deepEqual(summary.projects[0].topCandidateIds, ["src/sessionClient.ts"]);
    assert.deepEqual(
      summary.unsupportedProjects.map((project) => [
        project.projectId,
        project.ecosystems,
        project.adapterMatches,
        project.supportStatusReason
      ]),
      [
        [
          "apps/android",
          ["jvm"],
          [],
          "No registered adapter supports ecosystems jvm with languages java, kotlin."
        ],
        ["services/api", ["python"], [], "No registered adapter supports ecosystems python with languages python."]
      ]
    );
  });

  it("classifies complete and empty audit coverage", () => {
    assert.equal(
      summarizeProjectAudits({
        schemaVersion: "project-audits/v1",
        root: "repo",
        summary: { projectCount: 1, auditedProjectCount: 1, skippedProjectCount: 0 },
        audits: [
          {
            projectId: "app",
            projectRoot: "app",
            adapterId: "javascript",
            audit: {
              profile: { confidence: "high" },
              untestedCandidates: [],
              coveredButRisky: [],
              skipped: [],
              recommended: [],
              risks: []
            }
          }
        ],
        skippedProjects: []
      }).summary.auditCoverage,
      "complete"
    );

    assert.equal(
      summarizeProjectAudits({
        schemaVersion: "project-audits/v1",
        root: "repo",
        summary: { projectCount: 1, auditedProjectCount: 0, skippedProjectCount: 1 },
        audits: [],
        skippedProjects: [
          {
            projectId: "api",
            projectRoot: "api",
            reason: "No registered adapter supports ecosystems python with languages python.",
            ecosystems: ["python"],
            languages: ["python"],
            adapterMatches: [],
            supportStatusReason: "No registered adapter supports ecosystems python with languages python."
          }
        ]
      }).summary.auditCoverage,
      "none"
    );
  });

  it("rejects non-project-audits artifacts", () => {
    assert.throws(
      () => summarizeProjectAudits({ schemaVersion: "audit/v1" }),
      /Expected project audits schemaVersion project-audits\/v1/
    );
  });
});
