import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditDetectedProjects } from "../src/core/project-auditor.js";
import { rankProjectTestCandidates } from "../src/core/project-candidate-ranking.js";

describe("project candidate ranking", () => {
  it("ranks candidates across audited projects with project identity", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));
    const ranking = rankProjectTestCandidates(projectAudits);

    assert.equal(ranking.schemaVersion, "project-candidate-ranking/v1");
    assert.deepEqual(ranking.summary, {
      projectCount: 3,
      auditedProjectCount: 1,
      unsupportedProjectCount: 2,
      auditCoverage: "partial",
      unsupportedReasons: [
        "No registered adapter supports ecosystems jvm with languages java, kotlin.",
        "No registered adapter supports ecosystems python with languages python."
      ],
      candidateCount: 1
    });
    assert.deepEqual(
      ranking.candidates.map((candidate) => ({
        projectTargetId: candidate.projectTargetId,
        projectRoot: candidate.projectRoot,
        priority: candidate.priority
      })),
      [
        {
          projectTargetId: "apps/web:src/sessionClient.ts",
          projectRoot: "apps/web",
          priority: 4
        }
      ]
    );
    assert.deepEqual(
      ranking.unsupportedProjects.map((project) => [
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

  it("rejects non-project-audits artifacts", () => {
    assert.throws(
      () => rankProjectTestCandidates({ schemaVersion: "audit/v1" }),
      /Expected project audits schemaVersion project-audits\/v1/
    );
  });
});
