export function explainTarget(audit, targetId) {
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
    rationale: skipped ? [target.reason, target.preferredCoveragePath].filter(Boolean) : target.reasons,
    existingTestPaths: skipped ? [] : target.existingTestPaths
  };
}

function findTarget(audit, targetId) {
  for (const category of ["untestedCandidates", "coveredButRisky", "skipped"]) {
    const target = audit[category].find((candidate) => candidate.id === targetId);
    if (target) return { target, category };
  }

  return undefined;
}
