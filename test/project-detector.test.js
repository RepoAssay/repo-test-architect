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
    assert.deepEqual(detection.projects[0].adapterMatches, [
      {
        adapterId: "javascript",
        maturity: "supported",
        matchedEcosystems: ["javascript"],
        matchedLanguages: ["javascript", "typescript"]
      }
    ]);
    assert.equal(
      detection.projects[0].supportStatusReason,
      "javascript matched ecosystems javascript and languages javascript, typescript"
    );
  });

  it("detects supported and unsupported projects in one repo", () => {
    const detection = detectProjects(path.resolve("examples/polyglot-workspace"));

    assert.equal(detection.summary.projectCount, 3);
    assert.equal(detection.summary.supportedProjectCount, 3);
    assert.equal(detection.summary.unsupportedProjectCount, 0);
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
          adapterIds: ["kotlin"],
          supported: true
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
          adapterIds: ["python"],
          supported: true
        }
      ]
    );
  });

  it("can exclude exact project roots and subtree patterns", () => {
    const exact = detectProjects(path.resolve("examples/polyglot-workspace"), {
      excludeProjectRoots: ["apps/web"]
    });
    const subtree = detectProjects(path.resolve("examples/polyglot-workspace"), {
      excludeProjectRoots: ["apps/**"]
    });

    assert.deepEqual(
      exact.projects.map((project) => project.root),
      ["apps/android", "services/api"]
    );
    assert.deepEqual(exact.summary, {
      projectCount: 2,
      supportedProjectCount: 2,
      unsupportedProjectCount: 0
    });
    assert.deepEqual(
      subtree.projects.map((project) => project.root),
      ["services/api"]
    );
    assert.deepEqual(subtree.summary, {
      projectCount: 1,
      supportedProjectCount: 1,
      unsupportedProjectCount: 0
    });
  });

  it("skips nested fixture projects while preserving direct fixture audits", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-workspace-fixtures-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "packages", "core"), { recursive: true });
    fs.mkdirSync(path.join(root, "packages", "integration-tests", "fixtures", "dependency"), { recursive: true });
    fs.mkdirSync(path.join(root, "packages", "core", "__fixtures__", "sample"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), "{}\n");
    fs.writeFileSync(path.join(root, "packages", "core", "package.json"), "{}\n");
    fs.writeFileSync(path.join(root, "packages", "integration-tests", "fixtures", "dependency", "package.json"), "{}\n");
    fs.writeFileSync(path.join(root, "packages", "core", "__fixtures__", "sample", "package.json"), "{}\n");

    const workspace = detectProjects(root);
    const fixture = detectProjects(path.join(root, "packages", "integration-tests", "fixtures", "dependency"));

    assert.deepEqual(workspace.projects.map((project) => project.root), [".", "packages/core"]);
    assert.deepEqual(fixture.projects.map((project) => project.root), ["."]);
  });

  it("explains experimental JVM adapter matching", () => {
    const detection = detectProjects(path.resolve("examples/kotlin-junit-basic"));

    assert.deepEqual(detection.projects[0].adapterMatches, [
      {
        adapterId: "kotlin",
        maturity: "experimental",
        matchedEcosystems: ["jvm"],
        matchedLanguages: ["java", "kotlin"]
      }
    ]);
    assert.equal(
      detection.projects[0].supportStatusReason,
      "kotlin matched ecosystems jvm and languages java, kotlin"
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
          supported: true
        }
      ]
    );
  });

  it("detects the Kotlin JUnit fixture as an experimental JVM project", () => {
    const detection = detectProjects(path.resolve("examples/kotlin-junit-basic"));
    const fixtureRoot = path.resolve("examples/kotlin-junit-basic");

    assert.equal(detection.summary.projectCount, 1);
    assert.equal(detection.summary.supportedProjectCount, 1);
    assert.equal(detection.summary.unsupportedProjectCount, 0);
    assert.ok(fs.existsSync(path.join(fixtureRoot, "src", "main", "java")));
    assert.ok(fs.existsSync(path.join(fixtureRoot, "src", "main", "kotlin")));
    assert.deepEqual(
      detection.projects.map((project) => ({
        root: project.root,
        ecosystems: project.ecosystems,
        languages: project.languages,
        markerFiles: project.markerFiles,
        adapterIds: project.adapterIds,
        supported: project.supported
      })),
      [
        {
          root: ".",
          ecosystems: ["jvm"],
          languages: ["java", "kotlin"],
          markerFiles: ["build.gradle.kts", "settings.gradle.kts"],
          adapterIds: ["kotlin"],
          supported: true
        }
      ]
    );
  });

  it("keeps mixed Java and Kotlin sources under one JVM project root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-mixed-jvm-"));
    fs.mkdirSync(path.join(root, "services", "checkout", "src", "main", "java"), { recursive: true });
    fs.mkdirSync(path.join(root, "services", "checkout", "src", "main", "kotlin"), { recursive: true });
    fs.writeFileSync(path.join(root, "services", "checkout", "build.gradle.kts"), "plugins { kotlin(\"jvm\") }\n");
    fs.writeFileSync(path.join(root, "services", "checkout", "src", "main", "java", "Money.java"), "class Money {}\n");
    fs.writeFileSync(path.join(root, "services", "checkout", "src", "main", "kotlin", "Checkout.kt"), "class Checkout\n");

    const detection = detectProjects(root);

    assert.equal(detection.summary.projectCount, 1);
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
          root: "services/checkout",
          ecosystems: ["jvm"],
          languages: ["java", "kotlin"],
          markerFiles: ["services/checkout/build.gradle.kts"],
          supported: true
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

  it("detects Xcode project directories as experimental Swift adapter projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-xcode-"));
    fs.mkdirSync(path.join(root, "apps", "ios", "Checkout.xcodeproj"), { recursive: true });
    fs.writeFileSync(path.join(root, "apps", "ios", "Checkout.xcodeproj", "project.pbxproj"), "// !$*UTF8*$!\n");

    const detection = detectProjects(root);

    assert.deepEqual(
      detection.projects.map((project) => ({
        root: project.root,
        ecosystems: project.ecosystems,
        languages: project.languages,
        markerFiles: project.markerFiles,
        adapterIds: project.adapterIds,
        supported: project.supported
      })),
      [
        {
          root: "apps/ios",
          ecosystems: ["apple"],
          languages: ["objective-c", "swift"],
          markerFiles: ["apps/ios/Checkout.xcodeproj"],
          adapterIds: ["swift"],
          supported: true
        }
      ]
    );
  });

  it("keeps mixed Swift and Objective-C sources under one Apple project root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-mixed-apple-"));
    fs.mkdirSync(path.join(root, "apps", "ios", "Checkout.xcodeproj"), { recursive: true });
    fs.mkdirSync(path.join(root, "apps", "ios", "Sources"), { recursive: true });
    fs.writeFileSync(path.join(root, "apps", "ios", "Checkout.xcodeproj", "project.pbxproj"), "// !$*UTF8*$!\n");
    fs.writeFileSync(path.join(root, "apps", "ios", "Sources", "CheckoutView.swift"), "import SwiftUI\n");
    fs.writeFileSync(path.join(root, "apps", "ios", "Sources", "LegacyPaymentClient.m"), "@implementation LegacyPaymentClient\n@end\n");

    const detection = detectProjects(root);

    assert.equal(detection.summary.projectCount, 1);
    assert.deepEqual(detection.projects[0].root, "apps/ios");
    assert.deepEqual(detection.projects[0].languages, ["objective-c", "swift"]);
    assert.deepEqual(detection.projects[0].markerFiles, ["apps/ios/Checkout.xcodeproj"]);
  });

  it("detects the mixed Apple Xcode fixture as one experimental Swift adapter project", () => {
    const fixtureRoot = path.resolve("examples/apple-xcode-mixed");
    const detection = detectProjects(fixtureRoot);

    assert.equal(detection.summary.projectCount, 1);
    assert.equal(detection.summary.supportedProjectCount, 1);
    assert.equal(detection.summary.unsupportedProjectCount, 0);
    assert.ok(fs.existsSync(path.join(fixtureRoot, "Sources", "CheckoutView.swift")));
    assert.ok(fs.existsSync(path.join(fixtureRoot, "Sources", "LegacyPaymentClient.m")));
    assert.deepEqual(
      detection.projects.map((project) => ({
        root: project.root,
        ecosystems: project.ecosystems,
        languages: project.languages,
        markerFiles: project.markerFiles,
        adapterIds: project.adapterIds,
        supported: project.supported
      })),
      [
        {
          root: ".",
          ecosystems: ["apple"],
          languages: ["objective-c", "swift"],
          markerFiles: ["CheckoutApp.xcodeproj"],
          adapterIds: ["swift"],
          supported: true
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

  it("detects Ruby Bundler projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-ruby-"));
    fs.mkdirSync(path.join(root, "services", "jobs"), { recursive: true });
    fs.writeFileSync(path.join(root, "services", "jobs", "Gemfile"), "source \"https://rubygems.org\"\n");

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
          root: "services/jobs",
          ecosystems: ["ruby"],
          languages: ["ruby"],
          supported: false
        }
      ]
    );
  });

  it("detects PHP Composer projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-php-"));
    fs.mkdirSync(path.join(root, "services", "cms"), { recursive: true });
    fs.writeFileSync(path.join(root, "services", "cms", "composer.json"), "{\"require\":{}}\n");

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
          root: "services/cms",
          ecosystems: ["php"],
          languages: ["php"],
          supported: false
        }
      ]
    );
  });

  it("detects Elixir Mix projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-elixir-"));
    fs.mkdirSync(path.join(root, "services", "notifications"), { recursive: true });
    fs.writeFileSync(path.join(root, "services", "notifications", "mix.exs"), "defmodule Notifications.MixProject do\nend\n");

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
          root: "services/notifications",
          ecosystems: ["elixir"],
          languages: ["elixir"],
          supported: false
        }
      ]
    );
  });

  it("detects Rust Cargo projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-rust-"));
    fs.mkdirSync(path.join(root, "crates", "worker"), { recursive: true });
    fs.writeFileSync(path.join(root, "crates", "worker", "Cargo.toml"), "[package]\nname = \"worker\"\n");

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
          root: "crates/worker",
          ecosystems: ["rust"],
          languages: ["rust"],
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

  it("ignores Gradle cache directories", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-gradle-cache-"));
    fs.mkdirSync(path.join(root, ".gradle", "generated"), { recursive: true });
    fs.writeFileSync(path.join(root, ".gradle", "generated", "build.gradle.kts"), "plugins {}\n");

    const detection = detectProjects(root);

    assert.equal(detection.summary.projectCount, 0);
    assert.deepEqual(detection.projects, []);
  });

  it("ignores Swift and vendored dependency directories", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-generated-deps-"));
    fs.mkdirSync(path.join(root, ".build", "checkouts", "swift-package"), { recursive: true });
    fs.mkdirSync(path.join(root, ".swiftpm", "generated"), { recursive: true });
    fs.mkdirSync(path.join(root, "vendor", "bundle"), { recursive: true });
    fs.writeFileSync(path.join(root, ".build", "checkouts", "swift-package", "Package.swift"), "// swift-tools-version: 6.0\n");
    fs.writeFileSync(path.join(root, ".swiftpm", "generated", "Package.swift"), "// swift-tools-version: 6.0\n");
    fs.writeFileSync(path.join(root, "vendor", "bundle", "Gemfile"), "source \"https://rubygems.org\"\n");

    const detection = detectProjects(root);

    assert.equal(detection.summary.projectCount, 0);
    assert.deepEqual(detection.projects, []);
  });
});
