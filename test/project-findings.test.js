import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { auditDetectedProjects } from "../src/core/project-auditor.js";
import { createProjectFindings } from "../src/core/project-findings.js";

describe("project findings", () => {
  it("summarizes top test architecture findings across audited projects", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));
    const findings = createProjectFindings(projectAudits);

    assert.equal(findings.schemaVersion, "project-findings/v1");
    assert.deepEqual(findings.summary, {
      projectCount: 3,
      auditedProjectCount: 3,
      unsupportedProjectCount: 0,
      auditCoverage: "complete",
      unsupportedReasons: [],
      findingCount: 5,
      displayedFindingCount: 5,
      maxFindings: 10,
      highSeverityCount: 5,
      placementFindingCount: 0,
      blockedProjectCount: 2
    });
    assert.deepEqual(
      findings.findings.map((finding) => `${finding.category}:${finding.projectRoot}:${finding.target ?? finding.title}`),
      [
        "blocked-project:services/api:services/api cannot be fully audited",
        "blocked-project:services/api:services/api cannot be fully audited",
        "missing-coverage:apps/android:CheckoutCalculator",
        "missing-coverage:services/api:app",
        "missing-coverage:apps/web:sessionClient"
      ]
    );
    assert.deepEqual(findings.unsupportedProjects, []);
  });

  it("can limit displayed findings without changing total counts", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));
    const findings = createProjectFindings(projectAudits, { maxFindings: 2 });

    assert.equal(findings.summary.findingCount, 5);
    assert.equal(findings.summary.displayedFindingCount, 2);
    assert.equal(findings.findings.length, 2);
  });

  it("keeps placement-only fixture targets from becoming weak coverage findings", () => {
    const { projectAudits } = JSON.parse(fs.readFileSync("examples/mcp/split-placement-project-audits.args.json", "utf8"));
    const findings = createProjectFindings(projectAudits);

    assert.equal(findings.summary.findingCount, 1);
    assert.equal(findings.summary.placementFindingCount, 1);
    assert.equal(findings.findings[0].category, "misplaced-coverage");
    assert.equal(findings.findings[0].action, "split");
    assert.equal(findings.findings[0].testFile, "apps/main/tests/authRoute.test.ts");
  });

  it("rejects invalid max findings", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));

    assert.throws(
      () => createProjectFindings(projectAudits, { maxFindings: 0 }),
      /maxFindings must be a positive integer/
    );
  });
});
