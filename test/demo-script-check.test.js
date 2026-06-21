import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { demoChecks } from "../scripts/check-demo-script.js";

describe("demo script checker", () => {
  it("runs the documented demo path without nesting the full release suite", () => {
    const script = fs.readFileSync("scripts/check-demo-script.js", "utf8");
    const docs = fs.readFileSync("docs/demo-script.md", "utf8");
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

    assert.equal(packageJson.scripts["demo:check"], "node ./scripts/check-demo-script.js");
    assert.ok(demoChecks.length > 0);

    for (const check of demoChecks) {
      assert.ok(script.includes(`"${check}"`), `Missing demo checker command: ${check}`);
      assert.ok(docs.includes(`npm run ${check}`), `Missing documented demo command: ${check}`);
    }

    assert.doesNotMatch(script, /release:check/);
    assert.match(script, /Demo script check passed/);
  });
});
