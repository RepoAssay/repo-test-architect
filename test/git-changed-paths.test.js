import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  parseGitStatusPorcelainZ,
  readGitChangedPathsSince,
  readGitWorkingTreeChangedPaths
} from "../src/core/git-changed-paths.js";

const cliPath = path.resolve("src/cli/index.js");

describe("git changed paths", () => {
  it("parses porcelain status entries, resolving renames to their new path", () => {
    const output = [
      " M src/unstaged.js",
      "M  src/staged.js",
      "R  src/new-name.js",
      "src/old-name.js",
      "?? src/with space.js",
      ""
    ].join("\0");

    assert.deepEqual(parseGitStatusPorcelainZ(output), [
      "src/unstaged.js",
      "src/staged.js",
      "src/new-name.js",
      "src/with space.js"
    ]);
  });

  it("reads unstaged, staged, renamed, untracked, and spaced working-tree paths", () => {
    const repo = createRepo({
      "src/unstaged.js": "export const a = 1;\n",
      "src/staged.js": "export const b = 1;\n",
      "src/old-name.js": "export const c = 1;\n"
    });
    fs.writeFileSync(path.join(repo, "src/unstaged.js"), "export const a = 2;\n");
    fs.writeFileSync(path.join(repo, "src/staged.js"), "export const b = 2;\n");
    git(repo, "add", "src/staged.js");
    git(repo, "mv", "src/old-name.js", "src/new-name.js");
    fs.mkdirSync(path.join(repo, "src/fresh"));
    fs.writeFileSync(path.join(repo, "src/fresh/with space.js"), "export const d = 1;\n");

    assert.deepEqual(readGitWorkingTreeChangedPaths(repo).sort(), [
      "src/fresh/with space.js",
      "src/new-name.js",
      "src/staged.js",
      "src/unstaged.js"
    ]);
  });

  it("reports working-tree paths relative to a subdirectory root and drops paths outside it", () => {
    const repo = createRepo({
      "packages/app/src/index.js": "export const a = 1;\n",
      "README.md": "root\n"
    });
    fs.writeFileSync(path.join(repo, "packages/app/src/index.js"), "export const a = 2;\n");
    fs.writeFileSync(path.join(repo, "README.md"), "changed\n");

    assert.deepEqual(readGitWorkingTreeChangedPaths(path.join(repo, "packages/app")), ["src/index.js"]);
  });

  it("reports changed-since paths relative to a subdirectory root and drops paths outside it", () => {
    const repo = createRepo({
      "packages/app/src/index.js": "export const a = 1;\n",
      "README.md": "root\n"
    });
    const base = git(repo, "rev-parse", "HEAD").trim();
    fs.writeFileSync(path.join(repo, "packages/app/src/index.js"), "export const a = 2;\n");
    fs.writeFileSync(path.join(repo, "README.md"), "changed\n");
    commitAll(repo, "change");

    assert.deepEqual(readGitChangedPathsSince(path.join(repo, "packages/app"), base), ["src/index.js"]);
    assert.deepEqual(readGitChangedPathsSince(repo, base).sort(), ["README.md", "packages/app/src/index.js"]);
  });

  it("handles audited roots whose directory name starts with whitespace", () => {
    const repo = createRepo({
      " app/src/index.js": "export const a = 1;\n",
      "app/src/index.js": "export const b = 1;\n"
    });
    const base = git(repo, "rev-parse", "HEAD").trim();
    fs.writeFileSync(path.join(repo, " app/src/index.js"), "export const a = 2;\n");
    fs.writeFileSync(path.join(repo, "app/src/index.js"), "export const b = 2;\n");

    assert.deepEqual(readGitWorkingTreeChangedPaths(path.join(repo, " app")), ["src/index.js"]);
    commitAll(repo, "change");
    assert.deepEqual(readGitChangedPathsSince(path.join(repo, " app"), base), ["src/index.js"]);
    assert.deepEqual(readGitWorkingTreeChangedPaths(path.join(repo, "app")), []);
  });

  it("lists many untracked files without exceeding the subprocess output buffer", () => {
    const repo = createRepo({ "README.md": "root\n" });
    const generated = path.join(repo, "generated", "x".repeat(100));
    fs.mkdirSync(generated, { recursive: true });
    for (let index = 0; index < 12000; index += 1) {
      fs.writeFileSync(path.join(generated, `file-${index}.js`), "");
    }

    assert.equal(readGitWorkingTreeChangedPaths(repo).length, 12000);
  });

  it("rejects option-shaped refs instead of passing them to git", () => {
    const repo = createRepo({ "README.md": "root\n" });
    const outputPath = path.join(repo, "injected");

    assert.throws(() => readGitChangedPathsSince(repo, `--output=${outputPath}`), /invalid Git ref/);
    assert.deepEqual(fs.readdirSync(repo).filter((name) => name.startsWith("injected")), []);
  });

  it("rejects --changed-since values that look like git options through the CLI", () => {
    const repo = createRepo({ "README.md": "root\n" });
    const outputPath = path.join(repo, "injected");

    assert.throws(() => execFileSync(
      process.execPath,
      [cliPath, "audit", repo, `--changed-since=--output=${outputPath}`, "--format=json"],
      { encoding: "utf8", stdio: "pipe" }
    ), /Failed to read changed files since/);
    assert.deepEqual(fs.readdirSync(repo).filter((name) => name.startsWith("injected")), []);
  });

  it("rejects --changed-since without a ref instead of scanning everything", () => {
    assert.throws(() => execFileSync(
      process.execPath,
      [cliPath, "audit", "examples/node-vitest-basic", "--format=json", "--changed-since"],
      { encoding: "utf8", stdio: "pipe" }
    ), /--changed-since requires a Git ref/);
  });

  it("rejects --from-audit without a path instead of scanning everything", () => {
    assert.throws(() => execFileSync(
      process.execPath,
      [cliPath, "plan", "examples/node-vitest-basic", "--format=json", "--from-audit"],
      { encoding: "utf8", stdio: "pipe" }
    ), /--from-audit requires a JSON file path/);
  });

  it("rejects --from-project-audits without a path instead of scanning everything", () => {
    assert.throws(() => execFileSync(
      process.execPath,
      [cliPath, "plan-projects", "examples/node-vitest-basic", "--format=json", "--from-project-audits="],
      { encoding: "utf8", stdio: "pipe" }
    ), /--from-project-audits requires a JSON file path/);
  });
});

function createRepo(files) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rta-git-changed-")));
  git(repo, "init", "-q");
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(repo, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, contents);
  }
  commitAll(repo, "initial");
  return repo;
}

function commitAll(repo, message) {
  git(repo, "add", "-A");
  git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "-q", "-m", message);
}

function git(repo, ...args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
}
