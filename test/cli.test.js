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
});
