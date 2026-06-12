import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { loadEvalFixtures } from "./support/eval-fixtures.js";
import { assertMatchesSchema } from "./support/json-schema-validator.js";

const expectedDir = path.resolve("evals/expected");
const auditSchema = readJson("schemas/audit-v1.schema.json");
const planSchema = readJson("schemas/plan-v1.schema.json");
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
  }
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
