import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import {
  corpusRoles,
  loadValidationCorpus,
  optionalCorpusRoles,
  requiredCorpusRoles,
  scorecardAreas,
  validateValidationCorpus
} from "../scripts/check-validation-corpus.js";
import { listAdapters } from "../src/core/adapter-registry.js";
import { assertMatchesSchema } from "./support/json-schema-validator.js";

const corpus = loadValidationCorpus();
const schema = JSON.parse(fs.readFileSync("schemas/validation-corpus-v1.schema.json", "utf8"));

describe("adapter validation corpus", () => {
  it("matches the versioned corpus schema and semantic checks", () => {
    assertMatchesSchema(corpus, schema, "evals/validation-corpus.json");

    const result = validateValidationCorpus(corpus);
    assert.deepEqual(result.errors, []);
    assert.equal(result.adapterCount, 11);
    assert.equal(result.supportedAdapterCount, 10);
    assert.equal(result.experimentalAdapterCount, 1);
    assert.equal(result.caseCount, 33);
    assert.deepEqual(result.scorecardCounts, {
      pass: 231,
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

  it("contains every required role and scorecard area for every corpus adapter", () => {
    assert.deepEqual(corpusRoles, [...requiredCorpusRoles, ...optionalCorpusRoles]);
    assert.deepEqual(optionalCorpusRoles, ["product-monorepo"]);
    for (const adapter of corpus.adapters) {
      const roles = adapter.cases.map((entry) => entry.role);
      for (const role of requiredCorpusRoles) assert.ok(roles.includes(role), `${adapter.adapterId} pins a ${role} case`);
      for (const role of roles) assert.ok(corpusRoles.includes(role), `${adapter.adapterId} uses an accepted role (${role})`);
      for (const entry of adapter.cases) {
        assert.deepEqual(Object.keys(entry.scorecard).sort(), [...scorecardAreas].sort());
      }
    }
  });

  it("accepts a product-monorepo case ahead of enforcement and requires one for enforced adapters", () => {
    // #325: the fourth role is accepted everywhere and required adapter by adapter as pins land.
    const staged = structuredClone(corpus);
    const javascript = staged.adapters.find((adapter) => adapter.adapterId === "javascript");
    javascript.cases.push({ ...structuredClone(javascript.cases[0]), id: "javascript-product-monorepo-probe", role: "product-monorepo" });
    assertMatchesSchema(staged, schema, "validation corpus with a product-monorepo case");
    assert.deepEqual(validateValidationCorpus(staged).errors, []);
    assert.deepEqual(validateValidationCorpus(staged, { productMonorepoRequiredAdapters: new Set(["javascript"]) }).errors, []);

    const enforced = validateValidationCorpus(corpus, { productMonorepoRequiredAdapters: new Set(["swift"]) }).errors;
    assert.ok(enforced.some((error) => error.includes("swift needs at least 4 corpus cases")));
    assert.ok(enforced.some((error) => error.includes("swift is missing corpus role product-monorepo")));
    assert.ok(!enforced.some((error) => error.includes("javascript")), "adapters outside the enforced set are unaffected");

    const unknown = structuredClone(corpus);
    unknown.adapters[0].cases[0].role = "product-monorepo-app";
    assert.ok(validateValidationCorpus(unknown).errors.some((error) => error.includes("unsupported corpus role product-monorepo-app")));
  });

  it("requires every supported adapter and only accepts complete registered experimental cohorts", () => {
    const stagedRegistry = listAdapters().map((adapter) => (
      adapter.id === "elixir" ? { ...adapter, maturity: "experimental" } : adapter
    ));
    const stagedExperimental = structuredClone(corpus);
    const stagedElixir = stagedExperimental.adapters.find((adapter) => adapter.adapterId === "elixir");
    for (const entry of stagedElixir.cases) {
      for (const area of scorecardAreas) entry.scorecard[area] = "pending";
      delete entry.observed.auditDurationMs;
      delete entry.observed.auditDurationSamplesMs;
      delete entry.observed.evidenceRelationshipCount;
      delete entry.observed.canonicalAuditSha256;
    }
    const stagedResult = validateValidationCorpus(stagedExperimental, { adapters: stagedRegistry });
    assert.deepEqual(stagedResult.errors, []);
    assert.equal(stagedResult.supportedAdapterCount, 9);
    assert.equal(stagedResult.experimentalAdapterCount, 2);

    const missingSupported = structuredClone(corpus);
    missingSupported.adapters = missingSupported.adapters.filter((adapter) => adapter.adapterId !== "csharp");
    assert.ok(validateValidationCorpus(missingSupported).errors.some(
      (error) => error.includes("missing supported adapters: csharp")
    ));

    const unregistered = structuredClone(corpus);
    unregistered.adapters.find((adapter) => adapter.adapterId === "elixir").adapterId = "future";
    assert.ok(validateValidationCorpus(unregistered).errors.some(
      (error) => error.includes("future is not registered")
    ));

    const incompleteExperimental = structuredClone(corpus);
    const elixir = incompleteExperimental.adapters.find((adapter) => adapter.adapterId === "elixir");
    elixir.cases.pop();
    const errors = validateValidationCorpus(incompleteExperimental, { adapters: stagedRegistry }).errors;
    assert.ok(errors.some((error) => error.includes("elixir needs at least 3 corpus cases")));
    assert.ok(errors.some((error) => error.includes("elixir is missing corpus role difficult-ownership-graph")));
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
