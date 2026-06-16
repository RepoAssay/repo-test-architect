import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

describe("package contents", () => {
  it("keeps npm pack dry-run contents within the runtime allowlist", () => {
    const output = execFileSync(process.execPath, ["scripts/check-pack-contents.js"], {
      encoding: "utf8"
    });

    assert.match(output, /^Pack contents check passed \(\d+ files\)\./);
  });
});
