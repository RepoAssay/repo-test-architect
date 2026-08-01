import assert from "node:assert/strict";
import path from "node:path";
import { getAdapter } from "../../src/core/adapter-registry.js";
import { explainTarget } from "../../src/core/explain-target.js";
import { rankTestCandidates } from "../../src/core/rank-test-candidates.js";
import { renderMarkdownReport } from "../../src/core/report.js";
import { createTestPlan } from "../../src/core/test-plan.js";
import {
  analyzeProjectAudits,
  analyzeRepoProjectTestPlacement,
  auditRepoProjects,
  collectRepoProjectFindings,
  collectRepoProjectStats,
  generateRepoProjectTestPlan,
  getPlanExecutionHints,
  rankRepoProjectCandidates,
  summarizeRepoProjectAudits
} from "../../src/core/tool-api.js";

const portableEvidenceStrengths = {
  "bounded-dependency": ["indirect"],
  "browser-route-match": ["indirect"],
  "csharp-symbol-reference": ["direct"],
  "csharp-test-helper": ["indirect"],
  "direct-relative-import": ["direct"],
  "elixir-module-reference": ["direct"],
  "filename-convention": ["naming"],
  "go-source-dependency": ["indirect"],
  "go-symbol-reference": ["direct", "referenced"],
  "jvm-symbol-reference": ["direct", "referenced"],
  "php-symbol-reference": ["direct", "referenced"],
  "package-entry-import": ["referenced"],
  "python-module-import": ["direct"],
  "python-package-reexport": ["referenced"],
  "python-pytest-fixture": ["indirect"],
  "python-test-client-route": ["indirect"],
  "referenced-relative-reexport": ["referenced"],
  "ruby-constant-reference": ["direct", "referenced"],
  "rust-symbol-reference": ["direct"],
  "swift-symbol-reference": ["referenced"],
  "tsconfig-path-import": ["direct"]
};

export function assertAdapterConformance({
  adapterId,
  fixturePath,
  expectedMaturity = "supported",
  expectedProfile = {}
}) {
  const root = path.resolve(fixturePath);
  const adapter = getAdapter(adapterId);
  const first = adapter.audit(root);
  const second = adapter.audit(root);
  const serialized = JSON.stringify(first);

  assert.equal(adapter.maturity, expectedMaturity, `${adapterId} must expose the expected maturity`);
  assert.ok(adapter.ecosystems.length > 0, `${adapterId} must expose ecosystems`);
  assert.ok(adapter.languages.length > 0, `${adapterId} must expose languages`);
  assert.ok(adapter.supportedProjectTypes.length > 0, `${adapterId} must expose project types`);
  assert.ok(adapter.emittedArtifacts.includes("audit/v1"), `${adapterId} must advertise audit/v1`);

  assert.equal(first.schemaVersion, "audit/v1");
  assert.equal(first.profile.root, root);
  assert.equal(JSON.stringify(second), serialized, `${adapterId} repeated audits must produce identical JSON`);
  assert.deepEqual(JSON.parse(serialized), first, `${adapterId} audit JSON must not discard undefined values`);

  for (const [field, expected] of Object.entries(expectedProfile)) {
    if (Array.isArray(expected)) {
      assert.deepEqual(first.profile[field], expected, `${adapterId} profile.${field}`);
    } else {
      assert.equal(first.profile[field], expected, `${adapterId} profile.${field}`);
    }
  }

  assertPortableAuditPaths(first, adapterId);
  assertCategorySemantics(first, adapterId);
  assertDownstreamAgreement(first, adapterId);
  assertMarkdownAgreement(first, adapterId);
  assertProjectPipelineAgreement(first, root, adapterId);

  return first;
}

