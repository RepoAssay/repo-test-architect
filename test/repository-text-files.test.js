import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { getProjectDetectionRules } from "../src/core/project-detector.js";
import {
  DEFAULT_IGNORED_DIRECTORY_NAMES,
  normalizeChangedPath,
  normalizePlatformSeparators,
  normalizeRepositoryPath,
  readRepositoryTextFiles
} from "../src/core/repository-text-files.js";

describe("repository text-file kernel", () => {
  it("applies caller-owned traversal policies and returns sorted UTF-8 records", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-text-files-"));
    fs.mkdirSync(path.join(root, "ignored"), { recursive: true });
    fs.mkdirSync(path.join(root, "nested", "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "z.txt"), "z\n");
    fs.writeFileSync(path.join(root, "src", "a.txt"), "å\n");
    fs.writeFileSync(path.join(root, "src", "skip.json"), "{}\n");
    fs.writeFileSync(path.join(root, "ignored", "hidden.txt"), "hidden\n");
    fs.writeFileSync(path.join(root, "nested", "owner.marker"), "owner\n");
    fs.writeFileSync(path.join(root, "nested", "src", "nested.txt"), "nested\n");
    fs.symlinkSync(path.join(root, "src", "a.txt"), path.join(root, "linked.txt"));

    const pruned = [];
    const files = readRepositoryTextFiles(root, {
      ignoredDirectoryNames: new Set(["ignored"]),
      shouldPruneDirectory({ absolutePath, relativePath, depth }) {
        const shouldPrune = fs.existsSync(path.join(absolutePath, "owner.marker"));
        if (shouldPrune) pruned.push({ relativePath, depth });
        return shouldPrune;
      },
      shouldIncludeFile: ({ relativePath }) => relativePath.endsWith(".txt"),
      symbolicLinks: "skip"
    });

    assert.deepEqual(files, [
      { path: "src/a.txt", content: "å\n" },
      { path: "z.txt", content: "z\n" }
    ]);
    assert.deepEqual(pruned, [{ relativePath: "nested", depth: 1 }]);
  });

  it("owns the default ignore list that project detection publishes", () => {
    assert.deepEqual(getProjectDetectionRules().ignoredDirectories, [...DEFAULT_IGNORED_DIRECTORY_NAMES].sort());

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-text-files-defaults-"));
    for (const directory of ["node_modules", "vendor", "src"]) {
      fs.mkdirSync(path.join(root, directory));
      fs.writeFileSync(path.join(root, directory, "a.txt"), `${directory}\n`);
    }
    const files = readRepositoryTextFiles(root, { shouldIncludeFile: () => true });
    assert.deepEqual(files.map((file) => file.path), ["src/a.txt"]);
  });

  it("can keep backslashes in POSIX file names when only platform separators are converted", { skip: process.platform === "win32" }, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-text-files-separators-"));
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(path.join(root, "src", "a\\b.txt"), "ab\n");
    const read = (options) => readRepositoryTextFiles(root, { shouldIncludeFile: () => true, ...options }).map((file) => file.path);

    assert.deepEqual(read({}), ["src/a/b.txt"]);
    assert.deepEqual(read({ toRepositoryPath: normalizePlatformSeparators }), ["src/a\\b.txt"]);
  });

  it("normalizes repository and changed paths portably", () => {
    assert.equal(normalizeRepositoryPath("src\\Feature.php"), "src/Feature.php");
    assert.equal(normalizeChangedPath("C:\\repo", "C:\\repo\\src\\Feature.php"), "src/Feature.php");
    assert.equal(normalizeChangedPath("/repo", "/repo/src/Feature.php"), "src/Feature.php");
    assert.equal(normalizeChangedPath("/repo", ".\\src\\Feature.php"), "src/Feature.php");
  });

  it("rejects missing inclusion policy and unsupported symlink behavior", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-text-files-options-"));
    assert.throws(() => readRepositoryTextFiles(root, {}), /requires shouldIncludeFile/);
    assert.throws(
      () => readRepositoryTextFiles(root, { shouldIncludeFile: () => true, symbolicLinks: "follow" }),
      /supports only symbolicLinks: skip/
    );
  });

  it("reads only regular files so FIFOs and other special entries cannot block traversal", { skip: process.platform === "win32" }, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-text-files-"));
    fs.writeFileSync(path.join(root, "a.txt"), "a\n");
    execFileSync("mkfifo", [path.join(root, "block.txt")]);

    const files = readRepositoryTextFiles(root, {
      shouldIncludeFile: ({ relativePath }) => relativePath.endsWith(".txt")
    });

    assert.deepEqual(files, [{ path: "a.txt", content: "a\n" }]);
  });
});
