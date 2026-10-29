import { classifyProjectAuditCoverage } from "./project-audit-coverage.js";
import { compareText } from "./ordering.js";

/**
 * Built-in error classes whose names may be recorded. Any other name, including custom
 * subclasses, is reported as "Error" so arbitrary thrown text never reaches an artifact.
 */
export const FAILED_PROJECT_ERROR_NAMES = Object.freeze([
  "AggregateError",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError"
]);

/**
 * Node.js file-system error codes that may be recorded, each with a fixed public description.
 * Error messages are never recorded: they can contain paths, source text or secrets.
 */
const FAILED_PROJECT_ERROR_CODE_DESCRIPTIONS = Object.freeze({
  EACCES: "Permission was denied while reading the project.",
  EIO: "An input or output error occurred while reading the project.",
  EISDIR: "A directory was found where a file was expected.",
  ELOOP: "Too many symbolic links were encountered while reading the project.",
  EMFILE: "The process ran out of file handles while reading the project.",
  ENAMETOOLONG: "A file name in the project is too long.",
  ENFILE: "The system ran out of file handles while reading the project.",
  ENOENT: "A file or directory disappeared or was not found during the audit.",
  ENOMEM: "The system ran out of memory while reading the project.",
  ENOTDIR: "A file was found where a directory was expected.",
  EPERM: "The operation was not permitted while reading the project."
});

export const FAILED_PROJECT_ERROR_CODES = Object.freeze(Object.keys(FAILED_PROJECT_ERROR_CODE_DESCRIPTIONS).sort());

const ERROR_NAMES = new Set(FAILED_PROJECT_ERROR_NAMES);
const ADAPTER_ID = /^[a-z][a-z0-9-]{0,63}$/;
const ENTRY_KEYS = new Set(["projectId", "projectRoot", "adapterId", "ecosystems", "languages", "errorName", "errorCode", "reason"]);

/**
 * @typedef {object} FailedProjectAudit
 * @property {string} projectId
 * @property {string} projectRoot
 * @property {string} adapterId
 * @property {string[]} ecosystems
 * @property {string[]} languages
 * @property {string} errorName
 * @property {string} [errorCode]
 * @property {string} reason
 */

/**
 * Record a project whose adapter threw. Only an allowlisted error class name and file-system
 * code are read from the thrown value, each inside its own guard so hostile getters or Proxies
 * cannot escape containment. The reason is built entirely from fixed text.
 *
 * @param {{ id: string, root: string, ecosystems: string[], languages: string[] }} project
 * @param {string} adapterId
 * @param {unknown} error
 * @returns {FailedProjectAudit}
 */
export function describeFailedProject(project, adapterId, error) {
  const errorName = readErrorName(error);
  const errorCode = readErrorCode(error);
  const failure = {
    projectId: project.id,
    projectRoot: project.root,
    adapterId,
    ecosystems: project.ecosystems,
    languages: project.languages,
    errorName
  };

  if (errorCode) {
    failure.errorCode = errorCode;
  }

  failure.reason = describeReason(adapterId, errorName, errorCode);
  return failure;
}

/**
 * @param {FailedProjectAudit[]} failedProjects
 * @returns {FailedProjectAudit[]}
 */
export function sortFailedProjects(failedProjects) {
  return [...failedProjects].sort(
    (left, right) => compareText(left.projectRoot, right.projectRoot) || compareText(left.adapterId, right.adapterId)
  );
}

/**
 * Saved project-audits/v1 artifacts written before 1.1.0 have no failedProjects field.
 *
 * @param {{ failedProjects?: FailedProjectAudit[] }} projectAudits
 * @returns {FailedProjectAudit[]}
 */
export function normalizeFailedProjects(projectAudits) {
  return (projectAudits.failedProjects ?? []).map((project) => ({ ...project }));
}

/**
 * Copy failedProjects from an artifact that was not schema-validated, such as a caller-supplied
 * project-test-plan/v1. Rejects anything that the fixed failure vocabulary could not have produced.
 *
 * @param {unknown} failedProjects
 * @param {string} label
 * @returns {FailedProjectAudit[]}
 */
