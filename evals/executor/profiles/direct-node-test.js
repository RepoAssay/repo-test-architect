export const profileId = "direct-node-test";

export function createProposal(context, attemptNumber) {
  if (attemptNumber !== 1) return undefined;
  requireExpectedContext(context);
  return {
    planItemId: context.planItem.id,
    targetId: context.planItem.targetId,
    action: context.planItem.action,
    targetPath: context.planItem.path,
    testLevel: context.planItem.testLevel,
    sourceSignals: context.planItem.sourceSignals,
    files: [{
      path: context.guidance.allowedTestPath,
      content: passingTestContent()
    }]
  };
}

function requireExpectedContext(context) {
  if (context.planItem.id !== "add-test:src/access-policy.js") {
    throw new Error("The direct profile received an unexpected plan item.");
  }
  if (!context.files["src/access-policy.js"].includes("canDeleteDeck")) {
    throw new Error("The direct profile did not receive the selected target source.");
  }
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