function assertPortableAuditPaths(audit, adapterId) {
  const targets = [
    ...audit.untestedCandidates,
    ...audit.coveredButRisky,
    ...audit.recommended,
    ...audit.skipped
  ];

  for (const target of targets) {
    assertPortableRelativePath(target.id, `${adapterId} target id`);
    assertPortableRelativePath(target.path, `${adapterId} target path`);
    for (const testPath of target.existingTestPaths ?? []) {
      assertPortableRelativePath(testPath, `${adapterId} existing test path`);
    }
    for (const evidence of target.existingTestEvidence ?? []) {
      assertPortableRelativePath(evidence.testPath, `${adapterId} evidence test path`);
    }
  }
}

function assertCategorySemantics(audit, adapterId) {
  const categorized = [
    ...audit.untestedCandidates,
    ...audit.coveredButRisky,
    ...audit.skipped
  ];
  const categorizedIds = categorized.map((target) => target.id);
  const actionableIds = [
    ...audit.untestedCandidates,
    ...audit.coveredButRisky
  ].map((target) => target.id);
  const recommendedIds = audit.recommended.map((target) => target.id);

  assert.equal(new Set(categorizedIds).size, categorizedIds.length, `${adapterId} target ids must be unique across categories`);
  assert.deepEqual(
    [...recommendedIds].sort(),
    [...actionableIds].sort(),
    `${adapterId} recommended targets must equal untested plus covered-but-risky targets`
  );

  for (const target of audit.untestedCandidates) {
    assert.deepEqual(target.existingTestPaths, [], `${adapterId} untested target ${target.id} cannot cite existing tests`);
    assert.ok(!target.existingTestEvidence?.length, `${adapterId} untested target ${target.id} cannot cite evidence`);
  }

  for (const target of audit.coveredButRisky) {
    assert.ok(target.existingTestPaths.length > 0, `${adapterId} covered target ${target.id} must cite an existing test`);
    assert.ok(target.existingTestEvidence?.length > 0, `${adapterId} covered target ${target.id} must cite evidence`);

    for (const evidence of target.existingTestEvidence) {
      assert.ok(
        target.existingTestPaths.includes(evidence.testPath),
        `${adapterId} evidence path ${evidence.testPath} must appear in existingTestPaths`
      );
      assert.ok(
        portableEvidenceStrengths[evidence.kind]?.includes(evidence.strength),
        `${adapterId} ${evidence.kind} cannot use ${evidence.strength} strength`
      );
      if (evidence.strength === "indirect") {
        assert.equal(evidence.usage, undefined, `${adapterId} indirect evidence cannot claim direct usage`);
      } else {
        assert.equal(evidence.viaUsage, undefined, `${adapterId} non-indirect evidence cannot claim entrypoint usage`);
      }
    }
  }
}

function assertDownstreamAgreement(audit, adapterId) {
  const plan = createTestPlan(audit);
  const ranking = rankTestCandidates(audit);
  const expectedIds = audit.recommended.map((target) => target.id).sort();
  const planIds = plan.items
    .filter((item) => item.action !== "defer")
    .map((item) => item.targetId)
    .sort();
  const rankingIds = ranking.candidates.map((candidate) => candidate.targetId).sort();

  assert.equal(plan.summary.confidence, audit.profile.confidence, `${adapterId} plan confidence must agree`);
  assert.equal(plan.summary.verificationCommand, audit.profile.testCommand, `${adapterId} plan command must agree`);
  assert.deepEqual(plan.blockers, audit.profile.blockers, `${adapterId} plan blockers must agree`);
  assert.deepEqual(planIds, expectedIds, `${adapterId} plan targets must agree`);

  assert.equal(ranking.summary.confidence, audit.profile.confidence, `${adapterId} ranking confidence must agree`);
  assert.equal(ranking.summary.verificationCommand, audit.profile.testCommand, `${adapterId} ranking command must agree`);
  assert.deepEqual(ranking.blockers, audit.profile.blockers, `${adapterId} ranking blockers must agree`);
  assert.deepEqual(rankingIds, expectedIds, `${adapterId} ranking targets must agree`);

  for (const target of audit.recommended) {
    const explanation = explainTarget(audit, target.id);
    assert.equal(explanation.targetId, target.id, `${adapterId} explanation target id must agree`);
    assert.equal(explanation.path, target.path, `${adapterId} explanation path must agree`);
    assert.deepEqual(explanation.existingTestPaths, target.existingTestPaths, `${adapterId} explanation test paths must agree`);
    assert.deepEqual(explanation.existingTestEvidence, target.existingTestEvidence, `${adapterId} explanation evidence must agree`);
  }
}

