import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { releaseChecks } from "../scripts/check-release-readiness.js";
import { alphaChecks } from "../scripts/check-alpha-readiness.js";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

describe("package manifest", () => {
  it("keeps the package private until release readiness is complete", () => {
    assert.equal(packageJson.private, true);
  });

  it("locks the approved npm, MCP, and GitHub identities without enabling publication", () => {
    assert.equal(packageJson.name, "repo-test-architect");
    assert.equal(packageJson.mcpName, "io.github.repoassay/repo-test-architect");
    assert.deepEqual(packageJson.repository, {
      type: "git",
      url: "https://github.com/repoassay/repo-test-architect.git"
    });
    assert.equal(packageJson.homepage, "https://github.com/repoassay/repo-test-architect#readme");
    assert.deepEqual(packageJson.bugs, {
      url: "https://github.com/repoassay/repo-test-architect/issues"
    });
  });

  it("includes the approved MCP positioning without framework-specific claims", () => {
    assert.deepEqual(packageJson.keywords, ["testing", "audit", "agent", "mcp", "strategy"]);
    assert.ok(!packageJson.keywords.includes("swift"));
    assert.ok(!packageJson.keywords.includes("kotlin"));
    assert.ok(!packageJson.keywords.includes("jest"));
    assert.ok(!packageJson.keywords.includes("vitest"));
  });

  it("declares the supported Node runtime floor", () => {
    assert.equal(packageJson.engines.node, ">=20");
  });

  it("declares the official MCP SDK runtime dependency for stdio transport", () => {
    assert.match(packageJson.dependencies["@modelcontextprotocol/sdk"], /^\^1\./);
  });

  it("keeps stable CLI and MCP binary entry points", () => {
    assert.deepEqual(Object.keys(packageJson.bin).sort(), [
      "repo-test-architect",
      "repo-test-architect-mcp",
      "repo-test-architect-mcp-invoke",
    ]);
    assert.equal(packageJson.bin["repo-test-architect"], "./src/cli/package-entry.js");

    for (const [name, binPath] of Object.entries(packageJson.bin)) {
      assert.ok(fs.existsSync(binPath), `Missing bin entry point for ${name}: ${binPath}`);
      assert.match(fs.readFileSync(binPath, "utf8"), /^#!\/usr\/bin\/env node/, `Missing node shebang for ${name}`);
    }
  });

  it("keeps publish contents focused on runtime, docs, schemas, fixtures, and scripts", () => {
    assert.deepEqual(packageJson.files, [
      "SECURITY.md",
      "SUPPORT.md",
      "server.json",
      "docs/",
      "evals/",
      "examples/",
      "schemas/",
      "scripts/",
      "src/",
    ]);
    assert.ok(!packageJson.files.includes("test/"));
  });

  it("exposes package verification scripts", () => {
    assert.equal(packageJson.scripts["pack:dry-run"], "npm pack --dry-run");
    assert.ok(packageJson.scripts.test);
    assert.equal(packageJson.scripts.smoke, "node ./scripts/check-smoke.js");
    assert.ok(packageJson.scripts["eval:check"]);
    assert.ok(packageJson.scripts["model-consistency:check"]);
    assert.ok(packageJson.scripts["model-consistency:json"]);
    assert.ok(packageJson.scripts["model-consistency:compare"]);
    assert.ok(packageJson.scripts["model-consistency:compare:profiles"]);
    assert.ok(packageJson.scripts["model-consistency:stats"]);
    assert.equal(packageJson.scripts["demo:check"], "node ./scripts/check-demo-script.js");
    assert.equal(packageJson.scripts["mcp:smoke"], "node ./scripts/check-mcp-stdio-smoke.js");
    assert.ok(packageJson.scripts["pack:check"]);
    assert.ok(packageJson.scripts["bin:check"]);
    assert.equal(packageJson.scripts["installed-package:check"], "node ./scripts/check-installed-package.js");
    assert.equal(packageJson.scripts["distribution:check"], "node ./scripts/check-distribution-readiness.js");
    assert.equal(packageJson.scripts["distribution:check:publish"], "node ./scripts/check-distribution-readiness.js --publish");
    assert.equal(packageJson.scripts["alpha:check"], "node ./scripts/check-alpha-readiness.js");
    assert.ok(packageJson.scripts["release:check"]);
  });

  it("keeps the private-alpha gate focused on audit trust rather than package publishing", () => {
    const alphaRunner = fs.readFileSync("scripts/check-alpha-readiness.js", "utf8");

    assert.deepEqual(alphaChecks, [
      "test",
      "eval:check",
      "model-consistency:check",
      "demo:check",
      "mcp:smoke",
    ]);
    assert.match(alphaRunner, /Alpha readiness check passed/);
    assert.ok(!alphaChecks.includes("pack:check"));
    assert.ok(!alphaChecks.includes("installed-package:check"));
  });

  it("keeps release readiness checks aligned with public demo verification", () => {
    const releaseRunner = fs.readFileSync("scripts/check-release-readiness.js", "utf8");
    const status = fs.readFileSync("docs/status.md", "utf8");
    const expectedChecks = [
      "test",
      "eval:check",
      "model-consistency:check",
      "demo:check",
      "mcp:smoke",
      "smoke",
      "pack:check",
      "bin:check",
      "installed-package:check",
      "distribution:check",
    ];

    assert.deepEqual(releaseChecks, expectedChecks);
    assert.match(releaseRunner, /Release readiness check passed/);
    assert.ok(status.includes("demo path"));
  });

  it("documents package dry-run verification in project status", () => {
    const status = fs.readFileSync("docs/status.md", "utf8");
    const releaseChecklist = fs.readFileSync("docs/release-checklist.md", "utf8");

    assert.ok(status.includes("npm run pack:dry-run"));
    assert.ok(status.includes("npm run mcp:smoke"));
    assert.ok(status.includes("npm run pack:check"));
    assert.ok(status.includes("npm run bin:check"));
    assert.ok(status.includes("npm run installed-package:check"));
    assert.ok(status.includes("npm run release:check"));
    assert.ok(releaseChecklist.includes("npm run mcp:smoke"));
    assert.ok(releaseChecklist.includes("npm run installed-package:check"));
    assert.ok(releaseChecklist.includes("npm run distribution:check"));
  });

  it("keeps smoke checks aligned with packaged release verification scripts", () => {
    const smoke = fs.readFileSync("scripts/smoke.ps1", "utf8");
    const nodeSmoke = fs.readFileSync("scripts/check-smoke.js", "utf8");

    assert.ok(smoke.includes("scripts/check-pack-contents.js"));
    assert.ok(smoke.includes("scripts/check-bin-entrypoints.js"));
    assert.ok(smoke.includes("scripts/check-demo-script.js"));
    assert.ok(smoke.includes("scripts/check-distribution-readiness.js"));
    assert.ok(smoke.includes("scripts/check-installed-package.js"));
    assert.ok(smoke.includes("scripts/check-mcp-stdio-smoke.js"));
    assert.ok(smoke.includes("scripts/check-release-readiness.js"));
    assert.ok(smoke.includes("scripts/support/npm-runner.js"));
    assert.ok(nodeSmoke.includes("scripts/check-pack-contents.js"));
    assert.ok(nodeSmoke.includes("scripts/check-bin-entrypoints.js"));
    assert.ok(nodeSmoke.includes("scripts/check-demo-script.js"));
    assert.ok(nodeSmoke.includes("scripts/check-distribution-readiness.js"));
    assert.ok(nodeSmoke.includes("scripts/check-installed-package.js"));
    assert.ok(nodeSmoke.includes("scripts/check-mcp-stdio-smoke.js"));
    assert.ok(nodeSmoke.includes("scripts/check-release-readiness.js"));
    assert.ok(nodeSmoke.includes("scripts/support/npm-runner.js"));
  });
});
