import type { AuditResult, AuditTarget, TestLevel } from "./audit-model";

export type PlanAction = "add-test" | "extend-test" | "defer";

export interface TestPlanItem {
  action: PlanAction;
  target: string;
  path: string;
  testLevel: TestLevel;
  priority: number;
  riskReductionScore: number;
  maintenanceCost: number;
  rationale: string[];
  existingTestPaths: string[];
}

export interface TestPlan {
  summary: {
    confidence: string;
    verificationCommand?: string;
    blockerCount: number;
    addTestCount: number;
    extendTestCount: number;
    deferredCount: number;
  };
  blockers: string[];
  items: TestPlanItem[];
}

export function createTestPlan(audit: AuditResult): TestPlan {
  const addItems = audit.untestedCandidates.map((target) => toPlanItem("add-test", target));
  const extendItems = audit.coveredButRisky.map((target) => toPlanItem("extend-test", target));
  const deferredItems = audit.skipped
    .filter((target) => target.riskReductionScore >= 2)
    .map((target) => ({
      action: "defer" as const,
      target: target.name,
      path: target.path,
      testLevel: "none" as const,
      priority: target.riskReductionScore - target.maintenanceCost,
      riskReductionScore: target.riskReductionScore,
      maintenanceCost: target.maintenanceCost,
      rationale: [target.reason, target.preferredCoveragePath].filter(Boolean) as string[],
      existingTestPaths: []
    }));

  const items = [...addItems, ...extendItems, ...deferredItems].sort(
    (a, b) => b.priority - a.priority || b.riskReductionScore - a.riskReductionScore || a.target.localeCompare(b.target)
  );

  return {
    summary: {
      confidence: audit.profile.confidence,
      verificationCommand: audit.profile.testCommand,
      blockerCount: audit.profile.blockers.length,
      addTestCount: addItems.length,
      extendTestCount: extendItems.length,
      deferredCount: deferredItems.length
    },
    blockers: audit.profile.blockers,
    items
  };
}

function toPlanItem(action: "add-test" | "extend-test", target: AuditTarget): TestPlanItem {
  return {
    action,
    target: target.name,
    path: target.path,
    testLevel: target.recommendedTestLevel,
    priority: target.riskReductionScore - target.maintenanceCost,
    riskReductionScore: target.riskReductionScore,
    maintenanceCost: target.maintenanceCost,
    rationale: target.reasons,
    existingTestPaths: target.existingTestPaths
  };
}
