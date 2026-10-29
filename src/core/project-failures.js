import path from "node:path";
import { compareText } from "./ordering.js";

const MAX_REASON_LENGTH = 200;
const FALLBACK_REASON = "Adapter audit failed without a message.";
const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_$]{0,63}$/;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const FILE_URL = /\bfile:\/\/[^\s'"`,;()<>]*/gi;
const WINDOWS_ABSOLUTE_PATH = /(?:\b[A-Za-z]:|\\\\[^\\\s]+)[\\/][^\s'"`,;()<>]*/g;
const POSIX_ABSOLUTE_PATH = /(?<![\w.~-])\/[^\s'"`,;()<>]+/g;
const QUOTED_SPAN = /"[^"\r\n]*"|`[^`\r\n]*`/g;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]+/g;

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
 * Record a project whose adapter threw, keeping only a bounded, sanitized summary of the error:
 * its name, an optional Node-style code, and the first message line with absolute paths, quoted
 * spans (which can echo file contents) and control characters removed. Stacks are never kept.
 *
 * @param {{ id: string, root: string, ecosystems: string[], languages: string[] }} project
 * @param {string} adapterId
 * @param {unknown} error
 * @param {string} repoRoot
 * @returns {FailedProjectAudit}
 */
export function describeFailedProject(project, adapterId, error, repoRoot) {
  const failure = {
    projectId: project.id,
    projectRoot: project.root,
    adapterId,
    ecosystems: project.ecosystems,
    languages: project.languages,
    errorName: readErrorName(error)
  };
  const errorCode = readErrorCode(error);

  if (errorCode) {
    failure.errorCode = errorCode;
  }

  failure.reason = sanitizeErrorMessage(error, repoRoot);
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

function readErrorName(error) {
  const name = error instanceof Error ? error.name : undefined;
  return typeof name === "string" && SAFE_ERROR_NAME.test(name) ? name : "Error";
}

function readErrorCode(error) {
  const code = error && typeof error === "object" ? error.code : undefined;
  return typeof code === "string" && SAFE_ERROR_CODE.test(code) ? code : undefined;
}

function sanitizeErrorMessage(error, repoRoot) {
  const rawMessage = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const [firstLine = ""] = String(rawMessage).split(/\r?\n/, 1);
  const message = stripRepositoryRoot(firstLine, repoRoot)
    .replace(QUOTED_SPAN, (span) => `${span[0]}<redacted>${span[0]}`)
    .replace(FILE_URL, "<path>")
    .replace(WINDOWS_ABSOLUTE_PATH, "<path>")
    .replace(POSIX_ABSOLUTE_PATH, "<path>")
    .replace(CONTROL_CHARACTERS, " ")
    .trim();

  if (message.length === 0) return FALLBACK_REASON;
  return message.length > MAX_REASON_LENGTH ? `${message.slice(0, MAX_REASON_LENGTH - 3)}...` : message;
}

function stripRepositoryRoot(message, repoRoot) {
  if (!repoRoot || path.parse(repoRoot).root === repoRoot) return message;

  // Paths under the audited repository stay useful once made repository-relative.
  // A sibling such as "<root>-old" is not under the repository and is left for the absolute-path pass.
  let result = message;
  for (const root of new Set([repoRoot, repoRoot.replaceAll("\\", "/")])) {
    const pattern = new RegExp(`${escapeRegExp(root)}(?:[\\\\/]|(?![\\w.-]))`, "g");
    result = result.replace(pattern, (match) => (match.length > root.length ? "" : "."));
  }
  return result;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
