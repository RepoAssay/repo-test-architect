import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { detectProjects } from "../src/core/project-detector.js";

describe("project detector", () => {
  it("preserves literal Cargo workspace packages without the virtual aggregate", () => {
    const detection = detectProjects(path.resolve("examples/rust-cargo-workspace-basic"));

    assert.deepEqual(detection.summary, {
      projectCount: 2,
      supportedProjectCount: 2,
      unsupportedProjectCount: 0
    });
    assert.deepEqual(detection.projects.map((project) => ({
      root: project.root,
      markerFiles: project.markerFiles,
      adapterIds: project.adapterIds
    })), [
      {
        root: "crates/pricing",
        markerFiles: ["crates/pricing/Cargo.toml"],
        adapterIds: ["rust"]
      },
      {
        root: "services/checkout",
        markerFiles: ["services/checkout/Cargo.toml"],
        adapterIds: ["rust"]
      }
    ]);
  });

  it("preserves each declared go.work module as an independently detected project", () => {
    const detection = detectProjects(path.resolve("examples/go-workspace-basic"));

    assert.deepEqual(detection.summary, {
      projectCount: 2,
      supportedProjectCount: 2,
      unsupportedProjectCount: 0
    });
    assert.deepEqual(detection.projects.map((project) => ({
      root: project.root,
      markerFiles: project.markerFiles,
      adapterIds: project.adapterIds
    })), [
      {
        root: "libraries/pricing",
        markerFiles: ["libraries/pricing/go.mod"],
        adapterIds: ["go"]
      },
      {
        root: "services/checkout",
        markerFiles: ["services/checkout/go.mod"],
        adapterIds: ["go"]
      }
    ]);
  });

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

  it("skips nested fixture and testdata projects while preserving direct audits", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-workspace-fixtures-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "packages", "core"), { recursive: true });
    fs.mkdirSync(path.join(root, "packages", "integration-tests", "fixtures", "dependency"), { recursive: true });
    fs.mkdirSync(path.join(root, "packages", "core", "__fixtures__", "sample"), { recursive: true });
    fs.mkdirSync(path.join(root, "testdata"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), "{}\n");
    fs.writeFileSync(path.join(root, "packages", "core", "package.json"), "{}\n");
    fs.writeFileSync(path.join(root, "packages", "integration-tests", "fixtures", "dependency", "package.json"), "{}\n");
    fs.writeFileSync(path.join(root, "packages", "core", "__fixtures__", "sample", "package.json"), "{}\n");
    fs.writeFileSync(path.join(root, "testdata", "Cargo.toml"), "[package]\nname = \"fixture\"\n");

    const workspace = detectProjects(root);
    const fixture = detectProjects(path.join(root, "packages", "integration-tests", "fixtures", "dependency"));
    const testdata = detectProjects(path.join(root, "testdata"));

    assert.deepEqual(workspace.projects.map((project) => project.root), [".", "packages/core"]);
    assert.deepEqual(fixture.projects.map((project) => project.root), ["."]);
    assert.deepEqual(testdata.projects.map((project) => project.root), ["."]);
  });

  it("explains supported JVM adapter matching", () => {
    const detection = detectProjects(path.resolve("examples/kotlin-junit-basic"));

    assert.deepEqual(detection.projects[0].adapterMatches, [
      {
        adapterId: "kotlin",
        maturity: "supported",
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

  it("collapses conventional Maven reactor modules into their aggregate project root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-maven-reactor-detection-"));
    fs.mkdirSync(path.join(root, "core"), { recursive: true });
    fs.mkdirSync(path.join(root, "integration-tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "pom.xml"), "<project><groupId>com.example</groupId><artifactId>root</artifactId><modules><module>core</module><module>integration-tests</module></modules></project>\n");
    fs.writeFileSync(path.join(root, "core", "pom.xml"), "<project><groupId>com.example</groupId><artifactId>core</artifactId></project>\n");
    fs.writeFileSync(path.join(root, "integration-tests", "pom.xml"), "<project><groupId>com.example</groupId><artifactId>integration-tests</artifactId></project>\n");

    const detection = detectProjects(root);

    assert.equal(detection.summary.projectCount, 1);
    assert.deepEqual(detection.projects.map((project) => ({ root: project.root, markerFiles: project.markerFiles })), [{
      root: ".",
      markerFiles: ["pom.xml"]
    }]);
  });

  it("collapses complete literal nested Maven reactors into their aggregate root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-maven-nested-reactor-detection-"));
    fs.mkdirSync(path.join(root, "platform", "core"), { recursive: true });
    fs.writeFileSync(path.join(root, "pom.xml"), "<project><groupId>com.example</groupId><artifactId>root</artifactId><modules><module>platform</module></modules></project>\n");
    fs.writeFileSync(path.join(root, "platform", "pom.xml"), "<project><groupId>com.example</groupId><artifactId>platform</artifactId><modules><module>core</module></modules></project>\n");
    fs.writeFileSync(path.join(root, "platform", "core", "pom.xml"), "<project><groupId>com.example</groupId><artifactId>core</artifactId></project>\n");

    const detection = detectProjects(root);

    assert.deepEqual(detection.projects.map((project) => project.root), ["."]);
  });

  it("keeps the nearest complete nested Maven boundary when the root graph is incomplete", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-maven-incomplete-nested-reactor-detection-"));
    fs.mkdirSync(path.join(root, "platform", "core"), { recursive: true });
    fs.writeFileSync(path.join(root, "pom.xml"), "<project><groupId>com.example</groupId><artifactId>root</artifactId><modules><module>platform</module><module>missing</module></modules></project>\n");
    fs.writeFileSync(path.join(root, "platform", "pom.xml"), "<project><groupId>com.example</groupId><artifactId>platform</artifactId><modules><module>core</module></modules></project>\n");
    fs.writeFileSync(path.join(root, "platform", "core", "pom.xml"), "<project><groupId>com.example</groupId><artifactId>core</artifactId></project>\n");

    const detection = detectProjects(root);

    assert.deepEqual(detection.projects.map((project) => project.root), [".", "platform"]);
  });

  it("detects the checked-in Maven reactor fixture as one supported project", () => {
    const detection = detectProjects(path.resolve("examples/kotlin-maven-reactor-junit"));

    assert.deepEqual(detection.summary, {
      projectCount: 1,
      supportedProjectCount: 1,
      unsupportedProjectCount: 0
    });
    assert.deepEqual(detection.projects.map((project) => ({
      root: project.root,
      markerFiles: project.markerFiles,
      adapterIds: project.adapterIds
    })), [{
      root: ".",
      markerFiles: ["pom.xml"],
      adapterIds: ["kotlin"]
    }]);
  });

  it("does not collapse Maven profile, property, or escaping module declarations", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-maven-reactor-exclusions-"));
    for (const moduleName of ["profile-only", "property-module", "sibling"]) {
      fs.mkdirSync(path.join(root, moduleName), { recursive: true });
      fs.writeFileSync(path.join(root, moduleName, "pom.xml"), "<project />\n");
    }
    fs.writeFileSync(
      path.join(root, "pom.xml"),
      "<project><modules><module>${module.name}</module><module>../sibling</module></modules><profiles><profile><modules><module>profile-only</module></modules></profile></profiles><build><plugins><plugin><configuration><modules><module>property-module</module></modules></configuration></plugin></plugins></build></project>\n"
    );

    const detection = detectProjects(root);

    assert.deepEqual(detection.projects.map((project) => project.root), [".", "profile-only", "property-module", "sibling"]);
  });

  it("detects the Kotlin JUnit fixture as a supported JVM project", () => {
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

  it("collapses conventionally included Gradle modules into their aggregate project root", () => {
    const detection = detectProjects(path.resolve("examples/kotlin-gradle-module-graph-junit"));

    assert.equal(detection.summary.projectCount, 1);
    assert.equal(detection.summary.supportedProjectCount, 1);
    assert.deepEqual(
      detection.projects.map((project) => ({ root: project.root, markerFiles: project.markerFiles, adapterIds: project.adapterIds })),
      [{
        root: ".",
        markerFiles: ["build.gradle.kts", "settings.gradle.kts"],
        adapterIds: ["kotlin"]
      }]
    );
  });

  it("collapses literal Groovy Gradle include declarations", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-gradle-groovy-detection-"));
    for (const moduleName of ["core", "tests"]) {
      fs.mkdirSync(path.join(root, moduleName), { recursive: true });
      fs.writeFileSync(path.join(root, moduleName, "build.gradle"), "plugins {}\n");
    }
    fs.writeFileSync(path.join(root, "settings.gradle"), "include ':core', ':tests'\n");
    fs.writeFileSync(path.join(root, "build.gradle"), "plugins {}\n");

    const detection = detectProjects(root);

    assert.deepEqual(detection.projects.map((project) => project.root), ["."]);
  });

  it("does not collapse custom Gradle project-directory remaps", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-gradle-detection-remap-"));
    fs.mkdirSync(path.join(root, "modules", "token-core"), { recursive: true });
    fs.mkdirSync(path.join(root, "tokens"), { recursive: true });
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), 'include(":tokens")\nproject(":tokens").projectDir = file("modules/token-core")\n');
    fs.writeFileSync(path.join(root, "build.gradle.kts"), "plugins {}\n");
    fs.writeFileSync(path.join(root, "modules", "token-core", "build.gradle.kts"), "plugins {}\n");
    fs.writeFileSync(path.join(root, "tokens", "build.gradle.kts"), "plugins {}\n");

    const detection = detectProjects(root);

    assert.deepEqual(detection.projects.map((project) => project.root), [".", "modules/token-core", "tokens"]);
  });

  it("does not partially collapse computed or incomplete Gradle aggregates", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-gradle-detection-incomplete-"));
    for (const moduleName of ["core", "extra"]) {
      fs.mkdirSync(path.join(root, moduleName), { recursive: true });
      fs.writeFileSync(path.join(root, moduleName, "build.gradle.kts"), "plugins {}\n");
    }
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), 'include(":core", dynamicProject, ":missing")\n');
    fs.writeFileSync(path.join(root, "build.gradle.kts"), "plugins {}\n");

    const detection = detectProjects(root);

    assert.deepEqual(detection.projects.map((project) => project.root), [".", "core", "extra"]);
  });

  it("keeps a nested Gradle build visible unless the root declares every nested path", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-gradle-detection-nested-"));
    fs.mkdirSync(path.join(root, "platform", "core"), { recursive: true });
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), 'include(":platform")\n');
    fs.writeFileSync(path.join(root, "build.gradle.kts"), "plugins {}\n");
    fs.writeFileSync(path.join(root, "platform", "settings.gradle.kts"), 'include(":core")\n');
    fs.writeFileSync(path.join(root, "platform", "build.gradle.kts"), "plugins {}\n");
    fs.writeFileSync(path.join(root, "platform", "core", "build.gradle.kts"), "plugins {}\n");

    const nested = detectProjects(root);
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), 'include(":platform", ":platform:core")\n');
    const explicit = detectProjects(root);

    assert.deepEqual(nested.projects.map((project) => project.root), [".", "platform"]);
    assert.deepEqual(explicit.projects.map((project) => project.root), ["."]);
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
          supported: true
        }
      ]
    );
    assert.deepEqual(detection.projects[0].adapterMatches, [{
      adapterId: "csharp",
      maturity: "experimental",
      matchedEcosystems: ["dotnet"],
      matchedLanguages: ["csharp"]
    }]);
  });

  it("collapses one literal C# production/test pair to its common audit root", () => {
    const detection = detectProjects(path.resolve("examples/csharp-sdk-project-pair"));

    assert.deepEqual(detection.summary, {
      projectCount: 1,
      supportedProjectCount: 1,
      unsupportedProjectCount: 0
    });
    assert.deepEqual(detection.projects.map((project) => ({
      root: project.root,
      markerFiles: project.markerFiles,
      adapterIds: project.adapterIds
    })), [{
      root: ".",
      markerFiles: [
        "src/CheckoutRules/CheckoutRules.csproj",
        "tests/CheckoutRules.Tests/CheckoutRules.Tests.csproj"
      ],
      adapterIds: ["csharp"]
    }]);
  });

  it("collapses one unique C# test edge while preserving unrelated projects", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-dotnet-unique-pair-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const directory of ["src/Core", "src/Other", "tests/Core.Tests", "benchmarks/Benchmarks"]) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
    fs.writeFileSync(path.join(root, "src/Core/Core.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk\" />\n");
    fs.writeFileSync(path.join(root, "src/Other/Other.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk\" />\n");
    fs.writeFileSync(path.join(root, "benchmarks/Benchmarks/Benchmarks.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk\" />\n");
    fs.writeFileSync(path.join(root, "tests/Core.Tests/Core.Tests.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk\"><ItemGroup><PackageReference Include=\"Microsoft.NET.Test.Sdk\" /><ProjectReference Include=\"../../src/Core/Core.csproj\" /></ItemGroup></Project>\n");

    const detection = detectProjects(root);
    assert.deepEqual(detection.projects.map((project) => ({ root: project.root, markerFiles: project.markerFiles })), [
      {
        root: ".",
        markerFiles: ["src/Core/Core.csproj", "tests/Core.Tests/Core.Tests.csproj"]
      },
      {
        root: "benchmarks/Benchmarks",
        markerFiles: ["benchmarks/Benchmarks/Benchmarks.csproj"]
      },
      {
        root: "src/Other",
        markerFiles: ["src/Other/Other.csproj"]
      }
    ]);
  });

  it("does not collapse a C# pair across an occupied aggregate root", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-dotnet-overlap-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src/Core"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests/Core.Tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "Root.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk\" />\n");
    fs.writeFileSync(path.join(root, "src/Core/Core.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk\" />\n");
    fs.writeFileSync(path.join(root, "tests/Core.Tests/Core.Tests.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk\"><ItemGroup><PackageReference Include=\"Microsoft.NET.Test.Sdk\" /><ProjectReference Include=\"../../src/Core/Core.csproj\" /></ItemGroup></Project>\n");

    assert.deepEqual(detectProjects(root).projects.map((project) => project.root), [".", "src/Core", "tests/Core.Tests"]);
  });

  it("keeps dynamic C# project references as separate detected projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-dotnet-dynamic-pair-"));
    fs.mkdirSync(path.join(root, "src", "Core"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests", "Core.Tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "Core", "Core.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk\" />\n");
    fs.writeFileSync(path.join(root, "tests", "Core.Tests", "Core.Tests.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk\"><ItemGroup><PackageReference Include=\"Microsoft.NET.Test.Sdk\" /><ProjectReference Include=\"$(CoreProject)\" /></ItemGroup></Project>\n");

    const detection = detectProjects(root);
    assert.deepEqual(detection.projects.map((project) => project.root), ["src/Core", "tests/Core.Tests"]);
  });

  it("detects Xcode project directories as supported Swift adapter projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-xcode-"));
    fs.mkdirSync(path.join(root, "apps", "ios", "Checkout.xcodeproj"), { recursive: true });
    fs.writeFileSync(path.join(root, "apps", "ios", "Checkout.xcodeproj", "project.pbxproj"), "// !$*UTF8*$!\n");

    const detection = detectProjects(root);

    assert.equal(detection.projects[0].adapterMatches[0].maturity, "supported");

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

  it("detects Xcode workspace directories as supported Swift adapter projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-xcworkspace-"));
    fs.mkdirSync(path.join(root, "apps", "ios", "Checkout.xcworkspace"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "apps", "ios", "Checkout.xcworkspace", "contents.xcworkspacedata"),
      '<Workspace version="1.0"></Workspace>\n'
    );

    const detection = detectProjects(root);

    assert.equal(detection.summary.projectCount, 1);
    assert.deepEqual(detection.projects[0].root, "apps/ios");
    assert.deepEqual(detection.projects[0].ecosystems, ["apple"]);
    assert.deepEqual(detection.projects[0].languages, ["objective-c", "swift"]);
    assert.deepEqual(detection.projects[0].markerFiles, ["apps/ios/Checkout.xcworkspace"]);
    assert.deepEqual(detection.projects[0].adapterIds, ["swift"]);
    assert.equal(detection.projects[0].supported, true);
  });

  it("detects Swift Bazel workspaces without claiming generic Bazel workspaces", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-bazel-workspaces-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const swiftRoot = path.join(root, "swift-app");
    const genericRoot = path.join(root, "generic-app");
    fs.mkdirSync(path.join(swiftRoot, "Core"), { recursive: true });
    fs.mkdirSync(genericRoot, { recursive: true });
    fs.writeFileSync(path.join(swiftRoot, "MODULE.bazel"), 'bazel_dep(name = "rules_swift", version = "3.6.1")\n');
    fs.writeFileSync(path.join(swiftRoot, "BUILD.bazel"), 'swift_library(name = "Core", srcs = ["Core/Parser.swift"])\n');
    fs.writeFileSync(path.join(swiftRoot, "Core", "Parser.swift"), "struct Parser {}\n");
    fs.writeFileSync(path.join(genericRoot, "MODULE.bazel"), 'module(name = "generic")\n');
    fs.writeFileSync(path.join(genericRoot, "BUILD.bazel"), 'cc_library(name = "core")\n');

    const detection = detectProjects(root);

    assert.deepEqual(
      detection.projects.map((project) => ({
        root: project.root,
        ecosystems: project.ecosystems,
        languages: project.languages,
        markerFiles: project.markerFiles,
        adapterIds: project.adapterIds
      })),
      [
        {
          root: "swift-app",
          ecosystems: ["bazel"],
          languages: ["swift"],
          markerFiles: ["swift-app/MODULE.bazel"],
          adapterIds: ["swift"]
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

  it("detects the mixed Apple Xcode fixture as one supported Swift adapter project", () => {
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
          supported: true
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
          supported: true
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
