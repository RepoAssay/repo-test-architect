import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import {
  corpusRoles,
  loadValidationCorpus,
  scorecardAreas,
  validateValidationCorpus
} from "../scripts/check-validation-corpus.js";
import { assertMatchesSchema } from "./support/json-schema-validator.js";

const corpus = loadValidationCorpus();
const schema = JSON.parse(fs.readFileSync("schemas/validation-corpus-v1.schema.json", "utf8"));

describe("adapter validation corpus", () => {
  it("matches the versioned corpus schema and semantic checks", () => {
    assertMatchesSchema(corpus, schema, "evals/validation-corpus.json");

    const result = validateValidationCorpus(corpus);
    assert.deepEqual(result.errors, []);
    assert.equal(result.adapterCount, 9);
    assert.equal(result.caseCount, 27);
    assert.deepEqual(result.scorecardCounts, {
      pass: 189,
      fail: 0,
      pending: 0
    });
  });

  it("accepts bounded Go targets and rejects adapter-incompatible audit options", () => {
    const valid = structuredClone(corpus);
    const goCase = valid.adapters.find((adapter) => adapter.adapterId === "go").cases[1];
    assert.deepEqual(goCase.auditOptions, {
      goTarget: { goos: "darwin", goarch: "arm64", tags: [] }
    });
    assert.deepEqual(validateValidationCorpus(valid).errors, []);

    const invalid = structuredClone(corpus);
    invalid.adapters[0].cases[0].auditOptions = {
      goTarget: { goos: "darwin", goarch: "arm64", tags: ["integration", "integration"] }
    };
    const result = validateValidationCorpus(invalid);
    assert.ok(result.errors.some((error) => error.includes("only valid for the Go adapter")));
    assert.ok(result.errors.some((error) => error.includes("unique non-empty strings")));
  });

  it("contains every required role and scorecard area for every supported adapter", () => {
    for (const adapter of corpus.adapters) {
      assert.deepEqual(adapter.cases.map((entry) => entry.role).sort(), [...corpusRoles].sort());
      for (const entry of adapter.cases) {
        assert.deepEqual(Object.keys(entry.scorecard).sort(), [...scorecardAreas].sort());
      }
    }
  });

  it("accepts an explicitly withheld command after command review", () => {
    const blocked = structuredClone(corpus);
    blocked.adapters[0].cases[0].observed.testCommand = null;

    assert.deepEqual(validateValidationCorpus(blocked).errors, []);
    assertMatchesSchema(blocked, schema, "blocked-command validation corpus");
  });

  it("rejects incomplete pins and prematurely passing stability and performance records", () => {
    const invalid = structuredClone(corpus);
    invalid.adapters[0].cases[0].repository.commit = "55679f5";
    invalid.adapters[0].cases[0].scorecard.performance = "pass";
    invalid.adapters[0].cases[0].scorecard.stability = "pass";
    delete invalid.adapters[0].cases[0].observed.evidenceRelationshipCount;
    delete invalid.adapters[0].cases[0].observed.auditDurationSamplesMs;
    delete invalid.adapters[0].cases[0].observed.canonicalAuditSha256;
    invalid.adapters[0].cases[1].scorecard.ownership = "fail";

    const result = validateValidationCorpus(invalid);
    assert.ok(result.errors.some((error) => error.includes("full lowercase 40-character Git SHA")));
    assert.ok(result.errors.some((error) => error.includes("evidenceRelationshipCount")));
    assert.ok(result.errors.some((error) => error.includes("canonicalAuditSha256")));
    assert.ok(result.errors.some((error) => error.includes("auditDurationSamplesMs")));
    assert.ok(result.errors.some((error) => error.includes("scorecard.ownership is failing")));
  });
});
