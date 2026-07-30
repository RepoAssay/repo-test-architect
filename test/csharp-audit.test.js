import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditCSharpRepo } from "../src/adapters/csharp/audit.js";

describe("C# audit adapter", () => {
  it("audits the checked SDK-style xUnit fixture", () => {
    const audit = auditCSharpRepo(path.resolve("examples/csharp-sdk-xunit-basic"));

    assert.deepEqual(audit.profile.languages, ["csharp"]);
    assert.deepEqual(audit.profile.packageManagers, ["nuget"]);
    assert.deepEqual(audit.profile.testFrameworks, ["xunit"]);
    assert.deepEqual(audit.profile.architectures, ["dotnet-sdk-project", "dotnet-test-project", "library"]);
    assert.equal(audit.profile.testCommand, "dotnet test CheckoutRules.Tests.csproj");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["CheckoutService.cs"]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["PriceParser.cs"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "Tests/PriceParserTests.cs",
      kind: "csharp-symbol-reference",
      strength: "direct",
      usage: "asserted"
    }]);
    assert.deepEqual(audit.skipped.map((target) => target.path), ["CheckoutRequest.cs"]);
  });

  it("audits a literal SDK-style production/test project pair", () => {
    const audit = auditCSharpRepo(path.resolve("examples/csharp-sdk-project-pair"));

    assert.deepEqual(audit.profile.architectures, ["dotnet-sdk-project", "dotnet-project-pair", "dotnet-multi-target-project", "dotnet-test-project", "library"]);
    assert.equal(audit.profile.testCommand, "dotnet test tests/CheckoutRules.Tests/CheckoutRules.Tests.csproj");
    assert.deepEqual(audit.profile.setupSignals.slice(0, 2), [
      "src/CheckoutRules/CheckoutRules.csproj",
      "tests/CheckoutRules.Tests/CheckoutRules.Tests.csproj"
    ]);
    assert.ok(audit.profile.setupSignals.includes("net8.0;net9.0;net10.0"));
    assert.ok(audit.profile.setupSignals.includes("net10.0"));
    assert.ok(audit.profile.detectedConventions.includes("literal multi-target framework ownership"));
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), [
      "src/CheckoutRules/CheckoutService.cs",
      "src/CheckoutRules/DiscountCalculator.cs"
    ]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "tests/CheckoutRules.Tests/CheckoutServiceTests.cs",
      kind: "csharp-symbol-reference",
      strength: "direct",
      usage: "asserted"
    }]);
    assert.deepEqual(audit.coveredButRisky[1].existingTestEvidence, [{
      testPath: "tests/CheckoutRules.Tests/DiscountCalculatorTests.cs",
      kind: "csharp-symbol-reference",
      strength: "direct",
      usage: "asserted"
    }]);
    assert.deepEqual(audit.skipped.map((target) => target.path), ["src/CheckoutRules/CheckoutRequest.cs"]);
  });

  it("inherits literal unconditional metadata from the nearest Directory.Build.props", (t) => {
    const root = createRepo(t, {
      "Directory.Build.props": "<Project><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>",
      "src/Core/Core.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\" />",
      "src/Core/Core.cs": "public static class Core { public static int Run() => 1; }\n",
      "tests/Directory.Build.props": [
        "<Project>",
        "<PropertyGroup><TargetFramework>net10.0</TargetFramework><IsTestProject>true</IsTestProject></PropertyGroup>",
        "<ItemGroup><PackageReference Include=\"Microsoft.NET.Test.Sdk\" /><PackageReference Include=\"xunit\" /></ItemGroup>",
        "</Project>"
      ].join(""),
      "tests/Core.Tests/Core.Tests.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><ItemGroup><ProjectReference Include=\"../../src/Core/Core.csproj\" /></ItemGroup></Project>",
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, Core.Run()); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, "dotnet test tests/Core.Tests/Core.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.profile.testFrameworks, ["xunit"]);
    assert.ok(audit.profile.detectedConventions.includes("inherited Directory.Build.props metadata"));
    assert.ok(audit.profile.setupSignals.includes("Directory.Build.props"));
    assert.ok(audit.profile.setupSignals.includes("tests/Directory.Build.props"));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/Core/Core.cs"]);
  });

  it("keeps project-local target framework precedence over inherited metadata", (t) => {
    const root = createRepo(t, {
      "Directory.Build.props": "<Project><PropertyGroup><TargetFramework>net9.0</TargetFramework></PropertyGroup></Project>",
      "src/Core/Core.csproj": productionProjectFile("net10.0"),
      "src/Core/Core.cs": "public class Core { public int Run() => 1; }\n",
      "tests/Core.Tests/Core.Tests.csproj": testProjectFile("../../src/Core/Core.csproj", ""),
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, new Core().Run()); } }\n"
    });

    const blockers = auditCSharpRepo(root).profile.blockers;
    assert.ok(blockers.includes("Every test target framework must be listed literally by the production project in this bounded slice."));
  });

  it("audits one literal multi-target test project", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": [
        "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup>",
        "<TargetFrameworks>net9.0;net10.0</TargetFrameworks><IsTestProject>true</IsTestProject>",
        "</PropertyGroup><ItemGroup><PackageReference Include=\"Microsoft.NET.Test.Sdk\" />",
        "<PackageReference Include=\"xunit\" /></ItemGroup></Project>"
      ].join(""),
      "Source.cs": "public static class Source { public static int Run() => 1; }\n",
      "SourceTests.cs": "public class SourceTests { [Fact] public void Runs() { Assert.Equal(1, Source.Run()); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, "dotnet test Example.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.architectures.includes("dotnet-multi-target-project"));
    assert.ok(audit.profile.detectedConventions.includes("literal multi-target framework ownership"));
    assert.ok(audit.profile.setupSignals.includes("net9.0;net10.0"));
  });

  it("audits a production target superset and a single-target test project", (t) => {
    const root = createRepo(t, {
      "src/Core/Core.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFrameworks>net8.0;net9.0;net10.0</TargetFrameworks></PropertyGroup></Project>",
      "src/Core/Core.cs": "public static class Core { public static int Run() => 1; }\n",
      "tests/Core.Tests/Core.Tests.csproj": testProjectFile("../../src/Core/Core.csproj", "net10.0"),
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, Core.Run()); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, "dotnet test tests/Core.Tests/Core.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.profile.setupSignals.slice(3, 5), ["net8.0;net9.0;net10.0", "net10.0"]);
    assert.ok(audit.profile.detectedConventions.includes("literal multi-target framework ownership"));
  });

  it("inherits one literal multi-target list from Directory.Build.props", (t) => {
    const root = createRepo(t, {
      "Directory.Build.props": "<Project><PropertyGroup><TargetFrameworks>net9.0;net10.0</TargetFrameworks></PropertyGroup></Project>",
      "src/Core/Core.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\" />",
      "src/Core/Core.cs": "public static class Core { public static int Run() => 1; }\n",
      "tests/Core.Tests/Core.Tests.csproj": testProjectFile("../../src/Core/Core.csproj", ""),
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, Core.Run()); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, "dotnet test tests/Core.Tests/Core.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.setupSignals.includes("net9.0;net10.0"));
    assert.ok(audit.profile.setupSignals.includes("Directory.Build.props"));
  });

  it("blocks multi-target metadata that requires MSBuild evaluation", (t) => {
    const cases = [
      "<TargetFrameworks>$(TargetFrameworkList)</TargetFrameworks>",
      "<TargetFrameworks Condition=\"'$(Mode)' == 'test'\">net9.0;net10.0</TargetFrameworks>",
      "<TargetFrameworks>net9.0;net9.0</TargetFrameworks>",
      "<TargetFrameworks>net9.0;;net10.0</TargetFrameworks>",
      "<TargetFramework>net10.0</TargetFramework><TargetFrameworks>net9.0;net10.0</TargetFrameworks>"
    ];

    for (const targetMetadata of cases) {
      const root = createRepo(t, {
        "Example.Tests.csproj": `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>${targetMetadata}<IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" /><PackageReference Include="xunit" /></ItemGroup></Project>`,
        "Tests.cs": "public class Tests { [Fact] public void Runs() { Assert.True(true); } }\n"
      });
      const audit = auditCSharpRepo(root);
      assert.equal(audit.profile.testCommand, undefined);
      assert.ok(audit.profile.blockers.some((blocker) => blocker.startsWith("C# target framework metadata requires unsupported MSBuild evaluation:")));
    }

    const inheritedConflict = createRepo(t, {
      "Directory.Build.props": "<Project><PropertyGroup><TargetFrameworks>net9.0;net10.0</TargetFrameworks></PropertyGroup></Project>",
      "Example.Tests.csproj": projectFile("xunit"),
      "Tests.cs": "public class Tests { [Fact] public void Runs() { Assert.True(true); } }\n"
    });
    assert.ok(auditCSharpRepo(inheritedConflict).profile.blockers.some((blocker) => (
      blocker.includes("conflicting inherited target framework metadata")
    )));

    const reverseInheritedConflict = createRepo(t, {
      "Directory.Build.props": "<Project><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>",
      "Example.Tests.csproj": [
        "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup>",
        "<TargetFrameworks>net9.0;net10.0</TargetFrameworks><IsTestProject>true</IsTestProject>",
        "</PropertyGroup><ItemGroup><PackageReference Include=\"Microsoft.NET.Test.Sdk\" />",
        "<PackageReference Include=\"xunit\" /></ItemGroup></Project>"
      ].join(""),
      "Tests.cs": "public class Tests { [Fact] public void Runs() { Assert.True(true); } }\n"
    });
    assert.ok(auditCSharpRepo(reverseInheritedConflict).profile.blockers.some((blocker) => (
      blocker.includes("conflicting inherited target framework metadata")
    )));
  });

  it("requires literal target membership instead of inferring framework compatibility", (t) => {
    const missingTarget = createRepo(t, {
      "src/Core/Core.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFrameworks>net8.0;net9.0</TargetFrameworks></PropertyGroup></Project>",
      "src/Core/Core.cs": "public static class Core { public static int Run() => 1; }\n",
      "tests/Core.Tests/Core.Tests.csproj": testProjectFile("../../src/Core/Core.csproj", "net10.0"),
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, Core.Run()); } }\n"
    });
    const compatibilityShaped = createRepo(t, {
      "src/Core/Core.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFrameworks>netstandard2.0;net8.0;net10.0</TargetFrameworks></PropertyGroup></Project>",
      "src/Core/Core.cs": "public static class Core { public static int Run() => 1; }\n",
      "tests/Core.Tests/Core.Tests.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFrameworks>net462;net8.0;net10.0</TargetFrameworks><IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><PackageReference Include=\"Microsoft.NET.Test.Sdk\" /><PackageReference Include=\"xunit\" /><ProjectReference Include=\"../../src/Core/Core.csproj\" /></ItemGroup></Project>",
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, Core.Run()); } }\n"
    });

    const blocker = "Every test target framework must be listed literally by the production project in this bounded slice.";
    assert.ok(auditCSharpRepo(missingTarget).profile.blockers.includes(blocker));
    assert.ok(auditCSharpRepo(compatibilityShaped).profile.blockers.includes(blocker));
  });

  it("blocks Directory.Build.props shapes that require MSBuild evaluation", (t) => {
    const cases = [
      ["imports", "<Project><Import Project=\"shared.props\" /><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>"],
      ["conditional metadata", "<Project><PropertyGroup Condition=\"'$(Mode)' == 'test'\"><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>"],
      ["conditional metadata", "<Project><Choose><When Condition=\"'$(Mode)' == 'test'\"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></When></Choose></Project>"],
      ["property-expanded metadata", "<Project><PropertyGroup><TargetFramework>$(Framework)</TargetFramework></PropertyGroup></Project>"],
      ["custom compile items", "<Project><ItemGroup><Compile Remove=\"Generated.cs\" /></ItemGroup></Project>"]
    ];

    for (const [expected, props] of cases) {
      const root = createRepo(t, {
        "Directory.Build.props": props,
        "Example.Tests.csproj": projectFile("xunit"),
        "Tests.cs": "public class Tests { [Fact] public void Runs() { Assert.True(true); } }\n"
      });
      const audit = auditCSharpRepo(root);
      assert.equal(audit.profile.testCommand, undefined);
      assert.ok(audit.profile.blockers.some((blocker) => blocker.includes(expected)), expected);
    }
  });

  it("validates bounded central package versions for the selected project pair", (t) => {
    const root = createRepo(t, {
      "Directory.Build.props": [
        "<Project><PropertyGroup>",
        "<TargetFramework>net10.0</TargetFramework>",
        "<ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>",
        "</PropertyGroup></Project>"
      ].join(""),
      "Directory.Packages.props": [
        "<Project><PropertyGroup><CoreVersion>[10.0.10, 11.0.0)</CoreVersion></PropertyGroup><ItemGroup>",
        "<PackageVersion Include=\"Core.Dependency\" Version=\"$(CoreVersion)\" />",
        "<PackageVersion Include=\"Microsoft.NET.Test.Sdk\" Version=\"18.8.1\" />",
        "<PackageVersion Include=\"xunit\" Version=\"2.9.3\" />",
        "</ItemGroup></Project>"
      ].join(""),
      "src/Core/Core.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><ItemGroup><PackageReference Include=\"Core.Dependency\" /></ItemGroup></Project>",
      "src/Core/Core.cs": "public static class Core { public static int Run() => 1; }\n",
      "tests/Core.Tests/Core.Tests.csproj": [
        "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup>",
        "<PackageReference Include=\"Microsoft.NET.Test.Sdk\" />",
        "<PackageReference Include=\"xunit\" />",
        "<ProjectReference Include=\"../../src/Core/Core.csproj\" />",
        "</ItemGroup></Project>"
      ].join(""),
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, Core.Run()); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, "dotnet test tests/Core.Tests/Core.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.detectedConventions.includes("bounded central package management"));
    assert.ok(audit.profile.setupSignals.includes("Directory.Packages.props"));
  });

  it("audits finite project-local target-framework package conditions", (t) => {
    const root = createRepo(t, {
      "Directory.Packages.props": [
        "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup>",
        "<PackageVersion Include=\"System.Memory\" Version=\"4.6.3\" />",
        "<PackageVersion Include=\"System.Buffers\" Version=\"4.6.1\" />",
        "<PackageVersion Include=\"System.Text.Json\" Version=\"10.0.0\" />",
        "<PackageVersion Include=\"Microsoft.NET.Test.Sdk\" Version=\"18.8.1\" />",
        "<PackageVersion Include=\"xunit\" Version=\"2.9.3\" />",
        "</ItemGroup></Project>"
      ].join(""),
      "src/Core/Core.csproj": [
        "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup>",
        "<TargetFrameworks>netstandard2.0;net8.0;net10.0</TargetFrameworks>",
        "</PropertyGroup>",
        "<ItemGroup Condition=\"'$(TargetFramework)' != 'net8.0' And '$(TargetFramework)' != 'net10.0'\"><PackageReference Include=\"System.Memory\" /></ItemGroup>",
        "<ItemGroup Condition=\"'$(TargetFramework)' == 'net8.0' Or '$(TargetFramework)' == 'net10.0'\"><PackageReference Include=\"System.Buffers\" /></ItemGroup>",
        "<ItemGroup><PackageReference Include=\"System.Text.Json\" Condition=\"$(TargetFramework) == 'net8.0'\" /></ItemGroup>",
        "</Project>"
      ].join(""),
      "src/Core/Core.cs": "public static class Core { public static int Run() => 1; }\n",
      "tests/Core.Tests/Core.Tests.csproj": [
        "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup><ItemGroup>",
        "<PackageReference Include=\"Microsoft.NET.Test.Sdk\" /><PackageReference Include=\"xunit\" />",
        "<ProjectReference Include=\"../../src/Core/Core.csproj\" />",
        "</ItemGroup></Project>"
      ].join(""),
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, Core.Run()); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, "dotnet test tests/Core.Tests/Core.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.detectedConventions.includes("literal target-conditioned package references"));
    assert.ok(audit.profile.detectedConventions.includes("bounded central package management"));
  });

  it("blocks package conditions outside the finite target-framework boundary", (t) => {
    const cases = [
      ["non-literal target package reference conditions", "<ItemGroup><PackageReference Include=\"System.Memory\" Condition=\"'$(Mode)' == 'test'\" /></ItemGroup>"],
      ["non-literal target package reference conditions", "<ItemGroup><PackageReference Include=\"System.Memory\" Condition=\"'$(TargetFramework)' != 'net8.0' And '$(TargetFramework)' == 'net10.0'\" /></ItemGroup>"],
      ["non-literal target package reference conditions", "<ItemGroup><PackageReference Include=\"System.Memory\" Condition=\"'$(TargetFramework)' == 'net8.0' Or '$(Mode)' == 'test'\" /></ItemGroup>"],
      ["non-literal target package reference conditions", "<ItemGroup><PackageReference Include=\"System.Memory\" Condition=\"('$(TargetFramework)' == 'net8.0')\" /></ItemGroup>"],
      ["condition target net7.0 is absent", "<ItemGroup><PackageReference Include=\"System.Memory\" Condition=\"'$(TargetFramework)' == 'net7.0'\" /></ItemGroup>"],
      ["conditional test infrastructure", "<ItemGroup><PackageReference Include=\"Microsoft.NET.Test.Sdk\" Condition=\"'$(TargetFramework)' == 'net10.0'\" /><PackageReference Include=\"xunit\" /></ItemGroup>"],
      ["nested package reference conditions", "<ItemGroup Condition=\"'$(TargetFramework)' == 'net8.0'\"><PackageReference Include=\"System.Memory\" Condition=\"'$(TargetFramework)' == 'net8.0'\" /></ItemGroup>"]
    ];

    for (const [expected, packageItems] of cases) {
      const root = createRepo(t, {
        "Example.Tests.csproj": [
          "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFrameworks>net8.0;net10.0</TargetFrameworks><IsTestProject>true</IsTestProject></PropertyGroup>",
          packageItems,
          packageItems.includes("Microsoft.NET.Test.Sdk") ? "" : "<ItemGroup><PackageReference Include=\"Microsoft.NET.Test.Sdk\" /><PackageReference Include=\"xunit\" /></ItemGroup>",
          "</Project>"
        ].join(""),
        "Tests.cs": "public class Tests { [Fact] public void Runs() { Assert.True(true); } }\n"
      });
      const audit = auditCSharpRepo(root);
      assert.equal(audit.profile.testCommand, undefined);
      assert.ok(audit.profile.blockers.some((blocker) => blocker.includes(expected)), expected);
    }
  });

  it("uses the nearest bounded Directory.Packages.props independently for each selected project", (t) => {
    const root = createRepo(t, {
      "Directory.Build.props": "<Project><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>",
      "Directory.Packages.props": "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup><PackageVersion Include=\"Core.Dependency\" Version=\"1.0.0\" /></ItemGroup></Project>",
      "src/Core/Core.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><ItemGroup><PackageReference Include=\"Core.Dependency\" /></ItemGroup></Project>",
      "src/Core/Core.cs": "public static class Core { public static int Run() => 1; }\n",
      "tests/Directory.Packages.props": "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup><PackageVersion Include=\"Microsoft.NET.Test.Sdk\" Version=\"18.8.1\" /><PackageVersion Include=\"xunit\" Version=\"2.9.3\" /></ItemGroup></Project>",
      "tests/Core.Tests/Core.Tests.csproj": testProjectFile("../../src/Core/Core.csproj", ""),
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, Core.Run()); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.setupSignals.includes("Directory.Packages.props"));
    assert.ok(audit.profile.setupSignals.includes("tests/Directory.Packages.props"));
  });

  it("blocks central package shapes that require broader MSBuild evaluation", (t) => {
    const cases = [
      ["imports", "<Project><Import Project=\"shared.props\" /><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup></Project>", ""],
      ["conditional central package versions", "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup Condition=\"'$(Mode)' == 'test'\"><PackageVersion Include=\"xunit\" Version=\"2.9.3\" /><PackageVersion Include=\"Microsoft.NET.Test.Sdk\" Version=\"18.8.1\" /></ItemGroup></Project>", ""],
      ["property-expanded central package versions", "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally><VersionAlias>$(OtherVersion)</VersionAlias></PropertyGroup><ItemGroup><PackageVersion Include=\"xunit\" Version=\"$(VersionAlias)\" /><PackageVersion Include=\"Microsoft.NET.Test.Sdk\" Version=\"18.8.1\" /></ItemGroup></Project>", ""],
      ["property-expanded central package versions", "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup><PackageVersion Include=\"xunit\" Version=\"$(VersionAlias)\" /><PackageVersion Include=\"Microsoft.NET.Test.Sdk\" Version=\"18.8.1\" /></ItemGroup><PropertyGroup><VersionAlias>2.9.3</VersionAlias></PropertyGroup></Project>", ""],
      ["repeated central package versions", "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup><PackageVersion Include=\"xunit\" Version=\"2.9.3\" /><PackageVersion Include=\"xunit\" Version=\"2.9.4\" /><PackageVersion Include=\"Microsoft.NET.Test.Sdk\" Version=\"18.8.1\" /></ItemGroup></Project>", ""],
      ["missing central versions for xunit", "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup><PackageVersion Include=\"Microsoft.NET.Test.Sdk\" Version=\"18.8.1\" /></ItemGroup></Project>", ""],
      ["project-local package versions", "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup><PackageVersion Include=\"xunit\" Version=\"2.9.3\" /><PackageVersion Include=\"Microsoft.NET.Test.Sdk\" Version=\"18.8.1\" /></ItemGroup></Project>", " Version=\"2.9.3\""],
      ["project-local package versions", "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup><PackageVersion Include=\"xunit\" Version=\"2.9.3\" /><PackageVersion Include=\"Microsoft.NET.Test.Sdk\" Version=\"18.8.1\" /></ItemGroup></Project>", " VersionOverride=\"2.9.4\""],
      ["conditional test infrastructure package references", "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup><PackageVersion Include=\"xunit\" Version=\"2.9.3\" /><PackageVersion Include=\"Microsoft.NET.Test.Sdk\" Version=\"18.8.1\" /></ItemGroup></Project>", " Condition=\"'$(Mode)' == 'test'\""],
      ["global package references", "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup><GlobalPackageReference Include=\"Build.Tool\" Version=\"1.0.0\" /><PackageVersion Include=\"xunit\" Version=\"2.9.3\" /><PackageVersion Include=\"Microsoft.NET.Test.Sdk\" Version=\"18.8.1\" /></ItemGroup></Project>", ""]
    ];

    for (const [expected, packagesProps, xunitMetadata] of cases) {
      const root = createRepo(t, {
        "Directory.Packages.props": packagesProps,
        "Example.Tests.csproj": `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" /><PackageReference Include="xunit"${xunitMetadata} /></ItemGroup></Project>`,
        "Tests.cs": "public class Tests { [Fact] public void Runs() { Assert.True(true); } }\n"
      });
      const audit = auditCSharpRepo(root);
      assert.equal(audit.profile.testCommand, undefined);
      assert.ok(audit.profile.blockers.some((blocker) => blocker.includes(expected)), expected);
    }
  });

  it("blocks symbolic central package metadata paths", (t) => {
    const root = createRepo(t, {
      "Directory.Build.props": "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup></Project>",
      "central.props": "<Project />",
      "Example.Tests.csproj": projectFile("xunit"),
      "Tests.cs": "public class Tests { [Fact] public void Runs() { Assert.True(true); } }\n"
    });
    fs.symlinkSync(path.join(root, "central.props"), path.join(root, "Directory.Packages.props"));

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, undefined);
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("symbolic central packages path")));
  });

  it("detects bounded NUnit and MSTest attributed tests", (t) => {
    const nunit = createRepo(t, {
      "Example.Tests.csproj": projectFile("NUnit", "<IsTestProject>true</IsTestProject>"),
      "Calculator.cs": "public static class Calculator { public static int Add(int a, int b) => a + b; }\n",
      "CalculatorTests.cs": "public class CalculatorTests { [TestCase] public void Adds() { Assert.That(Calculator.Add(1, 2), Is.EqualTo(3)); } }\n"
    });
    const mstest = createRepo(t, {
      "Example.Tests.csproj": projectFile("MSTest.TestFramework", "<IsTestProject>true</IsTestProject>"),
      "Validator.cs": "public static class Validator { public static bool IsValid(int value) => value > 0; }\n",
      "ValidatorTest.cs": "public class ValidatorTest { [DataTestMethod] public void Validates() { Assert.IsTrue(Validator.IsValid(1)); } }\n"
    });

    assert.deepEqual(auditCSharpRepo(nunit).profile.testFrameworks, ["nunit"]);
    assert.equal(auditCSharpRepo(nunit).coveredButRisky[0].existingTestEvidence[0].usage, "asserted");
    assert.deepEqual(auditCSharpRepo(mstest).profile.testFrameworks, ["mstest"]);
    assert.equal(auditCSharpRepo(mstest).profile.testCommand, "dotnet test Example.Tests.csproj");
  });

  it("credits one sole direct MSTest ExpectedException call", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("MSTest.TestFramework", "<IsTestProject>true</IsTestProject>"),
      "CombinedThrower.cs": "public static class CombinedThrower { public static void Run() => throw new System.Exception(); }\n",
      "SeparateThrower.cs": "public static class SeparateThrower { public static void Run() => throw new System.Exception(); }\n",
      "NamespacedThrower.cs": "namespace Product.Types { public static class NamespacedThrower { public static void Run() => throw new System.Exception(); } }\n",
      "ThrowingConstructor.cs": "public class ThrowingConstructor { public ThrowingConstructor() => throw new System.Exception(); }\n",
      "OrdinaryThrower.cs": "public static class OrdinaryThrower { public static void Run() => throw new System.Exception(); }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [TestMethod, ExpectedException(typeof(System.Exception))] public void Combined() { CombinedThrower.Run(); }",
        "  [TestMethod] [ExpectedException(typeof(System.Exception))] public void Separate() { SeparateThrower.Run(); }",
        "  [DataTestMethod, ExpectedExceptionAttribute(typeof(System.Exception))] public void Namespaced() { Product.Types.NamespacedThrower.Run(); }",
        "  [TestMethod, ExpectedException(typeof(System.Exception))] public void Constructor() { new ThrowingConstructor(); }",
        "  [TestMethod] public void Ordinary() { OrdinaryThrower.Run(); }",
        "}"
      ].join("\n")
    });

    assert.deepEqual(
      auditCSharpRepo(root).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["CombinedThrower.cs", "asserted"],
        ["NamespacedThrower.cs", "asserted"],
        ["OrdinaryThrower.cs", "called"],
        ["SeparateThrower.cs", "asserted"],
        ["ThrowingConstructor.cs", "asserted"]
      ]
    );
  });

  it("rejects ambiguous, wrapped, indirect, deferred, and non-MSTest ExpectedException flow", (t) => {
    const mstest = createRepo(t, {
      "Example.Tests.csproj": projectFile("MSTest.TestFramework", "<IsTestProject>true</IsTestProject>"),
      "MultipleFirst.cs": "public static class MultipleFirst { public static void Run() { } }\n",
      "MultipleSecond.cs": "public static class MultipleSecond { public static void Run() { } }\n",
      "WrappedThrower.cs": "public static class WrappedThrower { public static int Run() => 1; }\n",
      "PreparedThrower.cs": "public static class PreparedThrower { public static void Run() { } }\n",
      "HelperOnlyThrower.cs": "public static class HelperOnlyThrower { public static void Run() { } }\n",
      "LambdaOnlyThrower.cs": "public static class LambdaOnlyThrower { public static void Run() { } }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [TestMethod, ExpectedException(typeof(System.Exception))] public void Multiple() { MultipleFirst.Run(); MultipleSecond.Run(); }",
        "  [TestMethod, ExpectedException(typeof(System.Exception))] public void Wrapped() { Consume(WrappedThrower.Run()); }",
        "  [TestMethod, ExpectedException(typeof(System.Exception))] public void Prepared() { Prepare(); PreparedThrower.Run(); }",
        "  [TestMethod, ExpectedException(typeof(System.Exception))] public void HelperOnly() { Helper(); }",
        "  [TestMethod, ExpectedException(typeof(System.Exception))] public void Deferred() { System.Action action = () => LambdaOnlyThrower.Run(); action(); }",
        "  private static void Consume(int value) { }",
        "  private static void Prepare() { }",
        "  private static void Helper() => HelperOnlyThrower.Run();",
        "}"
      ].join("\n")
    });
    const xunit = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "CustomAttributeThrower.cs": "public static class CustomAttributeThrower { public static void Run() { } }\n",
      "Tests.cs": "public class Tests { [Fact, ExpectedException(typeof(System.Exception))] public void Runs() { CustomAttributeThrower.Run(); } }\n"
    });

    assert.deepEqual(
      auditCSharpRepo(mstest).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["MultipleFirst.cs", "called"],
        ["MultipleSecond.cs", "called"],
        ["PreparedThrower.cs", "called"],
        ["WrappedThrower.cs", "called"]
      ]
    );
    assert.deepEqual(auditCSharpRepo(mstest).untestedCandidates.map((target) => target.path), [
      "HelperOnlyThrower.cs",
      "LambdaOnlyThrower.cs"
    ]);
    assert.equal(auditCSharpRepo(xunit).coveredButRisky[0].existingTestEvidence[0].usage, "called");
  });

  it("keeps self-closing test packages after package references with child metadata", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": [
        "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup><ItemGroup>",
        "<PackageReference Include=\"coverlet.collector\"><PrivateAssets>all</PrivateAssets></PackageReference>",
        "<PackageReference Include=\"Microsoft.NET.Test.Sdk\" />",
        "<PackageReference Include=\"MSTest.TestFramework\" />",
        "</ItemGroup></Project>"
      ].join(""),
      "Tests.cs": "public class Tests { [TestMethod] public void Runs() { Assert.IsTrue(true); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.deepEqual(audit.profile.testFrameworks, ["mstest"]);
    assert.equal(audit.profile.testCommand, "dotnet test Example.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
  });

  it("falls back to a unique filename convention without inventing symbol usage", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "Formatter.cs": "public static class Formatter { public static string Format(int value) => value.ToString(); }\n",
      "FormatterTests.cs": "public class FormatterTests { [Fact] public void Formats() { Assert.Equal(\"1\", Run()); } private string Run() => \"1\"; }\n"
    });

    assert.deepEqual(auditCSharpRepo(root).coveredButRisky[0].existingTestEvidence, [{
      testPath: "FormatterTests.cs",
      kind: "filename-convention",
      strength: "naming"
    }]);
  });

  it("rejects ambiguous and dynamic project ownership", (t) => {
    const root = createRepo(t, {
      "One.csproj": projectFile("xunit", "<TargetFrameworks>net9.0;net10.0</TargetFrameworks><ProjectReference Include=\"../Core/Core.csproj\" /><EnableDefaultCompileItems>false</EnableDefaultCompileItems>"),
      "Two.csproj": projectFile("xunit"),
      "Source.cs": "public class Source { public int Run() => 1; }\n",
      "Tests.cs": "public class Tests { [Fact] public void Runs() { _ = new Source(); } }\n"
    });
    const audit = auditCSharpRepo(root);

    assert.equal(audit.profile.testCommand, undefined);
    assert.ok(audit.profile.blockers.includes("Exactly one root test .csproj or one unique literal production/test project edge is required before C# command ownership is unambiguous."));
    assert.ok(audit.profile.blockers.includes("No runnable attributed C# tests detected."));
  });

  it("blocks unsupported single-project MSBuild shapes", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": [
        "<Project Sdk=\"Custom.Sdk\"><PropertyGroup>",
        "<TargetFrameworks>net9.0;net10.0</TargetFrameworks>",
        "<EnableDefaultCompileItems>false</EnableDefaultCompileItems>",
        "<IsTestProject>true</IsTestProject>",
        "</PropertyGroup><ItemGroup>",
        "<ProjectReference Include=\"../Core/Core.csproj\" />",
        "<PackageReference Include=\"xunit\" />",
        "</ItemGroup></Project>"
      ].join(""),
      "Source.cs": "public class Source { public int Run() => 1; }\n",
      "SourceTests.cs": "public class SourceTests { [Fact] public void Runs() { _ = new Source(); } }\n"
    });
    const blockers = auditCSharpRepo(root).profile.blockers;

    assert.ok(blockers.includes("Only static SDK-style Microsoft.NET.Sdk projects are supported in the first C# slice."));
    assert.ok(blockers.includes("Custom MSBuild Compile item graphs are outside the first bounded C# source-ownership slice."));
    assert.ok(blockers.includes("ProjectReference is supported only for one literal production/test project pair."));
    assert.ok(blockers.includes("Microsoft.NET.Test.Sdk is required for the bounded C# test command."));
  });

  it("does not credit comments, strings, duplicate types, or test-local shadows", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "First.cs": "public static class Duplicate { public static int Run() => 1; } public static class Shadowed { public static int Run() => 1; }\n",
      "Second.cs": "public static class Duplicate { public static int Other() => 2; }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [Fact] public void IgnoresText() { var text = \"Shadowed.Run()\"; /* Duplicate.Run(); */ Assert.NotNull(text); }",
        "  private class Shadowed { public static int Run() => 3; }",
        "}"
      ].join("\n")
    });

    assert.deepEqual(auditCSharpRepo(root).coveredButRisky, []);
  });

  it("does not credit source calls outside runnable attributed test bodies", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "HelperOnly.cs": "public static class HelperOnly { public static int Run() => 1; }\n",
      "ConstructorOnly.cs": "public class ConstructorOnly { public int Value => 1; }\n",
      "FieldOnly.cs": "public class FieldOnly { public int Value => 1; }\n",
      "LocalFunctionOnly.cs": "public static class LocalFunctionOnly { public static int Run() => 1; }\n",
      "LambdaOnly.cs": "public static class LambdaOnly { public static int Run() => 1; }\n",
      "Tests.cs": [
        "public class Tests {",
        "  private readonly FieldOnly _field = new FieldOnly();",
        "  public Tests() { _ = new ConstructorOnly(); }",
        "  [Fact] public void UsesOnlyIndirectCalls() { Helper(); void Local() { LocalFunctionOnly.Run(); } System.Func<int> deferred = () => LambdaOnly.Run(); Assert.True(true); }",
        "  private static int Helper() => HelperOnly.Run();",
        "}"
      ].join("\n")
    });

    const audit = auditCSharpRepo(root);
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), [
      "ConstructorOnly.cs",
      "FieldOnly.cs",
      "HelperOnly.cs",
      "LambdaOnly.cs",
      "LocalFunctionOnly.cs"
    ]);
  });

  it("tracks concrete local receiver calls and one-hop asserted results", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "InlineParser.cs": "public class InlineParser { public int Parse(int value) { if (value < 0) throw new Exception(); return value; } }\n",
      "ResultParser.cs": "public class ResultParser { public int Parse(int value) { if (value < 0) throw new Exception(); return value; } }\n",
      "CalledParser.cs": "public class CalledParser { public int Parse(int value) { if (value < 0) throw new Exception(); return value; } }\n",
      "FluentParser.cs": "public class FluentParser { public int Parse(int value) { if (value < 0) throw new Exception(); return value; } }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [Fact] public void AssertsInline() { var parser = new InlineParser(); Assert.Equal(1, parser.Parse(1)); }",
        "  [Fact] public void AssertsResult() { ResultParser parser = new ResultParser(); var result = parser.Parse(1); Assert.Equal(1, result); }",
        "  [Fact] public void AssertsFluentResult() { var parser = new FluentParser(); var result = parser.Parse(1); result.Should().Be(1); }",
        "  [Fact] public void OnlyCalls() { var parser = new CalledParser(); parser.Parse(1); }",
        "}"
      ].join("\n")
    });

    assert.deepEqual(
      auditCSharpRepo(root).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["CalledParser.cs", "called"],
        ["FluentParser.cs", "asserted"],
        ["InlineParser.cs", "asserted"],
        ["ResultParser.cs", "asserted"]
      ]
    );
  });

  it("tracks one stable direct type-call or constructor result into a later assertion", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "StaticFactory.cs": "public static class StaticFactory { public static int Create() => 1; }\n",
      "ExplicitFactory.cs": "public static class ExplicitFactory { public static int Create() => 1; }\n",
      "FluentFactory.cs": "public static class FluentFactory { public static int Create() => 1; }\n",
      "ConstructedResult.cs": "public class ConstructedResult { public int Value => 1; }\n",
      "CalledFactory.cs": "public static class CalledFactory { public static int Create() => 1; }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [Fact] public void AssertsStaticResult() { var result = StaticFactory.Create(); Assert.Equal(1, result); }",
        "  [Fact] public void AssertsExplicitResult() { int result = ExplicitFactory.Create(); Assert.Equal(1, result); }",
        "  [Fact] public void AssertsFluentResult() { var result = FluentFactory.Create(); result.Should().Be(1); }",
        "  [Fact] public void AssertsConstructedResult() { var result = new ConstructedResult(); Assert.Equal(1, result.Value); }",
        "  [Fact] public void OnlyCalls() { var result = CalledFactory.Create(); }",
        "}"
      ].join("\n")
    });

    assert.deepEqual(
      auditCSharpRepo(root).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["CalledFactory.cs", "called"],
        ["ConstructedResult.cs", "asserted"],
        ["ExplicitFactory.cs", "asserted"],
        ["FluentFactory.cs", "asserted"],
        ["StaticFactory.cs", "asserted"]
      ]
    );
  });

  it("rejects changed, nested, deferred, and indirect direct-call result flow", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "ChangedFactory.cs": "public static class ChangedFactory { public static int Create() => 1; }\n",
      "LocalFunctionFactory.cs": "public static class LocalFunctionFactory { public static int Create() => 1; }\n",
      "LambdaFactory.cs": "public static class LambdaFactory { public static int Create() => 1; }\n",
      "IndirectFactory.cs": "public static class IndirectFactory { public static int Create() => 1; }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [Fact] public void Changed() { var result = ChangedFactory.Create(); result = 2; Assert.Equal(2, result); }",
        "  [Fact] public void NestedFunction() { void Verify() { var result = LocalFunctionFactory.Create(); Assert.Equal(1, result); } Verify(); }",
        "  [Fact] public void DeferredLambda() { System.Func<int> verify = () => { var result = LambdaFactory.Create(); Assert.Equal(1, result); return result; }; verify(); }",
        "  [Fact] public void IndirectHelper() { var result = Create(); Assert.Equal(1, result); }",
        "  private static int Create() => IndirectFactory.Create();",
        "}"
      ].join("\n")
    });

    assert.deepEqual(
      auditCSharpRepo(root).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [["ChangedFactory.cs", "called"]]
    );
    assert.deepEqual(auditCSharpRepo(root).untestedCandidates.map((target) => target.path), [
      "IndirectFactory.cs",
      "LambdaFactory.cs",
      "LocalFunctionFactory.cs"
    ]);
  });

  it("rejects reassigned receivers and results plus interface, mutable-field, ref, and helper flow", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "ReassignedParser.cs": "public class ReassignedParser { public int Parse() => 1; }\n",
      "ChangedResultParser.cs": "public class ChangedResultParser { public int Parse() => 1; }\n",
      "InterfaceParser.cs": "public interface IParser { int Parse(); } public class InterfaceParser : IParser { public int Parse() => 1; }\n",
      "FieldParser.cs": "public class FieldParser { public int Parse() => 1; }\n",
      "RefParser.cs": "public class RefParser { public int Parse() => 1; }\n",
      "HelperParser.cs": "public class HelperParser { public int Parse() => 1; }\n",
      "LocalHelperParser.cs": "public class LocalHelperParser { public int Parse() => 1; }\n",
      "LambdaParser.cs": "public class LambdaParser { public int Parse() => 1; }\n",
      "Tests.cs": [
        "public class Tests {",
        "  private FieldParser fieldParser = new FieldParser();",
        "  [Fact] public void RejectsReceiverReassignment() { var parser = new ReassignedParser(); parser = new ReassignedParser(); Assert.Equal(1, parser.Parse()); }",
        "  [Fact] public void RejectsResultReassignment() { var parser = new ChangedResultParser(); var result = parser.Parse(); result = 2; Assert.Equal(2, result); }",
        "  [Fact] public void RejectsInterfaceBinding() { IParser parser = new InterfaceParser(); Assert.Equal(1, parser.Parse()); }",
        "  [Fact] public void RejectsFieldFlow() { Assert.Equal(1, fieldParser.Parse()); }",
        "  [Fact] public void RejectsRefMutation() { var parser = new RefParser(); Mutate(ref parser); Assert.Equal(1, parser.Parse()); }",
        "  [Fact] public void RejectsHelperFlow() { var parser = CreateParser(); Assert.Equal(1, parser.Parse()); }",
        "  [Fact] public void RejectsLocalHelper() { var parser = new LocalHelperParser(); void Verify() { Assert.Equal(1, parser.Parse()); } Verify(); }",
        "  [Fact] public void RejectsDeferredLambda() { var parser = new LambdaParser(); Action verify = () => Assert.Equal(1, parser.Parse()); verify(); }",
        "  private static void Mutate(ref RefParser parser) { parser = new RefParser(); }",
        "  private static HelperParser CreateParser() => new HelperParser();",
        "}"
      ].join("\n")
    });

    assert.deepEqual(
      auditCSharpRepo(root).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["ChangedResultParser.cs", "called"],
        ["InterfaceParser.cs", "called"],
        ["LambdaParser.cs", "called"],
        ["LocalHelperParser.cs", "called"],
        ["ReassignedParser.cs", "called"],
        ["RefParser.cs", "called"]
      ]
    );
    assert.deepEqual(auditCSharpRepo(root).untestedCandidates.map((target) => target.path), [
      "FieldParser.cs",
      "HelperParser.cs"
    ]);
  });

  it("tracks exact private readonly concrete field receivers", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "InlineFieldParser.cs": "public class InlineFieldParser { public int Parse() => 1; }\n",
      "ExplicitFieldParser.cs": "public class ExplicitFieldParser { public int Parse() => 1; }\n",
      "ConstructorFieldParser.cs": "public class ConstructorFieldParser { public int Parse() => 1; }\n",
      "CalledFieldParser.cs": "public class CalledFieldParser { public int Parse() => 1; }\n",
      "Tests.cs": [
        "public class Tests {",
        "  private readonly InlineFieldParser _inline = new();",
        "  private readonly ExplicitFieldParser _explicit = new ExplicitFieldParser();",
        "  private readonly ConstructorFieldParser _constructor;",
        "  private readonly CalledFieldParser _called = new();",
        "  public Tests() { this._constructor = new(); }",
        "  [Fact] public void AssertsInline() { Assert.Equal(1, _inline.Parse()); }",
        "  [Fact] public void AssertsExplicitResult() { var result = _explicit.Parse(); Assert.Equal(1, result); }",
        "  [Fact] public void AssertsConstructorResult() { var result = this._constructor.Parse(); Assert.Equal(1, result); }",
        "  [Fact] public void OnlyCalls() { _called.Parse(); }",
        "}"
      ].join("\n")
    });

    assert.deepEqual(
      auditCSharpRepo(root).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["CalledFieldParser.cs", "called"],
        ["ConstructorFieldParser.cs", "asserted"],
        ["ExplicitFieldParser.cs", "asserted"],
        ["InlineFieldParser.cs", "asserted"]
      ]
    );
  });

  it("tracks one exact inline out variable into a later assertion", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "LocalOutParser.cs": "public class LocalOutParser { public bool Parse(out int value) { value = 1; return true; } }\n",
      "FieldOutParser.cs": "public class FieldOutParser { public bool Parse(out int value) { value = 1; return true; } }\n",
      "FluentOutParser.cs": "public class FluentOutParser { public bool Parse(out int value) { value = 1; return true; } }\n",
      "CalledOutParser.cs": "public class CalledOutParser { public bool Parse(out int value) { value = 1; return true; } }\n",
      "Tests.cs": [
        "public class Tests {",
        "  private readonly FieldOutParser _field = new();",
        "  private readonly FluentOutParser _fluent = new();",
        "  private readonly CalledOutParser _called = new();",
        "  [Fact] public void AssertsLocalOut() { var parser = new LocalOutParser(); parser.Parse(out var output); Assert.Equal(1, output); }",
        "  [Fact] public void AssertsFieldOut() { this._field.Parse(out var output); Assert.Equal(1, output); }",
        "  [Fact] public void AssertsFluentOut() { _fluent.Parse(out var output); output.Should().Be(1); }",
        "  [Fact] public void OnlyCallsOut() { _called.Parse(out var output); }",
        "}"
      ].join("\n")
    });

    assert.deepEqual(
      auditCSharpRepo(root).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["CalledOutParser.cs", "called"],
        ["FieldOutParser.cs", "asserted"],
        ["FluentOutParser.cs", "asserted"],
        ["LocalOutParser.cs", "asserted"]
      ]
    );
  });

  it("rejects predeclared, changed, forwarded, nested, multiple, and deferred out flow", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "PredeclaredOutParser.cs": "public class PredeclaredOutParser { public bool Parse(out int value) { value = 1; return true; } }\n",
      "ChangedOutParser.cs": "public class ChangedOutParser { public bool Parse(out int value) { value = 1; return true; } }\n",
      "ForwardedOutParser.cs": "public class ForwardedOutParser { public bool Parse(out int value) { value = 1; return true; } }\n",
      "NestedOutParser.cs": "public class NestedOutParser { public bool Parse(int value) => true; }\n",
      "MultipleOutParser.cs": "public class MultipleOutParser { public bool Parse(out int first, out int second) { first = 1; second = 2; return true; } }\n",
      "LocalFunctionOutParser.cs": "public class LocalFunctionOutParser { public bool Parse(out int value) { value = 1; return true; } }\n",
      "LambdaOutParser.cs": "public class LambdaOutParser { public bool Parse(out int value) { value = 1; return true; } }\n",
      "AssertionLambdaOutParser.cs": "public class AssertionLambdaOutParser { public bool Parse(out int value) { value = 1; return true; } }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [Fact] public void Predeclared() { var parser = new PredeclaredOutParser(); int output; parser.Parse(out output); Assert.Equal(1, output); }",
        "  [Fact] public void Changed() { var parser = new ChangedOutParser(); parser.Parse(out var output); output = 2; Assert.Equal(2, output); }",
        "  [Fact] public void Forwarded() { var parser = new ForwardedOutParser(); parser.Parse(out var output); Mutate(ref output); Assert.Equal(2, output); }",
        "  [Fact] public void NestedHelperOwnsOut() { var parser = new NestedOutParser(); parser.Parse(Helper(out var output)); Assert.Equal(1, output); }",
        "  [Fact] public void Multiple() { var parser = new MultipleOutParser(); parser.Parse(out var first, out var second); Assert.Equal(1, first); }",
        "  [Fact] public void NestedFunction() { var parser = new LocalFunctionOutParser(); parser.Parse(out var output); void Verify() { Assert.Equal(1, output); } Verify(); }",
        "  [Fact] public void DeferredLambda() { var parser = new LambdaOutParser(); parser.Parse(out var output); System.Action verify = () => Assert.Equal(1, output); verify(); }",
        "  [Fact] public void AssertionLambda() { var parser = new AssertionLambdaOutParser(); parser.Parse(out var output); Assert.All(new[] { 1 }, value => Assert.Equal(value, output)); }",
        "  private static int Helper(out int value) { value = 1; return value; }",
        "  private static void Mutate(ref int value) { value = 2; }",
        "}"
      ].join("\n")
    });

    assert.deepEqual(
      auditCSharpRepo(root).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["AssertionLambdaOutParser.cs", "called"],
        ["ChangedOutParser.cs", "called"],
        ["ForwardedOutParser.cs", "called"],
        ["LambdaOutParser.cs", "called"],
        ["LocalFunctionOutParser.cs", "called"],
        ["MultipleOutParser.cs", "called"],
        ["NestedOutParser.cs", "called"],
        ["PredeclaredOutParser.cs", "called"]
      ]
    );
  });

  it("rejects mutable, shared, indirect, ambiguous, shadowed, and deferred fields", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "MutableParser.cs": "public class MutableParser { public int Parse() => 1; }\n",
      "StaticParser.cs": "public class StaticParser { public int Parse() => 1; }\n",
      "PropertyParser.cs": "public class PropertyParser { public int Parse() => 1; }\n",
      "HelperParser.cs": "public class HelperParser { public int Parse() => 1; }\n",
      "MultiConstructorParser.cs": "public class MultiConstructorParser { public int Parse() => 1; }\n",
      "ConstructorShadowParser.cs": "public class ConstructorShadowParser { public int Parse() => 1; }\n",
      "ConditionalFieldParser.cs": "public class ConditionalFieldParser { public int Parse() => 1; }\n",
      "ReassignedFieldParser.cs": "public class ReassignedFieldParser { public int Parse() => 1; }\n",
      "InheritedParser.cs": "public class InheritedParser { public int Parse() => 1; }\n",
      "PartialParser.cs": "public class PartialParser { public int Parse() => 1; }\n",
      "ShadowedFieldParser.cs": "public class ShadowedFieldParser { public int Parse() => 1; }\n",
      "ParameterFieldParser.cs": "public class ParameterFieldParser { public int Parse() => 1; }\n",
      "LocalFunctionFieldParser.cs": "public class LocalFunctionFieldParser { public int Parse() => 1; }\n",
      "LambdaFieldParser.cs": "public class LambdaFieldParser { public int Parse() => 1; }\n",
      "Tests.cs": [
        "public class TestsBase { protected readonly InheritedParser _inherited = new(); }",
        "public partial class Tests {",
        "  private MutableParser _mutable = new();",
        "  private static readonly StaticParser _static = new();",
        "  private PropertyParser Property { get; } = new();",
        "  private readonly HelperParser _helper = CreateHelper();",
        "  private readonly MultiConstructorParser _multi;",
        "  private readonly ConstructorShadowParser _constructorShadow;",
        "  private readonly ConditionalFieldParser _conditional;",
        "  private readonly ReassignedFieldParser _reassigned = new();",
        "  private readonly ShadowedFieldParser _shadowed = new();",
        "  private readonly ParameterFieldParser _parameter = new();",
        "  private readonly LocalFunctionFieldParser _localFunction = new();",
        "  private readonly LambdaFieldParser _lambda = new();",
        "  public Tests() { _multi = new(); ConstructorShadowParser _constructorShadow = new(); if (true) { _conditional = new(); } _reassigned = new(); }",
        "  public Tests(int value) : this() { }",
        "  [Fact] public void Mutable() { Assert.Equal(1, _mutable.Parse()); }",
        "  [Fact] public void Static() { Assert.Equal(1, _static.Parse()); }",
        "  [Fact] public void PropertyTest() { Assert.Equal(1, Property.Parse()); }",
        "  [Fact] public void Helper() { Assert.Equal(1, _helper.Parse()); }",
        "  [Fact] public void Multi() { Assert.Equal(1, _multi.Parse()); }",
        "  [Fact] public void ConstructorShadow() { Assert.Equal(1, _constructorShadow.Parse()); }",
        "  [Fact] public void Conditional() { Assert.Equal(1, _conditional.Parse()); }",
        "  [Fact] public void Reassigned() { Assert.Equal(1, _reassigned.Parse()); }",
        "  [Fact] public void LocalShadow() { var _shadowed = new object(); Assert.NotNull(_shadowed); }",
        "  [Fact] public void ParameterShadow(ParameterFieldParser _parameter) { Assert.Equal(1, _parameter.Parse()); }",
        "  [Fact] public void NestedFunction() { void Verify() { Assert.Equal(1, _localFunction.Parse()); } Verify(); }",
        "  [Fact] public void DeferredLambda() { System.Func<int> verify = () => _lambda.Parse(); Assert.Equal(1, verify()); }",
        "  private static HelperParser CreateHelper() => throw new System.Exception();",
        "}",
        "public partial class Tests { private readonly PartialParser _partial = new(); }",
        "public class DerivedTests : TestsBase { [Fact] public void Inherited() { Assert.Equal(1, _inherited.Parse()); } }"
      ].join("\n")
    });

    assert.deepEqual(auditCSharpRepo(root).coveredButRisky, []);
    assert.deepEqual(auditCSharpRepo(root).untestedCandidates.map((target) => target.path), [
      "ConditionalFieldParser.cs",
      "ConstructorShadowParser.cs",
      "HelperParser.cs",
      "InheritedParser.cs",
      "LambdaFieldParser.cs",
      "LocalFunctionFieldParser.cs",
      "MultiConstructorParser.cs",
      "MutableParser.cs",
      "ParameterFieldParser.cs",
      "PartialParser.cs",
      "PropertyParser.cs",
      "ReassignedFieldParser.cs",
      "ShadowedFieldParser.cs",
      "StaticParser.cs"
    ]);
  });

  it("filters candidates with portable changed paths and classifies generated and contract files", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "Service.cs": "public class Service { public int Run(int value) { if (value < 0) throw new Exception(); return value; } }\n",
      "Other.cs": "public class Other { public int Run() => 1; }\n",
      "Generated.g.cs": "public class Generated { }\n",
      "IClock.cs": "public interface IClock { int Hour { get; } }\n",
      "Tests.cs": "public class Tests { [Fact] public void Runs() { Assert.True(true); } }\n"
    });
    const audit = auditCSharpRepo(root, { changedPaths: [".\\Service.cs", path.join(root, "Generated.g.cs"), "IClock.cs"] });

    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["Service.cs"]);
    assert.deepEqual(audit.skipped.map((target) => [target.path, target.kind]), [
      ["Generated.g.cs", "generated-code"],
      ["IClock.cs", "contract"]
    ]);
  });

  it("reports a bounded blocker when no root project or runnable test exists", (t) => {
    const root = createRepo(t, { "Service.cs": "public class Service { public int Run() => 1; }\n" });
    const audit = auditCSharpRepo(root);

    assert.equal(audit.profile.confidence, "medium");
    assert.equal(audit.profile.testCommand, undefined);
    assert.deepEqual(audit.profile.blockers, [
      "No .csproj detected for the bounded C# SDK project adapter.",
      "No runnable attributed C# tests detected."
    ]);
  });

  it("does not join an unreferenced nested SDK project into the audit", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "RootService.cs": "public class RootService { public int Run() => 1; }\n",
      "RootTests.cs": "public class RootTests { [Fact] public void Runs() { Assert.True(true); } }\n",
      "nested/Nested.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>",
      "nested/NestedService.cs": "public class NestedService { public int Run() => 1; }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, undefined);
    assert.ok(audit.profile.blockers.includes("The test project must contain exactly one literal ProjectReference to the production project, with no other project edges."));
    assert.ok(audit.recommended.every((target) => target.path !== "RootService.cs"));
  });

  it("normalizes a portable literal ProjectReference", (t) => {
    const root = createRepo(t, {
      "src/Core/Core.csproj": productionProjectFile(),
      "src/Core/Calculator.cs": "public static class Calculator { public static int Add(int a, int b) => a + b; }\n",
      "tests/Core.Tests/Core.Tests.csproj": testProjectFile("..\\..\\src\\Core\\Core.csproj"),
      "tests/Core.Tests/CalculatorTests.cs": "public class CalculatorTests { [Fact] public void Adds() { Assert.Equal(3, Calculator.Add(1, 2)); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, "dotnet test tests/Core.Tests/Core.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
  });

  it("supports a root production project with one nested test project", (t) => {
    const root = createRepo(t, {
      "Core.csproj": productionProjectFile(),
      "Calculator.cs": "public static class Calculator { public static int Add(int a, int b) => a + b; }\n",
      "tests/Core.Tests/Core.Tests.csproj": testProjectFile("../../Core.csproj"),
      "tests/Core.Tests/CalculatorTests.cs": "public class CalculatorTests { [Fact] public void Adds() { Assert.Equal(3, Calculator.Add(1, 2)); } }\n",
      "tests/Core.Tests/TestDataBuilder.cs": "public class TestDataBuilder { public int Value() => 1; }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["Calculator.cs"]);
    assert.ok(audit.recommended.every((target) => target.path !== "tests/Core.Tests/TestDataBuilder.cs"));
  });

  it("selects one unique literal project edge without absorbing unrelated projects", (t) => {
    const root = createRepo(t, {
      "src/Core/Core.csproj": productionProjectFile(),
      "src/Core/Core.cs": "public class Core { public int Run(int value) { if (value < 0) throw new Exception(); return value; } }\n",
      "src/Other/Other.csproj": productionProjectFile(),
      "src/Other/Other.cs": "public class Other { public int Run() => 2; }\n",
      "tests/Core.Tests/Core.Tests.csproj": testProjectFile("../../src/Core/Core.csproj"),
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, new Core().Run(1)); } }\n",
      "benchmarks/Benchmarks/Benchmarks.csproj": productionProjectFile()
    });

    const audit = auditCSharpRepo(root);
    assert.deepEqual(audit.profile.blockers, []);
    assert.equal(audit.profile.testCommand, "dotnet test tests/Core.Tests/Core.Tests.csproj");
    assert.ok(audit.profile.detectedConventions.includes("unique literal test edge among unrelated projects"));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/Core/Core.cs"]);
    assert.ok(audit.recommended.every((target) => !target.path.includes("Other")));
  });

  it("blocks dynamic, mismatched, and ambiguous project graph shapes", (t) => {
    const dynamic = createRepo(t, {
      "src/Core/Core.csproj": productionProjectFile("net9.0"),
      "src/Core/Core.cs": "public class Core { public int Run() => 1; }\n",
      "tests/Core.Tests/Core.Tests.csproj": testProjectFile("$(CoreProject)"),
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, new Core().Run()); } }\n"
    });
    const ambiguous = createRepo(t, {
      "src/Core/Core.csproj": productionProjectFile(),
      "src/Core/Core.cs": "public class Core { public int Run() => 1; }\n",
      "src/Other/Other.csproj": productionProjectFile(),
      "src/Other/Other.cs": "public class Other { public int Run() => 2; }\n",
      "tests/Core.Tests/Core.Tests.csproj": testProjectFile("../../src/Core/Core.csproj"),
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, new Core().Run()); } }\n",
      "tests/Other.Tests/Other.Tests.csproj": testProjectFile("../../src/Other/Other.csproj"),
      "tests/Other.Tests/OtherTests.cs": "public class OtherTests { [Fact] public void Runs() { Assert.Equal(2, new Other().Run()); } }\n"
    });

    const dynamicBlockers = auditCSharpRepo(dynamic).profile.blockers;
    assert.ok(dynamicBlockers.includes("The test project must contain exactly one literal ProjectReference to the production project, with no other project edges."));
    assert.ok(dynamicBlockers.includes("Every test target framework must be listed literally by the production project in this bounded slice."));
    assert.deepEqual(auditCSharpRepo(dynamic).coveredButRisky, []);
    assert.ok(auditCSharpRepo(ambiguous).profile.blockers.includes("Exactly one root test .csproj or one unique literal production/test project edge is required before C# command ownership is unambiguous."));
  });

  it("blocks a unique pair that overlaps another project's default compile ownership", (t) => {
    const root = createRepo(t, {
      "Root.csproj": productionProjectFile(),
      "src/Core/Core.csproj": productionProjectFile(),
      "src/Core/Core.cs": "public class Core { public int Run() => 1; }\n",
      "tests/Core.Tests/Core.Tests.csproj": testProjectFile("../../src/Core/Core.csproj"),
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, new Core().Run()); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, undefined);
    assert.ok(audit.profile.blockers.includes("The unique C# production/test edge overlaps another project's default compile ownership."));
    assert.deepEqual(audit.coveredButRisky, []);
  });

  it("classifies application wiring and common boundary types", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "Program.cs": "var builder = WebApplication.CreateBuilder(args);\n",
      "OrderRepository.cs": "public class OrderRepository { public async Task Save() { await Task.Delay(1); } }\n",
      "OrderController.cs": "public class OrderController { public int Get(int id) => id; }\n",
      "PaymentClient.cs": "public class PaymentClient { private readonly HttpClient client = new(); public int Run() => 1; }\n",
      "Tests.cs": "public class Tests { [Fact] public void Runs() { Assert.True(true); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.deepEqual(audit.untestedCandidates.map((target) => [target.path, target.kind, target.recommendedTestLevel]), [
      ["OrderController.cs", "http-controller", "unit"],
      ["OrderRepository.cs", "repository", "integration"],
      ["PaymentClient.cs", "client", "integration"]
    ]);
    assert.deepEqual(audit.skipped.map((target) => [target.path, target.preferredCoveragePath]), [["Program.cs", "integration"]]);
  });

  it("masks line comments, interpolated, verbatim, and character literals", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "Hidden.cs": "public static class Hidden { public static int Run() => 1; }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [Fact] public void IgnoresText() {",
        "    // Hidden.Run();",
        "    var one = $\"Hidden.Run() {1}\";",
        "    var two = @\"Hidden.Run() \"\"quoted\"\"\";",
        "    var three = $@\"Hidden.Run() {one}\";",
        "    var four = @$\"Hidden.Run() {two}\";",
        "    var slash = '\\\\';",
        "    Assert.NotNull(one + two + three + four + slash);",
        "  }",
        "}"
      ].join("\n")
    });

    assert.deepEqual(auditCSharpRepo(root).coveredButRisky, []);
  });

  it("reports low confidence for an empty directory", (t) => {
    const root = createRepo(t, {});
    assert.equal(auditCSharpRepo(root).profile.confidence, "low");
  });
});

function projectFile(framework, extra = "") {
  return `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework>${extra}</PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" /><PackageReference Include="${framework}" /></ItemGroup></Project>`;
}

function productionProjectFile(targetFramework = "net10.0") {
  return `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>${targetFramework}</TargetFramework></PropertyGroup></Project>`;
}

function testProjectFile(reference, targetFramework = "net10.0") {
  const target = targetFramework ? `<TargetFramework>${targetFramework}</TargetFramework>` : "";
  return `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>${target}<IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" /><PackageReference Include="xunit" /><ProjectReference Include="${reference}" /></ItemGroup></Project>`;
}

function createRepo(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-csharp-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return root;
}
