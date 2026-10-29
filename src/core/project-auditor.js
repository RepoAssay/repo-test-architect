import path from "node:path";
import { normalizeGoTarget } from "../adapters/go/audit.js";
import { getAdapter } from "./adapter-registry.js";
import { InvalidOptionError } from "./invalid-option-error.js";
import { detectProjects } from "./project-detector.js";
import { describeFailedProject, sortFailedProjects } from "./project-failures.js";

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
 * @typedef {import("./project-failures.js").FailedProjectAudit} FailedProjectAudit
 *
 * @typedef {object} ProjectAudits
 * @property {"project-audits/v1"} schemaVersion
 * @property {string} root
 * @property {{ projectCount: number, auditedProjectCount: number, skippedProjectCount: number, failedProjectCount: number }} summary
 * @property {ProjectAuditEntry[]} audits
 * @property {SkippedProjectAudit[]} skippedProjects
 * @property {FailedProjectAudit[]} failedProjects
 *
 * @typedef {object} AuditDetectedProjectsOptions
 * @property {string[]} [changedPaths]
 * @property {string[]} [excludeProjectRoots]
 * @property {{ goos: string, goarch: string, tags?: string[] }} [goTarget]
 */

/**
 * Audit every detected supported project. An adapter that throws for one project is contained:
 * the project is reported in failedProjects with a fixed error summary and the remaining
 * projects are still audited. Invalid options are usage errors: they are validated before any
 * adapter runs and InvalidOptionError is never contained. Errors raised outside an adapter's
 * audit call are not contained either.
 *
 * @param {string} repoRoot
 * @param {AuditDetectedProjectsOptions} [options]
 * @returns {ProjectAudits}
 */
export function auditDetectedProjects(repoRoot, options = {}) {
  normalizeGoTarget(options.goTarget);
  const detection = detectProjects(repoRoot, {
    excludeProjectRoots: options.excludeProjectRoots
  });
  const audits = [];
  const skippedProjects = [];
  const failedProjects = [];

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
    const adapter = getAdapter(adapterId);
    const projectRoot = path.resolve(detection.root, project.root);
    const auditOptions = {
      changedPaths: selectProjectChangedPaths(detection.root, project.root, options.changedPaths),
      repositoryRoot: detection.root,
      goTarget: options.goTarget
    };
    let audit;

    try {
      audit = adapter.audit(projectRoot, auditOptions);
    } catch (error) {
      if (isInvalidOptionError(error)) throw error;
      // Programmer errors such as TypeError are contained too: one adapter defect should not hide
      // every other project's results. errorName keeps such defects visible in the artifact.
      failedProjects.push(describeFailedProject(project, adapterId, error));
      continue;
    }

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
      skippedProjectCount: skippedProjects.length,
      failedProjectCount: failedProjects.length
    },
    audits,
    skippedProjects,
    failedProjects: sortFailedProjects(failedProjects)
  };
}

function isInvalidOptionError(error) {
  try {
    return error instanceof InvalidOptionError;
  } catch {
    // A Proxy whose prototype lookup throws is an adapter failure, not a usage error.
    return false;
  }
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
