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
    const targetsByPath = new Map(
      (entry.audit?.coveredButRisky ?? []).map((target) => [normalizePath(target.path), target])
    );

    return placement.findings.map((finding) => {
      const sourcePath = extractMatchedSourcePath(finding.evidence) ?? "unknown source target";
      const target = targetsByPath.get(normalizePath(sourcePath));

      if (escapesProjectRoot(finding.testFile)) {
        const repoTestFile = resolveProjectPath(entry.projectRoot, finding.testFile);
        const repoSourcePath = joinProjectPath(entry.projectRoot, sourcePath);
        const currentOwner = inferProjectOwner(projectAudits.audits, repoTestFile, entry.projectRoot);
        const action = hasRecommendedLevel(finding.evidence, "integration") ? "split" : "move";

        return {
          ...finding,
          id: `${entry.projectId}:${action}:${repoTestFile}:${repoSourcePath}`,
          testFile: repoTestFile,
          currentOwner,
          suggestedOwner: entry.projectRoot,
          action,
          reason: action === "split"
            ? "Existing integration-level test escapes the audited project root while covering source owned by this project."
            : "Existing test path escapes the audited project root while covering source owned by this project.",
          evidence: [
            `project id: ${entry.projectId}`,
            `current owner: ${currentOwner}`,
            `suggested owner: ${entry.projectRoot}`,
            "test path escapes audited project root",
            ...finding.evidence.map((item) => prefixSourceEvidence(item, entry.projectRoot))
          ]
        };
      }

      const packageBoundaryFinding = createPackageBoundaryFinding({
        entry,
        entries: projectAudits.audits,
        finding,
        sourcePath,
        target
      });

      if (packageBoundaryFinding) return packageBoundaryFinding;

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
 * @param {object} input
 * @param {ProjectAuditEntry} input.entry
 * @param {ProjectAuditEntry[]} input.entries
 * @param {import("./test-placement-findings.js").TestPlacementFinding} input.finding
 * @param {string} input.sourcePath
 * @param {object | undefined} input.target
 * @returns {import("./test-placement-findings.js").TestPlacementFinding | undefined}
 */
function createPackageBoundaryFinding({ entry, entries, finding, sourcePath, target }) {
  const signals = target?.signals ?? [];

  const repoTestFile = normalizePath(finding.testFile);
  const currentOwner = inferProjectOwner(entries, repoTestFile, entry.projectRoot);
  if (currentOwner === entry.projectRoot || currentOwner === "outside audited project root") return undefined;

  const boundary = classifyPackageBoundary(entry.projectRoot, currentOwner, signals);
  if (!boundary.isPackageBoundary) return undefined;

  const repoSourcePath = joinProjectPath(entry.projectRoot, sourcePath);
  const action = hasRecommendedLevel(finding.evidence, "integration") || signals.includes("app-integration-dependency")
    ? "split"
    : "move";

  return {
    ...finding,
    id: `${entry.projectId}:${action}:${repoTestFile}:${repoSourcePath}`,
    testFile: repoTestFile,
    currentOwner,
    suggestedOwner: entry.projectRoot,
    action,
    reason: action === "split"
      ? "Existing test is owned by another project and mixes app integration behavior with package-owned behavior from this project."
      : "Existing test is owned by another project while covering package-owned behavior from this project.",
    evidence: [
      `project id: ${entry.projectId}`,
      `current owner: ${currentOwner}`,
      `suggested owner: ${entry.projectRoot}`,
      "test path belongs to another detected project",
      boundary.evidence,
      ...(signals.includes("app-integration-dependency") ? ["package boundary signal: app-integration-dependency"] : []),
      ...finding.evidence.map((item) => prefixSourceEvidence(item, entry.projectRoot))
    ]
  };
}

/**
 * @param {string} sourceOwner
 * @param {string} testOwner
 * @param {string[]} signals
 * @returns {{ isPackageBoundary: boolean, evidence: string }}
 */
function classifyPackageBoundary(sourceOwner, testOwner, signals) {
  if (signals.includes("package-owned-behavior")) {
    return {
      isPackageBoundary: true,
      evidence: "package boundary signal: package-owned-behavior"
    };
  }

  if (isPackageLikeOwner(sourceOwner) && isApplicationLikeOwner(testOwner)) {
    return {
      isPackageBoundary: true,
      evidence: "package boundary inferred from project roots: package-like source owner covered by app-like test owner"
    };
  }

  return {
    isPackageBoundary: false,
    evidence: ""
  };
}

/**
 * @param {string} owner
 * @returns {boolean}
 */
function isPackageLikeOwner(owner) {
  const normalized = normalizePath(owner);
  return /(^|\/)(packages|package|libs|lib|modules)\/[^/]+/.test(normalized);
}

/**
 * @param {string} owner
 * @returns {boolean}
 */
function isApplicationLikeOwner(owner) {
  const normalized = normalizePath(owner);
  return /(^|\/)(apps|app|clients|client|services)\/[^/]+/.test(normalized);
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
 * @param {string[]} evidence
 * @param {string} level
 * @returns {boolean}
 */
function hasRecommendedLevel(evidence, level) {
  return evidence.includes(`recommended level: ${level}`);
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
