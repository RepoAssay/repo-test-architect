export function createTestPlan(audit) {
  const addItems = audit.untestedCandidates.map((target) => toPlanItem("add-test", target));
  const extendItems = audit.coveredButRisky.map((target) => toPlanItem("extend-test", target));
  const deferredItems = audit.skipped
    .filter((target) => target.riskReductionScore >= 2)
    .map((target) => ({
      action: "defer",
      target: target.name,
      path: target.path,
      testLevel: "none",
      priority: target.riskReductionScore - target.maintenanceCost,
      riskReductionScore: target.riskReductionScore,
      maintenanceCost: target.maintenanceCost,
      rationale: [target.reason, target.preferredCoveragePath].filter(Boolean),
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

function toPlanItem(action, target) {
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
