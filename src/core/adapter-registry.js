import { auditJavaScriptRepo } from "../adapters/javascript/audit.js";
import { auditCSharpRepo } from "../adapters/csharp/audit.js";
import { auditGoRepo } from "../adapters/go/audit.js";
import { auditKotlinRepo } from "../adapters/kotlin/audit.js";
import { auditPythonRepo } from "../adapters/python/audit.js";
import { auditRustRepo } from "../adapters/rust/audit.js";
import { auditSwiftRepo } from "../adapters/swift/audit.js";

/**
 * @typedef {object} AuditRepoOptions
 * @property {string[]} [changedPaths]
 * @property {string} [repositoryRoot]
 * @property {{ goos: string, goarch: string, tags?: string[] }} [goTarget]
 *
 * @typedef {object} RuntimeAdapter
 * @property {string} id
 * @property {string[]} ecosystems
 * @property {string[]} languages
 * @property {"supported" | "experimental" | "planned"} maturity
 * @property {string[]} supportedTestFrameworks
 * @property {string[]} supportedProjectTypes
 * @property {string[]} emittedArtifacts
 * @property {(repoRoot: string, options?: AuditRepoOptions) => object} audit
 *
 * @typedef {object} AdapterSummary
 * @property {string} id
 * @property {string[]} ecosystems
 * @property {string[]} languages
 * @property {"supported" | "experimental" | "planned"} maturity
 * @property {string[]} supportedTestFrameworks
 * @property {string[]} supportedProjectTypes
 * @property {string[]} emittedArtifacts
 *
 * @typedef {object} AdapterRegistry
 * @property {"adapter-registry/v1"} schemaVersion
 * @property {AdapterSummary[]} adapters
 */

/** @type {RuntimeAdapter[]} */
export const adapters = [
  {
    id: "javascript",
    ecosystems: ["javascript"],
    languages: ["javascript", "typescript"],
    maturity: "supported",
    supportedTestFrameworks: ["ava", "bun-test", "cypress", "jest", "mocha", "node-test", "playwright", "react-testing-library", "supertest", "vitest"],
    supportedProjectTypes: ["node", "express", "react", "browser-e2e"],
    emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"],
    audit(repoRoot, options = {}) {
      return auditJavaScriptRepo(repoRoot, {
        changedPaths: options.changedPaths
      });
    }
  },
  {
    id: "csharp",
    ecosystems: ["dotnet"],
    languages: ["csharp"],
    maturity: "supported",
    supportedTestFrameworks: ["mstest", "nunit", "xunit"],
    supportedProjectTypes: ["dotnet-sdk-test-project", "dotnet-sdk-project-pair"],
    emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"],
    audit(repoRoot, options = {}) {
      return auditCSharpRepo(repoRoot, {
        changedPaths: options.changedPaths,
        repositoryRoot: options.repositoryRoot
      });
    }
  },
  {
    id: "go",
    ecosystems: ["go"],
    languages: ["go"],
    maturity: "supported",
    supportedTestFrameworks: ["go-testing"],
    supportedProjectTypes: ["go-module"],
    emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"],
    audit(repoRoot, options = {}) {
      return auditGoRepo(repoRoot, {
        changedPaths: options.changedPaths,
        goTarget: options.goTarget
      });
    }
  },
  {
    id: "kotlin",
    ecosystems: ["jvm"],
    languages: ["kotlin", "java"],
    maturity: "supported",
    supportedTestFrameworks: ["junit", "kotest", "kotlin-test", "spock", "testng"],
    supportedProjectTypes: ["gradle-jvm", "gradle-jvm-multimodule", "gradle-kmp-jvm", "maven-jvm", "maven-jvm-reactor"],
    emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"],
    audit(repoRoot, options = {}) {
      return auditKotlinRepo(repoRoot, {
        changedPaths: options.changedPaths
      });
    }
  },
  {
    id: "python",
    ecosystems: ["python"],
    languages: ["python"],
    maturity: "supported",
    supportedTestFrameworks: ["anyio", "hypothesis", "pytest", "pytest-asyncio", "unittest"],
    supportedProjectTypes: ["django", "fastapi", "flask", "python-package"],
    emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"],
    audit(repoRoot, options = {}) {
      return auditPythonRepo(repoRoot, {
        changedPaths: options.changedPaths,
        repositoryRoot: options.repositoryRoot
      });
    }
  },
  {
    id: "rust",
    ecosystems: ["rust"],
    languages: ["rust"],
    maturity: "supported",
    supportedTestFrameworks: ["rust-test"],
    supportedProjectTypes: ["cargo-package", "cargo-workspace-package"],
    emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"],
    audit(repoRoot, options = {}) {
      return auditRustRepo(repoRoot, {
        changedPaths: options.changedPaths
      });
    }
  },
  {
    id: "swift",
    ecosystems: ["apple", "bazel", "swift"],
    languages: ["objective-c", "swift"],
    maturity: "supported",
    supportedTestFrameworks: ["Nimble", "Quick", "RxBlocking", "RxTest", "SnapshotTesting", "Swift Testing", "VaporTesting", "XCTest", "XCTVapor"],
    supportedProjectTypes: ["swift-package", "apple-xcode", "bazel-swift", "vapor"],
    emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"],
    audit(repoRoot, options = {}) {
      return auditSwiftRepo(repoRoot, {
        changedPaths: options.changedPaths
      });
    }
  }
];

/**
 * @param {string} [adapterId]
 * @returns {RuntimeAdapter}
 */
export function getAdapter(adapterId = "javascript") {
  const adapter = adapters.find((candidate) => candidate.id === adapterId);

  if (!adapter) {
    throw new Error(`Unsupported adapter: ${adapterId}. Available adapters: ${adapters.map((candidate) => candidate.id).join(", ")}.`);
  }

  return adapter;
}

/**
 * @returns {AdapterSummary[]}
 */
export function listAdapters() {
  return adapters.map((adapter) => ({
    id: adapter.id,
    ecosystems: [...adapter.ecosystems],
    languages: [...adapter.languages],
    maturity: adapter.maturity,
    supportedTestFrameworks: [...adapter.supportedTestFrameworks],
    supportedProjectTypes: [...adapter.supportedProjectTypes],
    emittedArtifacts: [...adapter.emittedArtifacts]
  }));
}

/**
 * @returns {AdapterRegistry}
 */
export function getAdapterRegistry() {
  return {
    schemaVersion: "adapter-registry/v1",
    adapters: listAdapters()
  };
}
