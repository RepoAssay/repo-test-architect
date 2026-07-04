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
      plannedProjectCount: 3,
      unsupportedProjectCount: 0,
      auditCoverage: "complete",
      unsupportedReasons: [],
      addTestCount: 3,
      extendTestCount: 0,
      deferredCount: 0,
      itemCount: 3
    });
    assert.deepEqual(
      plan.items.map((item) => ({
        projectItemId: item.projectItemId,
        action: item.action,
        targetId: item.targetId
      })),
      [
        {
          projectItemId: "apps/android:add-test:src/main/kotlin/CheckoutCalculator.kt",
          action: "add-test",
          targetId: "src/main/kotlin/CheckoutCalculator.kt"
        },
        {
          projectItemId: "services/api:add-test:app.py",
          action: "add-test",
          targetId: "app.py"
        },
        {
          projectItemId: "apps/web:add-test:src/sessionClient.ts",
          action: "add-test",
          targetId: "src/sessionClient.ts"
        }
      ]
    );
    assert.deepEqual(plan.unsupportedProjects, []);
  });

  it("rejects non-project-audits artifacts", () => {
    assert.throws(
      () => createProjectTestPlan({ schemaVersion: "audit/v1" }),
      /Expected project audits schemaVersion project-audits\/v1/
    );
  });
});
