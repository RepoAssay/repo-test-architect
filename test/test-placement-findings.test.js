import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestPlacementFindings } from "../src/core/test-placement-findings.js";

describe("test placement findings", () => {
  it("creates an empty advisory placement artifact", () => {
    const artifact = createTestPlacementFindings();

    assert.deepEqual(artifact, {
      schemaVersion: "test-placement-findings/v1",
      findings: []
    });
  });

  it("normalizes placement findings without mutating evidence arrays", () => {
    const evidence = ["imports DeckCore", "asserts DeckParser output"];
    const artifact = createTestPlacementFindings([
      {
        id: "move:AppTests/DeckParserTests.swift",
        testFile: "AppTests/DeckParserTests.swift",
        currentOwner: "AppTests",
        suggestedOwner: "DeckCoreTests",
        action: "move",
        reason: "Test covers package-owned parser behavior.",
        evidence
      }
    ]);

    evidence.push("mutated after creation");

    assert.equal(artifact.schemaVersion, "test-placement-findings/v1");
    assert.deepEqual(artifact.findings[0].evidence, ["imports DeckCore", "asserts DeckParser output"]);
  });

  it("rejects invalid placement actions", () => {
    assert.throws(
      () =>
        createTestPlacementFindings([
          {
            id: "copy:AppTests/DeckParserTests.swift",
            testFile: "AppTests/DeckParserTests.swift",
            currentOwner: "AppTests",
            suggestedOwner: "DeckCoreTests",
            action: "copy",
            reason: "Unsupported action.",
            evidence: ["imports DeckCore"]
          }
        ]),
      /action must be one of/
    );
  });
});
