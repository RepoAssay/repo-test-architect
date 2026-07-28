# C# Experimental Support

The C# adapter is experimental. Its first bounded slice proves that one conventional SDK-style test project can flow through project detection, audit, ranking, planning, explanations, findings, stats, CLI/MCP-shaped calls, golden snapshots, and model-consistency checks without a C#-specific report format.

## Supported Boundary

| Area | Supported in this slice | Evidence or blocker boundary |
| --- | --- | --- |
| Project shape | Exactly one root SDK-style `.csproj` using `Microsoft.NET.Sdk` or a direct derivative such as the Web SDK | Multiple root projects, non-SDK projects, and nested projects are not merged into one owner |
| Target framework | One static `<TargetFramework>` | `<TargetFrameworks>`, repeated or property-expanded values block command selection |
| Source ownership | Default SDK compile ownership for repository-contained `.cs` files below the project root | `bin`, `obj`, dependencies, fixtures, and nested `.csproj` roots are excluded; custom `Compile` graphs block the command |
| Test project | `Microsoft.NET.Test.Sdk` or static `<IsTestProject>true</IsTestProject>` plus a supported framework package | The exact test SDK remains required for the bounded native command |
| Frameworks | xUnit `[Fact]`/`[Theory]`, NUnit `[Test]`/`[TestCase]`/`[TestCaseSource]`, and MSTest `[TestMethod]`/`[DataTestMethod]` | Package and runnable attributed-test evidence must agree |
| Command | `dotnet test <root-project>.csproj` | Emitted only when project, target, compile, test-runner, and ownership checks are complete |
| Direct evidence | One uniquely owned class, record, or struct used through `Type.Method(...)` or `new Type(...)` in a runnable test | Test-local declarations, duplicate source types, comments, strings, characters, and unused names contribute nothing |
| Assertion usage | Direct calls inside an `Assert.*` or `.Should(...)` statement are `asserted`; other exact calls are `called` | The adapter does not infer result flow through locals or helper assertions |
| Naming evidence | A unique `Foo.cs` to `FooTest.cs`/`FooTests.cs`/`FooSpec.cs`/`FooSpecs.cs` fallback | Used only when the same test has no stronger direct evidence for that source file |

The adapter classifies branching and fallible behavior, service and external boundaries, parsers, validators, calculators, formatters, mappers, repositories, controllers, and clients. Generated files, application startup wiring, data-only models, and interfaces are deferred with explicit reasons rather than promoted as direct test targets.

## Checked Fixture

`examples/csharp-sdk-xunit-basic` is a collocated SDK-style xUnit test project targeting `net10.0`. It contains one directly asserted `PriceParser`, one untested branching `CheckoutService`, and one deferred data-only `CheckoutRequest`. The fixture uses the package versions emitted by the installed .NET 10.0.302 SDK template and passes:

```sh
dotnet test CheckoutRules.Tests.csproj
```

The ordinary adapter audit does not execute `dotnet`, MSBuild, NuGet restore, source generators, target-repository code, or tests. The reported command is deterministic repository guidance; native execution is a fixture-validation gate performed separately.

## Explicit Exclusions

The first slice does not claim:

- `.sln` or `.slnx` ownership
- separate production and test projects connected by `ProjectReference`
- `Directory.Build.props`, `Directory.Build.targets`, imported SDKs, conditional properties, or evaluated MSBuild graphs
- custom, removed, or explicitly included `Compile` items
- multi-targeted projects
- central package management, custom test adapters, Microsoft.Testing.Platform-only layouts, or framework versions inferred through imported properties
- namespace, alias, partial-type, generic-type, overload, receiver, local-result, helper, mock, reflection, source-generator, or dependency-graph resolution
- cross-project or transitive evidence

The next ownership slice should model a literal repository-contained production/test project pair before solution graphs or deeper call evidence are attempted.
