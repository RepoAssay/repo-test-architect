import test from "ava";
import { parseCartTotal } from "../src/cartParser.js";

test("parses cart totals", (t) => {
  const total = parseCartTotal("42");
  t.is(total, 42);
  t.throws(() => parseCartTotal("invalid"));
});
