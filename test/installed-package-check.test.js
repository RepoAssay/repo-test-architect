import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

describe("installed package check", () => {
  it("packs, installs, and boots every published binary and the registry MCP command", () => {
    const output = execFileSync(process.execPath, ["scripts/check-installed-package.js"], {
      encoding: "utf8"
    });

    assert.match(output, /^Installed package check passed \(repo-test-architect@0\.3\.0\)\./);
  });
});
