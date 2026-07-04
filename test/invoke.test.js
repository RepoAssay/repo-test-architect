import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const invokePath = "src/mcp/invoke.js";

describe("MCP invoke entrypoint", () => {
  it("requires a tool name for tool calls", () => {
    assert.throws(
      () =>
        execFileSync(process.execPath, [invokePath, "call"], {
          encoding: "utf8",
          stdio: "pipe"
        }),
      (error) => {
        assert.match(error.stderr, /Tool name is required/);
        return true;
      }
    );
  });

  it("requires a path after @ args-file syntax", () => {
    assert.throws(
      () =>
        execFileSync(process.execPath, [invokePath, "call", "audit_repo", "@"], {
          encoding: "utf8",
          stdio: "pipe"
        }),
      (error) => {
        assert.match(error.stderr, /Tool args file path is required after @/);
        return true;
      }
    );
  });

  it("reads tool args from a file and emits JSON", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-invoke-"));
    const argsPath = path.join(tempDir, "args.json");
    fs.writeFileSync(argsPath, JSON.stringify({ repoRoot: "./examples/node-vitest-basic" }), "utf8");

    try {
      const output = execFileSync(process.execPath, [invokePath, "call", "audit_repo", `@${argsPath}`], {
        encoding: "utf8"
      });
      const audit = JSON.parse(output);

      assert.equal(audit.schemaVersion, "audit/v1");
      assert.deepEqual(audit.profile.testFrameworks, ["vitest"]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
