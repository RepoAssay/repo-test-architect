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
      blockedProjectCount: 2,
      categoryCounts: {
        "missing-coverage": 3,
        "weak-existing-coverage": 0,
        "misplaced-coverage": 0,
        "low-value-direct-test": 0,
        "blocked-project": 2
      }
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

  it("ranks missing test setup below actionable findings for auxiliary workspaces", () => {
    const projectAudits = {
      schemaVersion: "project-audits/v1",
      root: ".",
      summary: {
        projectCount: 3,
        auditedProjectCount: 3,
        skippedProjectCount: 0
      },
      audits: [
        {
          projectId: "apps/web",
          projectRoot: "apps/web",
          adapterId: "javascript",
          adapterMatches: [],
          audit: {
            schemaVersion: "audit/v1",
            profile: { confidence: "high", blockers: [], testCommand: "npm test" },
            untestedCandidates: [
              {
                id: "src/auth.ts",
                name: "auth",
                path: "src/auth.ts",
                kind: "utility",
                signals: ["branching-logic"],
                risk: "high",
                testability: "high",
                recommendedTestLevel: "unit",
                riskReductionScore: 7,
                maintenanceCost: 2
              }
            ],
            coveredButRisky: [],
            skipped: [],
            risks: []
          }
        },
        {
          projectId: "packages/docs",
          projectRoot: "packages/docs",
          adapterId: "javascript",
          adapterMatches: [],
          audit: {
            schemaVersion: "audit/v1",
            profile: {
              confidence: "low",
              blockers: [
                "No supported JS test framework detected.",
                "No runnable test command detected from package scripts or framework config."
              ]
            },
            untestedCandidates: [],
            coveredButRisky: [],
            skipped: [],
            risks: []
          }
        }
      ],
      skippedProjects: []
    };
    projectAudits.audits.push({
      ...projectAudits.audits[1],
      projectId: "benchmarks/routers",
      projectRoot: "benchmarks/routers"
    });

    const findings = createProjectFindings(projectAudits);

    assert.equal(findings.summary.highSeverityCount, 1);
    assert.equal(findings.summary.blockedProjectCount, 4);
    assert.equal(findings.findings[0].category, "missing-coverage");
    assert.deepEqual(
      findings.findings.slice(1).map((finding) => ({
        severity: finding.severity,
        priority: finding.priority,
        title: finding.title,
        evidence: finding.evidence
      })),
      [
        {
          severity: "low",
          priority: 1,
          title: "benchmarks/routers is auxiliary and lacks independent test setup",
          evidence: ["project role: auxiliary", "confidence: low", "test command: none detected"]
        },
        {
          severity: "low",
          priority: 1,
          title: "benchmarks/routers is auxiliary and lacks independent test setup",
          evidence: ["project role: auxiliary", "confidence: low", "test command: none detected"]
        },
        {
          severity: "low",
          priority: 1,
          title: "packages/docs is auxiliary and lacks independent test setup",
          evidence: ["project role: auxiliary", "confidence: low", "test command: none detected"]
        },
        {
          severity: "low",
          priority: 1,
          title: "packages/docs is auxiliary and lacks independent test setup",
          evidence: ["project role: auxiliary", "confidence: low", "test command: none detected"]
        }
      ]
    );
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

  it("does not promote correctly placed keep findings as misplaced coverage", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/node-vitest-basic"));
    const findings = createProjectFindings(projectAudits);

    assert.equal(findings.summary.placementFindingCount, 0);
    assert.ok(findings.findings.every((finding) => finding.category !== "misplaced-coverage"));
    assert.ok(findings.findings.some((finding) => finding.category === "weak-existing-coverage"));
  });

  it("defaults optional target arrays in project findings", () => {
    const findings = createProjectFindings({
      schemaVersion: "project-audits/v1",
      root: ".",
      summary: {
        projectCount: 1,
        auditedProjectCount: 1,
        skippedProjectCount: 0
      },
      audits: [
        {
          projectId: "apps/web",
          projectRoot: "apps/web",
          adapterId: "javascript",
          adapterMatches: [],
          audit: {
            schemaVersion: "audit/v1",
            profile: {
              confidence: "medium",
              blockers: []
            },
            untestedCandidates: [
              {
                id: "src/paymentClient.ts",
                name: "paymentClient",
                path: "src/paymentClient.ts",
                kind: "service",
                signals: ["service-name"],
                risk: "high",
                testability: "medium",
                recommendedTestLevel: "unit",
                riskReductionScore: 8,
                maintenanceCost: 4
              }
            ],
            coveredButRisky: [],
            skipped: [],
            risks: []
          }
        }
      ],
      skippedProjects: []
    });

    assert.equal(findings.summary.findingCount, 1);
    assert.equal(findings.findings[0].category, "missing-coverage");
    assert.deepEqual(findings.findings[0].rationale, []);
    assert.deepEqual(findings.findings[0].existingTestPaths, []);
    assert.ok(findings.findings[0].evidence.includes("existing tests: none detected"));
  });

  it("rejects invalid max findings", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));

    assert.throws(
      () => createProjectFindings(projectAudits, { maxFindings: 0 }),
      /maxFindings must be a positive integer/
    );
  });
});
