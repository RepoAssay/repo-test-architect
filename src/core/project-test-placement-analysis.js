import { analyzeTestPlacement } from "./test-placement-analysis.js";
import { createTestPlacementFindings } from "./test-placement-findings.js";

export function analyzeProjectTestPlacement(projectAudits) {
  if (projectAudits?.schemaVersion !== "project-audits/v1") {
    throw new Error("Expected project audits schemaVersion project-audits/v1.");
  }

  const findings = projectAudits.audits.flatMap((entry) => {
    const placement = analyzeTestPlacement(entry.audit, { owner: entry.projectRoot });

    return placement.findings.map((finding) => ({
      ...finding,
      id: `${entry.projectId}:${finding.id}`,
      testFile: joinProjectPath(entry.projectRoot, finding.testFile),
      currentOwner: entry.projectRoot,
      suggestedOwner: entry.projectRoot,
      evidence: [
        `project id: ${entry.projectId}`,
        ...finding.evidence.map((item) => prefixSourceEvidence(item, entry.projectRoot))
      ]
    }));
  });

  return createTestPlacementFindings(findings);
}

function prefixSourceEvidence(item, projectRoot) {
  const prefix = "matches source target ";
  if (!item.startsWith(prefix)) return item;

  return `${prefix}${joinProjectPath(projectRoot, item.slice(prefix.length))}`;
}

function joinProjectPath(projectRoot, relativePath) {
  const normalizedRoot = normalizePath(projectRoot);
  const normalizedPath = normalizePath(relativePath);

  if (normalizedRoot === "." || normalizedRoot.length === 0) {
    return normalizedPath;
  }

  return `${normalizedRoot}/${normalizedPath}`;
}

function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/");
}
