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
    assert.ok(schema.$defs.auditTarget.required.includes("id"));
    assert.ok(schema.$defs.auditTarget.required.includes("riskReductionScore"));
    assert.ok(schema.$defs.auditTarget.required.includes("signals"));
    assert.ok(schema.$defs.skippedTarget.required.includes("id"));
  });

  it("documents plan/v1", () => {
    const schema = readSchema("schemas/plan-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "plan/v1");
    assert.ok(schema.required.includes("summary"));
    assert.ok(schema.required.includes("items"));
    assert.ok(schema.properties.items.items.required.includes("id"));
    assert.ok(schema.properties.items.items.required.includes("action"));
    assert.ok(schema.properties.items.items.required.includes("targetId"));
    assert.ok(schema.properties.items.items.required.includes("sourceSignals"));
  });

  it("documents target-explanation/v1", () => {
    const schema = readSchema("schemas/target-explanation-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "target-explanation/v1");
    assert.ok(schema.required.includes("targetId"));
    assert.ok(schema.required.includes("recommendation"));
    assert.ok(schema.required.includes("rationale"));
    assert.deepEqual(schema.properties.category.enum, ["untestedCandidates", "coveredButRisky", "skipped"]);
  });

  it("documents candidate-ranking/v1", () => {
    const schema = readSchema("schemas/candidate-ranking-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "candidate-ranking/v1");
    assert.ok(schema.required.includes("summary"));
    assert.ok(schema.required.includes("candidates"));
    assert.ok(schema.properties.candidates.items.required.includes("targetId"));
    assert.ok(schema.properties.candidates.items.required.includes("priority"));
  });

  it("documents generation-deferred/v1", () => {
    const schema = readSchema("schemas/generation-deferred-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "generation-deferred/v1");
    assert.equal(schema.properties.status.const, "deferred");
    assert.ok(schema.required.includes("planItemId"));
    assert.ok(schema.required.includes("nextSteps"));
  });

  it("documents test-placement-findings/v1", () => {
    const schema = readSchema("schemas/test-placement-findings-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "test-placement-findings/v1");
    assert.ok(schema.required.includes("findings"));
    assert.ok(schema.properties.findings.items.required.includes("testFile"));
    assert.ok(schema.properties.findings.items.required.includes("currentOwner"));
    assert.ok(schema.properties.findings.items.required.includes("suggestedOwner"));
    assert.deepEqual(schema.properties.findings.items.properties.action.enum, ["move", "split", "keep"]);
  });

  it("documents adapter-registry/v1", () => {
    const schema = readSchema("schemas/adapter-registry-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "adapter-registry/v1");
    assert.ok(schema.required.includes("adapters"));
    assert.ok(schema.properties.adapters.items.required.includes("id"));
    assert.ok(schema.properties.adapters.items.required.includes("ecosystems"));
    assert.ok(schema.properties.adapters.items.required.includes("languages"));
  });

  it("documents project-detection/v1", () => {
    const schema = readSchema("schemas/project-detection-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "project-detection/v1");
    assert.ok(schema.required.includes("projects"));
    assert.ok(schema.required.includes("summary"));
    assert.ok(schema.properties.projects.items.required.includes("adapterIds"));
    assert.ok(schema.properties.projects.items.required.includes("supported"));
  });

  it("documents project-detection-rules/v1", () => {
    const schema = readSchema("schemas/project-detection-rules-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "project-detection-rules/v1");
    assert.ok(schema.required.includes("markers"));
    assert.ok(schema.required.includes("ignoredDirectories"));
    assert.ok(schema.properties.markers.items.required.includes("ecosystem"));
    assert.ok(schema.properties.markers.items.required.includes("languages"));
    assert.ok(schema.properties.markers.items.properties.directoryExtension);
  });

  it("documents project-audits/v1", () => {
    const schema = readSchema("schemas/project-audits-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "project-audits/v1");
    assert.ok(schema.required.includes("audits"));
    assert.ok(schema.required.includes("skippedProjects"));
    assert.ok(schema.properties.audits.items.required.includes("adapterId"));
    assert.ok(schema.properties.skippedProjects.items.required.includes("reason"));
    assert.ok(schema.properties.skippedProjects.items.required.includes("ecosystems"));
  });

  it("documents project-audit-summary/v1", () => {
    const schema = readSchema("schemas/project-audit-summary-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "project-audit-summary/v1");
    assert.ok(schema.required.includes("projects"));
    assert.ok(schema.required.includes("unsupportedProjects"));
    assert.ok(schema.properties.projects.items.required.includes("topCandidateIds"));
    assert.ok(schema.properties.unsupportedProjects.items.required.includes("ecosystems"));
    assert.ok(schema.properties.unsupportedProjects.items.required.includes("languages"));
  });

  it("documents project-candidate-ranking/v1", () => {
    const schema = readSchema("schemas/project-candidate-ranking-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "project-candidate-ranking/v1");
    assert.ok(schema.required.includes("candidates"));
    assert.ok(schema.required.includes("unsupportedProjects"));
    assert.ok(schema.properties.candidates.items.required.includes("projectTargetId"));
    assert.ok(schema.properties.candidates.items.required.includes("priority"));
    assert.ok(schema.properties.unsupportedProjects.items.required.includes("ecosystems"));
  });

  it("documents project-test-plan/v1", () => {
    const schema = readSchema("schemas/project-test-plan-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "project-test-plan/v1");
    assert.ok(schema.required.includes("projectPlans"));
    assert.ok(schema.required.includes("items"));
    assert.ok(schema.properties.items.items.required.includes("projectItemId"));
    assert.ok(schema.properties.items.items.required.includes("action"));
    assert.ok(schema.properties.unsupportedProjects.items.required.includes("ecosystems"));
  });

  it("documents MCP tool descriptors", () => {
    const schema = readSchema("schemas/mcp-tool-v1.schema.json");

    assert.ok(schema.required.includes("name"));
    assert.ok(schema.required.includes("inputSchema"));
    assert.ok(schema.required.includes("outputArtifact"));
    assert.equal(schema.properties.inputSchema.properties.type.const, "object");
  });
});

function readSchema(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}
