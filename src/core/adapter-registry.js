import { auditJavaScriptRepo } from "../adapters/javascript/audit.js";
import { auditKotlinRepo } from "../adapters/kotlin/audit.js";
import { auditSwiftRepo } from "../adapters/swift/audit.js";

/**
 * @typedef {object} AuditRepoOptions
 * @property {string[]} [changedPaths]
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
    supportedTestFrameworks: ["jest", "react-testing-library", "supertest", "vitest"],
    supportedProjectTypes: ["node", "express", "react"],
    emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"],
    audit(repoRoot, options = {}) {
      return auditJavaScriptRepo(repoRoot, {
        changedPaths: options.changedPaths
      });
    }
  },
  {
    id: "kotlin",
    ecosystems: ["jvm"],
    languages: ["kotlin", "java"],
    maturity: "experimental",
    supportedTestFrameworks: ["junit", "kotlin-test"],
    supportedProjectTypes: ["gradle-jvm", "maven-jvm"],
    emittedArtifacts: ["audit/v1", "plan/v1", "target-explanation/v1", "candidate-ranking/v1"],
    audit(repoRoot, options = {}) {
      return auditKotlinRepo(repoRoot, {
        changedPaths: options.changedPaths
      });
    }
  },
  {
    id: "swift",
    ecosystems: ["apple", "swift"],
    languages: ["objective-c", "swift"],
    maturity: "experimental",
    supportedTestFrameworks: ["Swift Testing", "XCTest"],
    supportedProjectTypes: ["swift-package", "apple-xcode"],
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
