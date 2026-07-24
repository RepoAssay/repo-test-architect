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

  it("documents plan-execution-hints/v1", () => {
    const schema = readSchema("schemas/plan-execution-hints-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "plan-execution-hints/v1");
    assert.ok(schema.required.includes("source"));
    assert.ok(schema.required.includes("summary"));
    assert.ok(schema.required.includes("items"));
    assert.deepEqual(schema.properties.source.properties.schemaVersion.enum, ["plan/v1", "project-test-plan/v1"]);
    assert.ok(schema.properties.items.items.required.includes("complexity"));
    assert.ok(schema.properties.items.items.required.includes("contextScope"));
    assert.ok(schema.properties.items.items.required.includes("parallelizable"));
    assert.ok(schema.properties.items.items.required.includes("recommendedAgentRole"));
    assert.ok(schema.properties.items.items.required.includes("requiresRepositoryReasoning"));
  });

  it("documents local diagnostic artifacts", () => {
    const eventSchema = readSchema("schemas/diagnostic-event-v1.schema.json");
    const doctorSchema = readSchema("schemas/doctor-report-v1.schema.json");
    const bundleSchema = readSchema("schemas/diagnostic-bundle-v1.schema.json");

    assert.equal(eventSchema.properties.schemaVersion.const, "diagnostic-event/v1");
    assert.equal(eventSchema.properties.eventType.const, "mcp-tool-call");
    assert.ok(eventSchema.required.includes("toolName"));
    assert.ok(eventSchema.required.includes("durationMs"));
    assert.equal(doctorSchema.properties.schemaVersion.const, "doctor-report/v1");
    assert.equal(doctorSchema.properties.diagnostics.properties.externalReporting.const, false);
    assert.equal(bundleSchema.properties.schemaVersion.const, "diagnostic-bundle/v1");
    assert.equal(bundleSchema.properties.privacy.properties.containsToolArguments.const, false);
    assert.equal(bundleSchema.properties.privacy.properties.containsRepositoryPaths.const, false);
    assert.equal(bundleSchema.properties.privacy.properties.containsSourceContent.const, false);
    assert.equal(bundleSchema.properties.privacy.properties.externalReporting.const, false);
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
    assert.ok(schema.properties.adapters.items.required.includes("maturity"));
    assert.ok(schema.properties.adapters.items.required.includes("supportedTestFrameworks"));
    assert.ok(schema.properties.adapters.items.required.includes("supportedProjectTypes"));
    assert.ok(schema.properties.adapters.items.required.includes("emittedArtifacts"));
    assert.deepEqual(schema.properties.adapters.items.properties.maturity.enum, ["supported", "experimental", "planned"]);
  });

  it("documents project-detection/v1", () => {
    const schema = readSchema("schemas/project-detection-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "project-detection/v1");
    assert.ok(schema.required.includes("projects"));
    assert.ok(schema.required.includes("summary"));
    assert.ok(schema.properties.projects.items.required.includes("adapterIds"));
    assert.ok(schema.properties.projects.items.required.includes("adapterMatches"));
    assert.ok(schema.properties.projects.items.required.includes("supported"));
    assert.ok(schema.properties.projects.items.required.includes("supportStatusReason"));
    assert.ok(schema.properties.projects.items.properties.adapterMatches.items.required.includes("matchedEcosystems"));
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
    assert.ok(schema.properties.skippedProjects.items.required.includes("adapterMatches"));
    assert.ok(schema.properties.skippedProjects.items.required.includes("supportStatusReason"));
  });

  it("documents project-audit-summary/v1", () => {
    const schema = readSchema("schemas/project-audit-summary-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "project-audit-summary/v1");
    assert.ok(schema.required.includes("projects"));
    assert.ok(schema.required.includes("unsupportedProjects"));
    assert.ok(schema.properties.projects.items.required.includes("topCandidateIds"));
    assert.ok(schema.properties.summary.required.includes("auditCoverage"));
    assert.ok(schema.properties.summary.required.includes("unsupportedReasons"));
    assert.ok(schema.properties.unsupportedProjects.items.required.includes("ecosystems"));
    assert.ok(schema.properties.unsupportedProjects.items.required.includes("languages"));
    assert.ok(schema.properties.unsupportedProjects.items.required.includes("adapterMatches"));
    assert.ok(schema.properties.unsupportedProjects.items.required.includes("supportStatusReason"));
  });

  it("documents project-candidate-ranking/v1", () => {
    const schema = readSchema("schemas/project-candidate-ranking-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "project-candidate-ranking/v1");
    assert.ok(schema.required.includes("candidates"));
    assert.ok(schema.required.includes("unsupportedProjects"));
    assert.ok(schema.properties.candidates.items.required.includes("projectTargetId"));
    assert.ok(schema.properties.candidates.items.required.includes("priority"));
    assert.ok(schema.properties.summary.required.includes("auditCoverage"));
    assert.ok(schema.properties.summary.required.includes("unsupportedReasons"));
    assert.ok(schema.properties.unsupportedProjects.items.required.includes("ecosystems"));
    assert.ok(schema.properties.unsupportedProjects.items.required.includes("adapterMatches"));
    assert.ok(schema.properties.unsupportedProjects.items.required.includes("supportStatusReason"));
  });

  it("documents project-test-plan/v1", () => {
    const schema = readSchema("schemas/project-test-plan-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "project-test-plan/v1");
    assert.ok(schema.required.includes("projectPlans"));
    assert.ok(schema.required.includes("items"));
    assert.ok(schema.properties.items.items.required.includes("projectItemId"));
    assert.ok(schema.properties.items.items.required.includes("action"));
    assert.ok(schema.properties.summary.required.includes("auditCoverage"));
    assert.ok(schema.properties.summary.required.includes("unsupportedReasons"));
    assert.ok(schema.properties.unsupportedProjects.items.required.includes("ecosystems"));
    assert.ok(schema.properties.unsupportedProjects.items.required.includes("adapterMatches"));
    assert.ok(schema.properties.unsupportedProjects.items.required.includes("supportStatusReason"));
  });

  it("documents project-findings/v1", () => {
    const schema = readSchema("schemas/project-findings-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "project-findings/v1");
    assert.ok(schema.required.includes("summary"));
    assert.ok(schema.required.includes("findings"));
    assert.ok(schema.required.includes("unsupportedProjects"));
    assert.ok(schema.properties.summary.required.includes("auditCoverage"));
    assert.ok(schema.properties.summary.required.includes("findingCount"));
    assert.ok(schema.properties.findings.items.required.includes("category"));
    assert.ok(schema.properties.findings.items.required.includes("severity"));
    assert.ok(schema.properties.findings.items.required.includes("evidence"));
  });

  it("documents project-stats/v1", () => {
    const schema = readSchema("schemas/project-stats-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "project-stats/v1");
    assert.ok(schema.required.includes("summary"));
    assert.ok(schema.required.includes("sourceFiles"));
    assert.ok(schema.required.includes("counts"));
    assert.ok(schema.required.includes("distributions"));
    assert.ok(schema.required.includes("adapters"));
    assert.ok(schema.properties.summary.required.includes("auditCoverage"));
    assert.ok(schema.properties.sourceFiles.required.includes("byLanguage"));
    assert.ok(schema.properties.counts.required.includes("blockerCount"));
    assert.ok(schema.properties.distributions.required.includes("testFrameworks"));
    assert.ok(schema.properties.adapters.items.required.includes("adapterId"));
  });

  it("documents MCP tool descriptors", () => {
    const schema = readSchema("schemas/mcp-tool-v1.schema.json");

    assert.ok(schema.required.includes("name"));
    assert.ok(schema.required.includes("inputSchema"));
    assert.ok(schema.required.includes("outputArtifact"));
    assert.equal(schema.properties.inputSchema.properties.type.const, "object");
  });

  it("documents model-consistency-scenario/v1", () => {
    const schema = readSchema("schemas/model-consistency-scenario-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "model-consistency-scenario/v1");
    assert.ok(schema.required.includes("sourceArtifact"));
    assert.ok(schema.properties.sourceArtifact.properties.argumentName);
    assert.ok(schema.required.includes("toolCall"));
    assert.ok(schema.required.includes("lockedFields"));
    assert.ok(schema.properties.lockedFields.items.required.includes("expected"));
    assert.ok(schema.properties.unexpectedVariations.minItems >= 1);
  });

  it("documents model-consistency-summary/v1", () => {
    const schema = readSchema("schemas/model-consistency-summary-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "model-consistency-summary/v1");
    assert.ok(schema.required.includes("profileName"));
    assert.ok(schema.required.includes("summary"));
    assert.ok(schema.required.includes("scenarios"));
    assert.ok(schema.properties.summary.required.includes("failureCount"));
    assert.deepEqual(schema.properties.scenarios.items.properties.status.enum, ["passed", "failed"]);
  });

  it("documents model-consistency-comparison/v1", () => {
    const schema = readSchema("schemas/model-consistency-comparison-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "model-consistency-comparison/v1");
    assert.ok(schema.required.includes("baselineProfile"));
    assert.ok(schema.required.includes("candidateProfile"));
    assert.ok(schema.required.includes("summary"));
    assert.ok(schema.properties.summary.required.includes("driftedScenarioCount"));
    assert.deepEqual(schema.properties.scenarios.items.properties.alignment.enum, [
      "aligned",
      "drifted",
      "missing",
      "unexpected"
    ]);
  });

  it("documents model-consistency-stats/v1", () => {
    const schema = readSchema("schemas/model-consistency-stats-v1.schema.json");

    assert.equal(schema.properties.schemaVersion.const, "model-consistency-stats/v1");
    assert.ok(schema.required.includes("source"));
    assert.ok(schema.required.includes("counts"));
    assert.ok(schema.required.includes("distributions"));
    assert.ok(schema.properties.counts.required.includes("driftedScenarioCount"));
    assert.ok(schema.properties.distributions.required.includes("scenariosByTool"));
  });
});

function readSchema(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}
