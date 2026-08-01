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
        supportedTestFrameworks: ["ava", "bun-test", "cypress", "jest", "mocha", "node-test", "playwright", "react-testing-library", "supertest", "vitest"],
        supportedProjectTypes: ["node", "express", "react", "browser-e2e"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "csharp",
        ecosystems: ["dotnet"],
        languages: ["csharp"],
        maturity: "supported",
        supportedTestFrameworks: ["mstest", "nunit", "xunit"],
        supportedProjectTypes: ["dotnet-sdk-test-project", "dotnet-sdk-project-pair"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "go",
        ecosystems: ["go"],
        languages: ["go"],
        maturity: "supported",
        supportedTestFrameworks: ["go-testing"],
        supportedProjectTypes: ["go-module"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "kotlin",
        ecosystems: ["jvm"],
        languages: ["kotlin", "java"],
        maturity: "supported",
        supportedTestFrameworks: ["junit", "kotest", "kotlin-test", "spock", "testng"],
        supportedProjectTypes: ["gradle-jvm", "gradle-jvm-multimodule", "gradle-kmp-jvm", "maven-jvm", "maven-jvm-reactor"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "php",
        ecosystems: ["php"],
        languages: ["php"],
        maturity: "experimental",
        supportedTestFrameworks: ["phpunit"],
        supportedProjectTypes: ["composer-psr4"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "python",
        ecosystems: ["python"],
        languages: ["python"],
        maturity: "supported",
        supportedTestFrameworks: ["anyio", "hypothesis", "pytest", "pytest-asyncio", "unittest"],
        supportedProjectTypes: ["django", "fastapi", "flask", "python-package"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "rust",
        ecosystems: ["rust"],
        languages: ["rust"],
        maturity: "supported",
        supportedTestFrameworks: ["rust-test"],
        supportedProjectTypes: ["cargo-package", "cargo-workspace-package"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "ruby",
        ecosystems: ["ruby"],
        languages: ["ruby"],
        maturity: "supported",
        supportedTestFrameworks: ["minitest", "rspec"],
        supportedProjectTypes: ["ruby-bundler"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "swift",
        ecosystems: ["apple", "bazel", "swift"],
        languages: ["objective-c", "swift"],
        maturity: "supported",
        supportedTestFrameworks: ["Nimble", "Quick", "RxBlocking", "RxTest", "SnapshotTesting", "Swift Testing", "VaporTesting", "XCTest", "XCTVapor"],
        supportedProjectTypes: ["swift-package", "apple-xcode", "bazel-swift", "vapor"],
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
          supportedTestFrameworks: ["ava", "bun-test", "cypress", "jest", "mocha", "node-test", "playwright", "react-testing-library", "supertest", "vitest"],
          supportedProjectTypes: ["node", "express", "react", "browser-e2e"],
          emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
        },
        {
          id: "csharp",
          ecosystems: ["dotnet"],
          languages: ["csharp"],
          maturity: "supported",
          supportedTestFrameworks: ["mstest", "nunit", "xunit"],
          supportedProjectTypes: ["dotnet-sdk-test-project", "dotnet-sdk-project-pair"],
          emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
        },
        {
          id: "go",
          ecosystems: ["go"],
          languages: ["go"],
          maturity: "supported",
          supportedTestFrameworks: ["go-testing"],
          supportedProjectTypes: ["go-module"],
          emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
        },
        {
          id: "kotlin",
          ecosystems: ["jvm"],
          languages: ["kotlin", "java"],
          maturity: "supported",
          supportedTestFrameworks: ["junit", "kotest", "kotlin-test", "spock", "testng"],
          supportedProjectTypes: ["gradle-jvm", "gradle-jvm-multimodule", "gradle-kmp-jvm", "maven-jvm", "maven-jvm-reactor"],
          emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
        },
      {
        id: "php",
        ecosystems: ["php"],
        languages: ["php"],
        maturity: "experimental",
        supportedTestFrameworks: ["phpunit"],
        supportedProjectTypes: ["composer-psr4"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "python",
        ecosystems: ["python"],
        languages: ["python"],
        maturity: "supported",
        supportedTestFrameworks: ["anyio", "hypothesis", "pytest", "pytest-asyncio", "unittest"],
        supportedProjectTypes: ["django", "fastapi", "flask", "python-package"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "rust",
        ecosystems: ["rust"],
        languages: ["rust"],
        maturity: "supported",
        supportedTestFrameworks: ["rust-test"],
        supportedProjectTypes: ["cargo-package", "cargo-workspace-package"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "ruby",
        ecosystems: ["ruby"],
        languages: ["ruby"],
        maturity: "supported",
        supportedTestFrameworks: ["minitest", "rspec"],
        supportedProjectTypes: ["ruby-bundler"],
        emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"]
      },
      {
        id: "swift",
          ecosystems: ["apple", "bazel", "swift"],
          languages: ["objective-c", "swift"],
          maturity: "supported",
          supportedTestFrameworks: ["Nimble", "Quick", "RxBlocking", "RxTest", "SnapshotTesting", "Swift Testing", "VaporTesting", "XCTest", "XCTVapor"],
          supportedProjectTypes: ["swift-package", "apple-xcode", "bazel-swift", "vapor"],
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
    assert.deepEqual(relisted[0].supportedTestFrameworks, ["ava", "bun-test", "cypress", "jest", "mocha", "node-test", "playwright", "react-testing-library", "supertest", "vitest"]);
    assert.deepEqual(relisted[0].supportedProjectTypes, ["node", "express", "react", "browser-e2e"]);
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
      () => getAdapter("elixir"),
      /Unsupported adapter: elixir\. Available adapters: javascript, csharp, go, kotlin, php, python, rust, ruby, swift\./
    );
  });

  it("audits through the Kotlin adapter", () => {
    const adapter = getAdapter("kotlin");
    const audit = adapter.audit(path.resolve("examples/kotlin-junit-basic"));

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.testFrameworks, ["junit", "kotlin-test"]);
  });

  it("audits through the Go adapter", () => {
    const adapter = getAdapter("go");
    const audit = adapter.audit(path.resolve("examples/go-testing-basic"));

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.testFrameworks, ["go-testing"]);
  });

  it("audits through the C# adapter", () => {
    const adapter = getAdapter("csharp");
    const audit = adapter.audit(path.resolve("examples/csharp-sdk-project-pair"));

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.testFrameworks, ["xunit"]);
    assert.ok(audit.profile.architectures.includes("dotnet-project-pair"));
  });

  it("audits through the Swift adapter", () => {
    const adapter = getAdapter("swift");
    const audit = adapter.audit(path.resolve("examples/swift-spm-xctest"));

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.testFrameworks, ["XCTest"]);
  });

  it("audits through the Rust adapter", () => {
    const adapter = getAdapter("rust");
    const audit = adapter.audit(path.resolve("examples/rust-cargo-basic"));

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.testFrameworks, ["rust-test"]);
  });

  it("audits through the Ruby adapter", () => {
    const adapter = getAdapter("ruby");
    const audit = adapter.audit(path.resolve("examples/ruby-minitest-basic"));

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.testFrameworks, ["minitest"]);
  });

  it("audits through the Python adapter", () => {
    const adapter = getAdapter("python");
    const audit = adapter.audit(path.resolve("examples/python-pytest-service"));

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
  });
});
