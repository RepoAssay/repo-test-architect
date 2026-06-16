import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditDetectedProjects } from "../src/core/project-auditor.js";

describe("project auditor", () => {
  it("audits supported detected projects and reports unsupported projects", () => {
    const result = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));

    assert.equal(result.schemaVersion, "project-audits/v1");
    assert.deepEqual(result.summary, {
      projectCount: 3,
      auditedProjectCount: 1,
      skippedProjectCount: 2
    });
    assert.deepEqual(
      result.audits.map((entry) => ({
        projectId: entry.projectId,
        adapterId: entry.adapterId,
        schemaVersion: entry.audit.schemaVersion
      })),
      [
        {
          projectId: "apps/web",
          adapterId: "javascript",
          schemaVersion: "audit/v1"
        }
      ]
    );
    assert.deepEqual(
      result.skippedProjects.map((project) => ({
        projectId: project.projectId,
        projectRoot: project.projectRoot,
        reason: project.reason,
        ecosystems: project.ecosystems,
        languages: project.languages,
        adapterMatches: project.adapterMatches,
        supportStatusReason: project.supportStatusReason
      })),
      [
        {
          projectId: "apps/android",
          projectRoot: "apps/android",
          reason: "No registered adapter supports ecosystems jvm with languages java, kotlin.",
          ecosystems: ["jvm"],
          languages: ["java", "kotlin"],
          adapterMatches: [],
          supportStatusReason: "No registered adapter supports ecosystems jvm with languages java, kotlin."
        },
        {
          projectId: "services/api",
          projectRoot: "services/api",
          reason: "No registered adapter supports ecosystems python with languages python.",
          ecosystems: ["python"],
          languages: ["python"],
          adapterMatches: [],
          supportStatusReason: "No registered adapter supports ecosystems python with languages python."
        }
      ]
    );
  });
});
