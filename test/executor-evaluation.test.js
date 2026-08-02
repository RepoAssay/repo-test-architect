import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createFaultInjectedContent,
  inspectExecutorProposal,
  readExecutorEvaluationFixture,
  runExecutorEvaluation
} from "../scripts/support/executor-evaluation.js";
import { assertMatchesSchema } from "./support/json-schema-validator.js";

const fixturePath = path.resolve("evals/executor/node-test-basic.executor-eval.json");
const fixtureSchema = readJson("schemas/executor-evaluation-fixture-v1.schema.json");
const artifactSchema = readJson("schemas/executor-evaluation-v1.schema.json");

describe("bounded executor evaluation", () => {
  it("runs direct and one-repair profiles without enabling product generation", async () => {
    const artifact = await runExecutorEvaluation(fixturePath);

    assertMatchesSchema(artifact, artifactSchema, "executor-evaluation.json");
    assert.equal(artifact.evaluationMode, "non-shipping");
    assert.equal(artifact.productGeneration.status, "deferred");
    assert.deepEqual(artifact.summary, {
      profileCount: 2,
      passedProfileCount: 2,
      failedProfileCount: 0,
      rejectedProfileCount: 0,
      totalAttemptCount: 3,
      totalRepairCount: 1,
      meaningfulFailureCount: 2
    });
    assert.deepEqual(
      artifact.profiles.map((profile) => [profile.id, profile.status, profile.repairCount]),
      [
        ["direct-node-test", "passed", 0],
        ["one-repair-node-test", "passed", 1]
      ]
    );
    assert.equal(artifact.profiles[1].attempts[0].verification.failureKind, "assertion-failure");
  });

  it("validates the versioned fixture contract", () => {
    const { fixture } = readExecutorEvaluationFixture(fixturePath);

    assertMatchesSchema(fixture, fixtureSchema, "node-test-basic.executor-eval.json");
  });

  it("rejects unrelated edits, evidence contradictions, and missing conventions", () => {
    const contract = {
      allowedTestPath: "src/access-policy.test.js",
      planItem: {
        id: "add-test:src/access-policy.js",
        targetId: "src/access-policy.js",
        path: "src/access-policy.js",
        action: "add-test",
        testLevel: "unit",
        sourceSignals: ["branching-logic"]
      },
      conventions: [
        { id: "node-test", target: "content", pattern: "node:test" },
        { id: "allowed-path", target: "path", pattern: "^src/access-policy\\.test\\.js$" }
      ]
    };
    const inspection = inspectExecutorProposal({
      planItemId: contract.planItem.id,
      targetId: contract.planItem.targetId,
      targetPath: contract.planItem.path,
      action: "modify-source",
      testLevel: contract.planItem.testLevel,
      sourceSignals: [],
      files: [
        { path: "src/access-policy.test.js", content: "export {};" },
        { path: "src/access-policy.js", content: "export {};" }
      ]
    }, contract);

    assert.equal(inspection.accepted, false);
    assert.deepEqual(inspection.unrelatedEdits, ["src/access-policy.js"]);
    assert.ok(inspection.evidenceContradictions.includes("proposal must contain exactly one generated test file"));
    assert.ok(inspection.evidenceContradictions.includes("plan action differs from the selected plan item"));
    assert.ok(inspection.evidenceContradictions.includes("source signals differ from the selected plan item"));
    assert.equal(inspection.conventionAdherence.status, "fail");
  });

  it("rejects fixture paths that escape the evaluation root", () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-executor-fixture-"));
    const invalidPath = path.join(temporaryRoot, "invalid.json");
    const fixture = readJson(fixturePath);
    fixture.allowedTestPath = "../outside.test.js";
    fs.writeFileSync(invalidPath, JSON.stringify(fixture));

    try {
      assert.throws(
        () => readExecutorEvaluationFixture(invalidPath),
        /allowed test path must stay inside the evaluation root/
      );
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("applies a canonical fault literal while preserving Windows newlines", () => {
    const original = "export function allowed() {\r\n  return false;\r\n}\r\n";
    const injected = createFaultInjectedContent(original, {
      path: "src/policy.js",
      find: "return false;\n}",
      replacement: "return true;\n}"
    });

    assert.equal(injected, "export function allowed() {\r\n  return true;\r\n}\r\n");
    assert.ok(!injected.replaceAll("\r\n", "").includes("\n"));
  });
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
