#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNpmInvocation } from "./support/npm-runner.js";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (isMainModule()) {
  runInstalledPackageCheck();
}

export function runInstalledPackageCheck() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-pack-"));
  const packageDir = path.join(tempRoot, "package");
  fs.mkdirSync(packageDir);

  const npm = resolveNpmInvocation();
  const tarballName = packTarball(npm, packageDir);
  const tarballPath = path.join(packageDir, tarballName);
  const installDir = path.join(tempRoot, "install");
  fs.mkdirSync(installDir);
  fs.writeFileSync(path.join(installDir, "package.json"), JSON.stringify({ private: true }, null, 2));

  execNpm(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath], { cwd: installDir });

  const binDir = path.join(installDir, "node_modules", ".bin");
  const cliOutput = execInstalledBin(binDir, "repo-test-architect", ["adapters", "--format", "json"]);
  const cliArtifact = JSON.parse(cliOutput);

  assertEqual(cliArtifact.schemaVersion, "adapter-registry/v1", "installed CLI adapter registry schema version");
  assertTrue(cliArtifact.adapters.some((adapter) => adapter.id === "javascript"), "installed CLI should list javascript");

  const doctorOutput = execInstalledBin(binDir, "repo-test-architect", ["doctor", ".", "--format", "json"]);
  const doctorArtifact = JSON.parse(doctorOutput);

  assertEqual(doctorArtifact.schemaVersion, "doctor-report/v1", "installed CLI doctor report schema version");
  assertEqual(doctorArtifact.diagnostics.externalReporting, false, "installed CLI doctor external reporting");

  const invokeOutput = execInstalledBin(binDir, "repo-test-architect-mcp-invoke", ["tools"]);
  const invokeArtifact = JSON.parse(invokeOutput);

  assertTrue(invokeArtifact.tools.some((tool) => tool.name === "audit_repo"), "installed MCP invoke should list audit_repo");

  const stdioRequest = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`;
  const stdioOutput = execInstalledBin(binDir, "repo-test-architect-mcp", [], { input: stdioRequest });
  const stdioResponse = JSON.parse(stdioOutput.trim());

  assertEqual(stdioResponse.id, 1, "installed MCP stdio response id");
  assertTrue(
    stdioResponse.result?.tools?.some((tool) => tool.name === "audit_repo"),
    "installed MCP stdio should list audit_repo"
  );

  console.log(`Installed package check passed (${packageJson.name}@${packageJson.version}).`);
}

function packTarball(npm, cwd) {
  const output = execNpm(npm, ["pack", root, "--json"], { cwd });
  const [pack] = JSON.parse(output);

  if (!pack?.filename) {
    throw new Error("npm pack did not return a tarball filename.");
  }

  return pack.filename;
}

function execInstalledBin(binDir, binName, args, options = {}) {
  return execFileSync(resolveBinPath(binDir, binName), args, {
    cwd: binDir,
    encoding: "utf8",
    input: options.input,
    shell: process.platform === "win32",
    stdio: options.input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"]
  });
}

function resolveBinPath(binDir, binName) {
  const platformPath = path.join(binDir, process.platform === "win32" ? `${binName}.cmd` : binName);
  if (fs.existsSync(platformPath)) return platformPath;

  return path.join(binDir, binName);
}

function execNpm(npm, args, options) {
  return execFileSync(npm.command, [...npm.args, ...args], {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
