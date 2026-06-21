import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, it } from "node:test";
import { binChecks } from "../scripts/check-bin-entrypoints.js";

describe("bin entrypoints", () => {
  it("has deterministic checks for every declared package binary", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

    assert.deepEqual(Object.keys(binChecks).sort(), Object.keys(packageJson.bin).sort());
  });

  it("boots every package binary through deterministic commands", () => {
    const output = execFileSync(process.execPath, ["scripts/check-bin-entrypoints.js"], {
      encoding: "utf8"
    });

    assert.match(output, /Bin entrypoint check passed \(3 binaries\)\./);
  });
});
