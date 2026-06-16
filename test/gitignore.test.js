import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

describe("gitignore", () => {
  it("ignores generated dependency, package, coverage, and local comparison artifacts", () => {
    const gitignore = fs.readFileSync(".gitignore", "utf8");

    for (const pattern of [
      "node_modules/",
      "coverage/",
      "dist/",
      "*.tgz",
      ".env",
      ".env.*",
      "*.log",
      "baseline-summary.json",
      "candidate-summary.json",
      "comparison.json",
      "model-consistency-stats.json"
    ]) {
      assert.match(gitignore, new RegExp(`^${escapeRegExp(pattern)}$`, "m"), `Missing .gitignore pattern: ${pattern}`);
    }
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
