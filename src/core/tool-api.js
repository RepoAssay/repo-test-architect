import { getAdapter, getAdapterRegistry as readAdapterRegistry } from "./adapter-registry.js";
import { explainTarget } from "./explain-target.js";
import { auditDetectedProjects } from "./project-auditor.js";
import { summarizeProjectAudits } from "./project-audit-summary.js";
import { detectProjects, getProjectDetectionRules as readProjectDetectionRules } from "./project-detector.js";
import { rankProjectTestCandidates } from "./project-candidate-ranking.js";
import { createProjectFindings } from "./project-findings.js";
import { analyzeProjectTestPlacement } from "./project-test-placement-analysis.js";
import { createProjectTestPlan } from "./project-test-plan.js";
import { collectProjectStats } from "./project-stats.js";
import { createPlanExecutionHints } from "./plan-execution-hints.js";
import { rankTestCandidates } from "./rank-test-candidates.js";
import { analyzeTestPlacement } from "./test-placement-analysis.js";
import { createTestPlacementFindings } from "./test-placement-findings.js";
import { createTestPlan } from "./test-plan.js";

export { validateProjectAudits } from "./project-audits-validation.js";

/**
 * @typedef {import("./adapter-registry.js").AdapterRegistry} AdapterRegistry
 * @typedef {import("./project-detector.js").ProjectDetection} ProjectDetection
 * @typedef {import("./project-detector.js").ProjectDetectionRules} ProjectDetectionRules
 * @typedef {import("./project-auditor.js").ProjectAudits} ProjectAudits
 * @typedef {import("./project-audit-summary.js").ProjectAuditSummary} ProjectAuditSummary
 * @typedef {import("./project-candidate-ranking.js").ProjectCandidateRanking} ProjectCandidateRanking
 * @typedef {import("./project-findings.js").ProjectFindings} ProjectFindings
 * @typedef {import("./project-test-plan.js").ProjectTestPlan} ProjectTestPlan
 * @typedef {import("./project-stats.js").ProjectStats} ProjectStats
 * @typedef {import("./plan-execution-hints.js").PlanExecutionHints} PlanExecutionHints
 * @typedef {import("./test-placement-findings.js").TestPlacementFindings} TestPlacementFindings
 * @typedef {import("./test-placement-findings.js").TestPlacementFinding} TestPlacementFinding
 * @typedef {import("./test-plan.js").TestPlan} TestPlan
 * @typedef {import("./explain-target.js").TargetExplanation} TargetExplanation
 * @typedef {import("./rank-test-candidates.js").CandidateRanking} CandidateRanking
 *
 * @typedef {object} AuditRepoOptions
 * @property {string} [adapterId]
 * @property {string[]} [changedPaths]
 *
 * @typedef {object} AuditRepoProjectsOptions
 * @property {string[]} [changedPaths]
 * @property {string[]} [excludeProjectRoots]
 *
 * @typedef {object} DetectRepoProjectsOptions
 * @property {string[]} [excludeProjectRoots]
 *
 * @typedef {object} GenerateTestPlanOptions
 * @property {string} [itemId]
 *
 * @typedef {object} AnalyzeTestPlacementOptions
 * @property {string} [owner]
 *
 * @typedef {object} AuditResult
 * @property {"audit/v1"} schemaVersion
 * @property {object} profile
 * @property {unknown[]} untestedCandidates
 * @property {unknown[]} coveredButRisky
 * @property {unknown[]} skipped
 * @property {string[]} risks
 */

/**
 * @param {string} repoRoot
 * @param {DetectRepoProjectsOptions} [options]
 * @returns {ProjectDetection}
 */
export function detectRepoProjects(repoRoot, options = {}) {
  return detectProjects(repoRoot, {
    excludeProjectRoots: validateProjectRootPatterns(options.excludeProjectRoots)
  });
}

/**
 * @returns {ProjectDetectionRules}
 */
export function getProjectDetectionRules() {
  return readProjectDetectionRules();
}

/**
 * @param {string} repoRoot
 * @param {AuditRepoProjectsOptions} [options]
 * @returns {ProjectAudits}
 */
export function auditRepoProjects(repoRoot, options = {}) {
  return auditDetectedProjects(repoRoot, {
    changedPaths: validateChangedPaths(options.changedPaths),
    excludeProjectRoots: validateProjectRootPatterns(options.excludeProjectRoots)
  });
}

/**
 * @returns {AdapterRegistry}
 */
