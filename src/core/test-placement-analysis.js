import { createTestPlacementFindings } from "./test-placement-findings.js";

export function analyzeTestPlacement(audit, options = {}) {
  const owner = options.owner ?? audit?.profile?.root ?? "repo";
  const findings = [];

  for (const target of audit?.coveredButRisky ?? []) {
    for (const testFile of target.existingTestPaths ?? []) {
      findings.push({
        id: `keep:${normalizePath(testFile)}:${normalizePath(target.path)}`,
        testFile: normalizePath(testFile),
        currentOwner: owner,
        suggestedOwner: owner,
        action: "keep",
        reason: "Existing test is colocated with the audited project and matches a source target in the same project.",
        evidence: [
          `matches source target ${normalizePath(target.path)}`,
          `target kind: ${target.kind}`,
          `recommended level: ${target.recommendedTestLevel}`
        ]
      });
    }
  }

  return createTestPlacementFindings(findings);
}

function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/");
}
