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
    assert.throws(() => getAdapter("swift"), /Unsupported adapter: swift/);
  });
});
