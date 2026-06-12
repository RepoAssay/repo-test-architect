import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const cliPath = "src/cli/index.js";
const fixturePath = "examples/node-vitest-basic";

describe("CLI", () => {
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
