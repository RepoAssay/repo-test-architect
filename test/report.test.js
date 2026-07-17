import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderMarkdownReport } from "../src/core/report.js";

describe("Markdown audit report", () => {
  it("renders bounded paths and normalized evidence summaries", () => {
    const existingTestPaths = Array.from({ length: 7 }, (_, index) => `test/parser-${index + 1}.test.ts`);
    const output = renderMarkdownReport({
      profile: {
        languages: ["typescript"],
        packageManagers: ["npm"],
        testFrameworks: ["vitest"],
        architectures: [],
        testCommand: "npm run test",
        confidence: "high",
        existingTestLocations: ["test/"],
        detectedConventions: ["*.test files"],
        setupSignals: ["vitest config"],
        blockers: []
      },
      untestedCandidates: [],
      coveredButRisky: [{
        name: "parser",
        kind: "pure-logic",
        recommendedTestLevel: "unit",
        riskReductionScore: 9,
        maintenanceCost: 2,
        reasons: ["Pure transformation logic"],
        existingTestPaths,
        existingTestEvidence: [
          { testPath: existingTestPaths[0], strength: "direct", usage: "asserted" },
          { testPath: existingTestPaths[1], strength: "indirect", viaUsage: "called" }
        ]
      }],
      skipped: [],
      risks: []
    });

    assert.match(output, /^# Repository Test Audit/m);
    assert.match(output, /\(\+2 more; full list available in JSON\)/);
    assert.match(output, /evidence strengths: direct: 1, indirect: 1/);
    assert.match(output, /evidence usage: asserted: 1/);
    assert.match(output, /indirect entrypoint usage: called: 1/);
  });
});
