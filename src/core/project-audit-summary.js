import { validateProjectAudits } from "./project-audits-validation.js";
import { classifyProjectAuditCoverage } from "./project-audit-coverage.js";
import { collectUnsupportedReasons, normalizeUnsupportedProjects } from "./project-unsupported.js";
import { rankTestCandidates } from "./rank-test-candidates.js";

/**
 * @typedef {object} ProjectAuditEntry
 * @property {string} projectId
 * @property {string} projectRoot
 * @property {string} adapterId
 * @property {object} audit
 *
 * @typedef {object} SkippedProjectAudit
 * @property {string} projectId
 * @property {string} projectRoot
 * @property {string} reason
 * @property {string[]} ecosystems
 * @property {string[]} languages
 * @property {Array<{ adapterId: string, maturity: string, matchedEcosystems: string[], matchedLanguages: string[] }>} adapterMatches
 * @property {string} supportStatusReason
 *
 * @typedef {object} ProjectAuditSummaryEntry
 * @property {string} projectId
 * @property {string} projectRoot
 * @property {string} adapterId
 * @property {string} confidence
 * @property {string} [testCommand]
 * @property {number} untestedCandidateCount
 * @property {number} coveredButRiskyCount
 * @property {number} skippedTargetCount
 * @property {number} riskCount
 * @property {string[]} topCandidateIds
 *
 * @typedef {"complete" | "partial" | "none"} ProjectAuditCoverage
 *
 * @typedef {"untestedCandidateCount" | "coveredButRiskyCount" | "skippedTargetCount" | "riskCount"} ProjectAuditSummaryCountKey
 *
 * @typedef {object} ProjectAudits
 * @property {"project-audits/v1"} schemaVersion
 * @property {string} root
 * @property {{ projectCount: number, auditedProjectCount: number, skippedProjectCount: number }} summary
 * @property {ProjectAuditEntry[]} audits
 * @property {SkippedProjectAudit[]} skippedProjects
 *
 * @typedef {object} ProjectAuditSummary
 * @property {"project-audit-summary/v1"} schemaVersion
 * @property {string} root
 * @property {{ projectCount: number, auditedProjectCount: number, unsupportedProjectCount: number, auditCoverage: ProjectAuditCoverage, unsupportedReasons: string[], untestedCandidateCount: number, coveredButRiskyCount: number, skippedTargetCount: number, riskCount: number }} summary
 * @property {ProjectAuditSummaryEntry[]} projects
 * @property {SkippedProjectAudit[]} unsupportedProjects
 */

/**
 * @param {ProjectAudits} projectAudits
 * @returns {ProjectAuditSummary}
 */
export function summarizeProjectAudits(projectAudits) {
  validateProjectAudits(projectAudits);

  const projects = projectAudits.audits.map((entry) => {
    const ranking = rankTestCandidates({
      ...entry.audit,
      profile: {
        ...entry.audit.profile,
        blockers: entry.audit.profile.blockers ?? []
      }
    });
    const project = {
      projectId: entry.projectId,
      projectRoot: entry.projectRoot,
      adapterId: entry.adapterId,
      confidence: entry.audit.profile.confidence,
      untestedCandidateCount: entry.audit.untestedCandidates.length,
      coveredButRiskyCount: entry.audit.coveredButRisky.length,
      skippedTargetCount: entry.audit.skipped.length,
      riskCount: entry.audit.risks.length,
      topCandidateIds: ranking.candidates.slice(0, 3).map((candidate) => candidate.targetId)
    };

    if (entry.audit.profile.testCommand) {
      project.testCommand = entry.audit.profile.testCommand;
    }

    return project;
  });

  const unsupportedProjects = normalizeUnsupportedProjects(projectAudits.skippedProjects);

  return {
    schemaVersion: "project-audit-summary/v1",
    root: projectAudits.root,
    summary: {
      projectCount: projectAudits.summary.projectCount,
      auditedProjectCount: projectAudits.summary.auditedProjectCount,
      unsupportedProjectCount: projectAudits.summary.skippedProjectCount,
      auditCoverage: classifyProjectAuditCoverage(projectAudits.summary.auditedProjectCount, projectAudits.summary.skippedProjectCount),
      unsupportedReasons: collectUnsupportedReasons(unsupportedProjects),
      untestedCandidateCount: sum(projects, "untestedCandidateCount"),
      coveredButRiskyCount: sum(projects, "coveredButRiskyCount"),
      skippedTargetCount: sum(projects, "skippedTargetCount"),
      riskCount: sum(projects, "riskCount")
    },
    projects,
    unsupportedProjects
  };
}

/**
 * @param {ProjectAuditSummaryEntry[]} items
 * @param {ProjectAuditSummaryCountKey} key
 * @returns {number}
 */
function sum(items, key) {
  return items.reduce((total, item) => total + item[key], 0);
}
