import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

describe("bin entrypoints", () => {
  it("boots every package binary through deterministic commands", () => {
    const output = execFileSync(process.execPath, ["scripts/check-bin-entrypoints.js"], {
      encoding: "utf8"
    });

    assert.match(output, /Bin entrypoint check passed \(3 binaries\)\./);
  });
});
