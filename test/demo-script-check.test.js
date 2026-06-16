import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

describe("demo script checker", () => {
  it("runs the documented demo path without nesting the full release suite", () => {
    const script = fs.readFileSync("scripts/check-demo-script.js", "utf8");
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

    assert.equal(packageJson.scripts["demo:check"], "node ./scripts/check-demo-script.js");
    assert.match(script, /audit:example/);
    assert.match(script, /rank:example/);
    assert.match(script, /plan:example/);
    assert.match(script, /detect:example/);
    assert.match(script, /audit-projects:example/);
    assert.match(script, /stats-projects:example/);
    assert.match(script, /mcp:tools/);
    assert.match(script, /mcp:audit-projects:example/);
    assert.match(script, /mcp:rank-projects:example/);
    assert.match(script, /mcp:plan-projects:example/);
    assert.match(script, /model-consistency:check/);
    assert.doesNotMatch(script, /release:check/);
    assert.match(script, /Demo script check passed/);
  });
});
