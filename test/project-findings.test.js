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
      findingCount: 4,
      displayedFindingCount: 4,
      maxFindings: 10,
      highSeverityCount: 3,
      placementFindingCount: 0,
      blockedProjectCount: 0,
      categoryCounts: {
        "missing-coverage": 4,
        "weak-existing-coverage": 0,
        "misplaced-coverage": 0,
        "low-value-direct-test": 0,
        "blocked-project": 0,
        "command-withheld": 0
      }
    });
    // services/api has no test framework or command: that is one coverage gap below the target findings, not two blockers (#312).
    assert.deepEqual(
      findings.findings.map((finding) => `${finding.category}:${finding.projectRoot}:${finding.target ?? finding.title}`),
      [
        "missing-coverage:apps/android:CheckoutCalculator",
        "missing-coverage:services/api:app",
        "missing-coverage:apps/web:sessionClient",
        "missing-coverage:services/api:services/api has no test infrastructure"
      ]
    );
    assert.equal(findings.findings[3].code, "missing-test-infrastructure");
    assert.deepEqual(findings.unsupportedProjects, []);
  });

  it("can limit displayed findings without changing total counts", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));
    const findings = createProjectFindings(projectAudits, { maxFindings: 2 });

    assert.equal(findings.summary.findingCount, 4);
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
    assert.equal(findings.summary.blockedProjectCount, 0);
    assert.equal(findings.findings[0].category, "missing-coverage");
    assert.deepEqual(
      findings.findings.slice(1).map((finding) => ({
        category: finding.category,
        code: finding.code,
        severity: finding.severity,
        priority: finding.priority,
        title: finding.title,
        evidence: finding.evidence
      })),
      [
        {
          category: "missing-coverage",
          code: "missing-test-infrastructure",
          severity: "low",
          priority: 1,
          title: "benchmarks/routers is auxiliary and lacks independent test setup",
          evidence: ["project role: auxiliary", "confidence: low", "test command: none detected"]
        },
        {
          category: "missing-coverage",
          code: "missing-test-infrastructure",
          severity: "low",
          priority: 1,
          title: "packages/docs is auxiliary and lacks independent test setup",
          evidence: ["project role: auxiliary", "confidence: low", "test command: none detected"]
        }
      ]
    );
  });

  it("classifies diagnostics into bounded audits, withheld commands and missing infrastructure", () => {
    // #312: audit-scope diagnostics stay blocked-project findings (high when attribution cannot be trusted,
    // medium for a known bound), command-scope diagnostics only withhold the command, and missing test
    // infrastructure is one coverage gap per project. Saved artifacts without diagnostics are classified
    // from their blocker strings.
    const audit = (profile) => ({ schemaVersion: "audit/v1", profile, untestedCandidates: [], coveredButRisky: [], skipped: [], risks: [] });
    const projectAudits = {
      schemaVersion: "project-audits/v1",
      root: ".",
      summary: { projectCount: 3, auditedProjectCount: 3, skippedProjectCount: 0 },
      audits: [
        {
          projectId: "packages/ios",
          projectRoot: "packages/ios",
          adapterId: "swift",
          audit: audit({ confidence: "high", blockers: ["Swift sources import UIKit, which swift test cannot build on macOS; run xcodebuild test with a simulator destination such as -destination 'platform=iOS Simulator,name=<device>' after selecting a device."] })
        },
        {
          projectId: "apps/android",
          projectRoot: "apps/android",
          adapterId: "kotlin",
          audit: audit({
            confidence: "medium",
            testCommand: "gradle test",
            blockers: ["Android modules are audited with JVM conventions: build variants are not modeled."],
            diagnostics: [
              { code: "android-jvm-conventions", scope: "audit", severity: "medium", message: "Android modules are audited with JVM conventions: build variants are not modeled." },
              { code: "missing-test-target", scope: "test-infrastructure", severity: "medium", message: "No test source set was found; add src/test/kotlin." }
            ]
          })
        },
        {
          projectId: "tools/legacy",
          projectRoot: "tools/legacy",
          adapterId: "kotlin",
          audit: audit({ confidence: "low", blockers: ["Custom Gradle build graphs are outside the supported ownership boundary."] })
        }
      ],
      skippedProjects: []
    };

    const findings = createProjectFindings(projectAudits);

    assert.deepEqual(findings.summary.categoryCounts, {
      "missing-coverage": 1,
      "weak-existing-coverage": 0,
      "misplaced-coverage": 0,
      "low-value-direct-test": 0,
      "blocked-project": 2,
      "command-withheld": 1
    });
    assert.equal(findings.summary.blockedProjectCount, 2);
    assert.equal(findings.summary.highSeverityCount, 1);
    assert.deepEqual(
      findings.findings.map((finding) => [finding.category, finding.code, finding.severity, finding.priority, finding.title]),
      [
        ["blocked-project", "audit-blocker", "high", 9, "tools/legacy cannot be fully audited"],
        ["blocked-project", "android-jvm-conventions", "medium", 7, "apps/android is audited within a bounded model"],
        ["command-withheld", "host-unavailable-framework", "medium", 6, "packages/ios has no runnable test command"],
        ["missing-coverage", "missing-test-target", "medium", 4, "apps/android has no test infrastructure"]
      ]
    );
    assert.deepEqual(findings.findings[2].evidence, ["confidence: high", "test command: none detected"]);
    assert.deepEqual(findings.findings[3].rationale, ["No test source set was found; add src/test/kotlin."]);
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

  it("ranks weak coverage by the strongest proven evidence", () => {
    const evidenceKinds = [
      {
        name: "indirect",
        evidence: [{ testPath: "test/behavior.test.ts", kind: "bounded-dependency", strength: "indirect" }],
        priority: 3,
        label: "strongest coverage evidence: naming or bounded-indirect reachability"
      },
      {
        name: "structural",
        evidence: [{ testPath: "test/behavior.test.ts", kind: "direct-relative-import", strength: "direct" }],
        priority: 2,
        label: "strongest coverage evidence: direct structural reachability"
      },
      {
        name: "called",
        evidence: [{ testPath: "test/behavior.test.ts", kind: "direct-relative-import", strength: "direct", usage: "called" }],
        priority: 1,
        label: "strongest coverage evidence: called usage"
      },
      {
        name: "asserted",
        evidence: [{ testPath: "test/behavior.test.ts", kind: "direct-relative-import", strength: "direct", usage: "asserted" }],
        priority: 0,
        label: "strongest coverage evidence: asserted usage"
      }
    ];
    const findings = createProjectFindings({
      schemaVersion: "project-audits/v1",
      root: ".",
      summary: { projectCount: 1, auditedProjectCount: 1, skippedProjectCount: 0 },
      audits: [{
        projectId: ".",
        projectRoot: ".",
        adapterId: "javascript",
        audit: {
          schemaVersion: "audit/v1",
          profile: { confidence: "high", blockers: [] },
          untestedCandidates: [],
          coveredButRisky: evidenceKinds.map(({ name, evidence }) => ({
            id: `src/${name}.ts`,
            name,
            path: `src/${name}.ts`,
            kind: "utility",
            signals: ["branching-logic", "matching-test"],
            risk: "medium",
            testability: "high",
            recommendedTestLevel: "unit",
            riskReductionScore: 7,
            maintenanceCost: 4,
            reasons: ["Branching logic"],
            existingTestPaths: ["test/behavior.test.ts"],
            existingTestEvidence: evidence
          })),
          skipped: [],
          risks: []
        }
      }],
      skippedProjects: []
    });

    assert.deepEqual(
      findings.findings.map((finding) => ({
        target: finding.target,
        priority: finding.priority,
        evidence: finding.evidence.find((item) => item.startsWith("strongest coverage evidence:"))
      })),
      evidenceKinds.map(({ name, priority, label }) => ({ target: name, priority, evidence: label }))
    );
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
