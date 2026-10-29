import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { compareText } from "../src/core/ordering.js";
import { auditDetectedProjects } from "../src/core/project-auditor.js";
import { detectProjects } from "../src/core/project-detector.js";

describe("deterministic ordering", () => {
  it("orders text case-insensitively first, then by code unit, independent of locale", () => {
    assert.deepEqual(
      ["routes", "UserResponseDTO", "configure", "b.js", "B.js", "a-b", "a_b", "a/b"].sort(compareText),
      ["a-b", "a/b", "a_b", "B.js", "b.js", "configure", "routes", "UserResponseDTO"]
    );
    assert.equal(compareText("same", "same"), 0);
  });

  it("does not let readdir order pick between settings.gradle and settings.gradle.kts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-dual-settings-"));
    fs.cpSync(path.resolve("examples/kotlin-gradle-module-graph-junit"), root, { recursive: true });
    assert.ok(fs.existsSync(path.join(root, "settings.gradle.kts")));
    fs.writeFileSync(path.join(root, "settings.gradle"), "rootProject.name = \"groovy-settings\"\n");

    const roots = () => detectProjects(root).projects.map((project) => project.root);
    const baseline = roots();
    withReversedReaddir(() => assert.deepEqual(roots(), baseline));
  });

  it("produces identical project audits whatever order the filesystem lists entries in", () => {
    const fixtures = fs.readdirSync("examples", { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.resolve("examples", entry.name));
    assert.ok(fixtures.length > 10);

    const baseline = fixtures.map((fixture) => JSON.stringify(auditDetectedProjects(fixture)));
    withReversedReaddir(() => {
      fixtures.forEach((fixture, index) => {
        assert.equal(JSON.stringify(auditDetectedProjects(fixture)), baseline[index], path.basename(fixture));
      });
    });
  });
});

function withReversedReaddir(callback) {
  const originalReaddirSync = fs.readdirSync;
  fs.readdirSync = function reversedReaddirSync(...args) {
    return originalReaddirSync.apply(this, args).reverse();
  };
  try {
    callback();
  } finally {
    fs.readdirSync = originalReaddirSync;
  }
}
