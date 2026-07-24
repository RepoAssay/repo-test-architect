#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mcpServerInfo } from "../src/mcp/server-info.js";
import { mcpTools } from "../src/mcp/tool-definitions.js";

const registrySchemaUrl = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const requiredPublicFiles = ["LICENSE", "README.md", "SECURITY.md", "SUPPORT.md", "docs/distribution.md"];
const requiredBins = ["repo-test-architect", "repo-test-architect-mcp", "repo-test-architect-mcp-invoke"];

if (isMainModule()) {
  const publishMode = process.argv.includes("--publish");
  const jsonMode = process.argv.includes("--json");
  const report = inspectDistributionReadiness();

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!report.preparationReady) {
    console.error(`Distribution preparation blockers: ${report.preparationBlockers.join(", ")}`);
  } else if (publishMode && !report.localPublishReady) {
    console.error(`Distribution publish blockers: ${report.publishBlockers.join(", ")}`);
  } else {
    const suffix = report.localPublishReady
      ? "local publish metadata ready; manual checks remain"
      : `publish blockers: ${report.publishBlockers.join(", ")}`;
    console.log(`Distribution preparation check passed (${suffix}).`);
  }

  if (!report.preparationReady || (publishMode && !report.localPublishReady)) {
    process.exitCode = 1;
  }
}

export function inspectDistributionReadiness(options = {}) {
  const root = path.resolve(options.root ?? path.dirname(fileURLToPath(new URL("../package.json", import.meta.url))));
  const packageJson = options.packageJson ?? readJson(path.join(root, "package.json"));
  const serverPath = path.join(root, "server.json");
  const serverManifest = options.serverManifest ?? (fs.existsSync(serverPath) ? readJson(serverPath) : undefined);
  const tools = options.tools ?? mcpTools;
  const fileExists = options.fileExists ?? ((filePath) => fs.existsSync(path.join(root, filePath)));
  const preparationChecks = [
    check("public-files", requiredPublicFiles.every(fileExists), "Required public documentation and policy files exist."),
    check(
      "stable-binaries",
      requiredBins.every((binName) => typeof packageJson.bin?.[binName] === "string"),
      "Stable CLI and MCP binaries are declared."
    ),
    check(
      "verification-scripts",
      ["release:check", "pack:check", "bin:check", "installed-package:check"].every(
        (scriptName) => typeof packageJson.scripts?.[scriptName] === "string"
      ),
      "Release, package, binary, and clean-install checks are declared."
    ),
    check("license-alignment", packageJson.license === "MIT" && fileExists("LICENSE"), "MIT metadata matches the license file."),
    check(
      "mcp-tool-metadata",
      tools.length > 0 && tools.every(hasSafeReadOnlyMetadata),
      "Every MCP tool has a title and explicit read-only, repeatable, closed-world annotations."
    )
  ];
  const npmPackage = serverManifest?.packages?.find((entry) => entry.registryType === "npm");
  const publishChecks = [
    check("package-public", packageJson.private === false, "package.json explicitly permits publication."),
    check("repository-metadata", hasRepositoryMetadata(packageJson), "Repository, homepage, and issue URLs are final."),
    check(
      "mcp-package-metadata",
      Array.isArray(packageJson.keywords) && packageJson.keywords.includes("mcp") && isRegistryName(packageJson.mcpName),
      "The npm package declares an MCP keyword and a GitHub-owned registry name."
    ),
    check(
      "runtime-server-identity",
      mcpServerInfo.name === packageJson.name && mcpServerInfo.version === packageJson.version,
      "The runtime MCP server name and version match package.json."
    ),
    check("server-manifest", Boolean(serverManifest), "server.json exists."),
    check(
      "server-schema",
      serverManifest?.$schema === registrySchemaUrl,
      `server.json uses the current pinned registry schema: ${registrySchemaUrl}`
    ),
    check(
      "server-identity",
      serverManifest?.name === packageJson.mcpName && nonEmpty(serverManifest?.title) && nonEmpty(serverManifest?.description),
      "The server name matches package.json mcpName and has public display metadata."
    ),
    check(
      "server-version",
      serverManifest?.version === packageJson.version && npmPackage?.version === packageJson.version,
      "The server and npm package versions match package.json."
    ),
    check(
      "server-npm-package",
      npmPackage?.registryBaseUrl === "https://registry.npmjs.org" &&
        npmPackage?.identifier === packageJson.name &&
        npmPackage?.transport?.type === "stdio" &&
        hasMcpPackageArgument(npmPackage),
      "server.json points to this npm package over stdio and selects its MCP command."
    ),
    check(
      "server-repository",
      serverManifest?.repository?.source === "github" &&
        nonEmpty(serverManifest?.repository?.id) &&
        normalizeRepositoryUrl(serverManifest?.repository?.url) === normalizeRepositoryUrl(repositoryUrl(packageJson)),
      "server.json and package.json point to the same GitHub repository and record its stable repository id."
    )
  ];
  const preparationBlockers = failedIds(preparationChecks);
  const publishBlockers = [...preparationBlockers, ...failedIds(publishChecks)];

  return {
    schemaVersion: "distribution-readiness/v1",
    package: {
      name: packageJson.name,
      version: packageJson.version,
      private: packageJson.private === true
    },
    preparationReady: preparationBlockers.length === 0,
    localPublishReady: publishBlockers.length === 0,
    preparationChecks,
    publishChecks,
    preparationBlockers,
    publishBlockers,
    manualPublishChecks: [
      "Confirm the GitHub repository is public.",
      "Confirm the npm package name is still available and authenticate with npm.",
      "Verify the copyright owner in LICENSE.",
      "Authenticate mcp-publisher with the intended GitHub identity.",
      "Approve each irreversible npm and MCP Registry publication."
    ]
  };
}

function check(id, passed, detail) {
  return { id, status: passed ? "pass" : "blocker", detail };
}

function failedIds(checks) {
  return checks.filter((entry) => entry.status === "blocker").map((entry) => entry.id);
}

function hasSafeReadOnlyMetadata(tool) {
  return (
    nonEmpty(tool.title) &&
    tool.annotations?.readOnlyHint === true &&
    tool.annotations?.destructiveHint === false &&
    tool.annotations?.idempotentHint === true &&
    tool.annotations?.openWorldHint === false
  );
}

function hasRepositoryMetadata(packageJson) {
  return (
    /^https:\/\/github\.com\//.test(repositoryUrl(packageJson) ?? "") &&
    /^https:\/\/github\.com\//.test(packageJson.homepage ?? "") &&
    /^https:\/\/github\.com\//.test(packageJson.bugs?.url ?? "")
  );
}

function repositoryUrl(packageJson) {
  return typeof packageJson.repository === "string" ? packageJson.repository : packageJson.repository?.url;
}

function normalizeRepositoryUrl(value) {
  return typeof value === "string" ? value.replace(/^git\+/, "").replace(/\.git$/, "").replace(/\/$/, "") : undefined;
}

function isRegistryName(value) {
  return typeof value === "string" && /^io\.github\.[a-z0-9-]+\/[a-z0-9._-]+$/.test(value);
}

function hasMcpPackageArgument(npmPackage) {
  return (
    npmPackage?.packageArguments?.length === 1 &&
    npmPackage.packageArguments[0]?.type === "positional" &&
    npmPackage.packageArguments[0]?.value === "mcp"
  );
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
