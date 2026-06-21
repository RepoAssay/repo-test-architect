import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, it } from "node:test";

describe("package contents", () => {
  it("keeps npm pack dry-run contents within the runtime allowlist", () => {
    const output = execFileSync(process.execPath, ["scripts/check-pack-contents.js"], {
      encoding: "utf8"
    });

    assert.match(output, /^Pack contents check passed \(\d+ files\)\./);
  });

  it("allows the future top-level license file without requiring it yet", () => {
    const checker = fs.readFileSync("scripts/check-pack-contents.js", "utf8");

    assert.match(checker, /"LICENSE"/);
    assert.doesNotMatch(checker, /requiredFiles = \[[\s\S]*"LICENSE"/);
  });

  it("requires check script dependencies needed by packaged release verification", () => {
    const checker = fs.readFileSync("scripts/check-pack-contents.js", "utf8");

    assert.match(checker, /"scripts\/check-demo-script\.js"/);
    assert.match(checker, /"scripts\/check-release-readiness\.js"/);
    assert.match(checker, /"scripts\/support\/npm-runner\.js"/);
  });
});
