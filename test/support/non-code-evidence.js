import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditRepoProjects, generateRepoProjectTestPlan } from "../../src/core/tool-api.js";

export function copyTrustFixture(t, fixture) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rta-non-code-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.resolve("examples", fixture), root, {
    recursive: true,
    filter: entry => !["vendor", "node_modules", "build", ".dart_tool", ".git"].includes(path.basename(entry))
  });
  return root;
}

export function assertNoSemanticEvidence(audit) {
  for (const target of audit.coveredButRisky) {
    for (const evidence of target.existingTestEvidence ?? []) {
      assert.equal(evidence.kind, "filename-convention");
      assert.equal(evidence.usage, undefined);
      assert.equal(evidence.viaUsage, undefined);
    }
  }
}

export function assertNoPlannedUsage(root) {
  const plan = generateRepoProjectTestPlan(auditRepoProjects(root));
  for (const item of plan.items) {
    for (const evidence of item.existingTestEvidence ?? []) {
      assert.equal(evidence.usage, undefined);
      assert.equal(evidence.viaUsage, undefined);
    }
  }
}
