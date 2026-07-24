#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (isMainModule()) {
  const paths = fs
    .readFileSync(0, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  const classification = classifyCiPaths(paths);

  process.stdout.write(
    [
      `docs_only=${classification.docsOnly}`,
      `release=${classification.release}`,
      `windows=${classification.windows}`,
      `macos=${classification.macos}`,
      "",
    ].join("\n")
  );
}

export function classifyCiPaths(inputPaths) {
  const paths = [...new Set(inputPaths.map(normalizePath).filter(Boolean))];

  return {
    docsOnly: paths.length > 0 && paths.every(isDocumentationPath),
    release: paths.some(isReleasePath),
    windows: paths.some(isWindowsPortabilityPath),
    macos: paths.some(isMacosSwiftPath),
  };
}

function normalizePath(value) {
  return typeof value === "string" ? value.trim().replaceAll("\\", "/").replace(/^\.\//, "") : "";
}

function isDocumentationPath(filePath) {
  return (
    filePath.endsWith(".md") ||
    filePath.startsWith("docs/") ||
    filePath.startsWith(".github/ISSUE_TEMPLATE/") ||
    filePath === ".github/pull_request_template.md"
  );
}

function isReleasePath(filePath) {
  return (
    filePath === "package.json" ||
    filePath === "package-lock.json" ||
    filePath === "server.json" ||
    filePath.startsWith(".github/workflows/") ||
    filePath.startsWith("schemas/") ||
    filePath.startsWith("scripts/") ||
    filePath.startsWith("src/cli/") ||
    filePath.startsWith("src/mcp/")
  );
}

function isWindowsPortabilityPath(filePath) {
  return (
    filePath === "package.json" ||
    filePath === "package-lock.json" ||
    filePath === "server.json" ||
    filePath.startsWith(".github/workflows/") ||
    filePath.startsWith("schemas/") ||
    filePath.startsWith("scripts/") ||
    filePath.startsWith("src/")
  );
}

function isMacosSwiftPath(filePath) {
  return (
    filePath === "package.json" ||
    filePath === "package-lock.json" ||
    filePath.startsWith(".github/workflows/") ||
    filePath === "scripts/classify-ci-paths.js" ||
    filePath.startsWith("src/adapters/swift/") ||
    filePath === "test/swift-audit.test.js" ||
    /^(examples|evals)\/.*(swift|apple|vapor)/.test(filePath)
  );
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
