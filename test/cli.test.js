import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
});