export function copyUntrustedFailedProjects(failedProjects, label) {
  if (failedProjects === undefined) return [];
  if (!Array.isArray(failedProjects)) throw new Error(`${label} failedProjects must be an array.`);

  return failedProjects.map((entry, index) => {
    const invalid = () => new Error(`${label} failedProjects[${index}] is not a valid failed project entry.`);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw invalid();
    if (Object.keys(entry).some((key) => !ENTRY_KEYS.has(key))) throw invalid();
    if (![entry.projectId, entry.projectRoot].every((value) => typeof value === "string" && value.length > 0)) throw invalid();
    if (![entry.ecosystems, entry.languages].every(isStringArray)) throw invalid();
    if (typeof entry.adapterId !== "string" || !ADAPTER_ID.test(entry.adapterId)) throw invalid();
    if (!ERROR_NAMES.has(entry.errorName)) throw invalid();
    if (entry.errorCode !== undefined && !Object.hasOwn(FAILED_PROJECT_ERROR_CODE_DESCRIPTIONS, entry.errorCode)) throw invalid();
    if (entry.reason !== describeReason(entry.adapterId, entry.errorName, entry.errorCode)) throw invalid();

    return {
      projectId: entry.projectId,
      projectRoot: entry.projectRoot,
      adapterId: entry.adapterId,
      ecosystems: [...entry.ecosystems],
      languages: [...entry.languages],
      errorName: entry.errorName,
      ...(entry.errorCode ? { errorCode: entry.errorCode } : {}),
      reason: entry.reason
    };
  });
}

/**
 * Derived artifacts only carry failure fields when a project failed, so complete runs keep
 * their 1.0 shape.
 *
 * @param {FailedProjectAudit[]} failedProjects
 * @returns {{ failedProjectCount?: number }}
 */
export function failedProjectCountField(failedProjects) {
  return failedProjects.length > 0 ? { failedProjectCount: failedProjects.length } : {};
}

/**
 * @param {FailedProjectAudit[]} failedProjects
 * @returns {{ failedProjects?: FailedProjectAudit[] }}
 */
export function failedProjectsField(failedProjects) {
  return failedProjects.length > 0 ? { failedProjects } : {};
}

/**
 * Coverage context for artifacts without a summary of their own, such as project placement.
 *
 * @param {{ summary: { auditedProjectCount: number, skippedProjectCount: number } }} projectAudits
 * @param {FailedProjectAudit[]} failedProjects
 * @returns {{ auditCoverage?: "partial" | "none", failedProjectCount?: number, failedProjects?: FailedProjectAudit[] }}
 */
export function failureContextFields(projectAudits, failedProjects) {
  if (failedProjects.length === 0) return {};

  return {
    auditCoverage: classifyProjectAuditCoverage(
      projectAudits.summary.auditedProjectCount,
      projectAudits.summary.skippedProjectCount + failedProjects.length
    ),
    failedProjectCount: failedProjects.length,
    failedProjects
  };
}

/**
 * @param {string} adapterId
 * @param {string} errorName
 * @param {string} [errorCode]
 * @returns {string}
 */
export function describeReason(adapterId, errorName, errorCode) {
  const summary = `The ${adapterId} adapter failed with ${errorName}.`;
  return errorCode ? `${summary} ${FAILED_PROJECT_ERROR_CODE_DESCRIPTIONS[errorCode]}` : summary;
}

function readErrorName(error) {
  try {
    if (!error || (typeof error !== "object" && typeof error !== "function")) return "Error";
    const name = error.name;
    return typeof name === "string" && ERROR_NAMES.has(name) ? name : "Error";
  } catch {
    return "Error";
  }
}

function readErrorCode(error) {
  try {
    if (!error || (typeof error !== "object" && typeof error !== "function")) return undefined;
    const code = error.code;
    return typeof code === "string" && Object.hasOwn(FAILED_PROJECT_ERROR_CODE_DESCRIPTIONS, code) ? code : undefined;
  } catch {
    return undefined;
  }
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}