function assertMarkdownAgreement(audit, adapterId) {
  const markdown = renderMarkdownReport(audit);

  assert.match(markdown, new RegExp(`^- Test command: ${escapeRegExp(audit.profile.testCommand ?? "none detected")}$`, "m"));
  assert.match(markdown, new RegExp(`^- Confidence: ${audit.profile.confidence}$`, "m"));

  for (const blocker of audit.profile.blockers) {
    assert.ok(markdown.includes(`- ${blocker}`), `${adapterId} Markdown must include blocker ${blocker}`);
  }

  for (const target of [...audit.untestedCandidates, ...audit.coveredButRisky, ...audit.skipped]) {
    assert.ok(markdown.includes(`- ${target.name}:`), `${adapterId} Markdown must include target ${target.name}`);
  }
}

function assertProjectPipelineAgreement(audit, root, adapterId) {
  const projectAudits = auditRepoProjects(root);

  assert.equal(projectAudits.root, root, `${adapterId} project audit root must agree`);
  assert.deepEqual(projectAudits.summary, {
    projectCount: 1,
    auditedProjectCount: 1,
    skippedProjectCount: 0
  }, `${adapterId} conformance fixture must resolve to one supported project`);
  assert.equal(projectAudits.audits[0].projectId, ".", `${adapterId} project id must agree`);
  assert.equal(projectAudits.audits[0].projectRoot, ".", `${adapterId} project root must agree`);
  assert.equal(projectAudits.audits[0].adapterId, adapterId, `${adapterId} project adapter must agree`);
  assert.deepEqual(projectAudits.audits[0].audit, audit, `${adapterId} direct and project audits must agree`);

  const summary = summarizeRepoProjectAudits(projectAudits);
  const ranking = rankRepoProjectCandidates(projectAudits);
  const plan = generateRepoProjectTestPlan(projectAudits);
  const hints = getPlanExecutionHints(plan);
  const findings = collectRepoProjectFindings(projectAudits);
  const placement = analyzeRepoProjectTestPlacement(projectAudits);
  const stats = collectRepoProjectStats(projectAudits);
  const analysis = analyzeProjectAudits(projectAudits);
  const directRanking = rankTestCandidates(audit);
  const directPlan = createTestPlan(audit);
  const rankedTargetIds = directRanking.candidates.map((candidate) => candidate.targetId);
  const actionablePlanIds = plan.items
    .filter((item) => item.action !== "defer")
    .map((item) => item.targetId);

  assert.deepEqual(summary.summary, {
    projectCount: 1,
    auditedProjectCount: 1,
    unsupportedProjectCount: 0,
    auditCoverage: "complete",
    unsupportedReasons: [],
    untestedCandidateCount: audit.untestedCandidates.length,
    coveredButRiskyCount: audit.coveredButRisky.length,
    skippedTargetCount: audit.skipped.length,
    riskCount: audit.risks.length
  }, `${adapterId} project summary counts must agree`);
  assert.deepEqual(
    summary.projects[0].topCandidateIds,
    rankedTargetIds.slice(0, 3),
    `${adapterId} project summary top candidates must use canonical ranking order`
  );
  assert.deepEqual(
    ranking.candidates.map((candidate) => candidate.targetId),
    rankedTargetIds,
    `${adapterId} project and direct rankings must agree`
  );
  assert.deepEqual(actionablePlanIds, rankedTargetIds, `${adapterId} project plan and ranking order must agree`);
  assert.deepEqual(plan.projectPlans[0].plan, directPlan, `${adapterId} direct and project plans must agree`);

  assertProjectEvidenceAgreement(audit, ranking, plan, findings, adapterId);
  assertProjectPlacementAgreement(audit, placement, adapterId);
  assertProjectStatsAgreement(audit, stats, adapterId);

  assert.equal(hints.source.schemaVersion, "project-test-plan/v1", `${adapterId} hints source schema must agree`);
  assert.equal(hints.source.itemCount, plan.items.length, `${adapterId} hints source count must agree`);
  assert.deepEqual(
    hints.items.map((item) => item.planItemId),
    plan.items.map((item) => item.projectItemId),
    `${adapterId} execution hints must retain project plan item ids`
  );

  assert.deepEqual(analysis.projectAudits, projectAudits, `${adapterId} analysis project audits must agree`);
  assert.deepEqual(analysis.auditSummary, summary, `${adapterId} analysis summary must agree`);
  assert.deepEqual(analysis.candidateRanking, ranking, `${adapterId} analysis ranking must agree`);
  assert.deepEqual(analysis.testPlan, plan, `${adapterId} analysis plan must agree`);
  assert.deepEqual(analysis.executionHints, hints, `${adapterId} analysis hints must agree`);
  assert.deepEqual(analysis.findings, findings, `${adapterId} analysis findings must agree`);
  assert.deepEqual(analysis.stats, stats, `${adapterId} analysis stats must agree`);
  assert.deepEqual(analysis.verificationCommands, [
    { command: audit.profile.testCommand, projectCount: 1 }
  ], `${adapterId} analysis verification commands must agree`);
  assert.deepEqual(analysis.summary, {
    projectCount: 1,
    auditedProjectCount: 1,
    unsupportedProjectCount: 0,
    auditCoverage: "complete",
    blockerCount: audit.profile.blockers.length,
    findingCount: findings.summary.findingCount,
    candidateCount: ranking.summary.candidateCount,
    planItemCount: plan.summary.itemCount,
    verificationCommandCount: 1
  }, `${adapterId} repository analysis counts must agree`);

  assertPortableProjectPaths({ summary, ranking, plan, findings, placement, hints }, adapterId);
  for (const [label, artifact] of Object.entries({
    projectAudits,
    summary,
    ranking,
    plan,
    hints,
    findings,
    placement,
    stats,
    analysis
  })) {
    assertJsonRoundTrip(artifact, `${adapterId} ${label}`);
  }

  assertBlockedPipelineAgreement(projectAudits, audit, adapterId);
}

