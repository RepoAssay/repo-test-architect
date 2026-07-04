import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";
import { createTestPlan } from "../src/core/test-plan.js";

describe("test plan generator", () => {
  it("creates ordered add, extend, and defer actions from an audit", () => {
    const audit = auditJavaScriptRepo(path.resolve("examples/react-testing-library"));
    const plan = createTestPlan(audit);

    assert.equal(plan.schemaVersion, "plan/v1");
    assert.equal(plan.summary.confidence, "high");
    assert.equal(plan.summary.verificationCommand, "npm run test");
    assert.equal(plan.summary.addTestCount, 1);
    assert.equal(plan.summary.extendTestCount, 1);
    assert.equal(plan.summary.deferredCount, 2);

    assert.deepEqual(
      plan.items.map((item) => `${item.action}:${item.target}`),
      ["add-test:sessionService", "extend-test:LoginForm", "defer:sessionDto", "defer:Avatar"]
    );
    assert.deepEqual(
      plan.items.map((item) => item.id),
      [
        "add-test:src/services/sessionService.ts",
        "extend-test:src/components/LoginForm.tsx",
        "defer:src/models/sessionDto.ts",
        "defer:src/components/Avatar.tsx"
      ]
    );
    assert.deepEqual(plan.items[0].sourceSignals, ["service-name", "auth-branch"]);
    assert.equal(plan.items[0].targetId, "src/services/sessionService.ts");
  });

  it("carries blockers into the plan for repos without tests", () => {
    const audit = auditJavaScriptRepo(path.resolve("examples/node-no-tests-yet"));
    const plan = createTestPlan(audit);

    assert.equal(plan.summary.confidence, "low");
    assert.equal(plan.summary.verificationCommand, undefined);
    assert.equal(plan.summary.blockerCount, 2);
    assert.ok(plan.blockers.includes("No supported JS test framework detected."));
  });

  it("adds concrete MongoDB coverage guidance from source signals", () => {
    const plan = createTestPlan({
      schemaVersion: "audit/v1",
      profile: {
        confidence: "high",
        testCommand: "swift test",
        blockers: []
      },
      untestedCandidates: [
        {
          id: "Sources/App/Controllers/PriceController.swift",
          name: "PriceController",
          path: "Sources/App/Controllers/PriceController.swift",
          kind: "http-route",
          signals: ["http-route", "vapor-route", "mongodb-aggregation", "mongodb-dynamic-filter", "pagination-or-sort", "mongodb-write"],
          risk: "high",
          testability: "medium",
          recommendedTestLevel: "integration",
          riskReductionScore: 9,
          maintenanceCost: 5,
          reasons: ["HTTP route behavior", "Vapor request handling", "MongoDB query boundary"],
          existingTestPaths: []
        }
      ],
      coveredButRisky: [],
      skipped: []
    });

    const item = plan.items[0];
    assert.equal(item.target, "PriceController");
    assert.ok(item.rationale.includes("Seed representative MongoDB fixture data and assert aggregation grouping, ordering, and edge-case result shape."));
    assert.ok(item.rationale.includes("Cover dynamic BSON filter construction with escaped user input, empty results, and malformed query boundaries."));
    assert.ok(item.rationale.includes("Assert pagination and sorting boundaries, including limits, offsets, stable ordering, and has-next-page behavior."));
    assert.ok(item.rationale.includes("Exercise MongoDB create/update paths for idempotency, duplicate data, and existing-record updates."));
  });

  it("defaults optional target arrays in plan items", () => {
    const plan = createTestPlan({
      schemaVersion: "audit/v1",
      profile: {
        confidence: "medium",
        blockers: []
      },
      untestedCandidates: [
        {
          id: "src/paymentClient.ts",
          name: "paymentClient",
          path: "src/paymentClient.ts",
          kind: "service",
          signals: ["service-name"],
          recommendedTestLevel: "unit",
          riskReductionScore: 8,
          maintenanceCost: 4
        }
      ],
      coveredButRisky: [],
      skipped: []
    });

    assert.deepEqual(plan.items[0].rationale, []);
    assert.deepEqual(plan.items[0].existingTestPaths, []);
  });
});
