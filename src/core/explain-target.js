/**
 * @typedef {"untestedCandidates" | "coveredButRisky" | "skipped"} ExplanationCategory
 * @typedef {"unit" | "integration" | "component" | "ui" | "none"} TestLevel
 *
 * @typedef {object} AuditTarget
 * @property {string} id
 * @property {string} name
 * @property {string} path
 * @property {string} kind
 * @property {string} [risk]
 * @property {string} [testability]
 * @property {TestLevel} [recommendedTestLevel]
 * @property {number} riskReductionScore
 * @property {number} maintenanceCost
 * @property {string[]} signals
 * @property {string[]} [reasons]
 * @property {string} [reason]
 * @property {string} [preferredCoveragePath]
 * @property {string[]} [existingTestPaths]
 * @property {Array<{testPath: string, kind: string, strength: string}>} [existingTestEvidence]
 *
 * @typedef {object} AuditResult
 * @property {"audit/v1"} schemaVersion
 * @property {AuditTarget[]} untestedCandidates
 * @property {AuditTarget[]} coveredButRisky
 * @property {AuditTarget[]} skipped
 *
 * @typedef {object} TargetMatch
 * @property {AuditTarget} target
 * @property {ExplanationCategory} category
 *
 * @typedef {object} TargetExplanation
 * @property {"target-explanation/v1"} schemaVersion
 * @property {string} targetId
 * @property {string} target
 * @property {string} path
 * @property {ExplanationCategory} category
 * @property {string} kind
 * @property {"test" | "defer"} recommendation
 * @property {TestLevel} testLevel
 * @property {string} risk
 * @property {string} testability
 * @property {number} riskReductionScore
 * @property {number} maintenanceCost
 * @property {string[]} signals
 * @property {string[]} rationale
 * @property {string[]} existingTestPaths
 * @property {Array<{testPath: string, kind: string, strength: string}>} [existingTestEvidence]
 */

/**
 * @param {AuditResult} audit
 * @param {string} targetId
 * @returns {TargetExplanation}
 */
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
    rationale: skipped ? [target.reason, target.preferredCoveragePath].filter(Boolean) : target.reasons ?? [],
    existingTestPaths: skipped ? [] : target.existingTestPaths ?? [],
    ...(!skipped && target.existingTestEvidence ? { existingTestEvidence: target.existingTestEvidence } : {})
  };
}

/**
 * @param {AuditResult} audit
 * @param {string} targetId
 * @returns {TargetMatch | undefined}
 */
function findTarget(audit, targetId) {
  for (const category of ["untestedCandidates", "coveredButRisky", "skipped"]) {
    const target = audit[category].find((candidate) => candidate.id === targetId);
    if (target) return { target, category };
  }

  return undefined;
}
