import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditPythonRepo } from "../src/adapters/python/audit.js";

const exampleRoot = path.resolve("examples/python-pytest-service");

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
});
