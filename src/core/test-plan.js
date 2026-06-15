/**
 * @typedef {"unit" | "integration" | "component" | "ui" | "none"} TestLevel
 * @typedef {"add-test" | "extend-test" | "defer"} PlanAction
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
 * @property {TestLevel} recommendedTestLevel
 * @property {number} riskReductionScore
 * @property {number} maintenanceCost
 * @property {string[]} signals
 * @property {string[]} [reasons]
 * @property {string} [reason]
 * @property {string} [preferredCoveragePath]
 * @property {string[]} [existingTestPaths]
 *
 * @typedef {object} AuditResult
 * @property {"audit/v1"} schemaVersion
 * @property {AuditProfile} profile
 * @property {AuditTarget[]} untestedCandidates
 * @property {AuditTarget[]} coveredButRisky
 * @property {AuditTarget[]} skipped
 *
 * @typedef {object} TestPlanItem
 * @property {string} id
 * @property {PlanAction} action
 * @property {string} targetId
 * @property {string} target
 * @property {string} path
 * @property {TestLevel} testLevel
 * @property {number} priority
 * @property {number} riskReductionScore
 * @property {number} maintenanceCost
 * @property {string[]} rationale
 * @property {string[]} sourceSignals
 * @property {string[]} existingTestPaths
 *
 * @typedef {object} TestPlan
 * @property {"plan/v1"} schemaVersion
 * @property {object} summary
 * @property {string[]} blockers
 * @property {TestPlanItem[]} items
 */

/**
 * @param {AuditResult} audit
 * @returns {TestPlan}
 */
export function createTestPlan(audit) {
  const addItems = audit.untestedCandidates.map((target) => toPlanItem("add-test", target));
  const extendItems = audit.coveredButRisky.map((target) => toPlanItem("extend-test", target));
  const deferredItems = audit.skipped
    .filter((target) => target.riskReductionScore >= 2)
    .map((target) => ({
      id: `defer:${target.path}`,
      action: "defer",
      targetId: target.id,
      target: target.name,
      path: target.path,
      testLevel: "none",
      priority: target.riskReductionScore - target.maintenanceCost,
      riskReductionScore: target.riskReductionScore,
      maintenanceCost: target.maintenanceCost,
      rationale: [target.reason, target.preferredCoveragePath].filter(Boolean),
      sourceSignals: target.signals,
      existingTestPaths: []
    }));

  const items = [...addItems, ...extendItems, ...deferredItems].sort(
    (a, b) => b.priority - a.priority || b.riskReductionScore - a.riskReductionScore || a.target.localeCompare(b.target)
  );

  return {
    schemaVersion: "plan/v1",
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

/**
 * @param {"add-test" | "extend-test"} action
 * @param {AuditTarget} target
 * @returns {TestPlanItem}
 */
function toPlanItem(action, target) {
  return {
    id: `${action}:${target.path}`,
    action,
    targetId: target.id,
    target: target.name,
    path: target.path,
    testLevel: target.recommendedTestLevel,
    priority: target.riskReductionScore - target.maintenanceCost,
    riskReductionScore: target.riskReductionScore,
    maintenanceCost: target.maintenanceCost,
    rationale: target.reasons,
    sourceSignals: target.signals,
    existingTestPaths: target.existingTestPaths
  };
}
