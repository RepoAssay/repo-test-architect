import type { AuditResult } from "./audit-model";
import { explainTarget } from "./explain-target";
import { rankTestCandidates } from "./rank-test-candidates";
import { createTestPlan, type TestPlan } from "./test-plan";

export interface AuditRepoOptions {
  adapterId?: string;
  changedPaths?: string[];
}

export interface GenerateTestPlanOptions {
  itemId?: string;
}

export function getAuditGraph(audit: AuditResult): AuditResult {
  validateAudit(audit);
  return audit;
}

export function generateTestPlan(audit: AuditResult, options: GenerateTestPlanOptions = {}): TestPlan {
  validateAudit(audit);
  return filterPlan(createTestPlan(audit), options.itemId);
}

export function explainAuditTarget(audit: AuditResult, targetId: string) {
  validateAudit(audit);
  return explainTarget(audit, targetId);
}

export function rankAuditTestCandidates(audit: AuditResult) {
  validateAudit(audit);
  return rankTestCandidates(audit);
}

export function validateAudit(audit: AuditResult): void {
  if (audit?.schemaVersion !== "audit/v1") {
    throw new Error("Expected audit schemaVersion audit/v1.");
  }

  if (!audit.profile || typeof audit.profile !== "object") {
    throw new Error("Audit profile is missing.");
  }

  for (const key of ["untestedCandidates", "coveredButRisky", "skipped", "risks"] as const) {
    if (!Array.isArray(audit[key])) {
      throw new Error(`Audit ${key} must be an array.`);
    }
  }
}

function filterPlan(plan: TestPlan, itemId?: string): TestPlan {
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
