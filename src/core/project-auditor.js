import path from "node:path";
import { getAdapter } from "./adapter-registry.js";
import { detectProjects } from "./project-detector.js";

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
 * @typedef {object} ProjectAudits
 * @property {"project-audits/v1"} schemaVersion
 * @property {string} root
 * @property {{ projectCount: number, auditedProjectCount: number, skippedProjectCount: number }} summary
 * @property {ProjectAuditEntry[]} audits
 * @property {SkippedProjectAudit[]} skippedProjects
 */

/**
 * @param {string} repoRoot
 * @returns {ProjectAudits}
 */
export function auditDetectedProjects(repoRoot) {
  const detection = detectProjects(repoRoot);
  const audits = [];
  const skippedProjects = [];

  for (const project of detection.projects) {
    if (project.adapterIds.length === 0) {
      skippedProjects.push({
        projectId: project.id,
        projectRoot: project.root,
        reason: project.supportStatusReason,
        ecosystems: project.ecosystems,
        languages: project.languages,
        adapterMatches: project.adapterMatches,
        supportStatusReason: project.supportStatusReason
      });
      continue;
    }

    const adapterId = project.adapterIds[0];
    const audit = getAdapter(adapterId).audit(path.resolve(detection.root, project.root));

    audits.push({
      projectId: project.id,
      projectRoot: project.root,
      adapterId,
      audit
    });
  }

  return {
    schemaVersion: "project-audits/v1",
    root: detection.root,
    summary: {
      projectCount: detection.summary.projectCount,
      auditedProjectCount: audits.length,
      skippedProjectCount: skippedProjects.length
    },
    audits,
    skippedProjects
  };
}