export function getAdapterRegistry() {
  return readAdapterRegistry();
}

/**
 * @param {ProjectAudits} projectAudits
 * @returns {ProjectAuditSummary}
 */
export function summarizeRepoProjectAudits(projectAudits) {
  return summarizeProjectAudits(projectAudits);
}

/**
 * @param {ProjectAudits} projectAudits
 * @returns {ProjectCandidateRanking}
 */
export function rankRepoProjectCandidates(projectAudits) {
  return rankProjectTestCandidates(projectAudits);
}

/**
 * @param {ProjectAudits} projectAudits
 * @returns {ProjectTestPlan}
 */
export function generateRepoProjectTestPlan(projectAudits) {
  return createProjectTestPlan(projectAudits);
}

/**
 * @param {ProjectAudits} projectAudits
 * @returns {ProjectFindings}
 */
export function collectRepoProjectFindings(projectAudits) {
  return createProjectFindings(projectAudits);
}

/**
 * @param {ProjectAudits} projectAudits
 * @returns {TestPlacementFindings}
 */
export function analyzeRepoProjectTestPlacement(projectAudits) {
  return analyzeProjectTestPlacement(projectAudits);
}

/**
 * @param {ProjectAudits} projectAudits
 * @returns {ProjectStats}
 */
export function collectRepoProjectStats(projectAudits) {
  return collectProjectStats(projectAudits);
}

/**
 * @param {string} repoRoot
 * @param {AuditRepoOptions} [options]
 * @returns {AuditResult}
 */
export function auditRepo(repoRoot, options = {}) {
  return getAdapter(options.adapterId).audit(repoRoot, {
    changedPaths: validateChangedPaths(options.changedPaths)
  });
}

/**
 * @param {AuditResult} audit
 * @returns {AuditResult}
 */
export function getAuditGraph(audit) {
  validateAudit(audit);
  return audit;
}

/**
 * @param {AuditResult} audit
 * @param {GenerateTestPlanOptions} [options]
 * @returns {TestPlan}
 */
export function generateTestPlan(audit, options = {}) {
  validateAudit(audit);
  return filterPlan(createTestPlan(audit), options.itemId);
}

/**
 * @param {TestPlan | ProjectTestPlan} plan
 * @param {GenerateTestPlanOptions} [options]
 * @returns {PlanExecutionHints}
 */
export function getPlanExecutionHints(plan, options = {}) {
  return createPlanExecutionHints(plan, options);
}

/**
 * @param {AuditResult} audit
 * @param {string} targetId
 * @returns {TargetExplanation}
 */
export function explainAuditTarget(audit, targetId) {
  validateAudit(audit);
  return explainTarget(audit, targetId);
}

/**
 * @param {AuditResult} audit
 * @returns {CandidateRanking}
 */
export function rankAuditTestCandidates(audit) {
  validateAudit(audit);
  return rankTestCandidates(audit);
}

/**
 * @param {TestPlacementFinding[]} [findings]
 * @returns {TestPlacementFindings}
 */
export function createRepoTestPlacementFindings(findings = []) {
  return createTestPlacementFindings(findings);
}

/**
 * @param {AuditResult} audit
 * @param {AnalyzeTestPlacementOptions} [options]
 * @returns {TestPlacementFindings}
 */
export function analyzeRepoTestPlacement(audit, options = {}) {
  validateAudit(audit);
  return analyzeTestPlacement(audit, options);
}

/**
 * @param {AuditResult} audit
 * @returns {void}
 */
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

/**
 * @param {string[]} [changedPaths]
 * @returns {string[] | undefined}
 */
function validateChangedPaths(changedPaths) {
  if (changedPaths === undefined) return undefined;

  if (!Array.isArray(changedPaths) || changedPaths.some((changedPath) => typeof changedPath !== "string" || changedPath.length === 0)) {
    throw new Error("changedPaths must be an array of non-empty strings.");
  }

  return changedPaths;
}

function validateProjectRootPatterns(projectRoots) {
  if (projectRoots === undefined) return undefined;

  if (!Array.isArray(projectRoots) || projectRoots.some((projectRoot) => typeof projectRoot !== "string" || projectRoot.length === 0)) {
    throw new Error("excludeProjectRoots must be an array of non-empty strings.");
  }

  return projectRoots;
}

/**
 * @param {TestPlan} plan
 * @param {string} [itemId]
 * @returns {TestPlan}
 */
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
