import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

describe("schema files", () => {
  it("documents audit/v1", () => {
    const schema = readSchema("schemas/audit-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "audit/v1");
    assert.ok(schema.required.includes("profile"));
    assert.ok(schema.required.includes("untestedCandidates"));
    assert.ok(schema.required.includes("coveredButRisky"));
    assert.ok(schema.required.includes("skipped"));
    assert.ok(schema.$defs.auditTarget.required.includes("riskReductionScore"));
    assert.ok(schema.$defs.auditTarget.required.includes("signals"));
  });

  it("documents plan/v1", () => {
    const schema = readSchema("schemas/plan-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "plan/v1");
    assert.ok(schema.required.includes("summary"));
    assert.ok(schema.required.includes("items"));
    assert.ok(schema.properties.items.items.required.includes("id"));
    assert.ok(schema.properties.items.items.required.includes("action"));
    assert.ok(schema.properties.items.items.required.includes("sourceSignals"));
  });
});

function readSchema(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}