function assertProjectEvidenceAgreement(audit, ranking, plan, findings, adapterId) {
  const targetsById = new Map(audit.recommended.map((target) => [target.id, target]));

  for (const candidate of ranking.candidates) {
    const target = targetsById.get(candidate.targetId);
    assert.ok(target, `${adapterId} ranked target ${candidate.targetId} must exist in the audit`);
    assert.deepEqual(candidate.existingTestPaths, target.existingTestPaths ?? [], `${adapterId} ranking test paths must agree`);
    assert.deepEqual(candidate.existingTestEvidence, target.existingTestEvidence, `${adapterId} ranking evidence must agree`);
  }

  for (const item of plan.items.filter((candidate) => candidate.action !== "defer")) {
    const target = targetsById.get(item.targetId);
    assert.ok(target, `${adapterId} planned target ${item.targetId} must exist in the audit`);
    assert.deepEqual(item.existingTestPaths, target.existingTestPaths ?? [], `${adapterId} plan test paths must agree`);
    assert.deepEqual(item.existingTestEvidence, target.existingTestEvidence, `${adapterId} plan evidence must agree`);
  }

  assert.equal(findings.summary.categoryCounts["missing-coverage"], audit.untestedCandidates.length, `${adapterId} missing findings must agree`);
  assert.equal(findings.summary.categoryCounts["weak-existing-coverage"], audit.coveredButRisky.length, `${adapterId} weak findings must agree`);
  assert.equal(findings.summary.categoryCounts["blocked-project"], audit.profile.blockers.length, `${adapterId} blocker findings must agree`);

  for (const target of audit.coveredButRisky) {
    const finding = findings.findings.find((entry) => entry.category === "weak-existing-coverage" && entry.targetId === target.id);
    assert.ok(finding, `${adapterId} covered target ${target.id} must have a weak-coverage finding`);
    assert.deepEqual(finding.existingTestPaths, target.existingTestPaths, `${adapterId} finding test paths must agree`);
  }
}

