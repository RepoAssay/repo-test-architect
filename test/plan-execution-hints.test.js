import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { auditDetectedProjects } from "../src/core/project-auditor.js";
import { createProjectTestPlan } from "../src/core/project-test-plan.js";
import { createPlanExecutionHints } from "../src/core/plan-execution-hints.js";

describe("plan execution hints", () => {
  it("derives the same bounded extension hints across supported adapters", () => {
    const fixtures = [
      ["node-vitest-basic", "src/deckParser.ts", "src/deckParser.test.ts"],
      ["python-pytest-service", "app/parsers.py", "tests/test_parsers.py"],
      ["swift-spm-xctest", "Sources/CheckoutCore/CheckoutParser.swift", "Tests/CheckoutCoreTests/CheckoutParserTests.swift"],
      ["kotlin-junit-basic", "src/main/kotlin/com/example/checkout/CheckoutCalculator.kt", "src/test/kotlin/com/example/checkout/CheckoutCalculatorTest.kt"]
    ];

    for (const [fixture, sourcePath, testPath] of fixtures) {
      const plan = readJson(`evals/expected/${fixture}.plan.json`);
      const hints = createPlanExecutionHints(plan, { itemId: plan.items[0].id });

      assert.equal(hints.schemaVersion, "plan-execution-hints/v1");
      assert.deepEqual(hints.summary, {
        itemCount: 1,
        lowComplexityCount: 0,
        mediumComplexityCount: 1,
        highComplexityCount: 0,
        parallelizableCount: 0,
        repositoryReasoningCount: 0
      });
      assert.deepEqual(hints.items[0].contextScope, {
        mode: "target-and-tests",
        paths: [sourcePath, testPath],
        includeBuildConfiguration: false,
        includeRepositoryInstructions: true
      });
      assert.equal(hints.items[0].recommendedAgentRole, "implementation");
    }
  });

  it("marks isolated new unit tests as parallelizable implementation work", () => {
    const hints = createPlanExecutionHints(planWithItem({
      id: "add-test:src/parser.ts",
      action: "add-test",
      target: "parser",
      path: "src/parser.ts",
      testLevel: "unit",
      maintenanceCost: 2,
      sourceSignals: ["pure-logic", "edge-case-surface"],
      existingTestPaths: []
    }));

    assert.equal(hints.items[0].complexity, "low");
    assert.equal(hints.items[0].parallelizable, true);
    assert.equal(hints.items[0].recommendedAgentRole, "implementation");
    assert.equal(hints.items[0].requiresRepositoryReasoning, false);
    assert.equal(hints.items[0].contextScope.mode, "target-only");
  });

  it("routes infrastructure-sensitive integration work to repository reasoning", () => {
    const plan = readJson("evals/expected/vapor-mongodb-boundaries.plan.json");
    const hints = createPlanExecutionHints(plan, { itemId: plan.items[0].id });
    const hint = hints.items[0];

    assert.equal(hint.complexity, "high");
    assert.equal(hint.parallelizable, false);
    assert.equal(hint.recommendedAgentRole, "repository-reasoning");
    assert.equal(hint.requiresRepositoryReasoning, true);
    assert.deepEqual(hint.contextScope, {
      mode: "project-boundary",
      paths: ["Sources/App/Controllers/PriceController.swift"],
      includeBuildConfiguration: true,
      includeRepositoryInstructions: true
    });
  });

  it("routes deferred items to review without requesting implementation", () => {
    const hints = createPlanExecutionHints(planWithItem({
      id: "defer:src/model.ts",
      action: "defer",
      target: "model",
      path: "src/model.ts",
      testLevel: "none",
      maintenanceCost: 4,
      sourceSignals: ["dto-only"],
      existingTestPaths: []
    }));
    const hint = hints.items[0];

    assert.equal(hint.complexity, "low");
    assert.equal(hint.parallelizable, false);
    assert.equal(hint.recommendedAgentRole, "review");
    assert.equal(hint.requiresRepositoryReasoning, false);
    assert.match(hint.reasons[0], /defers direct test implementation/);
  });

  it("preserves project identity and qualifies project-relative context paths", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));
    const plan = createProjectTestPlan(projectAudits);
    const itemId = "apps/android:add-test:src/main/kotlin/CheckoutCalculator.kt";
    const hints = createPlanExecutionHints(plan, { itemId });
    const hint = hints.items[0];

    assert.deepEqual(hints.source, {
      schemaVersion: "project-test-plan/v1",
      itemCount: 3,
      root: path.resolve("examples/polyglot-workspace")
    });
    assert.equal(hint.planItemId, itemId);
    assert.equal(hint.projectId, "apps/android");
    assert.equal(hint.projectRoot, "apps/android");
    assert.equal(hint.adapterId, "kotlin");
    assert.equal(hint.path, "apps/android/src/main/kotlin/CheckoutCalculator.kt");
    assert.deepEqual(hint.contextScope.paths, ["apps/android/src/main/kotlin/CheckoutCalculator.kt"]);
  });

  it("rejects unsupported plans, malformed items, and unknown selections", () => {
    assert.throws(
      () => createPlanExecutionHints({ schemaVersion: "audit/v1", items: [] }),
      /Expected plan schemaVersion/
    );
    assert.throws(
      () => createPlanExecutionHints({ schemaVersion: "plan/v1", items: [{}] }),
      /Plan item id must be a non-empty string/
    );
    assert.throws(
      () => createPlanExecutionHints(planWithItem({
        id: "write-test:src/parser.ts",
        action: "write-test",
        target: "parser",
        path: "src/parser.ts",
        testLevel: "unit",
        maintenanceCost: 2,
        sourceSignals: [],
        existingTestPaths: []
      })),
      /Plan item action must be add-test, extend-test, or defer/
    );
    assert.throws(
      () => createPlanExecutionHints(planWithItem({
        id: "add-test:src/parser.ts",
        action: "add-test",
        target: "parser",
        path: "src/parser.ts",
        testLevel: "unit",
        maintenanceCost: 2,
        sourceSignals: [],
        existingTestPaths: []
      }), { itemId: "missing" }),
      /Unknown plan item id: missing/
    );
  });
});

function planWithItem(item) {
  return {
    schemaVersion: "plan/v1",
    summary: {},
    blockers: [],
    items: [item]
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
