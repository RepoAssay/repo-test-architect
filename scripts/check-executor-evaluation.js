#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runExecutorEvaluation } from "./support/executor-evaluation.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "evals/executor/node-test-basic.executor-eval.json");
const result = await runExecutorEvaluation(fixturePath, { repositoryRoot: projectRoot });

validateExpectedResult(result);

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(
    `Executor evaluation passed: ${result.summary.passedProfileCount}/${result.summary.profileCount} profiles, ` +
    `${result.summary.totalRepairCount} repair, ${result.summary.meaningfulFailureCount} controlled failures detected.\n`
  );
}

export function validateExpectedResult(artifact) {
  assert.equal(artifact.schemaVersion, "executor-evaluation/v1");
  assert.equal(artifact.evaluationMode, "non-shipping");
  assert.deepEqual(artifact.productGeneration, {
    schemaVersion: "generation-deferred/v1",
    status: "deferred"
  });
  assert.deepEqual(artifact.summary, {
    profileCount: 2,
    passedProfileCount: 2,
    failedProfileCount: 0,
    rejectedProfileCount: 0,
    totalAttemptCount: 3,
    totalRepairCount: 1,
    meaningfulFailureCount: 2
  });

  const direct = artifact.profiles.find((profile) => profile.id === "direct-node-test");
  const repaired = artifact.profiles.find((profile) => profile.id === "one-repair-node-test");
  assert.ok(direct);
  assert.ok(repaired);
  assert.equal(direct.status, "passed");
  assert.equal(direct.repairCount, 0);
  assert.equal(direct.attempts.length, 1);
  assert.equal(direct.attempts[0].verification.status, "passed");
  assert.equal(direct.faultInjection.status, "detected");
  assert.equal(repaired.status, "passed");
  assert.equal(repaired.repairCount, 1);
  assert.equal(repaired.attempts.length, 2);
  assert.equal(repaired.attempts[0].verification.failureKind, "assertion-failure");
  assert.equal(repaired.attempts[1].verification.status, "passed");
  assert.equal(repaired.faultInjection.status, "detected");

  for (const profile of artifact.profiles) {
    assert.equal(profile.inputDigest, artifact.input.digest);
    for (const attempt of profile.attempts) {
      assert.equal(attempt.proposalStatus, "accepted");
      assert.equal(attempt.conventionAdherence.status, "pass");
      assert.deepEqual(attempt.unrelatedEdits, []);
      assert.deepEqual(attempt.evidenceContradictions, []);
      assert.deepEqual(attempt.changedPaths, [artifact.fixture.allowedTestPath]);
    }
  }
}
