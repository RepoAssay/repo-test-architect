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
      auditedProjectCount: 3,
      unsupportedProjectCount: 0,
      auditCoverage: "complete"
    });
    assert.deepEqual(stats.counts, {
      untestedCandidateCount: 3,
      coveredButRiskyCount: 0,
      skippedTargetCount: 0,
      riskCount: 3,
      blockerCount: 2
    });
    assert.deepEqual(stats.distributions, {
      confidence: { low: 1, medium: 2 },
      testFrameworks: { "kotlin-test": 1, vitest: 1 },
      testCommands: { "gradle test": 1, "npm run test": 1 },
      targetKinds: { "pure-logic": 2, service: 1 },
      riskLevels: { high: 3 },
      signals: {
        "auth-branch": 1,
        "edge-case-surface": 2,
        "pure-logic": 2,
        "service-name": 1
      }
    });
    assert.deepEqual(stats.adapters, [
      { adapterId: "javascript", projectCount: 1 },
      { adapterId: "kotlin", projectCount: 1 },
      { adapterId: "python", projectCount: 1 }
    ]);
  });

  it("rejects non-project-audits artifacts", () => {
    assert.throws(
      () => collectProjectStats({ schemaVersion: "audit/v1" }),
      /Expected project audits schemaVersion project-audits\/v1/
    );
  });
});