function assertProjectPlacementAgreement(audit, placement, adapterId) {
  const expectedKeepCount = audit.coveredButRisky.reduce(
    (count, target) => count + (target.existingTestPaths?.length ?? 0),
    0
  );
  assert.equal(placement.findings.length, expectedKeepCount, `${adapterId} placement count must agree with covered test paths`);
  assert.ok(placement.findings.every((finding) => finding.action === "keep"), `${adapterId} conformance placement must stay inside its project`);
}

function assertProjectStatsAgreement(audit, stats, adapterId) {
  assert.deepEqual(stats.counts, {
    untestedCandidateCount: audit.untestedCandidates.length,
    coveredButRiskyCount: audit.coveredButRisky.length,
    skippedTargetCount: audit.skipped.length,
    riskCount: audit.risks.length,
    blockerCount: audit.profile.blockers.length
  }, `${adapterId} project stats counts must agree`);
  assert.deepEqual(stats.adapters, [{ adapterId, projectCount: 1 }], `${adapterId} project stats adapter count must agree`);
  assert.deepEqual(
    {
      evidenceStrengths: stats.distributions.evidenceStrengths,
      evidenceKinds: stats.distributions.evidenceKinds,
      evidenceUsage: stats.distributions.evidenceUsage,
      evidenceViaUsage: stats.distributions.evidenceViaUsage
    },
    collectAuditEvidenceDistributions(audit),
    `${adapterId} project stats evidence distributions must agree`
  );
}

function assertBlockedPipelineAgreement(projectAudits, audit, adapterId) {
  const blocker = `${adapterId} conformance blocker`;
  const blockedAudit = structuredClone(audit);
  blockedAudit.profile.confidence = "low";
  blockedAudit.profile.blockers = [blocker];
  delete blockedAudit.profile.testCommand;

  const blockedProjectAudits = structuredClone(projectAudits);
  blockedProjectAudits.audits[0].audit = blockedAudit;
  const directPlan = createTestPlan(blockedAudit);
  const directRanking = rankTestCandidates(blockedAudit);
  const summary = summarizeRepoProjectAudits(blockedProjectAudits);
  const plan = generateRepoProjectTestPlan(blockedProjectAudits);
  const ranking = rankRepoProjectCandidates(blockedProjectAudits);
  const findings = collectRepoProjectFindings(blockedProjectAudits);
  const stats = collectRepoProjectStats(blockedProjectAudits);
  const analysis = analyzeProjectAudits(blockedProjectAudits);

  assert.equal(Object.hasOwn(directPlan.summary, "verificationCommand"), false, `${adapterId} blocked plan must omit a command`);
  assert.equal(Object.hasOwn(directRanking.summary, "verificationCommand"), false, `${adapterId} blocked ranking must omit a command`);
  assert.deepEqual(directPlan.blockers, [blocker], `${adapterId} blocked plan must retain blockers`);
  assert.deepEqual(directRanking.blockers, [blocker], `${adapterId} blocked ranking must retain blockers`);
  assert.equal(Object.hasOwn(summary.projects[0], "testCommand"), false, `${adapterId} blocked project summary must omit a command`);
  assert.equal(Object.hasOwn(plan.projectPlans[0].plan.summary, "verificationCommand"), false, `${adapterId} blocked project plan must omit a command`);
  assert.deepEqual(stats.distributions.testCommands, {}, `${adapterId} blocked stats must omit commands`);
  assert.equal(findings.summary.categoryCounts["blocked-project"], 1, `${adapterId} blocked findings must retain the blocker`);
  assert.ok(findings.findings.some((finding) => finding.rationale.includes(blocker)), `${adapterId} blocker rationale must remain visible`);
  assert.deepEqual(analysis.verificationCommands, [], `${adapterId} blocked analysis must omit commands`);
  assert.equal(analysis.summary.verificationCommandCount, 0, `${adapterId} blocked analysis command count must agree`);
  assert.equal(analysis.summary.blockerCount, 1, `${adapterId} blocked analysis blocker count must agree`);

  for (const [label, artifact] of Object.entries({
    blockedAudit,
    directPlan,
    directRanking,
    summary,
    plan,
    ranking,
    findings,
    stats,
    analysis
  })) {
    assertJsonRoundTrip(artifact, `${adapterId} blocked ${label}`);
  }
}

