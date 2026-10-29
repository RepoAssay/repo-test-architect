import { execFileSync } from "node:child_process";

/**
 * Lists working-tree changes (staged, unstaged, and untracked) relative to repoRoot.
 * Paths outside repoRoot are dropped when repoRoot is a subdirectory of the Git work tree.
 *
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function readGitWorkingTreeChangedPaths(repoRoot) {
  // Strip only the trailing newline: directory names may legitimately start or end with whitespace.
  const prefix = runGit(repoRoot, ["rev-parse", "--show-prefix"]).replace(/\r?\n$/, "");
  // The "." pathspec scopes status to repoRoot, so changes elsewhere in the work tree are never listed.
  const output = runGit(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "."]);
  return toRepoRootPaths(parseGitStatusPorcelainZ(output), prefix);
}

/**
 * Lists paths changed between the merge base of ref and HEAD, relative to repoRoot.
 *
 * @param {string} repoRoot
 * @param {string} ref
 * @returns {string[]}
 */
export function readGitChangedPathsSince(repoRoot, ref) {
  if (typeof ref !== "string" || ref.length === 0) {
    throw new Error("a Git ref is required.");
  }
  // Reject option-shaped refs so a value such as "--output=<file>" is never parsed as a git option.
  // (git's --end-of-options would also work, but requires Git 2.24.)
  if (ref.startsWith("-")) {
    throw new Error(`invalid Git ref: ${ref}`);
  }
  const output = runGit(repoRoot, ["diff", "--name-only", "-z", "--relative", `${ref}...HEAD`, "--"]);
  return splitNul(output);
}

/**
 * Parses `git status --porcelain=v1 -z` output into paths relative to the Git work tree root.
 * Renamed and copied entries resolve to their new path.
 *
 * @param {string} output
 * @returns {string[]}
 */
export function parseGitStatusPorcelainZ(output) {
  const entries = output.split("\0");
  const paths = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.length < 4) continue;

    const status = entry.slice(0, 2);
    paths.push(entry.slice(3));
    // In -z mode a rename or copy is followed by a separate entry holding the original path.
    if (status.includes("R") || status.includes("C")) index += 1;
  }

  return paths;
}

function toRepoRootPaths(paths, prefix) {
  return paths
    .filter((changedPath) => changedPath.startsWith(prefix))
    .map((changedPath) => changedPath.slice(prefix.length))
    .filter(Boolean);
}

function splitNul(output) {
  return output.split("\0").filter(Boolean);
}

function runGit(repoRoot, args) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    // Large working trees (e.g. many untracked generated files) exceed the 1 MiB default.
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
}
