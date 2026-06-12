import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { getAdapter, listAdapters } from "../src/core/adapter-registry.js";

describe("adapter registry", () => {
  it("lists registered adapters", () => {
    assert.deepEqual(listAdapters(), [
      {
        id: "javascript",
        languages: ["javascript", "typescript"]
      }
    ]);
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
