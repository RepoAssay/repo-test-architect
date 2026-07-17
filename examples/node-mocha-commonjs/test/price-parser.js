const assert = require("node:assert/strict");
const parsePrice = require("../lib/priceParser.cjs");

describe("parsePrice", function () {
  it("parses valid prices", function () {
    assert.equal(parsePrice("42"), 42);
  });
});
