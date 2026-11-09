import { InvalidOptionError } from "./invalid-option-error.js";
import { createRepositoryAnalysis } from "./repository-analysis.js";

export const DEFAULT_REVIEW_LIMIT = 25;
export const MAX_REVIEW_LIMIT = 500;
// Same five-path rule the Markdown renderer applies: nested path lists never grow with test fan-out.
export const MAX_REVIEW_PATHS = 5;
const EXISTING_TESTS_EVIDENCE_PREFIX = "existing tests:";

/**
 * @typedef {object} RepositoryReview
 * @property {"repository-review/v1"} schemaVersion
 * @property {string} root
 * @property {object} summary
 * @property {Array<{ command: string, projectCount: number }>} verificationCommands
 * @property {Array<{ projectId: string, projectRoot: string, adapterId: string, blocker: string }>} blockers
 * @property {object} auditSummary
 * @property {{ summary: object, items: object[] }} findings
 * @property {object[]} topCandidates
 * @property {object[]} topPlanItems
 * @property {object[]} topExecutionHints
 * @property {object} stats
 */

/**
 * Derive the bounded repository review from one project audit pass.
 *
 * The review carries the same deterministic inputs as `repository-analysis/v1` but keeps the result
 * small enough for a model's context on large monorepos: the raw project audits are omitted, ranked
 * lists are capped at `limit`, per-test evidence collapses to counts, and the path lists that remain
 * (finding evidence, hint context scopes) keep at most MAX_REVIEW_PATHS entries plus an omitted count,
 * so the size never grows with how many tests reach one target. `explain_target` serves the complete
 * evidence for one target; `analyze_repository` serves the complete bundle.
 *
 * @param {object} projectAudits
 * @param {{ limit?: number }} [options]
 * @returns {RepositoryReview}
 */
export function createRepositoryReview(projectAudits, options = {}) {
  const limit = normalizeReviewLimit(options.limit);
  const analysis = createRepositoryAnalysis(projectAudits);
  const candidates = analysis.candidateRanking.candidates;
  const planItems = analysis.testPlan.items;
  const topCandidates = candidates.slice(0, limit).map(compactEvidence);
  const topPlanItems = planItems.slice(0, limit).map(compactEvidence);
  const topPlanItemIds = new Set(topPlanItems.map((item) => item.projectItemId));
  const topExecutionHints = analysis.executionHints.items
    .filter((hint) => topPlanItemIds.has(hint.planItemId))
    .map(boundHintPaths);

  return {
    schemaVersion: "repository-review/v1",
    root: analysis.root,
    summary: {
      ...analysis.summary,
      limit,
      displayedCandidateCount: topCandidates.length,
      displayedPlanItemCount: topPlanItems.length,
      truncated: candidates.length > limit || planItems.length > limit
    },
    verificationCommands: analysis.verificationCommands,
    blockers: collectBlockers(analysis.projectAudits),
    auditSummary: analysis.auditSummary,
    findings: {
      summary: analysis.findings.summary,
      items: analysis.findings.findings.map(compactFinding)
    },
    topCandidates,
    topPlanItems,
    topExecutionHints,
    stats: analysis.stats
  };
}

/**
 * @param {number | undefined} limit
 * @returns {number}
 */
export function normalizeReviewLimit(limit) {
  if (limit === undefined) return DEFAULT_REVIEW_LIMIT;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_REVIEW_LIMIT) {
    throw new InvalidOptionError(`limit must be an integer between 1 and ${MAX_REVIEW_LIMIT}.`, { option: "limit" });
  }

  return limit;
}

function collectBlockers(projectAudits) {
  return projectAudits.audits.flatMap((entry) =>
    (entry.audit.profile.blockers ?? []).map((blocker) => ({
      projectId: entry.projectId,
      projectRoot: entry.projectRoot,
      adapterId: entry.adapterId,
      blocker
    }))
  );
}

function compactFinding({ existingTestPaths = [], ...finding }) {
  return {
    ...finding,
    evidence: finding.evidence.map((entry) =>
      entry.startsWith(EXISTING_TESTS_EVIDENCE_PREFIX) && existingTestPaths.length > MAX_REVIEW_PATHS
        ? `${EXISTING_TESTS_EVIDENCE_PREFIX} ${existingTestPaths.slice(0, MAX_REVIEW_PATHS).join(", ")} (+${existingTestPaths.length - MAX_REVIEW_PATHS} more; see explain_target)`
        : entry
    ),
    existingTestCount: existingTestPaths.length
  };
}

function boundHintPaths(hint) {
  const { paths } = hint.contextScope;
  if (paths.length <= MAX_REVIEW_PATHS) return hint;

  return {
    ...hint,
    contextScope: {
      ...hint.contextScope,
      paths: paths.slice(0, MAX_REVIEW_PATHS),
      omittedPathCount: paths.length - MAX_REVIEW_PATHS
    }
  };
}

function compactEvidence({ existingTestPaths = [], existingTestEvidence = [], ...item }) {
  return {
    ...item,
    existingTestCount: existingTestPaths.length,
    directEvidenceCount: existingTestEvidence.filter((evidence) => evidence.strength === "direct").length
  };
}
