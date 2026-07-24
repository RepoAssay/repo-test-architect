import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { expectedMcpToolNames } from "./support/mcp-tools.js";

const stdioPath = "src/mcp/stdio.js";

describe("MCP SDK stdio server", () => {
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

  it("ignores invalid JSON lines at the SDK transport boundary", () => {
    const result = spawnSync(process.execPath, [stdioPath], {
      input: "{\n",
      encoding: "utf8"
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "");
  });

  it("does not answer JSON-RPC batch lines", () => {
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
    assert.equal(result.stdout.trim(), "");
  });

  it("returns structured tool errors over stdio", () => {
    const request = {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "audit_repo",
        arguments: {
          repoRoot: ".",
          changedPaths: [""]
        }
      }
    };
    const result = spawnSync(process.execPath, [stdioPath], {
      input: `${JSON.stringify(request)}\n`,
      encoding: "utf8"
    });

    assert.equal(result.status, 0);

    const response = JSON.parse(result.stdout.trim());
    assert.equal(response.id, 4);
    assert.equal(response.error.code, -32000);
    assert.equal(response.error.data.kind, "invalid-arguments");
    assert.equal(response.error.data.toolName, "audit_repo");
    assert.equal(response.error.data.argument, "changedPaths");
  });

  it("emits opt-in allowlisted diagnostics to stderr while keeping stdout as JSON-RPC", () => {
    const request = {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "audit_repo",
        arguments: {
          repoRoot: "secret/repository/path",
          changedPaths: [""],
          source: "proprietary source"
        }
      }
    };
    const result = spawnSync(process.execPath, [stdioPath], {
      input: `${JSON.stringify(request)}\n`,
      encoding: "utf8",
      env: {
        ...process.env,
        REPO_TEST_ARCHITECT_DIAGNOSTICS: "stderr"
      }
    });

    assert.equal(result.status, 0);
    const response = JSON.parse(result.stdout.trim());
    const event = JSON.parse(result.stderr.trim());

    assert.equal(response.id, 5);
    assert.equal(response.error.data.kind, "unsupported-argument");
    assert.equal(event.schemaVersion, "diagnostic-event/v1");
    assert.equal(event.toolName, "audit_repo");
    assert.equal(event.status, "error");
    assert.equal(event.errorKind, "unsupported-argument");
    assert.doesNotMatch(result.stderr, /secret\/repository|proprietary|changedPaths/);
  });
});
