import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

describe("GitHub templates", () => {
  it("keeps the pull request template aligned with audit and release verification expectations", () => {
    const template = fs.readFileSync(".github/pull_request_template.md", "utf8");

    assert.match(template, /^## Summary$/m);
    assert.match(template, /^## Audit Impact$/m);
    assert.match(template, /No audit behavior changed/);
    assert.match(template, /snapshots\/model-consistency scenarios were updated intentionally/);
    assert.match(template, /`npm run release:check`/);
    assert.match(template, /^## Risk Notes$/m);
  });

  it("keeps the bug report issue form aligned with audit debugging context", () => {
    const template = fs.readFileSync(".github/ISSUE_TEMPLATE/bug_report.yml", "utf8");

    assert.match(template, /name: Bug report/);
    assert.match(template, /Report incorrect audit, planning, MCP, or release-check behavior/);
    assert.match(template, /id: repo-shape/);
    assert.match(template, /label: Repository Shape/);
    assert.match(template, /id: command/);
    assert.match(template, /CLI, MCP invoke, or release check command/);
    assert.match(template, /id: artifact-excerpt/);
    assert.match(template, /audit, plan, project-audits, model-consistency, or MCP output excerpt/);
    assert.match(template, /npm run release:check/);
    assert.match(template, /label: Risk Notes/);
  });
});
