import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

describe("support docs", () => {
  it("documents support channels and safe report expectations", () => {
    const support = fs.readFileSync("SUPPORT.md", "utf8");
    const readme = fs.readFileSync("README.md", "utf8");

    assert.match(support, /Repo Test Architect is early audit-first tooling/);
    assert.match(support, /CLI commands/);
    assert.match(support, /MCP client setup/);
    assert.match(support, /support question issue form/);
    assert.match(support, /Use the bug report issue form/);
    assert.match(support, /Use the feature request issue form/);
    assert.match(support, /Use the security policy/);
    assert.match(support, /avoid private source content/);
    assert.match(support, /redacted artifact excerpts/);
    assert.match(support, /npm run release:check/);
    assert.match(readme, /\[Support\]\(SUPPORT\.md\)/);
  });
});
