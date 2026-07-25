import assert from "node:assert/strict";
import path from "node:path";
import { getAdapter } from "../../src/core/adapter-registry.js";
import { explainTarget } from "../../src/core/explain-target.js";
import { rankTestCandidates } from "../../src/core/rank-test-candidates.js";
import { renderMarkdownReport } from "../../src/core/report.js";
import { createTestPlan } from "../../src/core/test-plan.js";

const portableEvidenceStrengths = {
  "bounded-dependency": ["indirect"],
  "browser-route-match": ["indirect"],
  "direct-relative-import": ["direct"],
  "filename-convention": ["naming"],
  "jvm-symbol-reference": ["direct", "referenced"],
  "package-entry-import": ["referenced"],
  "python-module-import": ["direct"],
  "python-package-reexport": ["referenced"],
  "python-pytest-fixture": ["indirect"],
  "python-test-client-route": ["indirect"],
  "referenced-relative-reexport": ["referenced"],
  "swift-symbol-reference": ["referenced"],
  "tsconfig-path-import": ["direct"]
};

export function assertAdapterConformance({
  adapterId,
  fixturePath,
  expectedProfile = {}
}) {
  const root = path.resolve(fixturePath);
  const adapter = getAdapter(adapterId);
  const first = adapter.audit(root);
  const second = adapter.audit(root);
  const serialized = JSON.stringify(first);

  assert.equal(adapter.maturity, "supported", `${adapterId} must expose supported maturity`);
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
