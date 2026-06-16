import { classifyProjectAuditCoverage } from "./project-audit-coverage.js";
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
 * @typedef {"complete" | "partial" | "none"} ProjectAuditCoverage
 *
 * @typedef {object} ProjectAudits
 * @property {"project-audits/v1"} schemaVersion
 * @property {string} root
 * @property {{ projectCount: number, auditedProjectCount: number, skippedProjectCount: number }} summary
 * @property {ProjectAuditEntry[]} audits
 * @property {SkippedProjectAudit[]} skippedProjects
 *
 * @typedef {object} ProjectCandidateRanking
 * @property {"project-candidate-ranking/v1"} schemaVersion
 * @property {string} root
 * @property {{ projectCount: number, auditedProjectCount: number, unsupportedProjectCount: number, auditCoverage: ProjectAuditCoverage, unsupportedReasons: string[], candidateCount: number }} summary
 * @property {SkippedProjectAudit[]} unsupportedProjects
 * @property {object[]} candidates
 */

/**
 * @param {ProjectAudits} projectAudits
 * @returns {ProjectCandidateRanking}
 */
export function rankProjectTestCandidates(projectAudits) {
  if (projectAudits?.schemaVersion !== "project-audits/v1") {
    throw new Error("Expected project audits schemaVersion project-audits/v1.");
  }

  const candidates = projectAudits.audits.flatMap((entry) => {
    const ranking = rankTestCandidates(entry.audit);

    return ranking.candidates.map((candidate) => ({
      projectId: entry.projectId,
      projectRoot: entry.projectRoot,
      adapterId: entry.adapterId,
      ...candidate,
      projectTargetId: `${entry.projectId}:${candidate.targetId}`
    }));
  }).sort(
    (a, b) =>
      b.priority - a.priority ||
      b.riskReductionScore - a.riskReductionScore ||
      a.projectRoot.localeCompare(b.projectRoot) ||
      a.target.localeCompare(b.target)
  );

  const unsupportedProjects = projectAudits.skippedProjects.map((project) => ({
    projectId: project.projectId,
    projectRoot: project.projectRoot,
    reason: project.reason,
    ecosystems: project.ecosystems,
    languages: project.languages,
    adapterMatches: project.adapterMatches ?? [],
    supportStatusReason: project.supportStatusReason ?? project.reason
  }));

  return {
    schemaVersion: "project-candidate-ranking/v1",
    root: projectAudits.root,
    summary: {
      projectCount: projectAudits.summary.projectCount,
      auditedProjectCount: projectAudits.summary.auditedProjectCount,
      unsupportedProjectCount: projectAudits.summary.skippedProjectCount,
      auditCoverage: classifyProjectAuditCoverage(projectAudits.summary.auditedProjectCount, projectAudits.summary.skippedProjectCount),
      unsupportedReasons: [...new Set(unsupportedProjects.map((project) => project.supportStatusReason))],
      candidateCount: candidates.length
    },
    unsupportedProjects,
    candidates
  };
}
