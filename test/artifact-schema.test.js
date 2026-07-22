import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { getAdapter, getAdapterRegistry } from "../src/core/adapter-registry.js";
import { explainTarget } from "../src/core/explain-target.js";
import { summarizeProjectAudits } from "../src/core/project-audit-summary.js";
import { auditDetectedProjects } from "../src/core/project-auditor.js";
import { rankProjectTestCandidates } from "../src/core/project-candidate-ranking.js";
import { detectProjects, getProjectDetectionRules } from "../src/core/project-detector.js";
import { createProjectFindings } from "../src/core/project-findings.js";
import { analyzeProjectTestPlacement } from "../src/core/project-test-placement-analysis.js";
import { createProjectTestPlan } from "../src/core/project-test-plan.js";
import { rankTestCandidates } from "../src/core/rank-test-candidates.js";
import {
  compareModelConsistencySummaries,
  readModelConsistencyScenario,
  runModelConsistencyScenario,
  summarizeModelConsistencyResults
} from "../src/core/model-consistency-runner.js";
import { createTestPlacementFindings } from "../src/core/test-placement-findings.js";
import { collectProjectStats } from "../src/core/project-stats.js";
import { collectModelConsistencyStats } from "../src/core/model-consistency-stats.js";
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
const projectFindingsSchema = readJson("schemas/project-findings-v1.schema.json");
const projectStatsSchema = readJson("schemas/project-stats-v1.schema.json");
const modelConsistencyScenarioSchema = readJson("schemas/model-consistency-scenario-v1.schema.json");
const modelConsistencySummarySchema = readJson("schemas/model-consistency-summary-v1.schema.json");
const modelConsistencyComparisonSchema = readJson("schemas/model-consistency-comparison-v1.schema.json");
const modelConsistencyStatsSchema = readJson("schemas/model-consistency-stats-v1.schema.json");
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
      const audit = getAdapter(fixture.adapter).audit(fixture.root);
      const target = [...audit.untestedCandidates, ...audit.coveredButRisky, ...audit.skipped][0];
      if (!target) {
        assert.deepEqual(audit.recommended, []);
        return;
      }
      const artifact = explainTarget(audit, target.id);

      assertMatchesSchema(artifact, explanationSchema, `${fixture.name}.target-explanation.json`);
    });

    it(`validates ${fixture.name} candidate ranking artifact`, () => {
      const audit = getAdapter(fixture.adapter).audit(fixture.root);
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

  it("validates checked-in MCP project-audits args fixture", () => {
    const args = readJson("examples/mcp/polyglot-project-audits.args.json");

    assertMatchesSchema(args.projectAudits, projectAuditsSchema, "polyglot-project-audits.args.json.projectAudits");
  });

  it("validates checked-in split placement project-audits fixtures", () => {
    const projectAudits = readJson("examples/split-placement-project-audits.json");
    const args = readJson("examples/mcp/split-placement-project-audits.args.json");

    assertMatchesSchema(projectAudits, projectAuditsSchema, "split-placement-project-audits.json");
    assertMatchesSchema(args.projectAudits, projectAuditsSchema, "split-placement-project-audits.args.json.projectAudits");
    assert.deepEqual(args.projectAudits, projectAudits);
  });

  it("keeps checked-in MCP project-audits args fixture aligned with the polyglot example", () => {
    const args = readJson("examples/mcp/polyglot-project-audits.args.json");
    const artifact = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));

    assert.deepEqual(normalizePolyglotProjectAudits(artifact), args.projectAudits);
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

describe("project findings artifact schema compatibility", () => {
  it("validates project-findings/v1", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));
    const artifact = createProjectFindings(projectAudits);

    assertMatchesSchema(artifact, projectFindingsSchema, "project-findings.json");
  });
});

describe("project stats artifact schema compatibility", () => {
  it("validates project-stats/v1", () => {
    const projectAudits = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));
    const artifact = collectProjectStats(projectAudits);

    assertMatchesSchema(artifact, projectStatsSchema, "project-stats.json");
  });
});

describe("model consistency scenario schema compatibility", () => {
  for (const scenarioPath of fs.readdirSync("evals/model-consistency").filter((fileName) => fileName.endsWith(".scenario.json"))) {
    it(`validates ${scenarioPath}`, () => {
      const artifact = readJson(path.join("evals/model-consistency", scenarioPath));

      assertMatchesSchema(artifact, modelConsistencyScenarioSchema, scenarioPath);
    });
  }
});

describe("model consistency summary artifact schema compatibility", () => {
  it("validates model-consistency-summary/v1", () => {
    const scenarios = fs
      .readdirSync("evals/model-consistency")
      .filter((fileName) => fileName.endsWith(".scenario.json"))
      .sort()
      .map((fileName) => readModelConsistencyScenario(path.join("evals/model-consistency", fileName)));
    const results = scenarios.map((scenario) => runModelConsistencyScenario(scenario));
    const artifact = summarizeModelConsistencyResults(scenarios, results);

    assertMatchesSchema(artifact, modelConsistencySummarySchema, "model-consistency-summary.json");
  });
});

describe("model consistency comparison artifact schema compatibility", () => {
  it("validates model-consistency-comparison/v1", () => {
    const scenarios = readModelConsistencyScenarios();
    const results = scenarios.map((scenario) => runModelConsistencyScenario(scenario));
    const baseline = summarizeModelConsistencyResults(scenarios, results, {
      profileName: "deterministic-baseline"
    });
    const candidate = summarizeModelConsistencyResults(scenarios, results, {
      profileName: "local-small"
    });
    const artifact = compareModelConsistencySummaries(baseline, candidate);

    assertMatchesSchema(artifact, modelConsistencyComparisonSchema, "model-consistency-comparison.json");
  });
});

describe("model consistency stats artifact schema compatibility", () => {
  it("validates model-consistency-stats/v1", () => {
    const scenarios = fs
      .readdirSync("evals/model-consistency")
      .filter((fileName) => fileName.endsWith(".scenario.json"))
      .sort()
      .map((fileName) => readModelConsistencyScenario(path.join("evals/model-consistency", fileName)));
    const results = scenarios.map((scenario) => runModelConsistencyScenario(scenario));
    const summary = summarizeModelConsistencyResults(scenarios, results);
    const artifact = collectModelConsistencyStats(summary);

    assertMatchesSchema(artifact, modelConsistencyStatsSchema, "model-consistency-stats.json");
  });
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readModelConsistencyScenarios() {
  return fs
    .readdirSync("evals/model-consistency")
    .filter((fileName) => fileName.endsWith(".scenario.json"))
    .sort()
    .map((fileName) => readModelConsistencyScenario(path.join("evals/model-consistency", fileName)));
}

function normalizePolyglotProjectAudits(projectAudits) {
  return JSON.parse(JSON.stringify({
    ...projectAudits,
    root: "./examples/polyglot-workspace",
    audits: projectAudits.audits.map((entry) => ({
      ...entry,
      audit: {
        ...entry.audit,
        profile: {
          ...entry.audit.profile,
          root: `./examples/polyglot-workspace/${entry.projectRoot}`
        }
      }
    }))
  }));
}
