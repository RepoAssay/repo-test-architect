import assert from "node:assert/strict";
import test from "node:test";

test("the executor fixture starts with a runnable native test command", () => {
  assert.equal(2 + 2, 4);
});
