import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditKotlinRepo } from "../src/adapters/kotlin/audit.js";

const exampleRoot = path.resolve("examples/kotlin-junit-basic");

describe("Kotlin audit adapter", () => {
  it("detects Gradle, JVM languages, test framework, and conventions", () => {
    const audit = auditKotlinRepo(exampleRoot);

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.languages, ["java", "kotlin"]);
    assert.deepEqual(audit.profile.packageManagers, ["gradle"]);
    assert.deepEqual(audit.profile.testFrameworks, ["junit", "kotlin-test"]);
    assert.equal(audit.profile.testCommand, "gradle test");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.existingTestLocations.includes("src/test"));
    assert.ok(audit.profile.detectedConventions.includes("*Test files"));
    assert.ok(audit.profile.setupSignals.includes("gradle kotlin dsl"));
    assert.ok(audit.profile.setupSignals.includes("junit platform"));
  });

  it("separates covered risky logic, untested logic, and DTO-like data classes", () => {
    const audit = auditKotlinRepo(exampleRoot);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.name),
      ["CheckoutCalculator"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["MoneyFormatter"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => target.name),
      ["CheckoutRequest"]
    );

    const calculator = audit.coveredButRisky[0];
    assert.equal(calculator.kind, "pure-logic");
    assert.equal(calculator.recommendedTestLevel, "unit");
    assert.deepEqual(calculator.existingTestPaths, ["src/test/kotlin/com/example/checkout/CheckoutCalculatorTest.kt"]);
    assert.ok(calculator.signals.includes("matching-test"));

    const request = audit.skipped[0];
    assert.equal(request.kind, "dto");
    assert.match(request.reason, /DTO-only models/);
  });

  it("can limit candidates to changed source files while keeping repo profile", () => {
    const audit = auditKotlinRepo(exampleRoot, {
      changedPaths: ["src/main/java/com/example/checkout/MoneyFormatter.java"]
    });

    assert.deepEqual(audit.profile.testFrameworks, ["junit", "kotlin-test"]);
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["MoneyFormatter"]
    );
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
  });
});
