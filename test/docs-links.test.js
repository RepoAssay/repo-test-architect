import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { getProjectDetectionRules } from "../src/core/project-detector.js";

describe("docs links", () => {
  it("keeps README doc links valid", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const links = [...readme.matchAll(/\]\((docs\/[^)]+)\)/g)].map((match) => match[1]);

    assert.ok(links.length > 0);

    for (const link of links) {
      assert.ok(fs.existsSync(path.resolve(link)), `Missing README doc link: ${link}`);
    }
  });

  it("keeps docs free of local machine paths", () => {
    const markdownFiles = fs
      .readdirSync("docs")
      .filter((fileName) => fileName.endsWith(".md"))
      .map((fileName) => path.join("docs", fileName));

    for (const filePath of ["README.md", ...markdownFiles]) {
      const contents = fs.readFileSync(filePath, "utf8");

      assert.doesNotMatch(contents, /C:\/Users\/[^/\s]+/i, `Local Windows user path leaked in ${filePath}`);
      assert.doesNotMatch(contents, /C:\\Users\\[^\\\s]+/i, `Local Windows user path leaked in ${filePath}`);
      assert.doesNotMatch(contents, /\/Users\/[^/\s]+\/(source|repos|projects)/i, `Local Unix user path leaked in ${filePath}`);
    }
  });

  it("keeps README MCP script examples complete", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const mcpScripts = Object.keys(packageJson.scripts).filter((script) => script.startsWith("mcp:"));

    for (const script of mcpScripts) {
      assert.ok(readme.includes(`npm run ${script}`), `Missing README MCP script example: ${script}`);
    }
  });

  it("keeps README CLI script examples complete", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const cliScripts = Object.entries(packageJson.scripts)
      .filter(([, command]) => command.startsWith("node ./src/cli/index.js"))
      .map(([script]) => script);

    for (const script of cliScripts) {
      assert.ok(readme.includes(`npm run ${script}`), `Missing README CLI script example: ${script}`);
    }
  });

  it("keeps MCP install docs aligned with package name and binaries", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const clientConfig = fs.readFileSync("docs/mcp-client-config.md", "utf8");
    const releaseChecklist = fs.readFileSync("docs/release-checklist.md", "utf8");

    assert.ok(clientConfig.includes(`npm install -g ${packageJson.name}`));
    assert.ok(clientConfig.includes('"command": "repo-test-architect-mcp"'));

    for (const binName of Object.keys(packageJson.bin)) {
      assert.ok(releaseChecklist.includes(`\`${binName}\``), `Missing release checklist binary: ${binName}`);
    }
  });

  it("keeps project detection docs aligned with detector rules", () => {
    const docs = fs.readFileSync("docs/project-detection.md", "utf8");
    const rules = getProjectDetectionRules();

    for (const marker of rules.markers) {
      const label = marker.fileName ?? `*${marker.extension ?? marker.directoryExtension}`;
      assert.ok(docs.includes(`\`${label}\``), `Missing documented project marker: ${label}`);
      assert.ok(docs.includes(`\`${marker.ecosystem}\``), `Missing documented ecosystem: ${marker.ecosystem}`);
      for (const language of marker.languages) {
        assert.ok(docs.includes(`\`${language}\``), `Missing documented language: ${language}`);
      }
    }

    for (const directory of rules.ignoredDirectories) {
      assert.ok(docs.includes(`\`${directory}\``), `Missing documented ignored directory: ${directory}`);
    }
  });

  it("documents future test placement findings", () => {
    const projectPlan = fs.readFileSync("docs/project-plan.md", "utf8");
    const adapterContract = fs.readFileSync("docs/adapter-contract.md", "utf8");

    assert.ok(projectPlan.includes("Test Placement Direction"));
    assert.ok(projectPlan.includes("move or split"));
    assert.ok(adapterContract.includes("Test Placement Findings"));
    assert.ok(adapterContract.includes("move"));
    assert.ok(adapterContract.includes("split"));
    assert.ok(adapterContract.includes("keep"));
  });

  it("documents public readiness separately from npm publishing", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const publicReadiness = fs.readFileSync("docs/public-readiness.md", "utf8");
    const status = fs.readFileSync("docs/status.md", "utf8");

    assert.ok(readme.includes("[Public readiness](docs/public-readiness.md)"));
    assert.ok(publicReadiness.includes("Ready To Show"));
    assert.ok(publicReadiness.includes("Not Ready To Publish"));
    assert.ok(publicReadiness.includes("package remains `private: true`"));
    assert.ok(publicReadiness.includes("final public repository URL is not configured"));
    assert.ok(publicReadiness.includes("native test generation is still deferred"));
    assert.ok(publicReadiness.includes("real MCP SDK transport wrapper is still pending"));
    assert.ok(publicReadiness.includes("confirm the license file and copyright owner"));
    assert.ok(publicReadiness.includes("Avoid presenting native test generation as available"));
    assert.ok(status.includes("public-readiness checklist"));
  });

  it("documents the first public demo path without claiming generation readiness", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const demoScript = fs.readFileSync("docs/demo-script.md", "utf8");
    const publicReadiness = fs.readFileSync("docs/public-readiness.md", "utf8");
    const status = fs.readFileSync("docs/status.md", "utf8");

    assert.ok(readme.includes("[Demo script](docs/demo-script.md)"));
    assert.ok(demoScript.includes("test strategy decisions before writing tests"));
    assert.ok(demoScript.includes("Native generation is intentionally deferred"));
    assert.ok(demoScript.includes("npm run audit:example"));
    assert.ok(demoScript.includes("npm run rank:example"));
    assert.ok(demoScript.includes("npm run plan:example"));
    assert.ok(demoScript.includes("npm run detect:example"));
    assert.ok(demoScript.includes("npm run audit-projects:example"));
    assert.ok(demoScript.includes("npm run stats-projects:example"));
    assert.ok(demoScript.includes("npm run mcp:tools"));
    assert.ok(demoScript.includes("npm run model-consistency:check"));
    assert.ok(demoScript.includes("The tool is useful before it generates a single test"));
    assert.ok(publicReadiness.includes("[Demo Script](demo-script.md)"));
    assert.ok(status.includes("demo script for showing audit quality"));
  });

  it("records architecture and scope decisions for future traceability", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const decisionLog = fs.readFileSync("docs/decision-log.md", "utf8");
    const status = fs.readFileSync("docs/status.md", "utf8");

    assert.ok(readme.includes("[Decision log](docs/decision-log.md)"));
    assert.ok(decisionLog.includes("Audit Graph First"));
    assert.ok(decisionLog.includes("JavaScript And TypeScript First"));
    assert.ok(decisionLog.includes("Polyglot Detection Before Universal Adapters"));
    assert.ok(decisionLog.includes("Local Stdio MCP First"));
    assert.ok(decisionLog.includes("Native Generation Deferred"));
    assert.ok(decisionLog.includes("Public Demo Before Package Release"));
    assert.ok(decisionLog.includes("Local-First Stats Before Telemetry"));
    assert.ok(decisionLog.includes("Revisit when:"));
    assert.ok(status.includes("decision log for audit-first architecture"));
  });

  it("documents the acceptance gate for a second adapter spike", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const adapterContract = fs.readFileSync("docs/adapter-contract.md", "utf8");
    const secondAdapterSpike = fs.readFileSync("docs/second-adapter-spike.md", "utf8");
    const status = fs.readFileSync("docs/status.md", "utf8");

    assert.ok(readme.includes("[Second adapter spike](docs/second-adapter-spike.md)"));
    assert.ok(adapterContract.includes("[Second Adapter Spike](second-adapter-spike.md)"));
    assert.ok(secondAdapterSpike.includes("Kotlin/JVM with Gradle and JUnit"));
    assert.ok(secondAdapterSpike.includes("Swift Package Manager with XCTest or Swift Testing"));
    assert.ok(secondAdapterSpike.includes("reuse the shared audit model"));
    assert.ok(secondAdapterSpike.includes("produce golden audit and plan snapshots"));
    assert.ok(secondAdapterSpike.includes("model-consistency scenario"));
    assert.ok(secondAdapterSpike.includes("native test generation"));
    assert.ok(secondAdapterSpike.includes("npm run release:check"));
    assert.ok(status.includes("second-adapter spike checklist"));
  });
});
