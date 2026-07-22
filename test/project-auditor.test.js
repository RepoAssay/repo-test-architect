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
      auditedProjectCount: 3,
      skippedProjectCount: 0
    });
    assert.deepEqual(
      result.audits.map((entry) => ({
        projectId: entry.projectId,
        adapterId: entry.adapterId,
        schemaVersion: entry.audit.schemaVersion
      })),
      [
        {
          projectId: "apps/android",
          adapterId: "kotlin",
          schemaVersion: "audit/v1"
        },
        {
          projectId: "apps/web",
          adapterId: "javascript",
          schemaVersion: "audit/v1"
        },
        {
          projectId: "services/api",
          adapterId: "python",
          schemaVersion: "audit/v1"
        }
      ]
    );
    assert.deepEqual(result.skippedProjects, []);
  });

  it("audits a conventionally owned Gradle module graph once at the aggregate root", () => {
    const result = auditDetectedProjects(path.resolve("examples/kotlin-gradle-module-graph-junit"));

    assert.deepEqual(result.summary, {
      projectCount: 1,
      auditedProjectCount: 1,
      skippedProjectCount: 0
    });
    assert.equal(result.audits[0].projectId, ".");
    assert.equal(result.audits[0].adapterId, "kotlin");
    assert.deepEqual(result.audits[0].audit.untestedCandidates.map((target) => target.name), ["TokenFormatter"]);
    assert.deepEqual(result.audits[0].audit.coveredButRisky.map((target) => target.name), ["TokenParser"]);
  });

  it("passes project-relative changed paths into matching project adapters", () => {
    const result = auditDetectedProjects(path.resolve("examples/polyglot-workspace"), {
      changedPaths: [
        "apps/android/src/main/kotlin/CheckoutCalculator.kt",
        "apps/web/src/sessionClient.ts",
        "services/api/app.py"
      ]
    });

    assert.deepEqual(
      result.audits.map((entry) => ({
        projectId: entry.projectId,
        untested: entry.audit.untestedCandidates.map((target) => target.path)
      })),
      [
        {
          projectId: "apps/android",
          untested: ["src/main/kotlin/CheckoutCalculator.kt"]
        },
        {
          projectId: "apps/web",
          untested: ["src/sessionClient.ts"]
        },
        {
          projectId: "services/api",
          untested: ["app.py"]
        }
      ]
    );
  });

  it("can exclude project roots before auditing", () => {
    const result = auditDetectedProjects(path.resolve("examples/polyglot-workspace"), {
      excludeProjectRoots: ["apps/**"]
    });

    assert.deepEqual(result.summary, {
      projectCount: 1,
      auditedProjectCount: 1,
      skippedProjectCount: 0
    });
    assert.deepEqual(
      result.audits.map((entry) => entry.projectId),
      ["services/api"]
    );
  });

  it("normalizes absolute changed paths before project adapter dispatch", () => {
    const repoRoot = path.resolve("examples/polyglot-workspace");
    const result = auditDetectedProjects(repoRoot, {
      changedPaths: [path.join(repoRoot, "apps", "web", "src", "sessionClient.ts")]
    });

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

  it("normalizes current-directory changed paths before project adapter dispatch", () => {
    const result = auditDetectedProjects(path.resolve("examples/polyglot-workspace"), {
      changedPaths: ["./apps/web/src/sessionClient.ts"]
    });

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
});
