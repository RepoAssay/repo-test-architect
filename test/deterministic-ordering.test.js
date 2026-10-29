import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { compareText } from "../src/core/ordering.js";
import { auditDetectedProjects } from "../src/core/project-auditor.js";

describe("deterministic ordering", () => {
  it("orders text case-insensitively first, then by code unit, independent of locale", () => {
    assert.deepEqual(
      ["routes", "UserResponseDTO", "configure", "b.js", "B.js", "a-b", "a_b", "a/b"].sort(compareText),
      ["a-b", "a/b", "a_b", "B.js", "b.js", "configure", "routes", "UserResponseDTO"]
    );
    assert.equal(compareText("same", "same"), 0);
  });

  it("produces identical project audits whatever order the filesystem lists entries in", () => {
    const fixtures = fs.readdirSync("examples", { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.resolve("examples", entry.name));
    assert.ok(fixtures.length > 10);

    const baseline = fixtures.map((fixture) => JSON.stringify(auditDetectedProjects(fixture)));
    const originalReaddirSync = fs.readdirSync;
    fs.readdirSync = function reversedReaddirSync(...args) {
      return originalReaddirSync.apply(this, args).reverse();
    };
    try {
      fixtures.forEach((fixture, index) => {
        assert.equal(JSON.stringify(auditDetectedProjects(fixture)), baseline[index], path.basename(fixture));
      });
    } finally {
      fs.readdirSync = originalReaddirSync;
    }
  });
});
