import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";
import { analyzeTestPlacement } from "../src/core/test-placement-analysis.js";

describe("test placement analysis", () => {
  it("keeps matching tests inside the audited project owner", () => {
    const audit = auditJavaScriptRepo(path.resolve("examples/node-vitest-basic"));
    const artifact = analyzeTestPlacement(audit, { owner: "node-vitest-basic" });

    assert.equal(artifact.schemaVersion, "test-placement-findings/v1");
    assert.deepEqual(
      artifact.findings.map((finding) => finding.action),
      ["keep"]
    );
    assert.deepEqual(artifact.findings[0], {
      id: "keep:src/deckParser.test.ts:src/deckParser.ts",
      testFile: "src/deckParser.test.ts",
      currentOwner: "node-vitest-basic",
      suggestedOwner: "node-vitest-basic",
      action: "keep",
      reason: "Existing test is colocated with the audited project and matches a source target in the same project.",
      evidence: [
        "matches source target src/deckParser.ts",
        "target kind: pure-logic",
        "recommended level: unit"
      ]
    });
  });

  it("returns an empty artifact when no matching tests exist", () => {
    const audit = auditJavaScriptRepo(path.resolve("examples/node-no-tests-yet"));
    const artifact = analyzeTestPlacement(audit, { owner: "node-no-tests-yet" });

    assert.deepEqual(artifact, {
      schemaVersion: "test-placement-findings/v1",
      findings: []
    });
  });
});
