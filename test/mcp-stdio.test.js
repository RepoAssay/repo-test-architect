import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const stdioPath = "src/mcp/stdio.js";

describe("MCP stdio scaffold", () => {
  it("handles newline-delimited JSON-RPC requests", () => {
    const request = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    };
    const result = spawnSync(process.execPath, [stdioPath], {
      input: `${JSON.stringify(request)}\n`,
      encoding: "utf8"
    });

    assert.equal(result.status, 0);

    const response = JSON.parse(result.stdout.trim());
    assert.equal(response.id, 1);
    assert.deepEqual(
      response.result.tools.map((tool) => tool.name),
      ["audit_repo", "get_audit_graph", "generate_test_plan", "explain_target", "rank_test_candidates", "generate_selected_test"]
    );
  });

  it("returns parse errors for invalid JSON lines", () => {
    const result = spawnSync(process.execPath, [stdioPath], {
      input: "{\n",
      encoding: "utf8"
    });

    assert.equal(result.status, 0);

    const response = JSON.parse(result.stdout.trim());
    assert.equal(response.error.code, -32700);
  });
});
