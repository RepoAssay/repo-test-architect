import { validateProjectAudits } from "./project-audits-validation.js";
import { classifyProjectAuditCoverage } from "./project-audit-coverage.js";
import { failedProjectCountField, failedProjectsField, normalizeFailedProjects } from "./project-failures.js";
import { collectUnsupportedReasons, normalizeUnsupportedProjects } from "./project-unsupported.js";
import { rankTestCandidates } from "./rank-test-candidates.js";
import { compareText } from "./ordering.js";

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
 * @property {{ projectCount: number, auditedProjectCount: number, unsupportedProjectCount: number, failedProjectCount?: number, auditCoverage: ProjectAuditCoverage, unsupportedReasons: string[], candidateCount: number }} summary
 * @property {SkippedProjectAudit[]} unsupportedProjects
 * @property {import("./project-failures.js").FailedProjectAudit[]} [failedProjects]
 * @property {object[]} candidates
 */

/**
 * @param {ProjectAudits} projectAudits
 * @returns {ProjectCandidateRanking}
 */
export function rankProjectTestCandidates(projectAudits) {
  validateProjectAudits(projectAudits);

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
      compareText(a.projectRoot, b.projectRoot) ||
      compareText(a.target, b.target)
  );

  const unsupportedProjects = normalizeUnsupportedProjects(projectAudits.skippedProjects);
  const failedProjects = normalizeFailedProjects(projectAudits);

  return {
    schemaVersion: "project-candidate-ranking/v1",
    root: projectAudits.root,
    summary: {
      projectCount: projectAudits.summary.projectCount,
      auditedProjectCount: projectAudits.summary.auditedProjectCount,
      unsupportedProjectCount: projectAudits.summary.skippedProjectCount,
      ...failedProjectCountField(failedProjects),
      auditCoverage: classifyProjectAuditCoverage(
        projectAudits.summary.auditedProjectCount,
        projectAudits.summary.skippedProjectCount + failedProjects.length
      ),
      unsupportedReasons: collectUnsupportedReasons(unsupportedProjects),
      candidateCount: candidates.length
    },
    unsupportedProjects,
    ...failedProjectsField(failedProjects),
    candidates
  };
}
