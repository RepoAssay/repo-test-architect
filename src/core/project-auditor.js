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
 *
 * @typedef {object} AuditDetectedProjectsOptions
 * @property {string[]} [changedPaths]
 * @property {string[]} [excludeProjectRoots]
 */

/**
 * @param {string} repoRoot
 * @param {AuditDetectedProjectsOptions} [options]
 * @returns {ProjectAudits}
 */
export function auditDetectedProjects(repoRoot, options = {}) {
  const detection = detectProjects(repoRoot, {
    excludeProjectRoots: options.excludeProjectRoots
  });
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
    const projectRoot = path.resolve(detection.root, project.root);
    const audit = getAdapter(adapterId).audit(projectRoot, {
      changedPaths: selectProjectChangedPaths(detection.root, project.root, options.changedPaths)
    });

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

function selectProjectChangedPaths(repoRoot, projectRoot, changedPaths) {
  if (!changedPaths) return undefined;

  return changedPaths
    .map((currentPath) => normalizeRepoRelativePath(repoRoot, currentPath))
    .filter((currentPath) => isInsideProject(projectRoot, currentPath))
    .map((currentPath) => toProjectRelativePath(projectRoot, currentPath));
}

function normalizeRepoRelativePath(repoRoot, currentPath) {
  if (path.isAbsolute(currentPath)) {
    return stripCurrentDirectoryPrefix(normalizePath(path.relative(repoRoot, currentPath)));
  }

  return stripCurrentDirectoryPrefix(normalizePath(currentPath));
}

function isInsideProject(projectRoot, currentPath) {
  return projectRoot === "." || currentPath === projectRoot || currentPath.startsWith(`${projectRoot}/`);
}

function toProjectRelativePath(projectRoot, currentPath) {
  if (projectRoot === ".") return currentPath;
  if (currentPath === projectRoot) return ".";
  return currentPath.slice(projectRoot.length + 1);
}

function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/");
}

function stripCurrentDirectoryPrefix(currentPath) {
  return currentPath.replace(/^\.\//, "");
}
