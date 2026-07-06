import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditDetectedProjects } from "../src/core/project-auditor.js";
import { analyzeProjectTestPlacement } from "../src/core/project-test-placement-analysis.js";

describe("project test placement analysis", () => {
  it("creates placement findings from project audits", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/node-vitest-basic"));
    const placement = analyzeProjectTestPlacement(projectAudits);

    assert.equal(placement.schemaVersion, "test-placement-findings/v1");
    assert.deepEqual(placement.findings[0], {
      id: ".:keep:src/deckParser.test.ts:src/deckParser.ts",
      testFile: "src/deckParser.test.ts",
      currentOwner: ".",
      suggestedOwner: ".",
      action: "keep",
      reason: "Existing test is colocated with the audited project and matches a source target in the same project.",
      evidence: [
        "project id: .",
        "matches source target src/deckParser.ts",
        "target kind: pure-logic",
        "recommended level: unit"
      ]
    });
  });

  it("prefixes nested project test and source paths", () => {
    const placement = analyzeProjectTestPlacement({
      schemaVersion: "project-audits/v1",
      root: "/repo",
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
            profile: { root: "/repo/apps/web" },
            untestedCandidates: [],
            coveredButRisky: [
              {
                path: "src/sessionClient.ts",
                kind: "service",
                recommendedTestLevel: "unit",
                existingTestPaths: ["src/sessionClient.test.ts"]
              }
            ],
            skipped: [],
            risks: []
          }
        }
      ],
      skippedProjects: []
    });

    assert.equal(placement.findings[0].testFile, "apps/web/src/sessionClient.test.ts");
    assert.deepEqual(placement.findings[0].evidence, [
      "project id: apps/web",
      "matches source target apps/web/src/sessionClient.ts",
      "target kind: service",
      "recommended level: unit"
    ]);
  });

  it("recommends moving tests that escape the audited project root", () => {
    const placement = analyzeProjectTestPlacement({
      schemaVersion: "project-audits/v1",
      root: "/repo",
      summary: {
        projectCount: 2,
        auditedProjectCount: 2,
        skippedProjectCount: 0
      },
      audits: [
        {
          projectId: "apps/main",
          projectRoot: "apps/main",
          adapterId: "javascript",
          audit: {
            schemaVersion: "audit/v1",
            profile: { root: "/repo/apps/main" },
            untestedCandidates: [],
            coveredButRisky: [],
            skipped: [],
            risks: []
          }
        },
        {
          projectId: "packages/deck-core",
          projectRoot: "packages/deck-core",
          adapterId: "javascript",
          audit: {
            schemaVersion: "audit/v1",
            profile: { root: "/repo/packages/deck-core" },
            untestedCandidates: [],
            coveredButRisky: [
              {
                path: "src/deckParser.ts",
                kind: "pure-logic",
                recommendedTestLevel: "unit",
                existingTestPaths: ["../../apps/main/tests/deckParser.test.ts"]
              }
            ],
            skipped: [],
            risks: []
          }
        }
      ],
      skippedProjects: []
    });

    assert.deepEqual(placement.findings[0], {
      id: "packages/deck-core:move:apps/main/tests/deckParser.test.ts:packages/deck-core/src/deckParser.ts",
      testFile: "apps/main/tests/deckParser.test.ts",
      currentOwner: "apps/main",
      suggestedOwner: "packages/deck-core",
      action: "move",
      reason: "Existing test path escapes the audited project root while covering source owned by this project.",
      evidence: [
        "project id: packages/deck-core",
        "current owner: apps/main",
        "suggested owner: packages/deck-core",
        "test path escapes audited project root",
        "matches source target packages/deck-core/src/deckParser.ts",
        "target kind: pure-logic",
        "recommended level: unit"
      ]
    });
  });

  it("recommends splitting integration tests that escape into another project", () => {
    const placement = analyzeProjectTestPlacement({
      schemaVersion: "project-audits/v1",
      root: "/repo",
      summary: {
        projectCount: 2,
        auditedProjectCount: 2,
        skippedProjectCount: 0
      },
      audits: [
        {
          projectId: "apps/main",
          projectRoot: "apps/main",
          adapterId: "javascript",
          audit: {
            schemaVersion: "audit/v1",
            profile: { root: "/repo/apps/main" },
            untestedCandidates: [],
            coveredButRisky: [],
            skipped: [],
            risks: []
          }
        },
        {
          projectId: "packages/auth-core",
          projectRoot: "packages/auth-core",
          adapterId: "javascript",
          audit: {
            schemaVersion: "audit/v1",
            profile: { root: "/repo/packages/auth-core" },
            untestedCandidates: [],
            coveredButRisky: [
              {
                path: "src/authRoute.ts",
                kind: "http-route",
                recommendedTestLevel: "integration",
                existingTestPaths: ["../../apps/main/tests/authRoute.test.ts"]
              }
            ],
            skipped: [],
            risks: []
          }
        }
      ],
      skippedProjects: []
    });

    assert.deepEqual(placement.findings[0], {
      id: "packages/auth-core:split:apps/main/tests/authRoute.test.ts:packages/auth-core/src/authRoute.ts",
      testFile: "apps/main/tests/authRoute.test.ts",
      currentOwner: "apps/main",
      suggestedOwner: "packages/auth-core",
      action: "split",
      reason: "Existing integration-level test escapes the audited project root while covering source owned by this project.",
      evidence: [
        "project id: packages/auth-core",
        "current owner: apps/main",
        "suggested owner: packages/auth-core",
        "test path escapes audited project root",
        "matches source target packages/auth-core/src/authRoute.ts",
        "target kind: http-route",
        "recommended level: integration"
      ]
    });
  });

  it("recommends moving package-owned tests reported with repo-relative cross-owner paths", () => {
    const placement = analyzeProjectTestPlacement({
      schemaVersion: "project-audits/v1",
      root: "/repo",
      summary: {
        projectCount: 2,
        auditedProjectCount: 2,
        skippedProjectCount: 0
      },
      audits: [
        {
          projectId: "apps/main",
          projectRoot: "apps/main",
          adapterId: "javascript",
          audit: {
            schemaVersion: "audit/v1",
            profile: { root: "/repo/apps/main" },
            untestedCandidates: [],
            coveredButRisky: [],
            skipped: [],
            risks: []
          }
        },
        {
          projectId: "packages/deck-core",
          projectRoot: "packages/deck-core",
          adapterId: "javascript",
          audit: {
            schemaVersion: "audit/v1",
            profile: { root: "/repo/packages/deck-core" },
            untestedCandidates: [],
            coveredButRisky: [
              {
                path: "src/deckParser.ts",
                kind: "pure-logic",
                signals: ["pure-logic", "package-owned-behavior"],
                recommendedTestLevel: "unit",
                existingTestPaths: ["apps/main/tests/deckParser.test.ts"]
              }
            ],
            skipped: [],
            risks: []
          }
        }
      ],
      skippedProjects: []
    });

    assert.deepEqual(placement.findings[0], {
      id: "packages/deck-core:move:apps/main/tests/deckParser.test.ts:packages/deck-core/src/deckParser.ts",
      testFile: "apps/main/tests/deckParser.test.ts",
      currentOwner: "apps/main",
      suggestedOwner: "packages/deck-core",
      action: "move",
      reason: "Existing test is owned by another project while covering package-owned behavior from this project.",
      evidence: [
        "project id: packages/deck-core",
        "current owner: apps/main",
        "suggested owner: packages/deck-core",
        "test path belongs to another detected project",
        "package boundary signal: package-owned-behavior",
        "matches source target packages/deck-core/src/deckParser.ts",
        "target kind: pure-logic",
        "recommended level: unit"
      ]
    });
  });

  it("recommends splitting repo-relative package tests that include app integration dependencies", () => {
    const placement = analyzeProjectTestPlacement({
      schemaVersion: "project-audits/v1",
      root: "/repo",
      summary: {
        projectCount: 2,
        auditedProjectCount: 2,
        skippedProjectCount: 0
      },
      audits: [
        {
          projectId: "apps/main",
          projectRoot: "apps/main",
          adapterId: "javascript",
          audit: {
            schemaVersion: "audit/v1",
            profile: { root: "/repo/apps/main" },
            untestedCandidates: [],
            coveredButRisky: [],
            skipped: [],
            risks: []
          }
        },
        {
          projectId: "packages/auth-core",
          projectRoot: "packages/auth-core",
          adapterId: "javascript",
          audit: {
            schemaVersion: "audit/v1",
            profile: { root: "/repo/packages/auth-core" },
            untestedCandidates: [],
            coveredButRisky: [
              {
                path: "src/authPolicy.ts",
                kind: "service",
                signals: ["service-name", "package-owned-behavior", "app-integration-dependency"],
                recommendedTestLevel: "unit",
                existingTestPaths: ["apps/main/tests/authPolicy.test.ts"]
              }
            ],
            skipped: [],
            risks: []
          }
        }
      ],
      skippedProjects: []
    });

    assert.deepEqual(placement.findings[0], {
      id: "packages/auth-core:split:apps/main/tests/authPolicy.test.ts:packages/auth-core/src/authPolicy.ts",
      testFile: "apps/main/tests/authPolicy.test.ts",
      currentOwner: "apps/main",
      suggestedOwner: "packages/auth-core",
      action: "split",
      reason: "Existing test is owned by another project and mixes app integration behavior with package-owned behavior from this project.",
      evidence: [
        "project id: packages/auth-core",
        "current owner: apps/main",
        "suggested owner: packages/auth-core",
        "test path belongs to another detected project",
        "package boundary signal: package-owned-behavior",
        "package boundary signal: app-integration-dependency",
        "matches source target packages/auth-core/src/authPolicy.ts",
        "target kind: service",
        "recommended level: unit"
      ]
    });
  });

  it("infers package boundaries from package and app project roots", () => {
    const placement = analyzeProjectTestPlacement({
      schemaVersion: "project-audits/v1",
      root: "/repo",
      summary: {
        projectCount: 2,
        auditedProjectCount: 2,
        skippedProjectCount: 0
      },
      audits: [
        {
          projectId: "apps/main",
          projectRoot: "apps/main",
          adapterId: "javascript",
          audit: {
            schemaVersion: "audit/v1",
            profile: { root: "/repo/apps/main" },
            untestedCandidates: [],
            coveredButRisky: [],
            skipped: [],
            risks: []
          }
        },
        {
          projectId: "packages/billing-core",
          projectRoot: "packages/billing-core",
          adapterId: "javascript",
          audit: {
            schemaVersion: "audit/v1",
            profile: { root: "/repo/packages/billing-core" },
            untestedCandidates: [],
            coveredButRisky: [
              {
                path: "src/priceRules.ts",
                kind: "pure-logic",
                signals: ["pure-logic"],
                recommendedTestLevel: "unit",
                existingTestPaths: ["apps/main/tests/priceRules.test.ts"]
              }
            ],
            skipped: [],
            risks: []
          }
        }
      ],
      skippedProjects: []
    });

    assert.deepEqual(placement.findings[0], {
      id: "packages/billing-core:move:apps/main/tests/priceRules.test.ts:packages/billing-core/src/priceRules.ts",
      testFile: "apps/main/tests/priceRules.test.ts",
      currentOwner: "apps/main",
      suggestedOwner: "packages/billing-core",
      action: "move",
      reason: "Existing test is owned by another project while covering package-owned behavior from this project.",
      evidence: [
        "project id: packages/billing-core",
        "current owner: apps/main",
        "suggested owner: packages/billing-core",
        "test path belongs to another detected project",
        "package boundary inferred from project roots: package-like source owner covered by app-like test owner",
        "matches source target packages/billing-core/src/priceRules.ts",
        "target kind: pure-logic",
        "recommended level: unit"
      ]
    });
  });

  it("rejects non-project-audits artifacts", () => {
    assert.throws(
      () => analyzeProjectTestPlacement({ schemaVersion: "audit/v1" }),
      /Expected project audits schemaVersion project-audits\/v1/
    );
  });
});
