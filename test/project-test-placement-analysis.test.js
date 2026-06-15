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

  it("rejects non-project-audits artifacts", () => {
    assert.throws(
      () => analyzeProjectTestPlacement({ schemaVersion: "audit/v1" }),
      /Expected project audits schemaVersion project-audits\/v1/
    );
  });
});
