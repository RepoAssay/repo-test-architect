import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { getAdapter, getAdapterRegistry, listAdapters } from "../src/core/adapter-registry.js";

describe("adapter registry", () => {
  it("lists registered adapters", () => {
    assert.deepEqual(listAdapters(), [
      {
        id: "javascript",
        ecosystems: ["javascript"],
        languages: ["javascript", "typescript"],
        maturity: "supported",
        supportedTestFrameworks: ["jest", "node-test", "react-testing-library", "supertest", "vitest"],
        supportedProjectTypes: ["node", "express", "react"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "kotlin",
        ecosystems: ["jvm"],
        languages: ["kotlin", "java"],
        maturity: "experimental",
        supportedTestFrameworks: ["junit", "kotlin-test"],
        supportedProjectTypes: ["gradle-jvm", "maven-jvm"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "python",
        ecosystems: ["python"],
        languages: ["python"],
        maturity: "experimental",
        supportedTestFrameworks: ["pytest", "unittest"],
        supportedProjectTypes: ["fastapi", "python-package"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "swift",
        ecosystems: ["apple", "swift"],
        languages: ["objective-c", "swift"],
        maturity: "experimental",
        supportedTestFrameworks: ["Nimble", "Quick", "SnapshotTesting", "Swift Testing", "XCTest", "XCTVapor"],
        supportedProjectTypes: ["swift-package", "apple-xcode", "vapor"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      }
    ]);
  });

  it("returns the adapter registry artifact", () => {
    assert.deepEqual(getAdapterRegistry(), {
      schemaVersion: "adapter-registry/v1",
      adapters: [
        {
          id: "javascript",
          ecosystems: ["javascript"],
          languages: ["javascript", "typescript"],
          maturity: "supported",
          supportedTestFrameworks: ["jest", "node-test", "react-testing-library", "supertest", "vitest"],
          supportedProjectTypes: ["node", "express", "react"],
          emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
        },
        {
          id: "kotlin",
          ecosystems: ["jvm"],
          languages: ["kotlin", "java"],
          maturity: "experimental",
          supportedTestFrameworks: ["junit", "kotlin-test"],
          supportedProjectTypes: ["gradle-jvm", "maven-jvm"],
          emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
        },
      {
        id: "python",
        ecosystems: ["python"],
        languages: ["python"],
        maturity: "experimental",
        supportedTestFrameworks: ["pytest", "unittest"],
        supportedProjectTypes: ["fastapi", "python-package"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "swift",
          ecosystems: ["apple", "swift"],
          languages: ["objective-c", "swift"],
          maturity: "experimental",
          supportedTestFrameworks: ["Nimble", "Quick", "SnapshotTesting", "Swift Testing", "XCTest", "XCTVapor"],
          supportedProjectTypes: ["swift-package", "apple-xcode", "vapor"],
          emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
        }
      ]
    });
  });

  it("returns adapter summary snapshots that callers can mutate safely", () => {
    const listed = listAdapters();
    listed[0].id = "mutated";
    listed[0].ecosystems.push("mutated");
    listed[0].languages.push("mutated");
    listed[0].supportedTestFrameworks.push("mutated");
    listed[0].supportedProjectTypes.push("mutated");
    listed[0].emittedArtifacts.push("mutated");

    const relisted = listAdapters();
    assert.equal(relisted[0].id, "javascript");
    assert.deepEqual(relisted[0].ecosystems, ["javascript"]);
    assert.deepEqual(relisted[0].languages, ["javascript", "typescript"]);
    assert.deepEqual(relisted[0].supportedTestFrameworks, ["jest", "node-test", "react-testing-library", "supertest", "vitest"]);
    assert.deepEqual(relisted[0].supportedProjectTypes, ["node", "express", "react"]);
    assert.deepEqual(relisted[0].emittedArtifacts, ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]);
  });

  it("returns registry artifact snapshots that callers can mutate safely", () => {
    const registry = getAdapterRegistry();
    registry.schemaVersion = "mutated";
    registry.adapters[0].id = "mutated";
    registry.adapters[0].languages.push("mutated");

    const freshRegistry = getAdapterRegistry();
    assert.equal(freshRegistry.schemaVersion, "adapter-registry/v1");
    assert.equal(freshRegistry.adapters[0].id, "javascript");
    assert.deepEqual(freshRegistry.adapters[0].languages, ["javascript", "typescript"]);
  });

  it("defaults to the JavaScript adapter", () => {
    assert.equal(getAdapter().id, "javascript");
  });

  it("audits through the JavaScript adapter", () => {
    const adapter = getAdapter("javascript");
    const audit = adapter.audit(path.resolve("examples/node-vitest-basic"));

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.testFrameworks, ["vitest"]);
  });

  it("rejects unsupported adapters", () => {
    assert.throws(
      () => getAdapter("ruby"),
      /Unsupported adapter: ruby\. Available adapters: javascript, kotlin, python, swift\./
    );
  });

  it("audits through the Kotlin adapter", () => {
    const adapter = getAdapter("kotlin");
    const audit = adapter.audit(path.resolve("examples/kotlin-junit-basic"));

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.testFrameworks, ["junit", "kotlin-test"]);
  });

  it("audits through the Swift adapter", () => {
    const adapter = getAdapter("swift");
    const audit = adapter.audit(path.resolve("examples/swift-spm-xctest"));

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.testFrameworks, ["XCTest"]);
  });

  it("audits through the Python adapter", () => {
    const adapter = getAdapter("python");
    const audit = adapter.audit(path.resolve("examples/python-pytest-service"));

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
  });
});
