import { auditJavaScriptRepo } from "../adapters/javascript/audit.js";

/**
 * @typedef {object} AuditRepoOptions
 * @property {string[]} [changedPaths]
 *
 * @typedef {object} RuntimeAdapter
 * @property {string} id
 * @property {string[]} ecosystems
 * @property {string[]} languages
 * @property {(repoRoot: string, options?: AuditRepoOptions) => object} audit
 *
 * @typedef {object} AdapterSummary
 * @property {string} id
 * @property {string[]} ecosystems
 * @property {string[]} languages
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
    audit(repoRoot, options = {}) {
      return auditJavaScriptRepo(repoRoot, {
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
    throw new Error(`Unsupported adapter: ${adapterId}`);
  }

  return adapter;
}

/**
 * @returns {AdapterSummary[]}
 */
export function listAdapters() {
  return adapters.map((adapter) => ({
    id: adapter.id,
    ecosystems: adapter.ecosystems,
    languages: adapter.languages
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
