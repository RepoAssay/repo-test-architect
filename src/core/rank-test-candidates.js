export function rankTestCandidates(audit) {
  const candidates = [...audit.untestedCandidates, ...audit.coveredButRisky]
    .map((target) => ({
      targetId: target.id,
      target: target.name,
      path: target.path,
      category: audit.untestedCandidates.includes(target) ? "untested" : "covered-but-risky",
      kind: target.kind,
      testLevel: target.recommendedTestLevel,
      priority: target.riskReductionScore - target.maintenanceCost,
      riskReductionScore: target.riskReductionScore,
      maintenanceCost: target.maintenanceCost,
      signals: target.signals,
      rationale: target.reasons,
      existingTestPaths: target.existingTestPaths
    }))
    .sort((a, b) => b.priority - a.priority || b.riskReductionScore - a.riskReductionScore || a.target.localeCompare(b.target));

  return {
    schemaVersion: "candidate-ranking/v1",
    summary: {
      confidence: audit.profile.confidence,
      candidateCount: candidates.length,
      blockerCount: audit.profile.blockers.length,
      ...(audit.profile.testCommand ? { verificationCommand: audit.profile.testCommand } : {})
    },
    blockers: audit.profile.blockers,
    candidates
  };
}
