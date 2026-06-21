import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

describe("demo script checker", () => {
  it("runs the documented demo path without nesting the full release suite", () => {
    const script = fs.readFileSync("scripts/check-demo-script.js", "utf8");
    const docs = fs.readFileSync("docs/demo-script.md", "utf8");
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const documentedChecks = [
      "audit:example",
      "audit:kotlin-fixture",
      "rank:example",
      "plan:example",
      "plan:kotlin-fixture",
      "detect:example",
      "audit-projects:example",
      "summarize-projects:example",
      "rank-projects:example",
      "plan-projects:example",
      "placement-projects:split-example:json",
      "stats-projects:example",
      "mcp:tools",
      "mcp:audit-projects:example",
      "mcp:audit:kotlin-fixture",
      "mcp:rank-projects:example",
      "mcp:plan-projects:example",
      "mcp:placement-split:example",
      "model-consistency:check",
    ];

    assert.equal(packageJson.scripts["demo:check"], "node ./scripts/check-demo-script.js");

    for (const check of documentedChecks) {
      assert.ok(script.includes(`"${check}"`), `Missing demo checker command: ${check}`);
      assert.ok(docs.includes(`npm run ${check}`), `Missing documented demo command: ${check}`);
    }

    assert.doesNotMatch(script, /release:check/);
    assert.match(script, /Demo script check passed/);
  });
});
