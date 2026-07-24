import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");

describe("CI workflow", () => {
  it("keeps one stable Linux PR gate and a full post-merge release check", () => {
    assert.match(workflow, /pull_request:/);
    assert.match(workflow, /branches:\s*\n\s*- master/);
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /name: pr-gate\s*\n\s*if: \$\{\{ always\(\) && github\.event_name == 'pull_request' \}\}/);
    assert.match(workflow, /name: Require successful path classification\s*\n\s*if: needs\.classify\.result != 'success'\s*\n\s*run: exit 1/);
    assert.match(workflow, /name: release check\s*\n\s*if: github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'/);
    assert.match(workflow, /run: npm run alpha:check/);
    assert.match(workflow, /run: npm run release:check/);
  });

  it("classifies PR paths before spending cross-platform runner minutes", () => {
    assert.match(workflow, /node scripts\/classify-ci-paths\.js >> "\$GITHUB_OUTPUT"/);
    assert.match(workflow, /needs\.classify\.outputs\.docs_only == 'true'/);
    assert.match(workflow, /needs\.classify\.outputs\.release == 'true'/);
    assert.match(workflow, /needs\.classify\.outputs\.windows == 'true'/);
    assert.match(workflow, /needs\.classify\.outputs\.macos == 'true'/);
    assert.match(workflow, /runs-on: windows-latest/);
    assert.match(workflow, /runs-on: macos-latest/);
  });

  it("uses cancellable PR concurrency, least privilege, immutable actions, and reproducible installs", () => {
    assert.match(workflow, /contents: read\s*\n\s*pull-requests: read/);
    assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
    assert.ok(!workflow.includes("actions/checkout@v"));
    assert.ok(!workflow.includes("actions/setup-node@v"));
    assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1/);
    assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7\.0\.0/);
    assert.match(workflow, /node-version: "20"/);
    assert.match(workflow, /cache: npm/);
    assert.match(workflow, /persist-credentials: false/);
    assert.match(workflow, /run: npm ci/);
    assert.ok(!workflow.includes("npm install"));
  });
});
