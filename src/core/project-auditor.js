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
 * @typedef {object} NestedProject
 * @property {string} root Project-relative root of a detected project inside the audited project.
 * @property {string} adapterId The adapter that audits the nested project.
 * @property {string[]} markerFiles The detector's marker files for the nested project, so an adapter can tell project kinds apart.
 *
 * @typedef {object} AuditDetectedProjectsOptions
 * @property {string[]} [changedPaths]
 * @property {string[]} [excludeProjectRoots]
 * @property {{ goos: string, goarch: string, tags?: string[] }} [goTarget]
 * @property {Record<string, string>} [swiftSchemes] shared Xcode scheme to use per detected project root (#310)
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
  const swiftSchemes = normalizeSwiftSchemes(options.swiftSchemes, detection.projects);
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
      goTarget: options.goTarget,
      swiftScheme: swiftSchemes.get(normalizeProjectRootKey(project.root)),
      // Detected projects inside this one receive their own audit; an adapter may leave their
      // sources to that audit instead of counting them again. Unsupported or excluded roots are
      // not listed, so nothing is dropped without a replacement audit.
      nestedProjects: collectNestedProjects(detection.projects, project)
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

  linkCrossProjectTestEvidence(audits);

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

/**
 * Once every project has its own audit, an adapter that can read sibling projects links the tests that
 * live in one project but exercise another (#318). The adapter sees only the audits it produced in
 * this scan, in detection order; lone-root audits never reach this pass. A defect in the pass is
 * contained like a per-project adapter defect: the audits stay exactly as produced, which only means
 * fewer links, and the other adapters still get their pass.
 * @param {Array<{ projectId: string, projectRoot: string, adapterId: string, audit: object }>} audits
 */
function linkCrossProjectTestEvidence(audits) {
  const byAdapter = new Map();
  for (const entry of audits) byAdapter.set(entry.adapterId, [...(byAdapter.get(entry.adapterId) ?? []), entry]);
  for (const [adapterId, entries] of byAdapter) {
    const adapter = getAdapter(adapterId);
    if (entries.length <= 1 || typeof adapter.linkCrossProjectTestEvidence !== "function") continue;
    try {
      adapter.linkCrossProjectTestEvidence(entries);
    } catch (error) {
      if (isInvalidOptionError(error)) throw error;
    }
  }
}

function isInvalidOptionError(error) {
  try {
    return error instanceof InvalidOptionError;
  } catch {
    // A Proxy whose prototype lookup throws is an adapter failure, not a usage error.
    return false;
  }
}

/**
 * @param {Array<{ root: string, adapterIds: string[] }>} projects
 * @param {{ root: string }} project
 * @returns {NestedProject[]}
 */
/**
 * Validates the per-project scheme selections and keys them by normalized project root. A key that
 * names no detected project is a usage error rather than a silent no-op (#310).
 * @param {unknown} swiftSchemes
 * @param {Array<{ root: string }>} projects
 * @returns {Map<string, string>}
 */
function normalizeSwiftSchemes(swiftSchemes, projects) {
  const selections = normalizeSwiftSchemeSelections(swiftSchemes);
  const detectedRoots = new Set(projects.map((project) => normalizeProjectRootKey(project.root)));
  for (const [root, { rawRoot }] of selections) {
    if (!detectedRoots.has(root)) {
      throw new InvalidOptionError(`swiftSchemes names a project root that was not detected: ${rawRoot}.`, { option: "swiftSchemes" });
    }
  }
  return new Map([...selections].map(([root, { scheme }]) => [root, scheme]));
}

/**
 * Validates the shape of a `swiftSchemes` selection map and keys it by normalized project root
 * (`./Apps/Shop/` and `Apps/Shop` are the same root; `"."` is the audited root). Two raw keys that
 * name the same root, an absolute or escaping key, and an empty scheme name are usage errors.
 * @param {unknown} swiftSchemes
 * @returns {Map<string, { rawRoot: string, scheme: string }>}
 */
export function normalizeSwiftSchemeSelections(swiftSchemes) {
  const selections = new Map();
  if (swiftSchemes === undefined) return selections;
  if (!swiftSchemes || typeof swiftSchemes !== "object" || Array.isArray(swiftSchemes)) {
    throw new InvalidOptionError("swiftSchemes must be an object mapping project roots to shared Xcode scheme names.", { option: "swiftSchemes" });
  }
  for (const [rawRoot, scheme] of Object.entries(swiftSchemes)) {
    if (typeof scheme !== "string" || scheme.length === 0) {
      throw new InvalidOptionError(`swiftSchemes[${JSON.stringify(rawRoot)}] must be a non-empty scheme name.`, { option: "swiftSchemes" });
    }
    const root = normalizeSwiftSchemeRoot(rawRoot);
    if (root === undefined) {
      throw new InvalidOptionError(`swiftSchemes keys must be repository-relative project roots, not ${JSON.stringify(rawRoot)}.`, { option: "swiftSchemes" });
    }
    if (selections.has(root)) {
      throw new InvalidOptionError(`swiftSchemes names project root ${root} more than once (${JSON.stringify(selections.get(root).rawRoot)} and ${JSON.stringify(rawRoot)}).`, { option: "swiftSchemes" });
    }
    selections.set(root, { rawRoot, scheme });
  }
  return selections;
}

/**
 * The normalized form of a project-root key, or undefined when it is not a repository-relative root.
 * @param {unknown} rawRoot
 * @returns {string | undefined}
 */
export function normalizeSwiftSchemeRoot(rawRoot) {
  if (typeof rawRoot !== "string" || rawRoot.length === 0) return undefined;
  const normalized = normalizePath(rawRoot);
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.split("/").includes("..")) return undefined;
  return normalizeProjectRootKey(normalized);
}

function normalizeProjectRootKey(root) {
  const normalized = stripCurrentDirectoryPrefix(normalizePath(String(root))).replace(/\/+$/, "").replace(/^(?:\.\/)+/, "");
  return normalized === "" || normalized === "." ? "." : normalized;
}

function collectNestedProjects(projects, project) {
  return projects
    .filter((candidate) => candidate.root !== project.root && candidate.adapterIds.length > 0 && isInsideProject(project.root, candidate.root))
    .map((candidate) => ({
      root: toProjectRelativePath(project.root, candidate.root),
      adapterId: candidate.adapterIds[0],
      markerFiles: [...candidate.markerFiles]
    }));
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