function assertPortableProjectPaths({ summary, ranking, plan, findings, placement, hints }, adapterId) {
  for (const project of summary.projects) {
    assertPortableRelativePath(project.projectId, `${adapterId} summary project id`);
    assertPortableRelativePath(project.projectRoot, `${adapterId} summary project root`);
    for (const targetId of project.topCandidateIds) {
      assertPortableRelativePath(targetId, `${adapterId} summary target id`);
    }
  }
  for (const candidate of ranking.candidates) {
    assertPortableRelativePath(candidate.projectRoot, `${adapterId} ranking project root`);
    assertPortableRelativePath(candidate.path, `${adapterId} ranking path`);
  }
  for (const item of plan.items) {
    assertPortableRelativePath(item.projectRoot, `${adapterId} plan project root`);
    assertPortableRelativePath(item.path, `${adapterId} plan path`);
    for (const testPath of item.existingTestPaths) assertPortableRelativePath(testPath, `${adapterId} plan test path`);
  }
  for (const finding of findings.findings) {
    assertPortableRelativePath(finding.projectRoot, `${adapterId} finding project root`);
    if (finding.path) assertPortableRelativePath(finding.path, `${adapterId} finding path`);
    for (const testPath of finding.existingTestPaths) assertPortableRelativePath(testPath, `${adapterId} finding test path`);
  }
  for (const finding of placement.findings) {
    assertPortableRelativePath(finding.testFile, `${adapterId} placement test path`);
  }
  for (const hint of hints.items) {
    for (const contextPath of hint.contextScope.paths) assertPortableRelativePath(contextPath, `${adapterId} hint context path`);
  }
}

function collectAuditEvidenceDistributions(audit) {
  const distributions = {
    evidenceStrengths: {},
    evidenceKinds: {},
    evidenceUsage: {},
    evidenceViaUsage: {}
  };
  const targets = [...audit.untestedCandidates, ...audit.coveredButRisky, ...audit.skipped];

  for (const target of targets) {
    for (const evidence of target.existingTestEvidence ?? []) {
      increment(distributions.evidenceStrengths, evidence.strength);
      increment(distributions.evidenceKinds, evidence.kind);
      if (evidence.usage) increment(distributions.evidenceUsage, evidence.usage);
      if (evidence.viaUsage) increment(distributions.evidenceViaUsage, evidence.viaUsage);
    }
  }

  return Object.fromEntries(
    Object.entries(distributions).map(([key, values]) => [
      key,
      Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)))
    ])
  );
}

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

function assertJsonRoundTrip(artifact, label) {
  assert.deepEqual(JSON.parse(JSON.stringify(artifact)), artifact, `${label} JSON must not discard undefined values`);
}

function assertPortableRelativePath(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.length > 0, `${label} must not be empty`);
  assert.ok(!value.includes("\\"), `${label} must use forward slashes`);
  assert.ok(!path.posix.isAbsolute(value), `${label} must be repository-relative`);
  assert.ok(!/^[A-Za-z]:/.test(value), `${label} must not use a Windows drive`);
  assert.ok(!value.split("/").includes(".."), `${label} must stay within the repository`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
