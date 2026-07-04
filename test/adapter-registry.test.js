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
        supportedTestFrameworks: ["jest", "react-testing-library", "supertest", "vitest"],
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
          supportedTestFrameworks: ["jest", "react-testing-library", "supertest", "vitest"],
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
