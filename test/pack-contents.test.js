import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { allowedTopLevelEntries, requiredFiles } from "../scripts/check-pack-contents.js";

describe("package contents", () => {
  it("keeps npm pack dry-run contents within the runtime allowlist", () => {
    const output = execFileSync(process.execPath, ["scripts/check-pack-contents.js"], {
      encoding: "utf8"
    });

    assert.match(output, /^Pack contents check passed \(\d+ files\)\./);
  });

  it("requires the top-level license file", () => {
    assert.ok(allowedTopLevelEntries.has("LICENSE"));
    assert.ok(requiredFiles.includes("LICENSE"));
  });

  it("requires check script dependencies needed by packaged release verification", () => {
    assert.ok(requiredFiles.includes("scripts/check-bin-entrypoints.js"));
    assert.ok(requiredFiles.includes("scripts/check-demo-script.js"));
    assert.ok(requiredFiles.includes("scripts/check-installed-package.js"));
    assert.ok(requiredFiles.includes("scripts/check-mcp-stdio-smoke.js"));
    assert.ok(requiredFiles.includes("scripts/check-smoke.js"));
    assert.ok(requiredFiles.includes("scripts/check-release-readiness.js"));
    assert.ok(requiredFiles.includes("scripts/support/npm-runner.js"));
  });
});
