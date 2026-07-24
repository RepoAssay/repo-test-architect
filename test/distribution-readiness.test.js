import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, it } from "node:test";
import { inspectDistributionReadiness } from "../scripts/check-distribution-readiness.js";
import { mcpTools } from "../src/mcp/tool-definitions.js";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

describe("distribution readiness", () => {
  it("passes the reversible preparation gate while publication remains blocked", () => {
    const report = inspectDistributionReadiness();

    assert.equal(report.schemaVersion, "distribution-readiness/v1");
    assert.equal(report.preparationReady, true);
    assert.equal(report.localPublishReady, false);
    assert.deepEqual(report.preparationBlockers, []);
    assert.deepEqual(report.publishBlockers, ["package-public"]);
    assert.ok(report.manualPublishChecks.some((entry) => entry.includes("npm")));
    assert.ok(report.manualPublishChecks.some((entry) => entry.includes("public")));
  });

  it("accepts an internally aligned public npm and MCP Registry manifest", () => {
    const publicPackage = {
      ...packageJson,
      private: false,
      name: "repo-test-architect",
      version: "0.1.0",
      mcpName: "io.github.m-stenbe/repo-test-architect",
      repository: {
        type: "git",
        url: "https://github.com/m-stenbe/repo-test-architect.git"
      },
      homepage: "https://github.com/m-stenbe/repo-test-architect#readme",
      bugs: {
        url: "https://github.com/m-stenbe/repo-test-architect/issues"
      },
      keywords: [...packageJson.keywords, "mcp"]
    };
    const serverManifest = {
      $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
      name: publicPackage.mcpName,
      title: "Repo Test Architect",
      description: publicPackage.description,
      repository: {
        url: "https://github.com/m-stenbe/repo-test-architect",
        source: "github",
        id: "1285319114"
      },
      version: publicPackage.version,
      packages: [
        {
          registryType: "npm",
          registryBaseUrl: "https://registry.npmjs.org",
          identifier: publicPackage.name,
          version: publicPackage.version,
          transport: {
            type: "stdio"
          },
          packageArguments: [
            {
              type: "positional",
              value: "mcp"
            }
          ]
        }
      ]
    };
    const report = inspectDistributionReadiness({
      packageJson: publicPackage,
      serverManifest,
      tools: mcpTools
    });

    assert.equal(report.preparationReady, true);
    assert.equal(report.localPublishReady, true);
    assert.deepEqual(report.publishBlockers, []);
  });

  it("exposes a successful preparation command and a failing publish command", () => {
    const preparationOutput = execFileSync(process.execPath, ["scripts/check-distribution-readiness.js"], {
      encoding: "utf8"
    });

    assert.match(preparationOutput, /^Distribution preparation check passed \(publish blockers:/);
    assert.throws(
      () => execFileSync(process.execPath, ["scripts/check-distribution-readiness.js", "--publish"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }),
      (error) => error.status === 1 && /Distribution publish blockers:/.test(error.stderr)
    );
  });
});
