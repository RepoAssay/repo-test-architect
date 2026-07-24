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

  it("keeps the feature request issue form aligned with audit-first product decisions", () => {
    const template = fs.readFileSync(".github/ISSUE_TEMPLATE/feature_request.yml", "utf8");

    assert.match(template, /name: Feature request/);
    assert.match(template, /audit, adapter, MCP, evaluation, or reporting improvements/);
    assert.match(template, /id: repo-shape/);
    assert.match(template, /label: Target Repository Shape/);
    assert.match(template, /id: desired-audit-output/);
    assert.match(template, /audit, ranking, plan, placement, stats, or MCP artifact/);
    assert.match(template, /id: non-goals/);
    assert.match(template, /Do not generate direct DTO tests or UI tests without an existing convention/);
    assert.match(template, /fixture added, golden snapshots updated, model-consistency scenario added, npm run release:check passes/);
    assert.match(template, /adapter-boundary concerns/);
  });

  it("keeps support questions structured and free of sensitive repository data", () => {
    const template = fs.readFileSync(".github/ISSUE_TEMPLATE/support_question.yml", "utf8");

    assert.match(template, /name: Support question/);
    assert.match(template, /CLI usage, MCP setup, audit artifacts, or adapter behavior/);
    assert.match(template, /id: goal/);
    assert.match(template, /id: command/);
    assert.match(template, /id: repo-shape/);
    assert.match(template, /id: output/);
    assert.match(template, /credentials, private source, proprietary artifacts, prompts, environment values, and machine-local paths/);
  });

  it("routes issue creation through structured support and private security channels", () => {
    const config = fs.readFileSync(".github/ISSUE_TEMPLATE/config.yml", "utf8");
    const status = fs.readFileSync("docs/status.md", "utf8");

    assert.match(config, /blank_issues_enabled: false/);
    assert.match(config, /contact_links:/);
    assert.match(config, /security\/advisories\/new/);
    assert.match(config, /blob\/master\/SUPPORT\.md/);
    assert.match(status, /GitHub issue template config/);
    assert.match(status, /structured support questions/);
  });

  it("keeps Dependabot version updates grouped and bounded", () => {
    const dependabot = fs.readFileSync(".github/dependabot.yml", "utf8");

    assert.match(dependabot, /package-ecosystem: npm/);
    assert.match(dependabot, /interval: monthly/);
    assert.match(dependabot, /timezone: Europe\/Stockholm/);
    assert.match(dependabot, /open-pull-requests-limit: 3/);
    assert.match(dependabot, /production-minor-patch:/);
    assert.match(dependabot, /dependency-type: production/);
  });
});
