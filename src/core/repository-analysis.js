import { createPlanExecutionHints } from "./plan-execution-hints.js";
import { summarizeProjectAudits } from "./project-audit-summary.js";
import { rankProjectTestCandidates } from "./project-candidate-ranking.js";
import { createProjectFindings } from "./project-findings.js";
import { collectProjectStats } from "./project-stats.js";
import { createProjectTestPlan } from "./project-test-plan.js";
import { validateProjectAudits } from "./project-audits-validation.js";

/**
 * @typedef {object} RepositoryAnalysis
 * @property {"repository-analysis/v1"} schemaVersion
 * @property {string} root
 * @property {object} summary
 * @property {Array<{ command: string, projectCount: number }>} verificationCommands
 * @property {object} projectAudits
 * @property {object} auditSummary
 * @property {object} findings
 * @property {object} candidateRanking
 * @property {object} testPlan
 * @property {object} executionHints
 * @property {object} stats
 */

/**
 * Derive the complete deterministic repository review from one project audit pass.
 *
 * @param {object} projectAudits
 * @returns {RepositoryAnalysis}
 */
export function createRepositoryAnalysis(projectAudits) {
  validateProjectAudits(projectAudits);

  const auditSummary = summarizeProjectAudits(projectAudits);
  const findings = createProjectFindings(projectAudits);
  const candidateRanking = rankProjectTestCandidates(projectAudits);
  const testPlan = createProjectTestPlan(projectAudits);
  const executionHints = createPlanExecutionHints(testPlan);
  const stats = collectProjectStats(projectAudits);
  const verificationCommands = Object.entries(stats.distributions.testCommands)
    .map(([command, projectCount]) => ({ command, projectCount }))
    .sort((left, right) => left.command.localeCompare(right.command));

  return {
    schemaVersion: "repository-analysis/v1",
    root: projectAudits.root,
    summary: {
      projectCount: auditSummary.summary.projectCount,
      auditedProjectCount: auditSummary.summary.auditedProjectCount,
      unsupportedProjectCount: auditSummary.summary.unsupportedProjectCount,
      auditCoverage: auditSummary.summary.auditCoverage,
      blockerCount: stats.counts.blockerCount,
      findingCount: findings.summary.findingCount,
      candidateCount: candidateRanking.summary.candidateCount,
      planItemCount: testPlan.summary.itemCount,
      verificationCommandCount: verificationCommands.length
    },
    verificationCommands,
    projectAudits,
    auditSummary,
    findings,
    candidateRanking,
    testPlan,
    executionHints,
    stats
  };
}
