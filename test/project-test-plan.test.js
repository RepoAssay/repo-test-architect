import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditDetectedProjects } from "../src/core/project-auditor.js";
import { createProjectTestPlan } from "../src/core/project-test-plan.js";

describe("project test plan", () => {
  it("creates a project-aware plan from audited projects", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));
    const plan = createProjectTestPlan(projectAudits);

    assert.equal(plan.schemaVersion, "project-test-plan/v1");
    assert.deepEqual(plan.summary, {
      projectCount: 3,
      plannedProjectCount: 1,
      unsupportedProjectCount: 2,
      addTestCount: 1,
      extendTestCount: 0,
      deferredCount: 0,
      itemCount: 1
    });
    assert.deepEqual(
      plan.items.map((item) => ({
        projectItemId: item.projectItemId,
        action: item.action,
        targetId: item.targetId
      })),
      [
        {
          projectItemId: "apps/web:add-test:src/sessionClient.ts",
          action: "add-test",
          targetId: "src/sessionClient.ts"
        }
      ]
    );
    assert.deepEqual(
      plan.unsupportedProjects.map((project) => [project.projectId, project.ecosystems]),
      [
        ["apps/android", ["jvm"]],
        ["services/api", ["python"]]
      ]
    );
  });

  it("rejects non-project-audits artifacts", () => {
    assert.throws(
      () => createProjectTestPlan({ schemaVersion: "audit/v1" }),
      /Expected project audits schemaVersion project-audits\/v1/
    );
  });
});
