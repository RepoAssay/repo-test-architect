import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import {
  auditRepo,
  explainAuditTarget,
  generateTestPlan,
  getAuditGraph,
  rankAuditTestCandidates,
  validateAudit
} from "../src/core/tool-api.js";

describe("tool API", () => {
  it("audits a repo and exposes the audit graph", () => {
    const audit = auditRepo(path.resolve("examples/node-vitest-basic"));

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.equal(getAuditGraph(audit), audit);
  });

  it("generates and filters test plans", () => {
    const audit = auditRepo(path.resolve("examples/node-vitest-basic"));
    const plan = generateTestPlan(audit, { itemId: "add-test:src/authService.ts" });

    assert.equal(plan.schemaVersion, "plan/v1");
    assert.deepEqual(
      plan.items.map((item) => item.id),
      ["add-test:src/authService.ts"]
    );
  });

  it("explains and ranks audit targets", () => {
    const audit = auditRepo(path.resolve("examples/node-vitest-basic"));
    const explanation = explainAuditTarget(audit, "src/authService.ts");
    const ranking = rankAuditTestCandidates(audit);

    assert.equal(explanation.schemaVersion, "target-explanation/v1");
    assert.equal(ranking.schemaVersion, "candidate-ranking/v1");
    assert.equal(ranking.summary.candidateCount, 2);
  });

  it("rejects invalid audit artifacts", () => {
    assert.throws(
      () =>
        validateAudit({
          schemaVersion: "audit/v0"
        }),
      /Expected audit schemaVersion audit\/v1/
    );
  });
});
