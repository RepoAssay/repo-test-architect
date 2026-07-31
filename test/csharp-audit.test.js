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

  it("audits a repository-owned xUnit Microsoft.Testing.Platform v2 project pair", (t) => {
    const root = createRepo(t, {
      "global.json": [
        "{",
        "  // The repository owns both the SDK and test runner.",
        "  \"sdk\": { \"version\": \"10.0.300\" },",
        "  \"test\": { \"runner\": \"Microsoft.Testing.Platform\" }",
        "}"
      ].join("\n"),
      "Directory.Packages.props": [
        "<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup>",
        "<PackageVersion Include=\"xunit.v3.mtp-v2\" Version=\"3.2.2\" />",
        "<PackageVersion Include=\"Microsoft.Testing.Platform.MSBuild\" Version=\"2.2.3\" />",
        "</ItemGroup></Project>"
      ].join(""),
      "src/Core/Core.csproj": productionProjectFile("net10.0"),
      "src/Core/Core.cs": "public static class Core { public static int Run() => 1; }\n",
      "tests/Core.Tests/Core.Tests.csproj": [
        "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net10.0</TargetFramework>",
        "<OutputType>Exe</OutputType></PropertyGroup><ItemGroup>",
        "<PackageReference Include=\"xunit.v3.mtp-v2\" />",
        "<PackageReference Include=\"Microsoft.Testing.Platform.MSBuild\" />",
        "<ProjectReference Include=\"../../src/Core/Core.csproj\" />",
        "</ItemGroup></Project>"
      ].join(""),
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, Core.Run()); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, "dotnet test tests/Core.Tests/Core.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.profile.testFrameworks, ["xunit"]);
    assert.ok(audit.profile.detectedConventions.includes("repository-owned Microsoft.Testing.Platform v2 runner"));
    assert.ok(audit.profile.setupSignals.includes("global.json"));
    assert.ok(audit.profile.setupSignals.includes("Microsoft.Testing.Platform.MSBuild@2.2.3"));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/Core/Core.cs"]);
  });

  it("uses exclusive net10 targets as the bounded MTP runner context when global.json does not pin an SDK", (t) => {
    const root = createRepo(t, {
      "global.json": "{\"test\":{\"runner\":\"Microsoft.Testing.Platform\"}}",
      "Example.Tests.csproj": [
        "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net10.0</TargetFramework><OutputType>Exe</OutputType></PropertyGroup><ItemGroup>",
        "<PackageReference Include=\"xunit.v3.mtp-v2\" Version=\"3.2.2\" />",
        "<PackageReference Include=\"Microsoft.Testing.Platform.MSBuild\" Version=\"2.2.1\" />",
        "</ItemGroup></Project>"
      ].join(""),
      "Source.cs": "public static class Source { public static int Run() => 1; }\n",
      "SourceTests.cs": "public class SourceTests { [Fact] public void Runs() { Assert.Equal(1, Source.Run()); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, "dotnet test Example.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.detectedConventions.includes("repository-owned Microsoft.Testing.Platform v2 runner"));
  });

  it("audits repository-versioned MSTest.Sdk v4 MTP project ownership", (t) => {
    const root = createRepo(t, {
      "global.json": [
        "{",
        "  \"sdk\": { \"version\": \"10.0.302\" },",
        "  \"msbuild-sdks\": { \"MSTest.Sdk\": \"4.3.3\" },",
        "  \"test\": { \"runner\": \"Microsoft.Testing.Platform\" }",
        "}"
      ].join("\n"),
      "src/Core/Core.csproj": productionProjectFile("net10.0"),
      "src/Core/Core.cs": "public static class Core { public static int Run() => 1; }\n",
      "tests/Core.Tests/Core.Tests.csproj": [
        "<Project Sdk=\"MSTest.Sdk\"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup><ItemGroup>",
        "<ProjectReference Include=\"../../src/Core/Core.csproj\" />",
        "</ItemGroup></Project>"
      ].join(""),
      "tests/Core.Tests/CoreTests.cs": "[TestClass] public class CoreTests { [TestMethod] public void Runs() { Assert.AreEqual(1, Core.Run()); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, "dotnet test tests/Core.Tests/Core.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.profile.testFrameworks, ["mstest"]);
    assert.ok(audit.profile.detectedConventions.includes("repository-owned MSTest.Sdk v4 MTP runner"));
    assert.ok(audit.profile.setupSignals.includes("MSTest.Sdk@4.3.3"));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/Core/Core.cs"]);
  });

  it("audits an inline-versioned MSTest.Sdk v4 project", (t) => {
    const root = createRepo(t, {
      "global.json": "{\"sdk\":{\"version\":\"10.0.302\"},\"test\":{\"runner\":\"Microsoft.Testing.Platform\"}}",
      "Example.Tests.csproj": "<Project Sdk=\"MSTest.Sdk/4.1.0\"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>",
      "Source.cs": "public static class Source { public static int Run() => 1; }\n",
      "SourceTests.cs": "[TestClass] public class SourceTests { [TestMethod] public void Runs() { Assert.AreEqual(1, Source.Run()); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, "dotnet test Example.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.profile.testFrameworks, ["mstest"]);
    assert.ok(audit.profile.setupSignals.includes("MSTest.Sdk@4.1.0"));
  });

  it("keeps incomplete and non-native MSTest.Sdk ownership blocked", (t) => {
    const cases = [
      ["missing SDK version", "MSTest.Sdk", "{\"sdk\":{\"version\":\"10.0.302\"},\"test\":{\"runner\":\"Microsoft.Testing.Platform\"}}", ""],
      ["MSTest v3", "MSTest.Sdk/3.11.0", "{\"sdk\":{\"version\":\"10.0.302\"},\"test\":{\"runner\":\"Microsoft.Testing.Platform\"}}", ""],
      ["VSTest opt-in", "MSTest.Sdk/4.3.3", "{\"sdk\":{\"version\":\"10.0.302\"},\"test\":{\"runner\":\"Microsoft.Testing.Platform\"}}", "<UseVSTest>true</UseVSTest>"],
      ["missing runner", "MSTest.Sdk/4.3.3", "{\"sdk\":{\"version\":\"10.0.302\"}}", ""],
      ["helper library", "MSTest.Sdk/4.3.3", "{\"sdk\":{\"version\":\"10.0.302\"},\"test\":{\"runner\":\"Microsoft.Testing.Platform\"}}", "<IsTestApplication>false</IsTestApplication>"]
    ];

    for (const [label, sdk, globalJson, metadata] of cases) {
      const root = createRepo(t, {
        "global.json": globalJson,
        "Example.Tests.csproj": `<Project Sdk="${sdk}"><PropertyGroup><TargetFramework>net10.0</TargetFramework>${metadata}</PropertyGroup></Project>`,
        "Source.cs": "public static class Source { public static int Run() => 1; }\n",
        "SourceTests.cs": "[TestClass] public class SourceTests { [TestMethod] public void Runs() { Assert.AreEqual(1, Source.Run()); } }\n"
      });
      const audit = auditCSharpRepo(root);
      assert.equal(audit.profile.testCommand, undefined, label);
      assert.ok(audit.profile.blockers.some((blocker) => blocker.startsWith("Native MSTest.Sdk requires")), label);
    }
  });

  it("keeps incomplete Microsoft.Testing.Platform ownership blocked", (t) => {
    const cases = [
      ["missing global.json", undefined, "2.2.3"],
      ["VSTest runner", "{\"sdk\":{\"version\":\"10.0.300\"},\"test\":{\"runner\":\"VSTest\"}}", "2.2.3"],
      ["pre-.NET 10 SDK", "{\"sdk\":{\"version\":\"9.0.300\"},\"test\":{\"runner\":\"Microsoft.Testing.Platform\"}}", "2.2.3"],
      ["MTP v1 host", "{\"sdk\":{\"version\":\"10.0.300\"},\"test\":{\"runner\":\"Microsoft.Testing.Platform\"}}", "1.9.1"],
      ["malformed global.json", "{\"test\":", "2.2.3"]
    ];

    for (const [label, globalJson, hostVersion] of cases) {
      const files = {
        "Example.Tests.csproj": [
          "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net10.0</TargetFramework><OutputType>Exe</OutputType></PropertyGroup><ItemGroup>",
          `<PackageReference Include="xunit.v3.mtp-v2" Version="3.2.2" />`,
          `<PackageReference Include="Microsoft.Testing.Platform.MSBuild" Version="${hostVersion}" />`,
          "</ItemGroup></Project>"
        ].join(""),
        "Source.cs": "public static class Source { public static int Run() => 1; }\n",
        "SourceTests.cs": "public class SourceTests { [Fact] public void Runs() { Assert.Equal(1, Source.Run()); } }\n"
      };
      if (globalJson !== undefined) files["global.json"] = globalJson;
      const audit = auditCSharpRepo(createRepo(t, files));
      assert.equal(audit.profile.testCommand, undefined, label);
      assert.ok(audit.profile.blockers.some((blocker) => blocker.startsWith("Native Microsoft.Testing.Platform v2 requires")), label);
      if (label === "malformed global.json") {
        assert.ok(audit.profile.blockers.includes("global.json requires bounded static metadata: malformed global.json."));
      }
    }
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

  it("resolves one exact target-framework property alias from Directory.Build.props", (t) => {
    const root = createRepo(t, {
      "global.json": [
        "{",
        "  \"sdk\": { \"version\": \"10.0.302\" },",
        "  \"msbuild-sdks\": { \"MSTest.Sdk\": \"4.3.3\" },",
        "  \"test\": { \"runner\": \"Microsoft.Testing.Platform\" }",
        "}"
      ].join("\n"),
      "Directory.Build.props": "<Project><PropertyGroup><MainTargetFramework>net10.0</MainTargetFramework></PropertyGroup></Project>",
      "src/Core/Core.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>$(MainTargetFramework)</TargetFramework></PropertyGroup></Project>",
      "src/Core/Core.cs": "public static class Core { public static int Run() => 1; }\n",
      "tests/Core.Tests/Core.Tests.csproj": [
        "<Project Sdk=\"MSTest.Sdk\"><PropertyGroup><TargetFramework>$(MainTargetFramework)</TargetFramework></PropertyGroup><ItemGroup>",
        "<ProjectReference Include=\"../../src/Core/Core.csproj\" />",
        "</ItemGroup></Project>"
      ].join(""),
      "tests/Core.Tests/CoreTests.cs": "[TestClass] public class CoreTests { [TestMethod] public void Runs() { Assert.AreEqual(1, Core.Run()); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, "dotnet test tests/Core.Tests/Core.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.detectedConventions.includes("bounded root target-framework property alias"));
    assert.ok(audit.profile.detectedConventions.includes("inherited Directory.Build.props metadata"));
    assert.ok(audit.profile.setupSignals.includes("MainTargetFramework=net10.0"));
    assert.equal(audit.profile.setupSignals.filter((signal) => signal === "MainTargetFramework=net10.0").length, 1);
  });

  it("resolves one exact multi-target property alias from Directory.Build.props", (t) => {
    const root = createRepo(t, {
      "Directory.Build.props": "<Project><PropertyGroup><SupportedTargets>net9.0;net10.0</SupportedTargets></PropertyGroup></Project>",
      "Example.Tests.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFrameworks>$(SupportedTargets)</TargetFrameworks><IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><PackageReference Include=\"Microsoft.NET.Test.Sdk\" /><PackageReference Include=\"xunit\" /></ItemGroup></Project>",
      "Tests.cs": "public class Tests { [Fact] public void Runs() { Assert.True(true); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, "dotnet test Example.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.architectures.includes("dotnet-multi-target-project"));
    assert.ok(audit.profile.setupSignals.includes("SupportedTargets=net9.0;net10.0"));
  });

  it("keeps non-literal and non-root target-framework aliases blocked", (t) => {
    const cases = [
      ["conditional group", "<Project><PropertyGroup Condition=\"'$(Mode)' == 'test'\"><MainTargetFramework>net10.0</MainTargetFramework></PropertyGroup></Project>"],
      ["conditional property", "<Project><PropertyGroup><MainTargetFramework Condition=\"'$(Mode)' == 'test'\">net10.0</MainTargetFramework></PropertyGroup></Project>"],
      ["chained property", "<Project><PropertyGroup><MainTargetFramework>$(Framework)</MainTargetFramework></PropertyGroup></Project>"],
      ["repeated property", "<Project><PropertyGroup><MainTargetFramework>net9.0</MainTargetFramework><MainTargetFramework>net10.0</MainTargetFramework></PropertyGroup></Project>"],
      ["nested property", "<Project><PropertyGroup><Container><MainTargetFramework>net10.0</MainTargetFramework></Container></PropertyGroup></Project>"],
      ["target-owned property", "<Project><Target Name=\"SetFramework\"><PropertyGroup><MainTargetFramework>net10.0</MainTargetFramework></PropertyGroup></Target></Project>"]
    ];

    for (const [label, props] of cases) {
      const root = createRepo(t, {
        "Directory.Build.props": props,
        "Example.Tests.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>$(MainTargetFramework)</TargetFramework><IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><PackageReference Include=\"Microsoft.NET.Test.Sdk\" /><PackageReference Include=\"xunit\" /></ItemGroup></Project>",
        "Tests.cs": "public class Tests { [Fact] public void Runs() { Assert.True(true); } }\n"
      });
      const audit = auditCSharpRepo(root);
      assert.equal(audit.profile.testCommand, undefined, label);
      assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("property-expanded metadata")), label);
    }

    const localOnly = createRepo(t, {
      "Example.Tests.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><MainTargetFramework>net10.0</MainTargetFramework><TargetFramework>$(MainTargetFramework)</TargetFramework><IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><PackageReference Include=\"Microsoft.NET.Test.Sdk\" /><PackageReference Include=\"xunit\" /></ItemGroup></Project>",
      "Tests.cs": "public class Tests { [Fact] public void Runs() { Assert.True(true); } }\n"
    });
    assert.equal(auditCSharpRepo(localOnly).profile.testCommand, undefined);
    assert.ok(auditCSharpRepo(localOnly).profile.blockers.some((blocker) => blocker.includes("property-expanded metadata")));
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

  it("credits exact framework exception-assertion expression lambdas", (t) => {
    const xunit = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "XunitThrower.cs": "public static class XunitThrower { public static void Run() => throw new System.Exception(); }\n",
      "XunitAsyncThrower.cs": "public static class XunitAsyncThrower { public static System.Threading.Tasks.Task RunAsync() => throw new System.Exception(); }\n",
      "XunitConstructor.cs": "public class XunitConstructor { public XunitConstructor() => throw new System.Exception(); }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [Fact] public void Sync() { Assert.Throws<System.Exception>(() => XunitThrower.Run()); }",
        "  [Fact] public async System.Threading.Tasks.Task Async() { await Assert.ThrowsAsync<System.Exception>(async () => await XunitAsyncThrower.RunAsync()); }",
        "  [Fact] public void Constructor() { Assert.Throws<System.Exception>(() => new XunitConstructor()); }",
        "}"
      ].join("\n")
    });
    const nunit = createRepo(t, {
      "Example.Tests.csproj": projectFile("NUnit", "<IsTestProject>true</IsTestProject>"),
      "NunitThrower.cs": "public static class NunitThrower { public static void Run() => throw new System.Exception(); }\n",
      "Tests.cs": "public class Tests { [Test] public void Runs() { Assert.Catch<System.Exception>(() => NunitThrower.Run()); } }\n"
    });
    const mstest = createRepo(t, {
      "Example.Tests.csproj": projectFile("MSTest.TestFramework", "<IsTestProject>true</IsTestProject>"),
      "MstestThrower.cs": "public static class MstestThrower { public static void Run() => throw new System.Exception(); }\n",
      "MstestAsyncThrower.cs": "public static class MstestAsyncThrower { public static System.Threading.Tasks.Task RunAsync() => throw new System.Exception(); }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [TestMethod] public void Sync() { Assert.ThrowsException<System.Exception>(() => MstestThrower.Run(), \"must throw\"); }",
        "  [TestMethod] public async System.Threading.Tasks.Task Async() { await Assert.ThrowsExceptionAsync<System.Exception>(async () => await MstestAsyncThrower.RunAsync()); }",
        "}"
      ].join("\n")
    });

    assert.deepEqual(auditCSharpRepo(xunit).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]), [
      ["XunitAsyncThrower.cs", "asserted"],
      ["XunitConstructor.cs", "asserted"],
      ["XunitThrower.cs", "asserted"]
    ]);
    assert.equal(auditCSharpRepo(nunit).coveredButRisky[0].existingTestEvidence[0].usage, "asserted");
    assert.deepEqual(auditCSharpRepo(mstest).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]), [
      ["MstestAsyncThrower.cs", "asserted"],
      ["MstestThrower.cs", "asserted"]
    ]);
  });

  it("rejects ambiguous, block, wrapped, captured, nested, and non-framework exception lambdas", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "AmbiguousOuter.cs": "public static class AmbiguousOuter { public static void Run(int value) { } }\n",
      "AmbiguousInner.cs": "public static class AmbiguousInner { public static int Run() => 1; }\n",
      "BlockThrower.cs": "public static class BlockThrower { public static void Run() { } }\n",
      "WrappedThrower.cs": "public static class WrappedThrower { public static int Run() => 1; }\n",
      "CapturedThrower.cs": "public static class CapturedThrower { public static void Run() { } }\n",
      "NestedThrower.cs": "public static class NestedThrower { public static void Run() { } }\n",
      "CustomThrower.cs": "public static class CustomThrower { public static void Run() { } }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [Fact] public void Ambiguous() { Assert.Throws<System.Exception>(() => AmbiguousOuter.Run(AmbiguousInner.Run())); }",
        "  [Fact] public void Block() { Assert.Throws<System.Exception>(() => { BlockThrower.Run(); }); }",
        "  [Fact] public void Wrapped() { Assert.Throws<System.Exception>(() => Consume(WrappedThrower.Run())); }",
        "  [Fact] public void Captured() { var error = Assert.Throws<System.Exception>(() => CapturedThrower.Run()); }",
        "  [Fact] public void Nested() { if (true) { Assert.Throws<System.Exception>(() => NestedThrower.Run()); } }",
        "  [Fact] public void Custom() { Verify.Throws<System.Exception>(() => CustomThrower.Run()); }",
        "  private static void Consume(int value) { }",
        "}",
        "public static class Verify { public static void Throws<T>(System.Action action) { } }"
      ].join("\n")
    });

    assert.deepEqual(auditCSharpRepo(root).coveredButRisky, []);
    assert.deepEqual(auditCSharpRepo(root).untestedCandidates.map((target) => target.path), [
      "AmbiguousInner.cs",
      "AmbiguousOuter.cs",
      "BlockThrower.cs",
      "CapturedThrower.cs",
      "CustomThrower.cs",
      "NestedThrower.cs",
      "WrappedThrower.cs"
    ]);
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

  it("owns one literal repository-contained Compile include glob", (t) => {
    const root = createRepo(t, {
      "src/Core/Core.csproj": [
        "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup><ItemGroup>",
        "<Compile Include=\"..\\..\\shared\\*.cs\" LinkBase=\"Shared\" />",
        "</ItemGroup></Project>"
      ].join(""),
      "src/Core/Core.cs": "public static class Core { public static int Run() => 1; }\n",
      "shared/SharedRule.cs": "public static class SharedRule { public static int Run() => 2; }\n",
      "tests/Core.Tests/Core.Tests.csproj": testProjectFile("../../src/Core/Core.csproj", "net10.0"),
      "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(2, SharedRule.Run()); } }\n"
    });

    const audit = auditCSharpRepo(root);
    assert.equal(audit.profile.testCommand, "dotnet test tests/Core.Tests/Core.Tests.csproj");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.detectedConventions.includes("literal repository-contained Compile includes"));
    assert.ok(audit.profile.setupSignals.includes("Compile Include=../../shared/*.cs"));
    assert.ok(audit.coveredButRisky.some((target) => target.path === "shared/SharedRule.cs"));
  });

  it("blocks Compile item shapes outside the literal contained glob", (t) => {
    const cases = [
      ["recursive glob", "<ItemGroup><Compile Include=\"../../shared/**/*.cs\" /></ItemGroup>"],
      ["explicit file", "<ItemGroup><Compile Include=\"../../shared/SharedRule.cs\" /></ItemGroup>"],
      ["property expansion", "<ItemGroup><Compile Include=\"$(Shared)/*.cs\" /></ItemGroup>"],
      ["item condition", "<ItemGroup><Compile Include=\"../../shared/*.cs\" Condition=\"'$(Mode)' == 'test'\" /></ItemGroup>"],
      ["group condition", "<ItemGroup Condition=\"'$(Mode)' == 'test'\"><Compile Include=\"../../shared/*.cs\" /></ItemGroup>"],
      ["remove", "<ItemGroup><Compile Remove=\"Generated.cs\" /></ItemGroup>"],
      ["update", "<ItemGroup><Compile Update=\"Generated.cs\" /></ItemGroup>"],
      ["child metadata", "<ItemGroup><Compile Include=\"../../shared/*.cs\"><Link>Shared/%(Filename)%(Extension)</Link></Compile></ItemGroup>"],
      ["multiple includes", "<ItemGroup><Compile Include=\"../../shared/*.cs\" /><Compile Include=\"../../other/*.cs\" /></ItemGroup>"],
      ["escaping glob", "<ItemGroup><Compile Include=\"../../../outside/*.cs\" /></ItemGroup>"],
      ["disabled defaults", "<PropertyGroup><EnableDefaultCompileItems>false</EnableDefaultCompileItems></PropertyGroup>"]
    ];

    for (const [label, compileMetadata] of cases) {
      const root = createRepo(t, {
        "src/Core/Core.csproj": `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup>${compileMetadata}</Project>`,
        "src/Core/Core.cs": "public static class Core { public static int Run() => 1; }\n",
        "shared/SharedRule.cs": "public static class SharedRule { public static int Run() => 2; }\n",
        "tests/Core.Tests/Core.Tests.csproj": testProjectFile("../../src/Core/Core.csproj", "net10.0"),
        "tests/Core.Tests/CoreTests.cs": "public class CoreTests { [Fact] public void Runs() { Assert.Equal(1, Core.Run()); } }\n"
      });
      const audit = auditCSharpRepo(root);
      assert.equal(audit.profile.testCommand, undefined, label);
      assert.ok(audit.profile.blockers.includes("Custom MSBuild Compile item graphs are outside the bounded C# project-pair slice."), label);
      assert.ok(![...audit.untestedCandidates, ...audit.coveredButRisky, ...audit.skipped]
        .some((target) => target.path === "shared/SharedRule.cs"), label);
    }
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

  it("rejects unqualified well-known System type collisions while preserving qualified source calls", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "Boolean.cs": "namespace Product.Types { public static class Boolean { public static int Run() => 1; } }\n",
      "DateTime.cs": "namespace Product.Types { public class DateTime { public static int Parse() => 1; } }\n",
      "Guid.cs": "namespace Product.Types { public class Guid { public static int Parse() => 1; } }\n",
      "String.cs": "namespace Product.Types { public static class String { public static int Run() => 1; } }\n",
      "Tests.cs": [
        "using System;",
        "using Boolean = Product.Types.Boolean;",
        "public class Tests {",
        "  [Fact] public void FrameworkTypes() { _ = new DateTime(); _ = Guid.Parse(); _ = System.String.Concat(\"a\", \"b\"); VerifyFrameworkDateTime(); }",
        "  [Fact] public void QualifiedSource() { Assert.Equal(1, Product.Types.String.Run()); }",
        "  [Fact] public void AliasedSource() { Assert.Equal(1, Boolean.Run()); }",
        "  private static void VerifyFrameworkDateTime() { Assert.Equal(1, DateTime.Parse()); }",
        "}"
      ].join("\n")
    });

    const audit = auditCSharpRepo(root);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["DateTime.cs", "Guid.cs"]);
    assert.deepEqual(audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0]]), [
      ["Boolean.cs", { testPath: "Tests.cs", kind: "csharp-symbol-reference", strength: "direct", usage: "asserted" }],
      ["String.cs", { testPath: "Tests.cs", kind: "csharp-symbol-reference", strength: "direct", usage: "asserted" }]
    ]);
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

  it("tracks one same-class private static test-helper hop as indirect evidence", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "AssertedHelperTarget.cs": "public static class AssertedHelperTarget { public static int Run() => 1; }\n",
      "ResultHelperTarget.cs": "public static class ResultHelperTarget { public static int Run() => 1; }\n",
      "CalledHelperTarget.cs": "public static class CalledHelperTarget { public static void Run() { } }\n",
      "DirectWinsTarget.cs": "public static class DirectWinsTarget { public static void Run() { } }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [Fact] public void AssertedHelper() { VerifyAsserted(); }",
        "  [Fact] public void ResultHelper() { VerifyResult(); }",
        "  [Fact] public void CalledHelper() { CallOnly(); }",
        "  [Fact] public void DirectWins() { VerifyDirectWins(); DirectWinsTarget.Run(); }",
        "  private static void VerifyAsserted() { Assert.Equal(1, AssertedHelperTarget.Run()); }",
        "  private static void VerifyResult() { var result = ResultHelperTarget.Run(); Assert.Equal(1, result); }",
        "  private static void CallOnly() { CalledHelperTarget.Run(); }",
        "  private static void VerifyDirectWins() { DirectWinsTarget.Run(); }",
        "}"
      ].join("\n")
    });

    assert.deepEqual(
      auditCSharpRepo(root).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0]]),
      [
        ["AssertedHelperTarget.cs", { testPath: "Tests.cs", kind: "csharp-test-helper", strength: "indirect", viaUsage: "asserted" }],
        ["CalledHelperTarget.cs", { testPath: "Tests.cs", kind: "csharp-test-helper", strength: "indirect", viaUsage: "called" }],
        ["DirectWinsTarget.cs", { testPath: "Tests.cs", kind: "csharp-symbol-reference", strength: "direct", usage: "called" }],
        ["ResultHelperTarget.cs", { testPath: "Tests.cs", kind: "csharp-test-helper", strength: "indirect", viaUsage: "asserted" }]
      ]
    );
  });

  it("recognizes NUnit and MSTest collection/string assertion owners without crediting xUnit lookalikes", (t) => {
    const mstest = createRepo(t, {
      "Example.Tests.csproj": projectFile("MSTest.TestFramework", "<IsTestProject>true</IsTestProject>"),
      "DirectCollectionTarget.cs": "public static class DirectCollectionTarget { public static int[] Read() => new[] { 1 }; }\n",
      "StableStringTarget.cs": "public static class StableStringTarget { public static string Read() => \"value\"; }\n",
      "HelperCollectionTarget.cs": "public static class HelperCollectionTarget { public static int[] Read() => new[] { 1 }; }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [TestMethod] public void DirectCollection() { CollectionAssert.AreEqual(null, DirectCollectionTarget.Read()); }",
        "  [TestMethod] public void StableString() { var result = StableStringTarget.Read(); StringAssert.Contains(result, \"value\"); }",
        "  [TestMethod] public void HelperCollection() { VerifyCollection(); }",
        "  private static void VerifyCollection() { CollectionAssert.AreEqual(null, HelperCollectionTarget.Read()); }",
        "}"
      ].join("\n")
    });
    const nunit = createRepo(t, {
      "Example.Tests.csproj": projectFile("NUnit", "<IsTestProject>true</IsTestProject>"),
      "NunitStringTarget.cs": "public static class NunitStringTarget { public static string Read() => \"value\"; }\n",
      "Tests.cs": "public class Tests { [Test] public void Reads() { StringAssert.StartsWith(\"val\", NunitStringTarget.Read()); } }\n"
    });
    const xunit = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "LookalikeDirectTarget.cs": "public static class LookalikeDirectTarget { public static int[] Read() => new[] { 1 }; }\n",
      "LookalikeHelperTarget.cs": "public static class LookalikeHelperTarget { public static int[] Read() => new[] { 1 }; }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [Fact] public void Direct() { CollectionAssert.AreEqual(null, LookalikeDirectTarget.Read()); }",
        "  [Fact] public void Helper() { Verify(); }",
        "  private static void Verify() { StringAssert.AreEqual(\"value\", LookalikeHelperTarget.Read()); }",
        "}"
      ].join("\n")
    });

    assert.deepEqual(
      auditCSharpRepo(mstest).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0]]),
      [
        ["DirectCollectionTarget.cs", { testPath: "Tests.cs", kind: "csharp-symbol-reference", strength: "direct", usage: "asserted" }],
        ["HelperCollectionTarget.cs", { testPath: "Tests.cs", kind: "csharp-test-helper", strength: "indirect", viaUsage: "asserted" }],
        ["StableStringTarget.cs", { testPath: "Tests.cs", kind: "csharp-symbol-reference", strength: "direct", usage: "asserted" }]
      ]
    );
    assert.equal(auditCSharpRepo(nunit).coveredButRisky[0].existingTestEvidence[0].usage, "asserted");
    assert.deepEqual(
      auditCSharpRepo(xunit).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0]]),
      [
        ["LookalikeDirectTarget.cs", { testPath: "Tests.cs", kind: "csharp-symbol-reference", strength: "direct", usage: "called" }],
        ["LookalikeHelperTarget.cs", { testPath: "Tests.cs", kind: "csharp-test-helper", strength: "indirect", viaUsage: "called" }]
      ]
    );
  });

  it("recognizes provenance-backed NUnit ClassicAssert without crediting lookalikes", (t) => {
    const nunit = createRepo(t, {
      "Example.Tests.csproj": projectFile("NUnit", "<IsTestProject>true</IsTestProject>"),
      "DirectClassicTarget.cs": "public static class DirectClassicTarget { public static bool Read() => true; }\n",
      "StableClassicTarget.cs": "public static class StableClassicTarget { public static string Read() => \"value\"; }\n",
      "HelperClassicTarget.cs": "public static class HelperClassicTarget { public static int Read() => 1; }\n",
      "AliasedClassicTarget.cs": "public static class AliasedClassicTarget { public static bool Read() => true; }\n",
      "QualifiedClassicTarget.cs": "public static class QualifiedClassicTarget { public static bool Read() => true; }\n",
      "CustomClassicTarget.cs": "public static class CustomClassicTarget { public static bool Read() => true; }\n",
      "LegacyTests.cs": [
        "using NUnit.Framework.Legacy;",
        "public class LegacyTests {",
        "  [Test] public void Direct() { ClassicAssert.IsTrue(DirectClassicTarget.Read()); }",
        "  [Test] public void Stable() { var result = StableClassicTarget.Read(); ClassicAssert.AreEqual(\"value\", result); }",
        "  [Test] public void Helper() { Verify(); }",
        "  private static void Verify() { ClassicAssert.AreEqual(1, HelperClassicTarget.Read()); }",
        "}"
      ].join("\n"),
      "AliasTests.cs": [
        "using ClassicAssert = global::NUnit.Framework.Legacy.ClassicAssert;",
        "public class AliasTests { [Test] public void Reads() { ClassicAssert.IsTrue(AliasedClassicTarget.Read()); } }"
      ].join("\n"),
      "QualifiedTests.cs": "public class QualifiedTests { [Test] public void Reads() { NUnit.Framework.Legacy.ClassicAssert.IsTrue(QualifiedClassicTarget.Read()); } }\n",
      "CustomTests.cs": [
        "using NUnit.Framework.Legacy;",
        "public static class ClassicAssert { public static void IsTrue(bool value) { } }",
        "public class CustomTests { [Test] public void Reads() { ClassicAssert.IsTrue(CustomClassicTarget.Read()); } }"
      ].join("\n")
    });
    const mstest = createRepo(t, {
      "Example.Tests.csproj": projectFile("MSTest.TestFramework", "<IsTestProject>true</IsTestProject>"),
      "LookalikeClassicTarget.cs": "public static class LookalikeClassicTarget { public static bool Read() => true; }\n",
      "Tests.cs": "using NUnit.Framework.Legacy; public class Tests { [TestMethod] public void Reads() { ClassicAssert.IsTrue(LookalikeClassicTarget.Read()); } }\n"
    });
    const sourceCollision = createRepo(t, {
      "Example.Tests.csproj": projectFile("NUnit", "<IsTestProject>true</IsTestProject>"),
      "ClassicAssert.cs": "public static class ClassicAssert { public static void IsTrue(bool value) { } }\n",
      "CollisionTarget.cs": "public static class CollisionTarget { public static bool Read() => true; }\n",
      "Tests.cs": "using NUnit.Framework.Legacy; public class Tests { [Test] public void Reads() { ClassicAssert.IsTrue(CollisionTarget.Read()); } }\n"
    });

    assert.deepEqual(
      auditCSharpRepo(nunit).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0]]),
      [
        ["AliasedClassicTarget.cs", { testPath: "AliasTests.cs", kind: "csharp-symbol-reference", strength: "direct", usage: "asserted" }],
        ["CustomClassicTarget.cs", { testPath: "CustomTests.cs", kind: "csharp-symbol-reference", strength: "direct", usage: "called" }],
        ["DirectClassicTarget.cs", { testPath: "LegacyTests.cs", kind: "csharp-symbol-reference", strength: "direct", usage: "asserted" }],
        ["HelperClassicTarget.cs", { testPath: "LegacyTests.cs", kind: "csharp-test-helper", strength: "indirect", viaUsage: "asserted" }],
        ["QualifiedClassicTarget.cs", { testPath: "QualifiedTests.cs", kind: "csharp-symbol-reference", strength: "direct", usage: "asserted" }],
        ["StableClassicTarget.cs", { testPath: "LegacyTests.cs", kind: "csharp-symbol-reference", strength: "direct", usage: "asserted" }]
      ]
    );
    assert.equal(auditCSharpRepo(mstest).coveredButRisky[0].existingTestEvidence[0].usage, "called");
    assert.deepEqual(
      auditCSharpRepo(sourceCollision).coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [["ClassicAssert.cs", "called"], ["CollisionTarget.cs", "called"]]
    );
  });

  it("rejects uncalled, non-private, overloaded, ambiguous, nested, lambda, and shadowed test helpers", (t) => {
    const root = createRepo(t, {
      "Example.Tests.csproj": projectFile("xunit"),
      "UncalledTarget.cs": "public static class UncalledTarget { public static void Run() { } }\n",
      "PublicTarget.cs": "public static class PublicTarget { public static void Run() { } }\n",
      "OverloadedFirst.cs": "public static class OverloadedFirst { public static void Run() { } }\n",
      "OverloadedSecond.cs": "public static class OverloadedSecond { public static void Run() { } }\n",
      "AmbiguousFirst.cs": "public static class AmbiguousFirst { public static void Run() { } }\n",
      "AmbiguousSecond.cs": "public static class AmbiguousSecond { public static void Run() { } }\n",
      "NestedTarget.cs": "public static class NestedTarget { public static void Run() { } }\n",
      "LambdaTarget.cs": "public static class LambdaTarget { public static void Run() { } }\n",
      "ShadowedTarget.cs": "public static class ShadowedTarget { public static void Run() { } }\n",
      "Tests.cs": [
        "public class Tests {",
        "  [Fact] public void Runs() { PublicHelper(); Overloaded(); Ambiguous(); Nested(); System.Action action = () => LambdaOnly(); action(); void Shadowed() { } Shadowed(); }",
        "  private static void Uncalled() { UncalledTarget.Run(); }",
        "  public static void PublicHelper() { PublicTarget.Run(); }",
        "  private static void Overloaded() { OverloadedFirst.Run(); }",
        "  private static void Overloaded(int value) { OverloadedSecond.Run(); }",
        "  private static void Ambiguous() { AmbiguousFirst.Run(); AmbiguousSecond.Run(); }",
        "  private static void Nested() { if (true) { NestedTarget.Run(); } }",
        "  private static void LambdaOnly() { LambdaTarget.Run(); }",
        "  private static void Shadowed() { ShadowedTarget.Run(); }",
        "}"
      ].join("\n")
    });

    assert.deepEqual(auditCSharpRepo(root).coveredButRisky, []);
    assert.deepEqual(auditCSharpRepo(root).untestedCandidates.map((target) => target.path), [
      "AmbiguousFirst.cs",
      "AmbiguousSecond.cs",
      "LambdaTarget.cs",
      "NestedTarget.cs",
      "OverloadedFirst.cs",
      "OverloadedSecond.cs",
      "PublicTarget.cs",
      "ShadowedTarget.cs",
      "UncalledTarget.cs"
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
