import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

describe("CI workflow", () => {
  it("runs the release readiness check on supported branches and pull requests", () => {
    const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");

    assert.match(workflow, /branches:\s*\n\s*- master\s*\n\s*- main/);
    assert.match(workflow, /pull_request:/);
    assert.match(workflow, /runs-on: \$\{\{ matrix\.os \}\}/);
    assert.match(workflow, /fail-fast: false/);
    assert.match(workflow, /os:\s*\n\s*- ubuntu-latest\s*\n\s*- macos-latest\s*\n\s*- windows-latest/);
    assert.match(workflow, /node-version: "20"/);
    assert.match(workflow, /run: npm run release:check/);
  });
});
