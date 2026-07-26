import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
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
    assert.deepEqual(stats.sourceFiles, {
      total: 3,
      audited: 3,
      unsupported: 0,
      byLanguage: {
        kotlin: { total: 1, audited: 1, unsupported: 0 },
        python: { total: 1, audited: 1, unsupported: 0 },
        typescript: { total: 1, audited: 1, unsupported: 0 }
      }
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
      },
      evidenceStrengths: {},
      evidenceKinds: {},
      evidenceUsage: {},
      evidenceViaUsage: {}
    });
    assert.deepEqual(stats.adapters, [
      { adapterId: "javascript", projectCount: 1 },
      { adapterId: "kotlin", projectCount: 1 },
      { adapterId: "python", projectCount: 1 }
    ]);
  });

  it("aggregates JavaScript test evidence provenance", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/node-vitest-basic"));
    const stats = collectProjectStats(projectAudits);

    assert.deepEqual(stats.distributions.evidenceStrengths, { direct: 1 });
    assert.deepEqual(stats.distributions.evidenceKinds, { "direct-relative-import": 1 });
    assert.deepEqual(stats.distributions.evidenceUsage, { asserted: 1 });
    assert.deepEqual(stats.distributions.evidenceViaUsage, {});
  });

  it("counts nested package sources once and excludes dependency fixtures", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-workspace-stats-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "packages", "core", "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "fixtures", "dependency", "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "testdata", "rust-fixture"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), "{}\n");
    fs.writeFileSync(path.join(root, "src", "root.ts"), "export const root = true;\n");
    fs.writeFileSync(path.join(root, "packages", "core", "package.json"), "{}\n");
    fs.writeFileSync(path.join(root, "packages", "core", "src", "core.ts"), "export const core = true;\n");
    fs.writeFileSync(path.join(root, "fixtures", "dependency", "package.json"), "{}\n");
    fs.writeFileSync(path.join(root, "fixtures", "dependency", "src", "fixture.ts"), "export const fixture = true;\n");
    fs.writeFileSync(path.join(root, "testdata", "rust-fixture", "fixture.rs"), "pub fn fixture() {}\n");

    const stats = collectProjectStats(auditDetectedProjects(root));

    assert.deepEqual(stats.sourceFiles, {
      total: 2,
      audited: 2,
      unsupported: 0,
      byLanguage: {
        typescript: { total: 2, audited: 2, unsupported: 0 }
      }
    });
  });

  it("separates audited and unsupported source file counts", () => {
    const projectAudits = {
      schemaVersion: "project-audits/v1",
      root: path.resolve("examples/polyglot-workspace"),
      summary: {
        projectCount: 3,
        auditedProjectCount: 2,
        skippedProjectCount: 1
      },
      audits: auditDetectedProjects(path.resolve("examples/polyglot-workspace"), {
        excludeProjectRoots: ["services/api"]
      }).audits,
      skippedProjects: [
        {
          projectId: "services/api",
          projectRoot: "services/api",
          reason: "Python adapter disabled for this stats fixture.",
          ecosystems: ["python"],
          languages: ["python"],
          adapterMatches: [],
          supportStatusReason: "Python adapter disabled for this stats fixture."
        }
      ]
    };
    const stats = collectProjectStats(projectAudits);

    assert.deepEqual(stats.summary, {
      projectCount: 3,
      auditedProjectCount: 2,
      unsupportedProjectCount: 1,
      auditCoverage: "partial"
    });
    assert.deepEqual(stats.sourceFiles, {
      total: 3,
      audited: 2,
      unsupported: 1,
      byLanguage: {
        kotlin: { total: 1, audited: 1, unsupported: 0 },
        python: { total: 1, audited: 0, unsupported: 1 },
        typescript: { total: 1, audited: 1, unsupported: 0 }
      }
    });
  });

  it("rejects non-project-audits artifacts", () => {
    assert.throws(
      () => collectProjectStats({ schemaVersion: "audit/v1" }),
      /Expected project audits schemaVersion project-audits\/v1/
    );
  });
});
