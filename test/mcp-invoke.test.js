import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { expectedMcpToolNames } from "./support/mcp-tools.js";

const invokePath = "src/mcp/invoke.js";

describe("MCP invoke harness", () => {
  it("lists MCP-style tool descriptors", () => {
    const output = execFileSync(process.execPath, [invokePath, "tools"], {
      encoding: "utf8"
    });
    const payload = JSON.parse(output);

    assert.deepEqual(payload.tools.map((tool) => tool.name), expectedMcpToolNames);
  });

  it("calls a tool with JSON args", () => {
    const output = execFileSync(
      process.execPath,
      [invokePath, "call", "audit_repo", JSON.stringify({ repoRoot: "./examples/node-vitest-basic" })],
      {
        encoding: "utf8"
      }
    );
    const audit = JSON.parse(output);

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.testFrameworks, ["vitest"]);
  });

  it("calls a tool with JSON args from a file", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-mcp-"));
    const argsPath = path.join(tempDir, "args.json");
    fs.writeFileSync(argsPath, JSON.stringify({ repoRoot: "./examples/node-vitest-basic" }), "utf8");

    const output = execFileSync(process.execPath, [invokePath, "call", "audit_repo", `@${argsPath}`], {
      encoding: "utf8"
    });
    const audit = JSON.parse(output);

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.packageManagers, ["npm"]);
  });

  it("calls a project tool with checked-in artifact args", () => {
    const output = execFileSync(
      process.execPath,
      [invokePath, "call", "summarize_project_audits", "@./examples/mcp/polyglot-project-audits.args.json"],
      {
        encoding: "utf8"
      }
    );
    const summary = JSON.parse(output);

    assert.equal(summary.schemaVersion, "project-audit-summary/v1");
    assert.equal(summary.summary.auditCoverage, "partial");
    assert.equal(summary.summary.projectCount, 3);
  });

  it("calls placement tools with JSON args", () => {
    const audit = {
      schemaVersion: "audit/v1",
      profile: {},
      untestedCandidates: [],
      coveredButRisky: [],
      skipped: [],
      risks: []
    };
    const projectAudits = {
      schemaVersion: "project-audits/v1",
      root: ".",
      summary: {
        projectCount: 0,
        auditedProjectCount: 0,
        skippedProjectCount: 0
      },
      audits: [],
      skippedProjects: []
    };
    const placementOutput = execFileSync(
      process.execPath,
      [invokePath, "call", "analyze_test_placement", JSON.stringify({ audit })],
      {
        encoding: "utf8"
      }
    );
    const projectPlacementOutput = execFileSync(
      process.execPath,
      [invokePath, "call", "analyze_project_test_placement", JSON.stringify({ projectAudits })],
      {
        encoding: "utf8"
      }
    );

    assert.equal(JSON.parse(placementOutput).schemaVersion, "test-placement-findings/v1");
    assert.equal(JSON.parse(projectPlacementOutput).schemaVersion, "test-placement-findings/v1");
  });

  it("calls a tool with an MCP-style response envelope", () => {
    const output = execFileSync(
      process.execPath,
      [invokePath, "call-envelope", "audit_repo", JSON.stringify({ repoRoot: "./examples/node-vitest-basic" })],
      {
        encoding: "utf8"
      }
    );
    const result = JSON.parse(output);
    const audit = JSON.parse(result.content[0].text);

    assert.equal(result.content[0].type, "text");
    assert.equal(audit.schemaVersion, "audit/v1");
  });

  it("rejects invalid JSON args", () => {
    assert.throws(
      () =>
        execFileSync(process.execPath, [invokePath, "call", "audit_repo", "{"], {
          encoding: "utf8",
          stdio: "pipe"
        }),
      /Command failed/
    );
  });
});
