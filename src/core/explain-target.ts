import type { AuditResult, AuditTarget, SkippedTarget, TestLevel } from "./audit-model";

export interface TargetExplanation {
  schemaVersion: "target-explanation/v1";
  targetId: string;
  target: string;
  path: string;
  category: "untestedCandidates" | "coveredButRisky" | "skipped";
  kind: string;
  recommendation: "test" | "defer";
  testLevel: TestLevel;
  risk: "low" | "medium" | "high";
  testability: "low" | "medium" | "high";
  riskReductionScore: number;
  maintenanceCost: number;
  signals: string[];
  rationale: string[];
  existingTestPaths: string[];
}

export function explainTarget(audit: AuditResult, targetId: string): TargetExplanation {
  if (!targetId) {
    throw new Error("--target requires an audit target id.");
  }

  const match = findTarget(audit, targetId);

  if (!match) {
    throw new Error(`Audit target not found: ${targetId}`);
  }

  const { target, category } = match;
  const skipped = category === "skipped";

  return {
    schemaVersion: "target-explanation/v1",
    targetId: target.id,
    target: target.name,
    path: target.path,
    category,
    kind: target.kind,
    recommendation: skipped ? "defer" : "test",
    testLevel: skipped ? "none" : target.recommendedTestLevel,
    risk: skipped ? "low" : target.risk,
    testability: skipped ? "low" : target.testability,
    riskReductionScore: target.riskReductionScore,
    maintenanceCost: target.maintenanceCost,
    signals: target.signals,
    rationale: skipped ? [target.reason, target.preferredCoveragePath].filter(Boolean) as string[] : target.reasons ?? [],
    existingTestPaths: skipped ? [] : target.existingTestPaths ?? []
  };
}

function findTarget(audit: AuditResult, targetId: string) {
  for (const category of ["untestedCandidates", "coveredButRisky", "skipped"] as const) {
    const targets = audit[category] as Array<AuditTarget | SkippedTarget>;
    const target = targets.find((candidate) => candidate.id === targetId);
    if (target) return { target, category };
  }

  return undefined;
}
