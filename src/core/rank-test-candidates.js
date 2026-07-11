/**
 * @typedef {"unit" | "integration" | "component" | "ui" | "none"} TestLevel
 * @typedef {"untested" | "covered-but-risky"} CandidateCategory
 *
 * @typedef {object} AuditProfile
 * @property {string} confidence
 * @property {string} [testCommand]
 * @property {string[]} blockers
 *
 * @typedef {object} AuditTarget
 * @property {string} id
 * @property {string} name
 * @property {string} path
 * @property {string} kind
 * @property {TestLevel} recommendedTestLevel
 * @property {number} riskReductionScore
 * @property {number} maintenanceCost
 * @property {string[]} signals
 * @property {string[]} reasons
 * @property {string[]} existingTestPaths
 * @property {Array<{testPath: string, kind: string, strength: string}>} [existingTestEvidence]
 *
 * @typedef {object} AuditResult
 * @property {"audit/v1"} schemaVersion
 * @property {AuditProfile} profile
 * @property {AuditTarget[]} untestedCandidates
 * @property {AuditTarget[]} coveredButRisky
 *
 * @typedef {object} RankedTestCandidate
 * @property {string} targetId
 * @property {string} target
 * @property {string} path
 * @property {CandidateCategory} category
 * @property {string} kind
 * @property {TestLevel} testLevel
 * @property {number} priority
 * @property {number} riskReductionScore
 * @property {number} maintenanceCost
 * @property {string[]} signals
 * @property {string[]} rationale
 * @property {string[]} existingTestPaths
 * @property {Array<{testPath: string, kind: string, strength: string}>} [existingTestEvidence]
 *
 * @typedef {object} CandidateRanking
 * @property {"candidate-ranking/v1"} schemaVersion
 * @property {object} summary
 * @property {string[]} blockers
 * @property {RankedTestCandidate[]} candidates
 */

/**
 * @param {AuditResult} audit
 * @returns {CandidateRanking}
 */
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
      rationale: target.reasons ?? [],
      existingTestPaths: target.existingTestPaths ?? [],
      ...(target.existingTestEvidence ? { existingTestEvidence: target.existingTestEvidence } : {})
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
