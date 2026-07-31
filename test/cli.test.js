import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const cliPath = "src/cli/index.js";
const fixturePath = "examples/node-vitest-basic";

describe("CLI", () => {
  it("shows the streamlined entrypoint in global help without scanning", () => {
    const output = execFileSync(process.execPath, [cliPath, "--help"], { encoding: "utf8" });

    assert.match(output, /Usage: repo-test-architect/);
    assert.match(output, /analyze\s+Complete repository analysis \(recommended\)/);
    assert.doesNotMatch(output, /# Repository Analysis/);
  });

  it("shows command help without resolving or scanning the repository", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "analyze", "/path/that/does/not/exist", "--help"],
      { encoding: "utf8" }
    );

    assert.match(output, /Usage: repo-test-architect analyze/);
    assert.match(output, /--from-project-audits/);
    assert.match(output, /--changed/);
  });

  it("analyzes a repository in one command with compact markdown", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "analyze", "examples/polyglot-workspace"],
      { encoding: "utf8" }
    );

    assert.match(output, /^# Repository Test Analysis/);
    assert.match(output, /- Projects: 3/);
    assert.match(output, /- Audited: 3/);
    assert.match(output, /## Verification Commands/);
    assert.match(output, /gradle test/);
    assert.match(output, /npm run test/);
    assert.match(output, /## Top Findings/);
    assert.match(output, /## Recommended Plan/);
    assert.match(output, /--format json/);
  });

  it("emits the complete repository analysis as JSON", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "analyze", "examples/polyglot-workspace", "--format=json"],
      { encoding: "utf8" }
    );
    const analysis = JSON.parse(output);

    assert.equal(analysis.schemaVersion, "repository-analysis/v1");
    assert.equal(analysis.summary.projectCount, 3);
    assert.equal(analysis.summary.planItemCount, 3);
    assert.equal(analysis.projectAudits.schemaVersion, "project-audits/v1");
    assert.equal(analysis.findings.schemaVersion, "project-findings/v1");
    assert.equal(analysis.executionHints.schemaVersion, "plan-execution-hints/v1");
  });

  it("rejects unknown options instead of silently ignoring them", () => {
    assert.throws(
      () => execFileSync(process.execPath, [cliPath, "analyze", ".", "--mystery"], { stdio: "pipe" }),
      /Command failed/
    );
  });

  it("reports local diagnostic readiness without enabling external reporting", () => {
    const output = execFileSync(process.execPath, [cliPath, "doctor", ".", "--format=json"], {
      encoding: "utf8",
      env: {
        ...process.env,
        REPO_TEST_ARCHITECT_DIAGNOSTICS: "off"
      }
    });
    const report = JSON.parse(output);

    assert.equal(report.schemaVersion, "doctor-report/v1");
    assert.equal(report.status, "ready");
    assert.equal(report.diagnostics.mode, "off");
    assert.equal(report.diagnostics.externalReporting, false);
  });

  it("renders a sanitized local diagnostic bundle", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-cli-diagnostics-"));
    const filePath = path.join(tempRoot, "diagnostics.jsonl");
    fs.writeFileSync(filePath, `${JSON.stringify({
      schemaVersion: "diagnostic-event/v1",
      timestamp: "2026-07-24T12:00:00.000Z",
      eventId: "event-00000000-0000-4000-8000-000000000001",
      eventType: "mcp-tool-call",
      serverVersion: "0.2.0",
      toolName: "audit_repo",
      status: "error",
      durationMs: 4,
      errorKind: "internal-error",
      reportId: "report-00000000-0000-4000-8000-000000000002",
      source: "proprietary source",
      token: "secret-token"
    })}\n`);

    const output = execFileSync(
      process.execPath,
      [cliPath, "diagnostic-bundle", "--diagnostics-file", filePath, "--format=json"],
      { encoding: "utf8" }
    );
    const bundle = JSON.parse(output);

    assert.equal(bundle.schemaVersion, "diagnostic-bundle/v1");
    assert.equal(bundle.summary.eventCount, 1);
    assert.equal(bundle.summary.internalErrorCount, 1);
    assert.doesNotMatch(output, /proprietary|secret-token|repo-test-architect-cli-diagnostics/);
  });

  it("lists adapters in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "adapters"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Adapter Registry/);
    assert.match(output, /csharp: supported; ecosystems dotnet; languages csharp/);
    assert.match(output, /javascript: supported; ecosystems javascript; languages javascript, typescript/);
    assert.match(output, /frameworks ava, bun-test, cypress, jest, mocha, node-test, playwright, react-testing-library, supertest, vitest/);
    assert.match(output, /go: supported; ecosystems go; languages go/);
    assert.match(output, /kotlin: supported; ecosystems jvm; languages kotlin, java/);
    assert.match(output, /swift: supported; ecosystems apple, bazel, swift; languages objective-c, swift/);
  });

  it("lists adapters as JSON", () => {
    const output = execFileSync(process.execPath, [cliPath, "adapters", "--format=json"], {
      encoding: "utf8"
    });
    const registry = JSON.parse(output);

    assert.equal(registry.schemaVersion, "adapter-registry/v1");
    assert.equal(registry.adapters[0].id, "javascript");
    assert.equal(registry.adapters[0].maturity, "supported");
    assert.equal(registry.adapters.find((adapter) => adapter.id === "csharp").maturity, "supported");
    assert.equal(registry.adapters.find((adapter) => adapter.id === "go").maturity, "supported");
    assert.equal(registry.adapters.find((adapter) => adapter.id === "kotlin").maturity, "supported");
    assert.equal(registry.adapters.find((adapter) => adapter.id === "swift").maturity, "supported");
    assert.deepEqual(registry.adapters[0].supportedTestFrameworks, [
      "ava",
      "bun-test",
      "cypress",
      "jest",
      "mocha",
      "node-test",
      "playwright",
      "react-testing-library",
      "supertest",
      "vitest"
    ]);
  });

  it("lists project detection rules in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "detect-rules"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Project Detection Rules/);
    assert.match(output, /package\.json: ecosystem javascript; languages javascript, typescript/);
    assert.match(output, /mix\.exs: ecosystem elixir; languages elixir/);
    assert.match(output, /Ignored Directories/);
  });

  it("lists project detection rules as JSON", () => {
    const output = execFileSync(process.execPath, [cliPath, "detect-rules", "--format=json"], {
      encoding: "utf8"
    });
    const rules = JSON.parse(output);

    assert.equal(rules.schemaVersion, "project-detection-rules/v1");
    assert.ok(rules.markers.some((marker) => marker.fileName === "composer.json" && marker.ecosystem === "php"));
    assert.ok(rules.ignoredDirectories.includes("node_modules"));
  });

  it("detects project roots in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "detect", "examples/polyglot-workspace"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Project Detection/);
    assert.match(output, /apps\/android: ecosystems jvm; languages java, kotlin \(supported; adapters: kotlin/);
    assert.match(output, /kotlin matched ecosystems jvm and languages java, kotlin/);
    assert.match(output, /apps\/web: ecosystems javascript; languages javascript, typescript \(supported; adapters: javascript/);
    assert.match(output, /javascript matched ecosystems javascript and languages javascript, typescript/);
    assert.match(output, /services\/api: ecosystems python; languages python \(supported; adapters: python/);
    assert.match(output, /python matched ecosystems python and languages python/);
  });

  it("detects project roots as JSON", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "detect", "examples/polyglot-workspace", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const detection = JSON.parse(output);

    assert.equal(detection.schemaVersion, "project-detection/v1");
    assert.equal(detection.summary.projectCount, 3);
    assert.deepEqual(
      detection.projects.map((project) => `${project.root}:${project.supported}`),
      ["apps/android:true", "apps/web:true", "services/api:true"]
    );
  });

  it("detects project roots with excluded roots", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "detect", "examples/polyglot-workspace", "--exclude-project=apps/**", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const detection = JSON.parse(output);

    assert.deepEqual(
      detection.projects.map((project) => project.root),
      ["services/api"]
    );
    assert.equal(detection.summary.projectCount, 1);
  });

  it("audits detected projects in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "audit-projects", "examples/polyglot-workspace"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Project Audits/);
    assert.match(output, /apps\/android: kotlin \(1 untested, 0 covered but risky, 1 risks\)/);
    assert.match(output, /apps\/web: javascript \(1 untested, 0 covered but risky, 1 risks\)/);
    assert.match(output, /services\/api: python \(1 untested, 0 covered but risky, 1 risks\)/);
  });

  it("audits detected projects as JSON", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "audit-projects", "examples/polyglot-workspace", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const projectAudits = JSON.parse(output);

    assert.equal(projectAudits.schemaVersion, "project-audits/v1");
    assert.equal(projectAudits.summary.auditedProjectCount, 3);
    assert.equal(projectAudits.audits[0].audit.schemaVersion, "audit/v1");
  });

  it("audits detected projects with excluded roots", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "audit-projects", "examples/polyglot-workspace", "--exclude-project", "apps/**", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const projectAudits = JSON.parse(output);

    assert.equal(projectAudits.schemaVersion, "project-audits/v1");
    assert.equal(projectAudits.summary.projectCount, 1);
    assert.deepEqual(projectAudits.audits.map((entry) => entry.projectId), ["services/api"]);
  });

  it("supports changed-since project audit mode", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "audit-projects", "examples/polyglot-workspace", "--changed-since=HEAD", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const projectAudits = JSON.parse(output);

    assert.equal(projectAudits.schemaVersion, "project-audits/v1");
    assert.equal(projectAudits.summary.auditedProjectCount, 3);
    assert.deepEqual(
      projectAudits.audits.map((entry) => ({
        projectId: entry.projectId,
        untested: entry.audit.untestedCandidates,
        coveredButRisky: entry.audit.coveredButRisky,
        skipped: entry.audit.skipped
      })),
      [
        {
          projectId: "apps/android",
          untested: [],
          coveredButRisky: [],
          skipped: []
        },
        {
          projectId: "apps/web",
          untested: [],
          coveredButRisky: [],
          skipped: []
        },
        {
          projectId: "services/api",
          untested: [],
          coveredButRisky: [],
          skipped: []
        }
      ]
    );
  });

  it("summarizes detected project audits in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "summarize-projects", "examples/polyglot-workspace"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Project Audit Summary/);
    assert.match(output, /Audit coverage: complete/);
    assert.match(output, /Untested candidates: 3/);
    assert.match(output, /apps\/android: kotlin, medium confidence, 1 untested/);
    assert.match(output, /apps\/web: javascript, medium confidence, 1 untested/);
    assert.match(output, /services\/api: python, low confidence, 1 untested/);
  });

  it("summarizes detected project audits as JSON", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "summarize-projects", "examples/polyglot-workspace", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const summary = JSON.parse(output);

    assert.equal(summary.schemaVersion, "project-audit-summary/v1");
    assert.equal(summary.summary.untestedCandidateCount, 3);
    assert.deepEqual(summary.projects[0].topCandidateIds, ["src/main/kotlin/CheckoutCalculator.kt"]);
    assert.deepEqual(summary.projects[1].topCandidateIds, ["src/sessionClient.ts"]);
    assert.deepEqual(summary.projects[2].topCandidateIds, ["app.py"]);
  });

  it("ranks detected project candidates in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "rank-projects", "examples/polyglot-workspace"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Project Candidate Ranking/);
    assert.match(output, /Audit coverage: complete/);
    assert.match(output, /Candidates: 3/);
    assert.match(output, /apps\/android: CheckoutCalculator \[apps\/android:src\/main\/kotlin\/CheckoutCalculator\.kt\]/);
    assert.match(output, /services\/api: app \[services\/api:app\.py\]/);
    assert.match(output, /apps\/web: sessionClient \[apps\/web:src\/sessionClient\.ts\]/);
  });

  it("ranks detected project candidates as JSON", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "rank-projects", "examples/polyglot-workspace", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const ranking = JSON.parse(output);

    assert.equal(ranking.schemaVersion, "project-candidate-ranking/v1");
    assert.equal(ranking.summary.candidateCount, 3);
    assert.deepEqual(
      ranking.candidates.map((candidate) => candidate.projectTargetId),
      ["apps/android:src/main/kotlin/CheckoutCalculator.kt", "services/api:app.py", "apps/web:src/sessionClient.ts"]
    );
  });

  it("plans detected project tests in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "plan-projects", "examples/polyglot-workspace"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Project Test Plan/);
    assert.match(output, /Audit coverage: complete/);
    assert.match(output, /Add tests: 3/);
    assert.match(output, /apps\/android: add-test: CheckoutCalculator \[apps\/android:add-test:src\/main\/kotlin\/CheckoutCalculator\.kt\]/);
    assert.match(output, /services\/api: add-test: app \[services\/api:add-test:app\.py\]/);
    assert.match(output, /apps\/web: add-test: sessionClient \[apps\/web:add-test:src\/sessionClient\.ts\]/);
  });

  it("plans detected project tests as JSON", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "plan-projects", "examples/polyglot-workspace", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const plan = JSON.parse(output);

    assert.equal(plan.schemaVersion, "project-test-plan/v1");
    assert.equal(plan.summary.itemCount, 3);
    assert.deepEqual(
      plan.items.map((item) => item.projectItemId),
      ["apps/android:add-test:src/main/kotlin/CheckoutCalculator.kt", "services/api:add-test:app.py", "apps/web:add-test:src/sessionClient.ts"]
    );
  });

  it("emits project plan execution hints with project-qualified context", () => {
    const output = execFileSync(
      process.execPath,
      [
        cliPath,
        "hints-projects",
        "examples/polyglot-workspace",
        "--item=apps/android:add-test:src/main/kotlin/CheckoutCalculator.kt",
        "--format=json"
      ],
      {
        encoding: "utf8"
      }
    );
    const hints = JSON.parse(output);

    assert.equal(hints.schemaVersion, "plan-execution-hints/v1");
    assert.equal(hints.source.schemaVersion, "project-test-plan/v1");
    assert.equal(hints.source.itemCount, 3);
    assert.equal(hints.summary.itemCount, 1);
    assert.equal(hints.items[0].projectId, "apps/android");
    assert.equal(hints.items[0].path, "apps/android/src/main/kotlin/CheckoutCalculator.kt");
  });

  it("supports changed-since project plan mode", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "plan-projects", "examples/polyglot-workspace", "--changed-since=HEAD", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const plan = JSON.parse(output);

    assert.equal(plan.schemaVersion, "project-test-plan/v1");
    assert.equal(plan.summary.itemCount, 0);
    assert.deepEqual(plan.items, []);
  });

  it("emits project findings in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "findings-projects", "examples/polyglot-workspace"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Project Findings/);
    assert.match(output, /Audit coverage: complete/);
    assert.match(output, /Findings: 5 of 5/);
    assert.match(output, /Finding categories: missing-coverage: 3, weak-existing-coverage: 0, misplaced-coverage: 0, low-value-direct-test: 0, blocked-project: 2/);
    assert.match(output, /services\/api: blocked-project, high, priority 9/);
    assert.match(output, /apps\/android: missing-coverage, high, priority 7: CheckoutCalculator/);
    assert.match(output, /Source: src\/main\/kotlin\/CheckoutCalculator\.kt/);
    assert.match(output, /Recommended level: unit/);
    assert.match(output, /Existing tests: none detected/);
    assert.match(output, /Evidence: signals: pure-logic, edge-case-surface\. risk: high\. testability: high\. existing tests: none detected\./);
  });

  it("emits project findings as JSON", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "findings-projects", "examples/polyglot-workspace", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const findings = JSON.parse(output);

    assert.equal(findings.schemaVersion, "project-findings/v1");
    assert.equal(findings.summary.findingCount, 5);
    assert.deepEqual(
      findings.findings.map((finding) => finding.category),
      ["blocked-project", "blocked-project", "missing-coverage", "missing-coverage", "missing-coverage"]
    );
  });

  it("emits project test placement findings in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "placement-projects", "examples/node-vitest-basic"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Test Placement Findings/);
    assert.match(output, /Findings: 1/);
    assert.match(output, /keep: src\/deckParser\.test\.ts \(\. -> \.\)/);
  });

  it("emits project test placement findings as JSON", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "placement-projects", "examples/node-vitest-basic", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const placement = JSON.parse(output);

    assert.equal(placement.schemaVersion, "test-placement-findings/v1");
    assert.deepEqual(
      placement.findings.map((finding) => `${finding.id}:${finding.testFile}`),
      [".:keep:src/deckParser.test.ts:src/deckParser.ts:src/deckParser.test.ts"]
    );
  });

  it("emits split placement findings from an existing project audits file", () => {
    const output = execFileSync(
      process.execPath,
      [
        cliPath,
        "placement-projects",
        "--from-project-audits",
        "examples/split-placement-project-audits.json",
        "--format=json"
      ],
      {
        encoding: "utf8"
      }
    );
    const placement = JSON.parse(output);

    assert.equal(placement.schemaVersion, "test-placement-findings/v1");
    assert.deepEqual(
      placement.findings.map((finding) => `${finding.action}:${finding.currentOwner}->${finding.suggestedOwner}:${finding.testFile}`),
      ["split:apps/main->packages/auth-core:apps/main/tests/authRoute.test.ts"]
    );
  });

  it("emits project stats in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "stats-projects", "examples/polyglot-workspace"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Project Stats/);
    assert.match(output, /Audit coverage: complete/);
    assert.match(output, /Total: 3/);
    assert.match(output, /By language: kotlin: 1 total, 1 audited, 0 unsupported; python: 1 total, 1 audited, 0 unsupported; typescript: 1 total, 1 audited, 0 unsupported/);
    assert.match(output, /Test frameworks: kotlin-test: 1, vitest: 1/);
    assert.match(output, /Target kinds: pure-logic: 2, service: 1/);
    assert.match(output, /Risk levels: high: 3/);
  });

  it("emits project stats as JSON", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "stats-projects", "examples/polyglot-workspace", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const stats = JSON.parse(output);

    assert.equal(stats.schemaVersion, "project-stats/v1");
    assert.equal(stats.summary.auditCoverage, "complete");
    assert.deepEqual(stats.sourceFiles.byLanguage, {
      kotlin: { total: 1, audited: 1, unsupported: 0 },
      python: { total: 1, audited: 1, unsupported: 0 },
      typescript: { total: 1, audited: 1, unsupported: 0 }
    });
    assert.deepEqual(stats.distributions.testCommands, { "gradle test": 1, "npm run test": 1 });
    assert.deepEqual(stats.distributions.targetKinds, { "pure-logic": 2, service: 1 });
    assert.deepEqual(stats.distributions.riskLevels, { high: 3 });
  });

  it("supports changed-since project stats mode", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "stats-projects", "examples/polyglot-workspace", "--changed-since=HEAD", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const stats = JSON.parse(output);

    assert.equal(stats.schemaVersion, "project-stats/v1");
    assert.equal(stats.counts.untestedCandidateCount, 0);
    assert.equal(stats.counts.coveredButRiskyCount, 0);
    assert.equal(stats.counts.skippedTargetCount, 0);
  });

  it("summarizes, ranks, plans, analyzes placement, and collects stats from an existing project audits file", () => {
    const projectAuditsPath = writeTempJson(
      JSON.parse(
        execFileSync(process.execPath, [cliPath, "audit-projects", "examples/polyglot-workspace", "--format=json"], {
          encoding: "utf8"
        })
      )
    );
    const summary = JSON.parse(
      execFileSync(
        process.execPath,
        [cliPath, "summarize-projects", "--from-project-audits", projectAuditsPath, "--format=json"],
        { encoding: "utf8" }
      )
    );
    const ranking = JSON.parse(
      execFileSync(
        process.execPath,
        [cliPath, "rank-projects", "--from-project-audits", projectAuditsPath, "--format=json"],
        { encoding: "utf8" }
      )
    );
    const plan = JSON.parse(
      execFileSync(
        process.execPath,
        [cliPath, "plan-projects", "--from-project-audits", projectAuditsPath, "--format=json"],
        { encoding: "utf8" }
      )
    );
    const placement = JSON.parse(
      execFileSync(
        process.execPath,
        [cliPath, "placement-projects", "--from-project-audits", projectAuditsPath, "--format=json"],
        { encoding: "utf8" }
      )
    );
    const stats = JSON.parse(
      execFileSync(
        process.execPath,
        [cliPath, "stats-projects", "--from-project-audits", projectAuditsPath, "--format=json"],
        { encoding: "utf8" }
      )
    );

    assert.equal(summary.schemaVersion, "project-audit-summary/v1");
    assert.equal(ranking.schemaVersion, "project-candidate-ranking/v1");
    assert.equal(plan.schemaVersion, "project-test-plan/v1");
    assert.equal(plan.summary.itemCount, 3);
    assert.equal(placement.schemaVersion, "test-placement-findings/v1");
    assert.equal(placement.findings.length, 0);
    assert.equal(stats.schemaVersion, "project-stats/v1");
    assert.equal(stats.counts.untestedCandidateCount, 3);
  });

  it("emits project audits from an existing project audits file", () => {
    const projectAuditsPath = writeTempJson(
      JSON.parse(
        execFileSync(process.execPath, [cliPath, "audit-projects", "examples/polyglot-workspace", "--format=json"], {
          encoding: "utf8"
        })
      )
    );
    const jsonOutput = execFileSync(
      process.execPath,
      [cliPath, "audit-projects", "--from-project-audits", projectAuditsPath, "--format=json"],
      { encoding: "utf8" }
    );
    const markdownOutput = execFileSync(
      process.execPath,
      [cliPath, "audit-projects", "--from-project-audits", projectAuditsPath],
      { encoding: "utf8" }
    );
    const projectAudits = JSON.parse(jsonOutput);

    assert.equal(projectAudits.schemaVersion, "project-audits/v1");
    assert.equal(projectAudits.summary.auditedProjectCount, 3);
    assert.match(markdownOutput, /^# Project Audits/);
    assert.match(markdownOutput, /apps\/android: kotlin \(1 untested, 0 covered but risky, 1 risks\)/);
    assert.match(markdownOutput, /apps\/web: javascript \(1 untested, 0 covered but risky, 1 risks\)/);
    assert.match(markdownOutput, /services\/api: python \(1 untested, 0 covered but risky, 1 risks\)/);
  });

  it("rejects project audits JSON with the wrong schema version", () => {
    const projectAuditsPath = writeTempJson({
      schemaVersion: "project-audits/v0",
      summary: {},
      audits: [],
      skippedProjects: []
    });

    assert.throws(
      () =>
        execFileSync(process.execPath, ["src/cli/index.js", "summarize-projects", "--from-project-audits", projectAuditsPath], {
          encoding: "utf8",
          stdio: "pipe"
        }),
      /Command failed/
    );
  });

  it("emits markdown by default", () => {
    const output = execFileSync(process.execPath, [cliPath, "audit", fixturePath], {
      encoding: "utf8"
    });

    assert.match(output, /^# Repository Test Audit/);
    assert.match(output, /## Untested Candidates/);
    assert.match(output, /evidence strengths: direct: 1/);
  });

  it("emits JSON when requested", () => {
    const output = execFileSync(process.execPath, [cliPath, "audit", fixturePath, "--format", "json"], {
      encoding: "utf8"
    });
    const audit = JSON.parse(output);

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.testFrameworks, ["vitest"]);
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["authService"]
    );
    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.name),
      ["deckParser"]
    );
  });

  it("emits JSON with equals-style format option", () => {
    const output = execFileSync(process.execPath, [cliPath, "audit", fixturePath, "--format=json"], {
      encoding: "utf8"
    });
    const audit = JSON.parse(output);

    assert.equal(audit.profile.testCommand, "npm run test");
  });

  it("uses an explicit adapter for non-default audit commands", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "audit", "examples/kotlin-junit-basic", "--adapter", "kotlin", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const audit = JSON.parse(output);

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.languages, ["java", "kotlin"]);
    assert.equal(audit.profile.testCommand, "gradle test");
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["MoneyFormatter"]
    );
  });

  it("audits the supported Rust fixture through the CLI", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "audit", "examples/rust-cargo-basic", "--adapter=rust", "--format=json"],
      { encoding: "utf8" }
    );
    const audit = JSON.parse(output);

    assert.equal(audit.profile.testCommand, "cargo test");
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/service.rs"]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/parser.rs", "src/validator.rs"]);
  });

  it("audits the supported C# project-pair fixture through the CLI", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "audit", "examples/csharp-sdk-project-pair", "--adapter=csharp", "--format=json"],
      { encoding: "utf8" }
    );
    const audit = JSON.parse(output);

    assert.equal(audit.profile.testCommand, "dotnet test tests/CheckoutRules.Tests/CheckoutRules.Tests.csproj");
    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), [
      "src/CheckoutRules/CheckoutService.cs",
      "src/CheckoutRules/DiscountCalculator.cs"
    ]);
  });

  it("passes explicit Go build targets through single-project audits", () => {
    const output = execFileSync(process.execPath, [
      cliPath,
      "audit",
      "examples/go-build-target-basic",
      "--adapter=go",
      "--goos=darwin",
      "--goarch=arm64",
      "--go-tag=integration",
      "--format=json"
    ], { encoding: "utf8" });
    const audit = JSON.parse(output);

    assert.equal(audit.profile.testCommand, "GOOS=darwin GOARCH=arm64 go test -tags=integration ./...");
    assert.deepEqual(audit.profile.blockers, []);
  });

  it("passes explicit Go build targets through repository audits", () => {
    const output = execFileSync(process.execPath, [
      cliPath,
      "audit-projects",
      "examples/go-build-target-basic",
      "--goos",
      "darwin",
      "--goarch",
      "arm64",
      "--go-tag",
      "integration",
      "--format=json"
    ], { encoding: "utf8" });
    const projectAudits = JSON.parse(output);

    assert.equal(
      projectAudits.audits[0].audit.profile.testCommand,
      "GOOS=darwin GOARCH=arm64 go test -tags=integration ./..."
    );
  });

  it("requires complete Go target flags", () => {
    assert.throws(
      () => execFileSync(process.execPath, [
        cliPath,
        "audit",
        "examples/go-build-target-basic",
        "--adapter=go",
        "--goos=darwin"
      ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
      (error) => /requires non-empty --goos and --goarch/.test(error.stderr)
    );
  });

  it("rejects Go target flags when reusing a saved audit artifact", () => {
    assert.throws(
      () => execFileSync(process.execPath, [
        cliPath,
        "plan",
        "--from-audit=evals/expected/go-testing-basic.audit.json",
        "--goos=darwin",
        "--goarch=arm64"
      ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
      (error) => /require a repository scan/.test(error.stderr)
    );
  });

  it("uses an explicit adapter for non-default plan commands", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "plan", "examples/kotlin-junit-basic", "--adapter=kotlin", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const plan = JSON.parse(output);

    assert.equal(plan.schemaVersion, "plan/v1");
    assert.equal(plan.summary.verificationCommand, "gradle test");
    assert.deepEqual(
      plan.items.map((item) => `${item.action}:${item.target}`),
      ["extend-test:CheckoutCalculator", "add-test:MoneyFormatter", "defer:CheckoutRequest"]
    );
  });

  it("reports available adapters when an explicit adapter is unsupported", () => {
    assert.throws(
      () =>
        execFileSync(process.execPath, [cliPath, "audit", fixturePath, "--adapter", "ruby"], {
          encoding: "utf8",
          stdio: "pipe"
        }),
      /Unsupported adapter: ruby\. Available adapters: javascript, csharp, go, kotlin, python, rust, swift\./
    );
  });

  it("supports changed-only audit mode", () => {
    const output = execFileSync(process.execPath, [cliPath, "audit", ".", "--changed", "--format=json"], {
      encoding: "utf8"
    });
    const audit = JSON.parse(output);

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.equal(Array.isArray(audit.recommended), true);
  });

  it("supports changed-only plan mode", () => {
    const output = execFileSync(process.execPath, [cliPath, "plan", ".", "--changed", "--format=json"], {
      encoding: "utf8"
    });
    const plan = JSON.parse(output);

    assert.equal(plan.schemaVersion, "plan/v1");
    assert.equal(Array.isArray(plan.items), true);
  });

  it("supports changed-since audit mode", () => {
    const output = execFileSync(process.execPath, [cliPath, "audit", ".", "--changed-since", "HEAD", "--format=json"], {
      encoding: "utf8"
    });
    const audit = JSON.parse(output);

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.recommended, []);
  });

  it("supports changed-since plan mode", () => {
    const output = execFileSync(process.execPath, [cliPath, "plan", ".", "--changed-since=HEAD", "--format=json"], {
      encoding: "utf8"
    });
    const plan = JSON.parse(output);

    assert.equal(plan.schemaVersion, "plan/v1");
    assert.deepEqual(plan.items, []);
  });

  it("emits a markdown test plan", () => {
    const output = execFileSync(process.execPath, [cliPath, "plan", fixturePath], {
      encoding: "utf8"
    });

    assert.match(output, /^# Test Plan/);
    assert.match(output, /add-test: authService/);
    assert.match(output, /\[add-test:src\/authService\.ts\]/);
    assert.match(output, /extend-test: deckParser/);
    assert.match(output, /Evidence strengths: direct: 1/);
    assert.match(output, /Evidence usage: asserted: 1/);
  });

  it("emits a JSON test plan", () => {
    const output = execFileSync(process.execPath, [cliPath, "plan", fixturePath, "--format=json"], {
      encoding: "utf8"
    });
    const plan = JSON.parse(output);

    assert.equal(plan.schemaVersion, "plan/v1");
    assert.equal(plan.summary.verificationCommand, "npm run test");
    assert.deepEqual(
      plan.items.map((item) => `${item.action}:${item.target}`),
      ["extend-test:deckParser", "add-test:authService", "defer:userDto"]
    );
  });

  it("emits provider-neutral plan execution hints in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "hints", fixturePath], {
      encoding: "utf8"
    });

    assert.match(output, /^# Plan Execution Hints/);
    assert.match(output, /Source: plan\/v1 \(3 item\(s\)\)/);
    assert.match(output, /deckParser \[extend-test:src\/deckParser\.ts\]: medium complexity; role implementation; serialize/);
    assert.match(output, /Context: target-and-tests; paths src\/deckParser\.ts, src\/deckParser\.test\.ts/);
    assert.match(output, /userDto \[defer:src\/userDto\.ts\]: low complexity; role review/);
  });

  it("filters JSON plan execution hints by stable item id", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "hints", fixturePath, "--item=add-test:src/authService.ts", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const hints = JSON.parse(output);

    assert.equal(hints.schemaVersion, "plan-execution-hints/v1");
    assert.equal(hints.source.itemCount, 3);
    assert.equal(hints.summary.itemCount, 1);
    assert.equal(hints.items[0].planItemId, "add-test:src/authService.ts");
    assert.equal(hints.items[0].recommendedAgentRole, "implementation");
  });

  it("emits a JSON target explanation", () => {
    const output = execFileSync(process.execPath, [cliPath, "explain", fixturePath, "--target", "src/authService.ts", "--format=json"], {
      encoding: "utf8"
    });
    const explanation = JSON.parse(output);

    assert.equal(explanation.schemaVersion, "target-explanation/v1");
    assert.equal(explanation.targetId, "src/authService.ts");
    assert.equal(explanation.recommendation, "test");
    assert.equal(explanation.testLevel, "unit");
  });

  it("emits a JSON candidate ranking", () => {
    const output = execFileSync(process.execPath, [cliPath, "rank", fixturePath, "--format=json"], {
      encoding: "utf8"
    });
    const ranking = JSON.parse(output);

    assert.equal(ranking.schemaVersion, "candidate-ranking/v1");
    assert.deepEqual(
      ranking.candidates.map((candidate) => candidate.targetId),
      ["src/deckParser.ts", "src/authService.ts"]
    );
  });

  it("emits markdown test placement findings", () => {
    const output = execFileSync(process.execPath, [cliPath, "placement", fixturePath, "--owner", "node-vitest-basic"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Test Placement Findings/);
    assert.match(output, /Findings: 1/);
    assert.match(output, /keep: src\/deckParser\.test\.ts \(node-vitest-basic -> node-vitest-basic\)/);
  });

  it("emits JSON test placement findings", () => {
    const output = execFileSync(process.execPath, [cliPath, "placement", fixturePath, "--owner=node-vitest-basic", "--format=json"], {
      encoding: "utf8"
    });
    const placement = JSON.parse(output);

    assert.equal(placement.schemaVersion, "test-placement-findings/v1");
    assert.deepEqual(
      placement.findings.map((finding) => `${finding.action}:${finding.testFile}`),
      ["keep:src/deckParser.test.ts"]
    );
  });

  it("emits a markdown candidate ranking from an existing audit file", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "rank", "--from-audit", "evals/expected/node-vitest-basic.audit.json"],
      {
        encoding: "utf8"
      }
    );

    assert.match(output, /^# Candidate Ranking/);
    assert.match(output, /deckParser \[src\/deckParser\.ts\]/);
    assert.match(output, /Evidence strengths: direct: 1/);
    assert.match(output, /Evidence usage: asserted: 1/);
  });

  it("summarizes long existing-test lists in markdown while preserving JSON evidence", () => {
    const audit = JSON.parse(fs.readFileSync("evals/expected/node-vitest-basic.audit.json", "utf8"));
    const existingTestPaths = Array.from({ length: 7 }, (_, index) => `test/parser-${index + 1}.test.ts`);
    for (const target of [...audit.coveredButRisky, ...audit.recommended]) {
      if (target.id === "src/deckParser.ts") target.existingTestPaths = existingTestPaths;
    }
    const auditPath = writeTempJson(audit);

    const markdown = execFileSync(process.execPath, [cliPath, "rank", "--from-audit", auditPath], {
      encoding: "utf8"
    });
    const json = JSON.parse(execFileSync(
      process.execPath,
      [cliPath, "rank", "--from-audit", auditPath, "--format=json"],
      { encoding: "utf8" }
    ));

    assert.match(markdown, /parser-5\.test\.ts \(\+2 more; full list available in JSON\)/);
    assert.doesNotMatch(markdown, /parser-6\.test\.ts/);
    assert.deepEqual(json.candidates.find((candidate) => candidate.targetId === "src/deckParser.ts").existingTestPaths, existingTestPaths);
  });

  it("emits test placement findings from an existing audit file", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "placement", "--from-audit", "evals/expected/node-vitest-basic.audit.json", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const placement = JSON.parse(output);

    assert.equal(placement.schemaVersion, "test-placement-findings/v1");
    assert.equal(placement.findings[0].testFile, "src/deckParser.test.ts");
  });

  it("emits a markdown target explanation from an existing audit file", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "explain", "--from-audit", "evals/expected/node-vitest-basic.audit.json", "--target=src/userDto.ts"],
      {
        encoding: "utf8"
      }
    );

    assert.match(output, /^# Target Explanation/);
    assert.match(output, /Target ID: src\/userDto\.ts/);
    assert.match(output, /Recommendation: defer/);
  });

  it("shows evidence strengths in covered target explanations", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "explain", "--from-audit", "evals/expected/node-vitest-basic.audit.json", "--target=src/deckParser.ts"],
      { encoding: "utf8" }
    );

    assert.match(output, /Evidence strengths: direct: 1/);
  });

  it("emits a JSON test plan from an existing audit file", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "plan", "--from-audit", "evals/expected/node-vitest-basic.audit.json", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const plan = JSON.parse(output);

    assert.equal(plan.summary.verificationCommand, "npm run test");
    assert.deepEqual(
      plan.items.map((item) => `${item.action}:${item.target}`),
      ["extend-test:deckParser", "add-test:authService", "defer:userDto"]
    );
  });

  it("filters a JSON test plan by stable item id", () => {
    const output = execFileSync(
      process.execPath,
      [cliPath, "plan", fixturePath, "--item", "add-test:src/authService.ts", "--format=json"],
      {
        encoding: "utf8"
      }
    );
    const plan = JSON.parse(output);

    assert.equal(plan.summary.addTestCount, 1);
    assert.equal(plan.summary.extendTestCount, 0);
    assert.equal(plan.summary.deferredCount, 0);
    assert.deepEqual(
      plan.items.map((item) => item.id),
      ["add-test:src/authService.ts"]
    );
  });

  it("rejects unknown plan item ids", () => {
    assert.throws(
      () =>
        execFileSync(process.execPath, [cliPath, "plan", fixturePath, "--item", "add-test:missing.ts"], {
          encoding: "utf8",
          stdio: "pipe"
        }),
      /Command failed/
    );
  });

  it("rejects audit-from-file input for the audit command", () => {
    assert.throws(
      () =>
        execFileSync(process.execPath, [cliPath, "audit", "--from-audit", "evals/expected/node-vitest-basic.audit.json"], {
          encoding: "utf8",
          stdio: "pipe"
        }),
      /Command failed/
    );
  });

  it("rejects unknown explanation target ids", () => {
    assert.throws(
      () =>
        execFileSync(process.execPath, [cliPath, "explain", fixturePath, "--target", "src/missing.ts"], {
          encoding: "utf8",
          stdio: "pipe"
        }),
      /Command failed/
    );
  });

  it("rejects audit JSON with the wrong schema version", () => {
    const auditPath = writeTempJson({
      schemaVersion: "audit/v0",
      profile: {},
      untestedCandidates: [],
      coveredButRisky: [],
      skipped: [],
      risks: []
    });

    assert.throws(
      () =>
        execFileSync(process.execPath, [cliPath, "plan", "--from-audit", auditPath], {
          encoding: "utf8",
          stdio: "pipe"
        }),
      /Command failed/
    );
  });

  it("rejects audit JSON missing required arrays", () => {
    const auditPath = writeTempJson({
      schemaVersion: "audit/v1",
      profile: {}
    });

    assert.throws(
      () =>
        execFileSync(process.execPath, [cliPath, "plan", "--from-audit", auditPath], {
          encoding: "utf8",
          stdio: "pipe"
        }),
      /Command failed/
    );
  });
});

function writeTempJson(value) {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-")), "audit.json");
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
  return filePath;
}
