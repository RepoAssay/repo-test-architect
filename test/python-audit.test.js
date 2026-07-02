import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditPythonRepo } from "../src/adapters/python/audit.js";

const exampleRoot = path.resolve("examples/python-pytest-service");
const unittestRoot = path.resolve("examples/python-unittest-service");
const requirementsRoot = path.resolve("examples/python-requirements-pytest");
const noTestsRoot = path.resolve("examples/python-no-tests-yet");

describe("Python audit adapter", () => {
  it("detects pyproject, pytest, FastAPI, and existing test conventions", () => {
    const audit = auditPythonRepo(exampleRoot);

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.languages, ["python"]);
    assert.deepEqual(audit.profile.packageManagers, ["pyproject"]);
    assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
    assert.deepEqual(audit.profile.architectures, ["fastapi", "service-layer"]);
    assert.equal(audit.profile.testCommand, "pytest");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.existingTestLocations.includes("tests"));
    assert.ok(audit.profile.detectedConventions.includes("tests/test_*.py"));
    assert.ok(audit.profile.setupSignals.includes("pyproject"));
    assert.ok(audit.profile.setupSignals.includes("pytest dependency"));
    assert.ok(audit.profile.setupSignals.includes("fastapi dependency"));
  });

  it("separates routes, services, covered parsers, DTOs, and app wiring", () => {
    const audit = auditPythonRepo(exampleRoot);

    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["user_service:service:unit", "users:http-route:integration"]
    );
    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.name),
      ["parsers"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.name}:${target.kind}`),
      ["main:app-wiring", "models:dto"]
    );

    const route = audit.untestedCandidates.find((target) => target.name === "users");
    assert.deepEqual(route.signals, ["http-route", "status-handling"]);

    const service = audit.untestedCandidates.find((target) => target.name === "user_service");
    assert.ok(service.signals.includes("service-boundary"));
    assert.ok(service.signals.includes("async-or-concurrency"));
    assert.ok(service.signals.includes("external-boundary"));

    const parser = audit.coveredButRisky[0];
    assert.equal(parser.kind, "pure-logic");
    assert.deepEqual(parser.existingTestPaths, ["tests/test_parsers.py"]);
    assert.ok(parser.signals.includes("matching-test"));
  });

  it("can limit candidates to changed source files while keeping repo profile", () => {
    const audit = auditPythonRepo(exampleRoot, {
      changedPaths: ["app/services/user_service.py"]
    });

    assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["user_service"]
    );
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
  });

  it("normalizes Windows-style changed source paths", () => {
    const audit = auditPythonRepo(exampleRoot, {
      changedPaths: ["app\\services\\user_service.py"]
    });

    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["user_service"]
    );
  });

  it("ignores changed test files for source target selection", () => {
    const audit = auditPythonRepo(exampleRoot, {
      changedPaths: ["tests/test_parsers.py"]
    });

    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
    assert.deepEqual(audit.recommended, []);
  });

  it("reports blockers while still finding candidates when no Python tests exist yet", () => {
    const audit = auditPythonRepo(noTestsRoot);

    assert.deepEqual(audit.profile.languages, ["python"]);
    assert.deepEqual(audit.profile.packageManagers, ["pyproject"]);
    assert.deepEqual(audit.profile.testFrameworks, []);
    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "low");
    assert.ok(audit.profile.blockers.includes("No supported Python test framework detected."));
    assert.ok(audit.profile.blockers.includes("No runnable Python test command detected from project markers."));
    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["billing_parser:pure-logic:unit", "payment_service:service:unit"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.name}:${target.kind}`),
      ["payment_response:dto"]
    );
  });

  it("detects unittest conventions and keeps covered parser evidence", () => {
    const audit = auditPythonRepo(unittestRoot);

    assert.deepEqual(audit.profile.packageManagers, ["pyproject"]);
    assert.deepEqual(audit.profile.testFrameworks, ["unittest"]);
    assert.equal(audit.profile.testCommand, "python -m unittest");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(audit.profile.detectedConventions.includes("*_test.py"));
    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.name}:${target.kind}:${target.existingTestPaths.join(",")}`),
      ["inventory_parser:pure-logic:tests/inventory_parser_test.py"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["inventory_service:service:unit"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.name}:${target.kind}`),
      ["inventory_response:dto"]
    );
  });

  it("detects requirements-based pytest projects", () => {
    const audit = auditPythonRepo(requirementsRoot);

    assert.deepEqual(audit.profile.packageManagers, ["pip"]);
    assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
    assert.equal(audit.profile.testCommand, "pytest");
    assert.equal(audit.profile.confidence, "medium");
    assert.ok(audit.profile.setupSignals.includes("requirements"));
    assert.ok(audit.profile.setupSignals.includes("pytest dependency"));
    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["shipping_client:service:unit", "shipping_mapper:pure-logic:unit"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.name}:${target.kind}`),
      ["shipping_response:dto"]
    );
  });
});
