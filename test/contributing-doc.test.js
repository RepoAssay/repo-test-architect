import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

describe("contributing docs", () => {
  it("documents audit-first contribution expectations", () => {
    const contributing = fs.readFileSync("CONTRIBUTING.md", "utf8");
    const readme = fs.readFileSync("README.md", "utf8");

    assert.match(contributing, /audit-first/i);
    assert.match(contributing, /Keep changes small and traceable/);
    assert.match(contributing, /npm run release:check/);
    assert.match(contributing, /Update golden snapshots only when the behavior change is intentional/);
    assert.match(contributing, /model-consistency scenarios/);
    assert.match(contributing, /Do not add direct-test recommendations for DTOs, constants, generated files, or UI components/);
    assert.match(contributing, /Adapters should emit the shared audit model/);
    assert.match(contributing, /Native test generation is intentionally deferred/);
    assert.match(readme, /\[Contributing\]\(CONTRIBUTING\.md\)/);
  });
});
