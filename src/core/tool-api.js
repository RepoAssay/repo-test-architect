import { auditJavaScriptRepo } from "../adapters/javascript/audit.js";
import { explainTarget } from "./explain-target.js";
import { rankTestCandidates } from "./rank-test-candidates.js";
import { createTestPlan } from "./test-plan.js";

export function auditRepo(repoRoot, options = {}) {
  return auditJavaScriptRepo(repoRoot, {
    changedPaths: options.changedPaths
  });
}

export function getAuditGraph(audit) {
  validateAudit(audit);
  return audit;
}

export function generateTestPlan(audit, options = {}) {
  validateAudit(audit);
  return filterPlan(createTestPlan(audit), options.itemId);
}

export function explainAuditTarget(audit, targetId) {
  validateAudit(audit);
  return explainTarget(audit, targetId);
}

export function rankAuditTestCandidates(audit) {
  validateAudit(audit);
  return rankTestCandidates(audit);
}

export function validateAudit(audit) {
  if (audit?.schemaVersion !== "audit/v1") {
    throw new Error("Expected audit schemaVersion audit/v1.");
  }

  if (!audit.profile || typeof audit.profile !== "object") {
    throw new Error("Audit profile is missing.");
  }

  for (const key of ["untestedCandidates", "coveredButRisky", "skipped", "risks"]) {
    if (!Array.isArray(audit[key])) {
      throw new Error(`Audit ${key} must be an array.`);
    }
  }
}

function filterPlan(plan, itemId) {
  if (!itemId) return plan;

  const item = plan.items.find((candidate) => candidate.id === itemId);

  if (!item) {
    throw new Error(`Plan item not found: ${itemId}`);
  }

  return {
    ...plan,
    summary: {
      ...plan.summary,
      addTestCount: item.action === "add-test" ? 1 : 0,
      extendTestCount: item.action === "extend-test" ? 1 : 0,
      deferredCount: item.action === "defer" ? 1 : 0
    },
    items: [item]
  };
}
