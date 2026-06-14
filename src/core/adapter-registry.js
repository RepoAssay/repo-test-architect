import { auditJavaScriptRepo } from "../adapters/javascript/audit.js";

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

export function getAdapter(adapterId = "javascript") {
  const adapter = adapters.find((candidate) => candidate.id === adapterId);

  if (!adapter) {
    throw new Error(`Unsupported adapter: ${adapterId}`);
  }

  return adapter;
}

export function listAdapters() {
  return adapters.map((adapter) => ({
    id: adapter.id,
    ecosystems: adapter.ecosystems,
    languages: adapter.languages
  }));
}

export function getAdapterRegistry() {
  return {
    schemaVersion: "adapter-registry/v1",
    adapters: listAdapters()
  };
}
