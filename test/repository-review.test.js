import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { adapters } from "../src/core/adapter-registry.js";
import { auditDetectedProjects } from "../src/core/project-auditor.js";
import { createRepositoryAnalysis } from "../src/core/repository-analysis.js";
import { createRepositoryReview, DEFAULT_REVIEW_LIMIT, MAX_REVIEW_LIMIT, MAX_REVIEW_PATHS, normalizeReviewLimit } from "../src/core/repository-review.js";
import { reviewProjectAudits, reviewRepository } from "../src/core/tool-api.js";
import { assertMatchesSchema } from "./support/json-schema-validator.js";

const polyglotRoot = path.resolve("examples/polyglot-workspace");
const reviewSchema = JSON.parse(fs.readFileSync("schemas/repository-review-v1.schema.json", "utf8"));

describe("repository review", () => {
  it("derives a bounded review that agrees with the complete analysis", () => {
    const projectAudits = auditDetectedProjects(polyglotRoot);
    const analysis = createRepositoryAnalysis(projectAudits);
    const review = createRepositoryReview(projectAudits);

    assertMatchesSchema(review, reviewSchema, "repository-review/v1");
    assert.equal(review.schemaVersion, "repository-review/v1");
    assert.equal(review.root, analysis.root);
    assert.deepEqual(review.summary, {
      ...analysis.summary,
      limit: DEFAULT_REVIEW_LIMIT,
      displayedCandidateCount: analysis.candidateRanking.candidates.length,
      displayedPlanItemCount: analysis.testPlan.items.length,
      truncated: false
    });
    assert.deepEqual(review.verificationCommands, analysis.verificationCommands);
    assert.deepEqual(review.auditSummary, analysis.auditSummary);
    assert.deepEqual(review.findings.summary, analysis.findings.summary);
    assert.deepEqual(
      review.findings.items,
      analysis.findings.findings.map(({ existingTestPaths, ...finding }) => ({ ...finding, existingTestCount: existingTestPaths.length }))
    );
    assert.deepEqual(review.stats, analysis.stats);
    assert.deepEqual(review.blockers, [
      { projectId: "services/api", projectRoot: "services/api", adapterId: "python", blocker: "No supported Python test framework detected." },
      { projectId: "services/api", projectRoot: "services/api", adapterId: "python", blocker: "No runnable Python test command detected from project markers." }
    ]);
    assert.equal(review.blockers.length, analysis.summary.blockerCount);
    assert.equal(Object.hasOwn(review, "projectAudits"), false);
    assert.equal(Object.hasOwn(review, "candidateRanking"), false);
    assert.equal(Object.hasOwn(review, "testPlan"), false);
  });

  it("keeps ranking and plan order while reducing evidence to counts", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/node-vitest-basic"));
    const analysis = createRepositoryAnalysis(projectAudits);
    const review = createRepositoryReview(projectAudits);

    assert.deepEqual(
      review.topCandidates.map((candidate) => candidate.projectTargetId),
      analysis.candidateRanking.candidates.map((candidate) => candidate.projectTargetId)
    );
    assert.deepEqual(
      review.topPlanItems.map((item) => item.projectItemId),
      analysis.testPlan.items.map((item) => item.projectItemId)
    );
    analysis.candidateRanking.candidates.forEach((candidate, index) => {
      const { existingTestPaths, existingTestEvidence = [], ...rest } = candidate;
      assert.deepEqual(review.topCandidates[index], {
        ...rest,
        existingTestCount: existingTestPaths.length,
        directEvidenceCount: existingTestEvidence.filter((evidence) => evidence.strength === "direct").length
      });
    });
    assert.ok(review.topCandidates.some((candidate) => candidate.existingTestCount > 0), "fixture has covered targets");
    assert.ok(review.topCandidates.some((candidate) => candidate.directEvidenceCount > 0), "fixture has direct evidence");
    assert.deepEqual(
      review.topExecutionHints,
      analysis.executionHints.items.filter((hint) => review.topPlanItems.some((item) => item.projectItemId === hint.planItemId))
    );
    assert.equal(review.topExecutionHints.length, review.topPlanItems.length);
  });

  it("caps the ranked lists at the limit and reports the totals", () => {
    const projectAudits = auditDetectedProjects(polyglotRoot);
    const review = createRepositoryReview(projectAudits, { limit: 2 });

    assert.equal(review.summary.limit, 2);
    assert.equal(review.summary.truncated, true);
    assert.equal(review.summary.candidateCount, 3);
    assert.equal(review.summary.planItemCount, 3);
    assert.equal(review.summary.displayedCandidateCount, 2);
    assert.equal(review.summary.displayedPlanItemCount, 2);
    assert.equal(review.topCandidates.length, 2);
    assert.equal(review.topPlanItems.length, 2);
    assert.deepEqual(review.topExecutionHints.map((hint) => hint.planItemId), review.topPlanItems.map((item) => item.projectItemId));
    assert.equal(review.blockers.length, 2, "blockers are never capped");
    assertMatchesSchema(review, reviewSchema, "repository-review/v1 limited");
  });

  it("never grows with the number of tests that reach one target", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/node-vitest-basic"));
    const [entry] = projectAudits.audits;
    const target = entry.audit.coveredButRisky[0];
    const injectedPaths = Array.from({ length: 2000 }, (_, index) => `test/generated/fanout-${index}.test.ts`);
    target.existingTestPaths = [...target.existingTestPaths, ...injectedPaths];
    target.existingTestEvidence = [
      ...(target.existingTestEvidence ?? []),
      ...injectedPaths.map((testPath) => ({ testPath, kind: "bounded-dependency", strength: "indirect" }))
    ];
    const analysis = createRepositoryAnalysis(projectAudits);
    const review = createRepositoryReview(projectAudits, { limit: MAX_REVIEW_LIMIT });
    const serialized = JSON.stringify(review);

    assertMatchesSchema(review, reviewSchema, "repository-review/v1 with fan-out");
    assert.ok(JSON.stringify(analysis).length > 400000, "the complete bundle carries the fan-out");
    assert.ok(serialized.length < 40000, `review is ${serialized.length} characters`);
    assert.doesNotMatch(serialized, /fanout-1999/);

    const finding = review.findings.items.find((item) => item.targetId === target.id);
    assert.equal(finding.existingTestCount, target.existingTestPaths.length);
    assert.equal(Object.hasOwn(finding, "existingTestPaths"), false);
    const evidenceLine = finding.evidence.find((line) => line.startsWith("existing tests:"));
    assert.equal(
      evidenceLine,
      `existing tests: ${target.existingTestPaths.slice(0, MAX_REVIEW_PATHS).join(", ")} (+${target.existingTestPaths.length - MAX_REVIEW_PATHS} more; see explain_target)`
    );

    const candidate = review.topCandidates.find((item) => item.targetId === target.id);
    assert.equal(candidate.existingTestCount, target.existingTestPaths.length);
    const hint = review.topExecutionHints.find((item) => item.path.endsWith(target.path));
    const fullHint = analysis.executionHints.items.find((item) => item.planItemId === hint.planItemId);
    assert.equal(hint.contextScope.paths.length, MAX_REVIEW_PATHS);
    assert.deepEqual(hint.contextScope.paths, fullHint.contextScope.paths.slice(0, MAX_REVIEW_PATHS));
    assert.equal(hint.contextScope.omittedPathCount, fullHint.contextScope.paths.length - MAX_REVIEW_PATHS);
    assert.ok(review.topExecutionHints.every((item) => item.contextScope.paths.length <= MAX_REVIEW_PATHS));

    const untouched = review.topExecutionHints.find((item) => item.contextScope.paths.length < MAX_REVIEW_PATHS);
    assert.ok(untouched, "fixture has a hint below the cap");
    assert.equal(Object.hasOwn(untouched.contextScope, "omittedPathCount"), false);
  });

  it("validates the limit without echoing it", () => {
    assert.equal(normalizeReviewLimit(undefined), DEFAULT_REVIEW_LIMIT);
    assert.equal(normalizeReviewLimit(1), 1);
    assert.equal(normalizeReviewLimit(MAX_REVIEW_LIMIT), MAX_REVIEW_LIMIT);
    for (const limit of [0, -1, 1.5, MAX_REVIEW_LIMIT + 1, "10", null, Number.NaN]) {
      assert.throws(
        () => normalizeReviewLimit(limit),
        (error) => error.name === "InvalidOptionError" && error.option === "limit" && /between 1 and 500/.test(error.message)
      );
    }
  });

  it("is deterministic and matches the tool API entrypoints", () => {
    const first = reviewRepository(polyglotRoot, { limit: 2 });
    const second = reviewRepository(polyglotRoot, { limit: 2 });
    const fromArtifact = reviewProjectAudits(auditDetectedProjects(polyglotRoot), { limit: 2 });

    assert.deepEqual(first, second);
    assert.deepEqual(first, fromArtifact);
    assert.deepEqual(
      reviewRepository(polyglotRoot, { excludeProjectRoots: ["apps/**"] }).auditSummary.projects.map((project) => project.projectRoot),
      ["services/api"]
    );
  });

  it("carries failed projects through as coverage gaps", (t) => {
    const kotlin = adapters.find((adapter) => adapter.id === "kotlin");
    t.mock.method(kotlin, "audit", () => {
      throw new TypeError("injected");
    });

    const review = reviewRepository(polyglotRoot);

    assertMatchesSchema(review, reviewSchema, "repository-review/v1 with failures");
    assert.equal(review.summary.failedProjectCount, 1);
    assert.equal(review.summary.auditCoverage, "partial");
    assert.deepEqual(review.auditSummary.failedProjects.map((project) => project.projectRoot), ["apps/android"]);
    assert.ok(review.topCandidates.every((candidate) => candidate.projectRoot !== "apps/android"));
  });
});
