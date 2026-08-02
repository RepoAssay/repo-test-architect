import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import {
  createValidationScorecard,
  renderValidationScorecardMarkdown,
  validationScorecardAreas
} from "../src/core/validation-scorecard.js";
import { assertMatchesSchema } from "./support/json-schema-validator.js";

const corpus = JSON.parse(fs.readFileSync("evals/validation-corpus.json", "utf8"));
const schema = JSON.parse(fs.readFileSync("schemas/validation-scorecard-v1.schema.json", "utf8"));

describe("validation scorecard", () => {
  it("derives a versioned scorecard from the validation corpus", () => {
    const scorecard = createValidationScorecard(corpus);

    assertMatchesSchema(scorecard, schema, "validation scorecard");
    assert.deepEqual(scorecard.summary, {
      caseCount: 30,
      reviewCompleteness: { reviewedAreas: 189, totalAreas: 210 },
      reviewedPassRate: { passedAreas: 189, reviewedAreas: 189 },
      states: { pass: 189, fail: 0, pending: 21 }
    });
    assert.deepEqual(scorecard.adapters[0].cases[0].areas.map((entry) => entry.area), validationScorecardAreas);
  });

  it("keeps review completeness separate from reviewed pass rate", () => {
    const partial = structuredClone(corpus);
    partial.adapters = [structuredClone(corpus.adapters[0])];
    partial.adapters[0].cases = [structuredClone(corpus.adapters[0].cases[0])];
    partial.adapters[0].cases[0].scorecard.stability = "pending";
    partial.adapters[0].cases[0].scorecard.performance = "pending";

    const scorecard = createValidationScorecard(partial);
    assert.deepEqual(scorecard.summary.reviewCompleteness, { reviewedAreas: 5, totalAreas: 7 });
    assert.deepEqual(scorecard.summary.reviewedPassRate, { passedAreas: 5, reviewedAreas: 5 });
    assert.deepEqual(scorecard.summary.states, { pass: 5, fail: 0, pending: 2 });

    const markdown = renderValidationScorecardMarkdown(scorecard);
    assert.match(markdown, /5\/7 areas reviewed \(71%\)/);
    assert.match(markdown, /5\/5 reviewed checks pass \(100%\)/);
    assert.doesNotMatch(markdown, /71% quality/i);
    assert.match(markdown, /PENDING/);
  });

  it("shows failures as reviewed checks and handles a zero-review pass rate", () => {
    const failed = structuredClone(corpus);
    failed.adapters = [structuredClone(corpus.adapters[0])];
    failed.adapters[0].cases = [structuredClone(corpus.adapters[0].cases[0])];
    failed.adapters[0].cases[0].scorecard.ownership = "fail";
    const failedScorecard = createValidationScorecard(failed);

    assert.deepEqual(failedScorecard.summary.reviewCompleteness, { reviewedAreas: 7, totalAreas: 7 });
    assert.deepEqual(failedScorecard.summary.reviewedPassRate, { passedAreas: 6, reviewedAreas: 7 });
    assert.match(renderValidationScorecardMarkdown(failedScorecard), /FAIL/);

    const pending = structuredClone(failed);
    for (const area of validationScorecardAreas) pending.adapters[0].cases[0].scorecard[area] = "pending";
    assert.match(renderValidationScorecardMarkdown(createValidationScorecard(pending)), /not available \(0 reviewed areas\)/);
  });

  it("renders the checked-in scorecard as Markdown and JSON", () => {
    const markdown = execFileSync(process.execPath, ["scripts/render-validation-scorecard.js"], { encoding: "utf8" });
    assert.match(markdown, /# Validation Corpus Scorecard/);
    assert.match(markdown, /189\/210 areas reviewed \(90%\)/);
    assert.match(markdown, /189\/189 reviewed checks pass \(100%\)/);
    assert.match(markdown, /This reports validation review status, not repository quality/);

    const json = JSON.parse(execFileSync(
      process.execPath,
      ["scripts/render-validation-scorecard.js", "--format=json"],
      { encoding: "utf8" }
    ));
    assertMatchesSchema(json, schema, "rendered validation scorecard");
  });
});
