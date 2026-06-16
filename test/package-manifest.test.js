import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

describe("package manifest", () => {
  it("keeps the package private until release readiness is complete", () => {
    assert.equal(packageJson.private, true);
  });

  it("declares the supported Node runtime floor", () => {
    assert.equal(packageJson.engines.node, ">=20");
  });

  it("keeps stable CLI and MCP binary entry points", () => {
    assert.deepEqual(Object.keys(packageJson.bin).sort(), [
      "repo-test-architect",
      "repo-test-architect-mcp",
      "repo-test-architect-mcp-invoke",
    ]);

    for (const [name, binPath] of Object.entries(packageJson.bin)) {
      assert.ok(fs.existsSync(binPath), `Missing bin entry point for ${name}: ${binPath}`);
      assert.match(fs.readFileSync(binPath, "utf8"), /^#!\/usr\/bin\/env node/, `Missing node shebang for ${name}`);
    }
  });

  it("keeps publish contents focused on runtime, docs, schemas, fixtures, and scripts", () => {
    assert.deepEqual(packageJson.files, ["docs/", "evals/", "examples/", "schemas/", "scripts/", "src/"]);
    assert.ok(!packageJson.files.includes("test/"));
  });

  it("exposes package verification scripts", () => {
    assert.equal(packageJson.scripts["pack:dry-run"], "npm pack --dry-run");
    assert.ok(packageJson.scripts.test);
    assert.ok(packageJson.scripts.smoke);
    assert.ok(packageJson.scripts["eval:check"]);
    assert.ok(packageJson.scripts["model-consistency:check"]);
    assert.ok(packageJson.scripts["model-consistency:json"]);
    assert.ok(packageJson.scripts["model-consistency:compare"]);
    assert.ok(packageJson.scripts["model-consistency:stats"]);
  });

  it("documents package dry-run verification in project status", () => {
    const status = fs.readFileSync("docs/status.md", "utf8");

    assert.ok(status.includes("npm run pack:dry-run"));
  });
});
