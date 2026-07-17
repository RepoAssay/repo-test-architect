import assert from "node:assert/strict";
import test from "node:test";
import { parseOrderTotal } from "../src/orderParser.ts";

test("parses a valid order total", () => {
  assert.equal(parseOrderTotal(" 42 "), 42);
});
