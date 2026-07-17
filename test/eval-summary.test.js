import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { loadEvalFixtures } from "./support/eval-fixtures.js";

describe("eval summary", () => {
  it("reports every fixture as passing", () => {
    const output = execFileSync(process.execPath, ["scripts/check-golden-snapshots.js"], {
      encoding: "utf8"
    });

    for (const fixture of loadEvalFixtures()) {
      assert.match(output, new RegExp(`PASS ${fixture.name}`));
      assert.match(output, new RegExp(`PASS ${fixture.name}\\.audit\\.json`));
      assert.match(output, new RegExp(`PASS ${fixture.name}\\.plan\\.json`));
    }

    assert.match(output, /PASS mcp-tools\.json/);
    assert.match(output, /49 snapshot\(s\) matched/);
    assert.match(output, /24 fixture\(s\) matched audit and plan snapshots/);
  });
});
