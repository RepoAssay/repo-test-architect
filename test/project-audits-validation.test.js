import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateProjectAudits } from "../src/core/project-audits-validation.js";

describe("project audits validation", () => {
  it("accepts a minimal valid project-audits artifact", () => {
    assert.doesNotThrow(() =>
      validateProjectAudits({
        schemaVersion: "project-audits/v1",
        root: ".",
        summary: {
          projectCount: 0,
          auditedProjectCount: 0,
          skippedProjectCount: 0
        },
        audits: [],
        skippedProjects: []
      })
    );
  });

  it("rejects missing required project audit fields", () => {
    assert.throws(
      () =>
        validateProjectAudits({
          schemaVersion: "project-audits/v1",
          root: ".",
          summary: {},
          audits: [],
          skippedProjects: []
        }),
      /Project audits summary\.projectCount must be a non-negative integer/
    );
    assert.throws(
      () =>
        validateProjectAudits({
          schemaVersion: "project-audits/v1",
          root: "",
          summary: {
            projectCount: 0,
            auditedProjectCount: 0,
            skippedProjectCount: 0
          },
          audits: [],
          skippedProjects: []
        }),
      /Project audits root must be a non-empty string/
    );
    assert.throws(
      () =>
        validateProjectAudits({
          schemaVersion: "project-audits/v1",
          root: ".",
          summary: {
            projectCount: 0,
            auditedProjectCount: 0,
            skippedProjectCount: 0
          },
          audits: []
        }),
      /Project audits skippedProjects must be an array/
    );
  });
});
