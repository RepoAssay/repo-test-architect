import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
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

  it("detects Maven JVM projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-maven-"));
    fs.mkdirSync(path.join(root, "services", "billing"), { recursive: true });
    fs.writeFileSync(path.join(root, "services", "billing", "pom.xml"), "<project />\n");

    const detection = detectProjects(root);

    assert.deepEqual(
      detection.projects.map((project) => ({
        root: project.root,
        ecosystems: project.ecosystems,
        languages: project.languages,
        supported: project.supported
      })),
      [
        {
          root: "services/billing",
          ecosystems: ["jvm"],
          languages: ["java", "kotlin"],
          supported: false
        }
      ]
    );
  });

  it("detects .NET project files by extension", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-dotnet-"));
    fs.mkdirSync(path.join(root, "services", "catalog"), { recursive: true });
    fs.writeFileSync(path.join(root, "services", "catalog", "Catalog.Api.csproj"), "<Project />\n");

    const detection = detectProjects(root);

    assert.deepEqual(
      detection.projects.map((project) => ({
        root: project.root,
        ecosystems: project.ecosystems,
        languages: project.languages,
        markerFiles: project.markerFiles,
        supported: project.supported
      })),
      [
        {
          root: "services/catalog",
          ecosystems: ["dotnet"],
          languages: ["csharp"],
          markerFiles: ["services/catalog/Catalog.Api.csproj"],
          supported: false
        }
      ]
    );
  });

  it("detects Go module projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-go-"));
    fs.mkdirSync(path.join(root, "services", "worker"), { recursive: true });
    fs.writeFileSync(path.join(root, "services", "worker", "go.mod"), "module example.com/worker\n");

    const detection = detectProjects(root);

    assert.deepEqual(
      detection.projects.map((project) => ({
        root: project.root,
        ecosystems: project.ecosystems,
        languages: project.languages,
        supported: project.supported
      })),
      [
        {
          root: "services/worker",
          ecosystems: ["go"],
          languages: ["go"],
          supported: false
        }
      ]
    );
  });

  it("ignores generated Maven target directories", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-target-"));
    fs.mkdirSync(path.join(root, "target", "generated"), { recursive: true });
    fs.writeFileSync(path.join(root, "target", "generated", "package.json"), "{}\n");

    const detection = detectProjects(root);

    assert.equal(detection.summary.projectCount, 0);
    assert.deepEqual(detection.projects, []);
  });

  it("ignores generated .NET output directories", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-dotnet-output-"));
    fs.mkdirSync(path.join(root, "obj", "Debug"), { recursive: true });
    fs.writeFileSync(path.join(root, "obj", "Debug", "Generated.csproj"), "<Project />\n");

    const detection = detectProjects(root);

    assert.equal(detection.summary.projectCount, 0);
    assert.deepEqual(detection.projects, []);
  });
});
