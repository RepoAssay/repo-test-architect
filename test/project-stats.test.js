import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditDetectedProjects } from "../src/core/project-auditor.js";
import { collectProjectStats } from "../src/core/project-stats.js";

describe("project stats", () => {
  it("collects local-first stats from project audits", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));
    const stats = collectProjectStats(projectAudits);

    assert.equal(stats.schemaVersion, "project-stats/v1");
    assert.deepEqual(stats.summary, {
      projectCount: 3,
      auditedProjectCount: 1,
      unsupportedProjectCount: 2,
      auditCoverage: "partial"
    });
    assert.deepEqual(stats.counts, {
      untestedCandidateCount: 1,
      coveredButRiskyCount: 0,
      skippedTargetCount: 0,
      riskCount: 1,
      blockerCount: 0
    });
    assert.deepEqual(stats.distributions, {
      confidence: { medium: 1 },
      testFrameworks: { vitest: 1 },
      testCommands: { "npm run test": 1 }
    });
    assert.deepEqual(stats.adapters, [{ adapterId: "javascript", projectCount: 1 }]);
  });

  it("rejects non-project-audits artifacts", () => {
    assert.throws(
      () => collectProjectStats({ schemaVersion: "audit/v1" }),
      /Expected project audits schemaVersion project-audits\/v1/
    );
  });
});
