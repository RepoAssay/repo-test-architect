import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

const invokePath = "src/mcp/invoke.js";

describe("MCP invoke harness", () => {
  it("lists MCP-style tool descriptors", () => {
    const output = execFileSync(process.execPath, [invokePath, "tools"], {
      encoding: "utf8"
    });
    const payload = JSON.parse(output);

    assert.deepEqual(
      payload.tools.map((tool) => tool.name),
      ["audit_repo", "get_audit_graph", "generate_test_plan", "explain_target", "rank_test_candidates"]
    );
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
