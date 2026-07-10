import { classifyProjectAuditCoverage } from "./project-audit-coverage.js";
import { validateProjectAudits } from "./project-audits-validation.js";
import { collectUnsupportedReasons, normalizeUnsupportedProjects } from "./project-unsupported.js";
import { analyzeProjectTestPlacement } from "./project-test-placement-analysis.js";

const DEFAULT_MAX_FINDINGS = 10;
const AUXILIARY_PROJECT_ROOT_NAMES = new Set(["docs", "examples", "playground"]);
const MISSING_TEST_INFRASTRUCTURE_BLOCKERS = new Set([
  "No supported JS test framework detected.",
  "No runnable test command detected from package scripts or framework config."
]);

/**
 * @typedef {"missing-coverage" | "weak-existing-coverage" | "misplaced-coverage" | "low-value-direct-test" | "blocked-project"} ProjectFindingCategory
 * @typedef {"high" | "medium" | "low"} ProjectFindingSeverity
 *
 * @typedef {object} ProjectFindings
 * @property {"project-findings/v1"} schemaVersion
 * @property {string} root
 * @property {{ projectCount: number, auditedProjectCount: number, unsupportedProjectCount: number, auditCoverage: "complete" | "partial" | "none", unsupportedReasons: string[], findingCount: number, displayedFindingCount: number, maxFindings: number, highSeverityCount: number, placementFindingCount: number, blockedProjectCount: number, categoryCounts: Record<ProjectFindingCategory, number> }} summary
 * @property {object[]} findings
 * @property {object[]} unsupportedProjects
 */

/**
 * @param {object} projectAudits
 * @param {{ maxFindings?: number }} [options]
 * @returns {ProjectFindings}
 */
export function createProjectFindings(projectAudits, options = {}) {
  validateProjectAudits(projectAudits);

  const maxFindings = normalizeMaxFindings(options.maxFindings);
  const unsupportedProjects = normalizeUnsupportedProjects(projectAudits.skippedProjects);
  const coverageFindings = projectAudits.audits.flatMap(toAuditFindings);
  const placementFindings = analyzeProjectTestPlacement(projectAudits).findings
    .filter((finding) => finding.action !== "keep")
    .map(toPlacementFinding);
  const findings = [...coverageFindings, ...placementFindings].sort(bySeverityThenPriority);
  const displayedFindings = findings.slice(0, maxFindings);
  const categoryCounts = countByCategory(findings);

  return {
    schemaVersion: "project-findings/v1",
    root: projectAudits.root,
    summary: {
      projectCount: projectAudits.summary.projectCount,
      auditedProjectCount: projectAudits.summary.auditedProjectCount,
      unsupportedProjectCount: unsupportedProjects.length,
      auditCoverage: classifyProjectAuditCoverage(projectAudits.summary.auditedProjectCount, unsupportedProjects.length),
      unsupportedReasons: collectUnsupportedReasons(unsupportedProjects),
      findingCount: findings.length,
      displayedFindingCount: displayedFindings.length,
      maxFindings,
      highSeverityCount: findings.filter((finding) => finding.severity === "high").length,
      placementFindingCount: placementFindings.length,
      blockedProjectCount: categoryCounts["blocked-project"],
      categoryCounts
    },
    findings: displayedFindings,
    unsupportedProjects
  };
}

function toAuditFindings(entry) {
  const findings = [];

  for (const blocker of entry.audit.profile.blockers ?? []) {
    const auxiliaryInfrastructureBlocker =
      isAuxiliaryProjectRoot(entry.projectRoot) && MISSING_TEST_INFRASTRUCTURE_BLOCKERS.has(blocker);
    findings.push({
      id: `${entry.projectId}:blocked:${slug(blocker)}`,
      category: "blocked-project",
      severity: auxiliaryInfrastructureBlocker ? "low" : "high",
      priority: auxiliaryInfrastructureBlocker ? 1 : 9,
      projectId: entry.projectId,
      projectRoot: entry.projectRoot,
      adapterId: entry.adapterId,
      title: auxiliaryInfrastructureBlocker
        ? `${entry.projectRoot} is auxiliary and lacks independent test setup`
        : `${entry.projectRoot} cannot be fully audited`,
      rationale: [blocker],
      evidence: [
        ...(auxiliaryInfrastructureBlocker ? ["project role: auxiliary"] : []),
        `confidence: ${entry.audit.profile.confidence}`,
        `test command: ${entry.audit.profile.testCommand ?? "none detected"}`
      ],
      existingTestPaths: []
    });
  }

  for (const target of entry.audit.untestedCandidates.filter(isReportableCoverageTarget)) {
    findings.push(toTargetFinding(entry, target, "missing-coverage"));
  }

  for (const target of entry.audit.coveredButRisky.filter(isReportableCoverageTarget)) {
    findings.push(toTargetFinding(entry, target, "weak-existing-coverage"));
  }

  for (const target of entry.audit.skipped.filter((candidate) => isReportableCoverageTarget(candidate) && candidate.riskReductionScore >= 2)) {
    findings.push(toSkippedFinding(entry, target));
  }

  return findings;
}

