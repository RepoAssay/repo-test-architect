import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectUnsupportedReasons, normalizeUnsupportedProjects } from "../src/core/project-unsupported.js";

describe("project unsupported helpers", () => {
  it("normalizes unsupported project evidence", () => {
    const projects = normalizeUnsupportedProjects([
      {
        projectId: "api",
        projectRoot: "services/api",
        reason: "No registered adapter supports ecosystems python with languages python.",
        ecosystems: ["python"],
        languages: ["python"]
      }
    ]);

    assert.deepEqual(projects, [
      {
        projectId: "api",
        projectRoot: "services/api",
        reason: "No registered adapter supports ecosystems python with languages python.",
        ecosystems: ["python"],
        languages: ["python"],
        adapterMatches: [],
        supportStatusReason: "No registered adapter supports ecosystems python with languages python."
      }
    ]);
  });

  it("collects stable unique unsupported reasons", () => {
    assert.deepEqual(
      collectUnsupportedReasons([
        {
          supportStatusReason: "No registered adapter supports ecosystems python with languages python."
        },
        {
          supportStatusReason: "No registered adapter supports ecosystems python with languages python."
        },
        {
          supportStatusReason: "No registered adapter supports ecosystems jvm with languages java, kotlin."
        }
      ]),
      [
        "No registered adapter supports ecosystems python with languages python.",
        "No registered adapter supports ecosystems jvm with languages java, kotlin."
      ]
    );
  });
});
