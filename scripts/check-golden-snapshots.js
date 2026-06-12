import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";
import { createTestPlan } from "../src/core/test-plan.js";
import { mcpTools } from "../src/mcp/tool-definitions.js";
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

compareSnapshot("mcp-tools", undefined, normalizeJsonForSnapshot({ tools: mcpTools }));

if (failures > 0) {
  console.error(`\n${failures} snapshot check(s) failed.`);
  process.exit(1);
}

console.log(`\n${loadEvalFixtures().length} fixture(s) matched audit and plan snapshots.`);
console.log("MCP tool snapshot matched.");

function compareSnapshot(fixtureName, kind, actual) {
  const snapshotFile = kind ? `${fixtureName}.${kind}.json` : `${fixtureName}.json`;
  const snapshotPath = path.join(expectedDir, snapshotFile);

  try {
    const expected = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    assert.deepEqual(actual, expected);
    return true;
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${snapshotFile}: ${error.message}`);
    return false;
  }
}
