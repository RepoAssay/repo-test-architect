import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";
import { explainTarget } from "../src/core/explain-target.js";
import { loadEvalFixtures } from "./support/eval-fixtures.js";
import { assertMatchesSchema } from "./support/json-schema-validator.js";

const expectedDir = path.resolve("evals/expected");
const auditSchema = readJson("schemas/audit-v1.schema.json");
const planSchema = readJson("schemas/plan-v1.schema.json");
const explanationSchema = readJson("schemas/target-explanation-v1.schema.json");
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
  }
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
