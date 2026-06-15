import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";
import { getAdapterRegistry } from "../src/core/adapter-registry.js";
import { explainTarget } from "../src/core/explain-target.js";
import { summarizeProjectAudits } from "../src/core/project-audit-summary.js";
import { auditDetectedProjects } from "../src/core/project-auditor.js";
import { rankProjectTestCandidates } from "../src/core/project-candidate-ranking.js";
import { detectProjects, getProjectDetectionRules } from "../src/core/project-detector.js";
import { analyzeProjectTestPlacement } from "../src/core/project-test-placement-analysis.js";
import { createProjectTestPlan } from "../src/core/project-test-plan.js";
import { rankTestCandidates } from "../src/core/rank-test-candidates.js";
import { createTestPlacementFindings } from "../src/core/test-placement-findings.js";
import { loadEvalFixtures } from "./support/eval-fixtures.js";
import { assertMatchesSchema } from "./support/json-schema-validator.js";

const expectedDir = path.resolve("evals/expected");
const auditSchema = readJson("schemas/audit-v1.schema.json");
const planSchema = readJson("schemas/plan-v1.schema.json");
const explanationSchema = readJson("schemas/target-explanation-v1.schema.json");
const rankingSchema = readJson("schemas/candidate-ranking-v1.schema.json");
const generationDeferredSchema = readJson("schemas/generation-deferred-v1.schema.json");
const testPlacementFindingsSchema = readJson("schemas/test-placement-findings-v1.schema.json");
const adapterRegistrySchema = readJson("schemas/adapter-registry-v1.schema.json");
const projectDetectionRulesSchema = readJson("schemas/project-detection-rules-v1.schema.json");
const projectDetectionSchema = readJson("schemas/project-detection-v1.schema.json");
const projectAuditsSchema = readJson("schemas/project-audits-v1.schema.json");
const projectAuditSummarySchema = readJson("schemas/project-audit-summary-v1.schema.json");
const projectCandidateRankingSchema = readJson("schemas/project-candidate-ranking-v1.schema.json");
const projectTestPlanSchema = readJson("schemas/project-test-plan-v1.schema.json");
const modelConsistencyScenarioSchema = readJson("schemas/model-consistency-scenario-v1.schema.json");
const fixtures = loadEvalFixtures();

describe("artifact schema compatibility", () => {
  for (const fixture of fixtures) {
    it(`validates ${fixture.name} audit artifact`, () => {
      const artifact = readJson(path.join(expectedDir, `${fixture.name}.audit.json`));

      assertMatchesSchema(artifact, auditSchema, `${fixture.name}.audit.json`);
    });

    it(`validates ${fixture.name} plan artifact`, () => {
      const artifact = readJson(path.join(expectedDir, `${fixture.name}.plan.json`));

      assertMatchesSchema(artifact, planSchema, `${fixture.name}.plan.json`);
    });

    it(`validates ${fixture.name} target explanation artifact`, () => {
      const audit = auditJavaScriptRepo(fixture.root);
      const target = [...audit.untestedCandidates, ...audit.coveredButRisky, ...audit.skipped][0];
      const artifact = explainTarget(audit, target.id);

      assertMatchesSchema(artifact, explanationSchema, `${fixture.name}.target-explanation.json`);
    });

    it(`validates ${fixture.name} candidate ranking artifact`, () => {
      const audit = auditJavaScriptRepo(fixture.root);
      const artifact = rankTestCandidates(audit);

      assertMatchesSchema(artifact, rankingSchema, `${fixture.name}.candidate-ranking.json`);
    });
  }
});

describe("deferred generation artifact schema compatibility", () => {
  it("validates generation-deferred/v1", () => {
    const artifact = {
      schemaVersion: "generation-deferred/v1",
      planItemId: "add-test:src/authService.ts",
      status: "deferred",
      reason: "Native test generation is intentionally disabled until audit and planning behavior are trustworthy.",
      nextSteps: ["Use generate_test_plan to select a stable plan item."]
    };

    assertMatchesSchema(artifact, generationDeferredSchema, "generation-deferred.json");
  });
});

describe("test placement findings artifact schema compatibility", () => {
  it("validates test-placement-findings/v1", () => {
    const artifact = createTestPlacementFindings([
      {
        id: "move:AppTests/DeckParserTests.swift",
        testFile: "AppTests/DeckParserTests.swift",
        currentOwner: "AppTests",
        suggestedOwner: "DeckCoreTests",
        action: "move",
        reason: "Test covers package-owned parser behavior without app integration dependencies.",
        evidence: ["imports DeckCore", "asserts DeckParser output", "does not touch app lifecycle"]
      },
      {
        id: "split:AppTests/CheckoutFlowTests.swift",
        testFile: "AppTests/CheckoutFlowTests.swift",
        currentOwner: "AppTests",
        suggestedOwner: "CheckoutCoreTests",
        action: "split",
        reason: "Test mixes package-owned price calculation with app navigation assertions.",
        evidence: ["imports CheckoutCore", "asserts CheckoutCalculator output", "also validates app navigation"]
      }
    ]);

    assertMatchesSchema(artifact, testPlacementFindingsSchema, "test-placement-findings.json");
  });

  it("validates project-derived test-placement-findings/v1", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));
    const artifact = analyzeProjectTestPlacement(projectAudits);

    assertMatchesSchema(artifact, testPlacementFindingsSchema, "project-test-placement-findings.json");
  });
});

describe("adapter registry artifact schema compatibility", () => {
  it("validates adapter-registry/v1", () => {
    assertMatchesSchema(getAdapterRegistry(), adapterRegistrySchema, "adapter-registry.json");
  });
});

describe("project detection artifact schema compatibility", () => {
  it("validates project-detection-rules/v1", () => {
    assertMatchesSchema(getProjectDetectionRules(), projectDetectionRulesSchema, "project-detection-rules.json");
  });

  it("validates project-detection/v1", () => {
    const artifact = detectProjects(path.resolve("examples/polyglot-workspace"));

    assertMatchesSchema(artifact, projectDetectionSchema, "project-detection.json");
  });
});

describe("project audits artifact schema compatibility", () => {
  it("validates project-audits/v1", () => {
    const artifact = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));

    assertMatchesSchema(artifact, projectAuditsSchema, "project-audits.json");
  });
});

describe("project audit summary artifact schema compatibility", () => {
  it("validates project-audit-summary/v1", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));
    const artifact = summarizeProjectAudits(projectAudits);

    assertMatchesSchema(artifact, projectAuditSummarySchema, "project-audit-summary.json");
  });
});

describe("project candidate ranking artifact schema compatibility", () => {
  it("validates project-candidate-ranking/v1", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));
    const artifact = rankProjectTestCandidates(projectAudits);

    assertMatchesSchema(artifact, projectCandidateRankingSchema, "project-candidate-ranking.json");
  });
});

describe("project test plan artifact schema compatibility", () => {
  it("validates project-test-plan/v1", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));
    const artifact = createProjectTestPlan(projectAudits);

    assertMatchesSchema(artifact, projectTestPlanSchema, "project-test-plan.json");
  });
});

describe("model consistency scenario schema compatibility", () => {
  it("validates model-consistency-scenario/v1", () => {
    const artifact = readJson("evals/model-consistency/node-vitest-basic-auth-explanation.scenario.json");

    assertMatchesSchema(artifact, modelConsistencyScenarioSchema, "node-vitest-basic-auth-explanation.scenario.json");
  });
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
