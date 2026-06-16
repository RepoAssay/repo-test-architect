import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyProjectAuditCoverage } from "../src/core/project-audit-coverage.js";

describe("project audit coverage", () => {
  it("classifies complete, partial, and absent coverage", () => {
    assert.equal(classifyProjectAuditCoverage(1, 0), "complete");
    assert.equal(classifyProjectAuditCoverage(1, 2), "partial");
    assert.equal(classifyProjectAuditCoverage(0, 1), "none");
    assert.equal(classifyProjectAuditCoverage(0, 0), "none");
  });
});
