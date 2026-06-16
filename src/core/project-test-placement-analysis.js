import { validateProjectAudits } from "./project-audits-validation.js";
import { analyzeTestPlacement } from "./test-placement-analysis.js";
import { createTestPlacementFindings } from "./test-placement-findings.js";

/**
 * @typedef {import("./test-placement-findings.js").TestPlacementFindings} TestPlacementFindings
 *
 * @typedef {object} ProjectAuditEntry
 * @property {string} projectId
 * @property {string} projectRoot
 * @property {object} audit
 *
 * @typedef {object} ProjectAudits
 * @property {"project-audits/v1"} schemaVersion
 * @property {ProjectAuditEntry[]} audits
 */

/**
 * @param {ProjectAudits} projectAudits
 * @returns {TestPlacementFindings}
 */
export function analyzeProjectTestPlacement(projectAudits) {
  validateProjectAudits(projectAudits);

  const findings = projectAudits.audits.flatMap((entry) => {
    const placement = analyzeTestPlacement(entry.audit, { owner: entry.projectRoot });

    return placement.findings.map((finding) => {
      if (escapesProjectRoot(finding.testFile)) {
        const sourcePath = extractMatchedSourcePath(finding.evidence) ?? "unknown source target";
        const repoTestFile = resolveProjectPath(entry.projectRoot, finding.testFile);
        const repoSourcePath = joinProjectPath(entry.projectRoot, sourcePath);
        const currentOwner = inferProjectOwner(projectAudits.audits, repoTestFile, entry.projectRoot);

        return {
          ...finding,
          id: `${entry.projectId}:move:${repoTestFile}:${repoSourcePath}`,
          testFile: repoTestFile,
          currentOwner,
          suggestedOwner: entry.projectRoot,
          action: "move",
          reason: "Existing test path escapes the audited project root while covering source owned by this project.",
          evidence: [
            `project id: ${entry.projectId}`,
            `current owner: ${currentOwner}`,
            `suggested owner: ${entry.projectRoot}`,
            "test path escapes audited project root",
            ...finding.evidence.map((item) => prefixSourceEvidence(item, entry.projectRoot))
          ]
        };
      }

      return {
        ...finding,
        id: `${entry.projectId}:${finding.id}`,
        testFile: joinProjectPath(entry.projectRoot, finding.testFile),
        currentOwner: entry.projectRoot,
        suggestedOwner: entry.projectRoot,
        evidence: [
          `project id: ${entry.projectId}`,
          ...finding.evidence.map((item) => prefixSourceEvidence(item, entry.projectRoot))
        ]
      };
    });
  });

  return createTestPlacementFindings(findings);
}

/**
 * @param {string} item
 * @param {string} projectRoot
 * @returns {string}
 */
function prefixSourceEvidence(item, projectRoot) {
  const prefix = "matches source target ";
  if (!item.startsWith(prefix)) return item;

  return `${prefix}${joinProjectPath(projectRoot, item.slice(prefix.length))}`;
}

/**
 * @param {string} projectRoot
 * @param {string} relativePath
 * @returns {string}
 */
function joinProjectPath(projectRoot, relativePath) {
  const normalizedRoot = normalizePath(projectRoot);
  const normalizedPath = normalizePath(relativePath);

  if (normalizedRoot === "." || normalizedRoot.length === 0) {
    return normalizedPath;
  }

  return `${normalizedRoot}/${normalizedPath}`;
}

/**
 * @param {string} projectRoot
 * @param {string} relativePath
 * @returns {string}
 */
function resolveProjectPath(projectRoot, relativePath) {
  const parts = [];
  const combined = joinProjectPath(projectRoot, relativePath);

  for (const part of combined.split("/")) {
    if (part.length === 0 || part === ".") continue;

    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join("/") || ".";
}

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
function escapesProjectRoot(relativePath) {
  const normalizedPath = normalizePath(relativePath);
  return normalizedPath === ".." || normalizedPath.startsWith("../") || normalizedPath.includes("/../");
}

/**
 * @param {ProjectAuditEntry[]} entries
 * @param {string} repoRelativePath
 * @param {string} fallbackOwner
 * @returns {string}
 */
function inferProjectOwner(entries, repoRelativePath, fallbackOwner) {
  const normalizedPath = normalizePath(repoRelativePath);
  const matchingEntry = entries
    .filter((entry) => entry.projectRoot !== fallbackOwner)
    .map((entry) => ({ entry, root: normalizePath(entry.projectRoot) }))
    .filter(({ root }) => root !== "." && (normalizedPath === root || normalizedPath.startsWith(`${root}/`)))
    .sort((left, right) => right.root.length - left.root.length)[0];

  return matchingEntry?.entry.projectRoot ?? "outside audited project root";
}

/**
 * @param {string[]} evidence
 * @returns {string | undefined}
 */
function extractMatchedSourcePath(evidence) {
  const prefix = "matches source target ";
  const item = evidence.find((entry) => entry.startsWith(prefix));

  return item?.slice(prefix.length);
}

/**
 * @param {string} currentPath
 * @returns {string}
 */
function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/");
}
