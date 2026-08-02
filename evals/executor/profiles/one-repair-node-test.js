export const profileId = "one-repair-node-test";

export function createProposal(context, attemptNumber) {
  requireExpectedContext(context);
  if (attemptNumber === 1) return proposal(context, failingTestContent());
  if (attemptNumber === 2 && context.previousVerification?.failureKind === "assertion-failure") {
    return proposal(context, passingTestContent());
  }
  return undefined;
}

function proposal(context, content) {
  return {
    planItemId: context.planItem.id,
    targetId: context.planItem.targetId,
    action: context.planItem.action,
    targetPath: context.planItem.path,
    testLevel: context.planItem.testLevel,
    sourceSignals: context.planItem.sourceSignals,
    files: [{ path: context.guidance.allowedTestPath, content }]
  };
}

function requireExpectedContext(context) {
  if (context.planItem.id !== "add-test:src/access-policy.js") {
    throw new Error("The repair profile received an unexpected plan item.");
  }
  if (!context.executionHint.contextScope.paths.includes("src/access-policy.js")) {
    throw new Error("The repair profile did not receive the selected execution hint.");
  }
}

function failingTestContent() {
  return passingTestContent().replace(
    "assert.equal(canDeleteDeck({ id: \"owner\", role: \"member\" }, \"owner\"), false);",
    "assert.equal(canDeleteDeck({ id: \"owner\", role: \"member\" }, \"owner\"), true);"
  );
}

function passingTestContent() {
  return `import assert from "node:assert/strict";
import test from "node:test";
import { canDeleteDeck } from "./access-policy.js";

test("requires an authentication token", () => {
  assert.equal(canDeleteDeck({ id: "owner", role: "member" }, "owner"), false);
});

test("allows administrators with a token", () => {
  assert.equal(canDeleteDeck({ id: "other", role: "admin", token: "token" }, "owner"), true);
});

test("allows a token-bearing member to delete their own deck", () => {
  assert.equal(canDeleteDeck({ id: "owner", role: "member", token: "token" }, "owner"), true);
});

test("rejects a token-bearing member for another owner's deck", () => {
  assert.equal(canDeleteDeck({ id: "member", role: "member", token: "token" }, "owner"), false);
});
`;
}
