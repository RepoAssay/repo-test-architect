import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";
import { createTestPlan } from "../src/core/test-plan.js";
import { loadEvalFixtures } from "../test/support/eval-fixtures.js";
import { normalizeAuditForSnapshot, normalizeJsonForSnapshot } from "../test/support/normalize-audit.js";

const expectedDir = path.resolve("evals/expected");
let failures = 0;

for (const fixture of loadEvalFixtures()) {
  const audit = normalizeAuditForSnapshot(auditJavaScriptRepo(fixture.root));
  const plan = normalizeJsonForSnapshot(createTestPlan(audit));

  const auditMatched = compareSnapshot(fixture.name, "audit", audit);
  const planMatched = compareSnapshot(fixture.name, "plan", plan);

  if (auditMatched && planMatched) {
    console.log(`PASS ${fixture.name}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} snapshot check(s) failed.`);
  process.exit(1);
}

console.log(`\n${loadEvalFixtures().length} fixture(s) matched audit and plan snapshots.`);

function compareSnapshot(fixtureName, kind, actual) {
  const snapshotPath = path.join(expectedDir, `${fixtureName}.${kind}.json`);

  try {
    const expected = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    assert.deepEqual(actual, expected);
    return true;
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${fixtureName} ${kind}: ${error.message}`);
    return false;
  }
}
