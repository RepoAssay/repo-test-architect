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
    assert.ok(allowedTopLevelEntries.has("server.json"));
    assert.ok(requiredFiles.includes("server.json"));
  });

  it("requires check script dependencies needed by packaged release verification", () => {
    assert.ok(requiredFiles.includes("src/diagnostics/diagnostics.js"));
    assert.ok(requiredFiles.includes("src/adapters/go/audit.js"));
    assert.ok(requiredFiles.includes("docs/go-experimental-support.md"));
    assert.ok(requiredFiles.includes("examples/go-testing-basic/go.mod"));
    assert.ok(requiredFiles.includes("schemas/diagnostic-event-v1.schema.json"));
    assert.ok(requiredFiles.includes("schemas/doctor-report-v1.schema.json"));
    assert.ok(requiredFiles.includes("schemas/diagnostic-bundle-v1.schema.json"));
    assert.ok(requiredFiles.includes("schemas/validation-corpus-v1.schema.json"));
    assert.ok(requiredFiles.includes("schemas/validation-scorecard-v1.schema.json"));
    assert.ok(requiredFiles.includes("evals/validation-corpus.json"));
    assert.ok(requiredFiles.includes("scripts/check-validation-corpus.js"));
    assert.ok(requiredFiles.includes("scripts/render-validation-scorecard.js"));
    assert.ok(requiredFiles.includes("scripts/check-javascript-performance.js"));
    assert.ok(requiredFiles.includes("scripts/check-bin-entrypoints.js"));
    assert.ok(requiredFiles.includes("scripts/check-demo-script.js"));
    assert.ok(requiredFiles.includes("scripts/check-distribution-readiness.js"));
    assert.ok(requiredFiles.includes("scripts/check-installed-package.js"));
    assert.ok(requiredFiles.includes("scripts/check-mcp-stdio-smoke.js"));
    assert.ok(requiredFiles.includes("scripts/check-smoke.js"));
    assert.ok(requiredFiles.includes("scripts/check-release-readiness.js"));
    assert.ok(requiredFiles.includes("scripts/support/npm-runner.js"));
  });
});
