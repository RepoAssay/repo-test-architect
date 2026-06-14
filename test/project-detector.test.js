import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { detectProjects } from "../src/core/project-detector.js";

describe("project detector", () => {
  it("detects a single JavaScript project", () => {
    const detection = detectProjects(path.resolve("examples/node-vitest-basic"));

    assert.equal(detection.schemaVersion, "project-detection/v1");
    assert.equal(detection.summary.projectCount, 1);
    assert.equal(detection.summary.supportedProjectCount, 1);
    assert.deepEqual(detection.projects.map((project) => project.root), ["."]);
    assert.deepEqual(detection.projects[0].adapterIds, ["javascript"]);
  });

  it("detects supported and unsupported projects in one repo", () => {
    const detection = detectProjects(path.resolve("examples/polyglot-workspace"));

    assert.equal(detection.summary.projectCount, 3);
    assert.equal(detection.summary.supportedProjectCount, 1);
    assert.equal(detection.summary.unsupportedProjectCount, 2);
    assert.deepEqual(
      detection.projects.map((project) => ({
        root: project.root,
        ecosystems: project.ecosystems,
        languages: project.languages,
        adapterIds: project.adapterIds,
        supported: project.supported
      })),
      [
        {
          root: "apps/android",
          ecosystems: ["jvm"],
          languages: ["java", "kotlin"],
          adapterIds: [],
          supported: false
        },
        {
          root: "apps/web",
          ecosystems: ["javascript"],
          languages: ["javascript", "typescript"],
          adapterIds: ["javascript"],
          supported: true
        },
        {
          root: "services/api",
          ecosystems: ["python"],
          languages: ["python"],
          adapterIds: [],
          supported: false
        }
      ]
    );
  });
});
