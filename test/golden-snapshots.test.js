import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";
import { createTestPlan } from "../src/core/test-plan.js";
import { normalizeAuditForSnapshot, normalizeJsonForSnapshot } from "./support/normalize-audit.js";

const expectedDir = path.resolve("evals/expected");

describe("golden audit snapshots", () => {
  for (const fileName of fs.readdirSync(expectedDir).filter((name) => name.endsWith(".audit.json")).sort()) {
    const fixtureName = fileName.replace(".audit.json", "");

    it(`matches ${fixtureName}`, () => {
      const fixtureRoot = path.resolve("examples", fixtureName);
      const expected = JSON.parse(fs.readFileSync(path.join(expectedDir, fileName), "utf8"));
      const actual = normalizeAuditForSnapshot(auditJavaScriptRepo(fixtureRoot));

      assert.deepEqual(actual, expected);
    });
  }
});

describe("golden plan snapshots", () => {
  for (const fileName of fs.readdirSync(expectedDir).filter((name) => name.endsWith(".plan.json")).sort()) {
    const fixtureName = fileName.replace(".plan.json", "");

    it(`matches ${fixtureName}`, () => {
      const fixtureRoot = path.resolve("examples", fixtureName);
      const expected = JSON.parse(fs.readFileSync(path.join(expectedDir, fileName), "utf8"));
      const audit = normalizeAuditForSnapshot(auditJavaScriptRepo(fixtureRoot));
      const actual = normalizeJsonForSnapshot(createTestPlan(audit));

      assert.deepEqual(actual, expected);
    });
  }
});
