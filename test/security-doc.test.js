import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

describe("security docs", () => {
  it("documents local-first security expectations", () => {
    const security = fs.readFileSync("SECURITY.md", "utf8");
    const readme = fs.readFileSync("README.md", "utf8");

    assert.match(security, /local-first/i);
    assert.match(security, /Raw private repository upload is not required/);
    assert.match(security, /Telemetry must be opt-in and avoid source content by default/);
    assert.match(security, /unexpected network access or source upload/);
    assert.match(security, /MCP tool behavior that grants broader file, command, or write access than documented/);
    assert.match(security, /package contents that include private, generated, or unintended files/);
    assert.match(security, /Do not include:/);
    assert.match(security, /npm run release:check/);
    assert.match(readme, /\[Security policy\]\(SECURITY\.md\)/);
  });
});
