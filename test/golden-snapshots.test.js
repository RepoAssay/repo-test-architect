import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";
import { createTestPlan } from "../src/core/test-plan.js";
import { loadEvalFixtures } from "./support/eval-fixtures.js";
import { normalizeAuditForSnapshot, normalizeJsonForSnapshot } from "./support/normalize-audit.js";

const expectedDir = path.resolve("evals/expected");
const fixtures = loadEvalFixtures();

describe("golden audit snapshots", () => {
  for (const fixture of fixtures) {
    it(`matches ${fixture.name}`, () => {
      const fileName = `${fixture.name}.audit.json`;
      const expected = JSON.parse(fs.readFileSync(path.join(expectedDir, fileName), "utf8"));
      const actual = normalizeAuditForSnapshot(auditJavaScriptRepo(fixture.root));

      assert.deepEqual(actual, expected);
    });
  }
});

describe("golden plan snapshots", () => {
  for (const fixture of fixtures) {
    it(`matches ${fixture.name}`, () => {
      const fileName = `${fixture.name}.plan.json`;
      const expected = JSON.parse(fs.readFileSync(path.join(expectedDir, fileName), "utf8"));
      const audit = normalizeAuditForSnapshot(auditJavaScriptRepo(fixture.root));
      const actual = normalizeJsonForSnapshot(createTestPlan(audit));

      assert.deepEqual(actual, expected);
    });
  }
});

describe("eval fixture manifest", () => {
  it("has expected snapshots for every fixture", () => {
    for (const fixture of fixtures) {
      assert.ok(fs.existsSync(path.join(expectedDir, `${fixture.name}.audit.json`)));
      assert.ok(fs.existsSync(path.join(expectedDir, `${fixture.name}.plan.json`)));
    }
  });
});
