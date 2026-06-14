import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const cliPath = "src/cli/index.js";
const fixturePath = "examples/node-vitest-basic";

describe("CLI", () => {
  it("detects project roots in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "detect", "examples/polyglot-workspace"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Project Detection/);
    assert.match(output, /apps\/android: java, kotlin \(unsupported; adapters: none available/);
    assert.match(output, /apps\/web: javascript, typescript \(supported; adapters: javascript/);
    assert.match(output, /services\/api: python \(unsupported; adapters: none available/);
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
      ["apps/android:false", "apps/web:true", "services/api:false"]
    );
  });

  it("audits detected projects in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "audit-projects", "examples/polyglot-workspace"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Project Audits/);
    assert.match(output, /apps\/web: javascript \(1 untested, 0 covered but risky, 1 risks\)/);
    assert.match(output, /services\/api: No registered adapter supports this project's detected languages/);
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
    assert.equal(projectAudits.summary.auditedProjectCount, 1);
    assert.equal(projectAudits.audits[0].audit.schemaVersion, "audit/v1");
  });

  it("summarizes detected project audits in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "summarize-projects", "examples/polyglot-workspace"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Project Audit Summary/);
    assert.match(output, /Untested candidates: 1/);
    assert.match(output, /apps\/web: javascript, medium confidence, 1 untested/);
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
    assert.equal(summary.summary.untestedCandidateCount, 1);
    assert.deepEqual(summary.projects[0].topCandidateIds, ["src/sessionClient.ts"]);
  });

  it("ranks detected project candidates in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "rank-projects", "examples/polyglot-workspace"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Project Candidate Ranking/);
    assert.match(output, /Candidates: 1/);
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
    assert.equal(ranking.summary.candidateCount, 1);
    assert.deepEqual(
      ranking.candidates.map((candidate) => candidate.projectTargetId),
      ["apps/web:src/sessionClient.ts"]
    );
  });

  it("plans detected project tests in markdown", () => {
    const output = execFileSync(process.execPath, [cliPath, "plan-projects", "examples/polyglot-workspace"], {
      encoding: "utf8"
    });

    assert.match(output, /^# Project Test Plan/);
    assert.match(output, /Add tests: 1/);
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
    assert.equal(plan.summary.itemCount, 1);
    assert.deepEqual(
      plan.items.map((item) => item.projectItemId),
      ["apps/web:add-test:src/sessionClient.ts"]
    );
  });

  it("summarizes, ranks, and plans from an existing project audits file", () => {
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

    assert.equal(summary.schemaVersion, "project-audit-summary/v1");
    assert.equal(ranking.schemaVersion, "project-candidate-ranking/v1");
    assert.equal(plan.schemaVersion, "project-test-plan/v1");
    assert.equal(plan.summary.itemCount, 1);
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
    assert.equal(projectAudits.summary.auditedProjectCount, 1);
    assert.match(markdownOutput, /^# Project Audits/);
    assert.match(markdownOutput, /apps\/web: javascript \(1 untested, 0 covered but risky, 1 risks\)/);
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
