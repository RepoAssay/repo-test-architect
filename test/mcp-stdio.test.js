import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { expectedMcpToolNames } from "./support/mcp-tools.js";

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
    assert.deepEqual(response.result.tools.map((tool) => tool.name), expectedMcpToolNames);
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

  it("handles JSON-RPC batch lines", () => {
    const batch = [
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list"
      },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "missing/method"
      }
    ];
    const result = spawnSync(process.execPath, [stdioPath], {
      input: `${JSON.stringify(batch)}\n`,
      encoding: "utf8"
    });

    assert.equal(result.status, 0);

    const response = JSON.parse(result.stdout.trim());
    assert.equal(response.length, 2);
    assert.equal(response[0].id, 2);
    assert.equal(response[1].error.code, -32601);
  });
});