function isAuxiliaryProjectRoot(projectRoot) {
  const normalized = projectRoot.replaceAll("\\", "/").replace(/\/$/, "");
  const rootName = normalized.split("/").at(-1);
  return AUXILIARY_PROJECT_ROOT_NAMES.has(rootName);
}

function toTargetFinding(entry, target, category) {
  const existingTestPaths = target.existingTestPaths ?? [];
  const hasExistingTests = existingTestPaths.length > 0;
  const title =
    category === "missing-coverage"
      ? `${target.name} lacks matching high-value coverage`
      : `${target.name} has coverage but still carries review risk`;

  return {
    id: `${entry.projectId}:${category}:${target.id}`,
    category,
    severity: target.risk === "high" ? "high" : "medium",
    priority: target.riskReductionScore - target.maintenanceCost,
    projectId: entry.projectId,
    projectRoot: entry.projectRoot,
    adapterId: entry.adapterId,
    targetId: target.id,
    target: target.name,
    path: target.path,
    kind: target.kind,
    testLevel: target.recommendedTestLevel,
    title,
    rationale: target.reasons ?? [],
    evidence: [
      `signals: ${target.signals.join(", ")}`,
      `risk: ${target.risk}`,
      `testability: ${target.testability}`,
      hasExistingTests ? `existing tests: ${existingTestPaths.join(", ")}` : "existing tests: none detected"
    ],
    existingTestPaths
  };
}

function toSkippedFinding(entry, target) {
  return {
    id: `${entry.projectId}:low-value-direct-test:${target.id}`,
    category: "low-value-direct-test",
    severity: "low",
    priority: target.riskReductionScore - target.maintenanceCost,
    projectId: entry.projectId,
    projectRoot: entry.projectRoot,
    adapterId: entry.adapterId,
    targetId: target.id,
    target: target.name,
    path: target.path,
    kind: target.kind,
    testLevel: "none",
    title: `${target.name} is a low-value direct test target`,
    rationale: [target.reason, target.preferredCoveragePath].filter(Boolean),
    evidence: [`signals: ${target.signals.join(", ")}`],
    existingTestPaths: []
  };
}

function toPlacementFinding(finding) {
  return {
    id: `placement:${finding.id}`,
    category: "misplaced-coverage",
    severity: finding.action === "split" ? "high" : "medium",
    priority: finding.action === "split" ? 6 : 5,
    projectId: finding.suggestedOwner,
    projectRoot: finding.suggestedOwner,
    title: `${finding.testFile} should ${finding.action === "split" ? "be split across owners" : "move closer to owned behavior"}`,
    testFile: finding.testFile,
    currentOwner: finding.currentOwner,
    suggestedOwner: finding.suggestedOwner,
    action: finding.action,
    rationale: [finding.reason],
    evidence: finding.evidence,
    existingTestPaths: [finding.testFile]
  };
}

function isReportableCoverageTarget(target) {
  return (
    typeof target?.id === "string" &&
    target.id.length > 0 &&
    typeof target.name === "string" &&
    target.name.length > 0 &&
    typeof target.path === "string" &&
    target.path.length > 0 &&
    Number.isInteger(target.riskReductionScore) &&
    Number.isInteger(target.maintenanceCost) &&
    Array.isArray(target.signals)
  );
}

function normalizeMaxFindings(maxFindings) {
  if (maxFindings === undefined) return DEFAULT_MAX_FINDINGS;
  if (!Number.isInteger(maxFindings) || maxFindings < 1) {
    throw new Error("maxFindings must be a positive integer.");
  }
  return maxFindings;
}

function countByCategory(findings) {
  const counts = {
    "missing-coverage": 0,
    "weak-existing-coverage": 0,
    "misplaced-coverage": 0,
    "low-value-direct-test": 0,
    "blocked-project": 0
  };

  for (const finding of findings) {
    counts[finding.category] += 1;
  }

  return counts;
}

function bySeverityThenPriority(a, b) {
  const severityOrder = { high: 0, medium: 1, low: 2 };
  return (
    severityOrder[a.severity] - severityOrder[b.severity] ||
    b.priority - a.priority ||
    a.projectRoot.localeCompare(b.projectRoot) ||
    a.title.localeCompare(b.title)
  );
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
