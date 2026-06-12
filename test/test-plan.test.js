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
  });

  it("carries blockers into the plan for repos without tests", () => {
    const audit = auditJavaScriptRepo(path.resolve("examples/node-no-tests-yet"));
    const plan = createTestPlan(audit);

    assert.equal(plan.summary.confidence, "low");
    assert.equal(plan.summary.verificationCommand, undefined);
    assert.equal(plan.summary.blockerCount, 2);
    assert.ok(plan.blockers.includes("No supported JS test framework detected."));
  });
});
