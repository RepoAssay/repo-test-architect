# C# Experimental Support

The C# adapter is experimental. Its bounded slices prove that one conventional SDK-style test project or one literal production/test project pair can flow through project detection, audit, ranking, planning, explanations, findings, stats, CLI/MCP-shaped calls, golden snapshots, and model-consistency checks without a C#-specific report format.

## Supported Boundary

| Area | Supported in this slice | Evidence or blocker boundary |
| --- | --- | --- |
| Project shape | Exactly one root SDK-style test `.csproj`, or exactly one production project and one test project using `Microsoft.NET.Sdk` or a direct derivative such as the Web SDK | Larger graphs, two test projects, two production projects, and non-SDK projects are not merged into one owner |
| Project-pair edge | The test project has exactly one literal repository-contained `ProjectReference` resolving to the production project; the production project has no project edges | Property-expanded, wildcard, absolute, escaping, missing, additional, reverse, and transitive edges block command selection |
| Target framework | One static `<TargetFramework>` per project; a pair uses the same literal value | `<TargetFrameworks>`, repeated, property-expanded, or mismatched pair values block command selection |
| Source ownership | Default SDK compile ownership below the selected production project directory; collocated single-project source remains owned below the audit root | Test-project helpers are not candidates; `bin`, `obj`, dependencies, fixtures, and custom `Compile` graphs are excluded |
| Test project | `Microsoft.NET.Test.Sdk` or static `<IsTestProject>true</IsTestProject>` plus a supported framework package | The exact test SDK remains required for the bounded native command |
| Frameworks | xUnit `[Fact]`/`[Theory]`, NUnit `[Test]`/`[TestCase]`/`[TestCaseSource]`, and MSTest `[TestMethod]`/`[DataTestMethod]` | Package and runnable attributed-test evidence must agree |
| Command | `dotnet test <test-project>.csproj` | Emitted only when project, edge, target, compile, test-runner, and ownership checks are complete |
| Direct evidence | One uniquely owned class, record, or struct used through `Type.Method(...)` or `new Type(...)` in a runnable test | Test-local declarations, duplicate source types, comments, strings, characters, and unused names contribute nothing |
| Assertion usage | Direct calls inside an `Assert.*` or `.Should(...)` statement are `asserted`; other exact calls are `called` | The adapter does not infer result flow through locals or helper assertions |
| Naming evidence | A unique `Foo.cs` to `FooTest.cs`/`FooTests.cs`/`FooSpec.cs`/`FooSpecs.cs` fallback | Used only when the same test has no stronger direct evidence for that source file |

The adapter classifies branching and fallible behavior, service and external boundaries, parsers, validators, calculators, formatters, mappers, repositories, controllers, and clients. Generated files, application startup wiring, data-only models, and interfaces are deferred with explicit reasons rather than promoted as direct test targets.

## Checked Fixtures

`examples/csharp-sdk-xunit-basic` is a collocated SDK-style xUnit test project targeting `net10.0`. It contains one directly asserted `PriceParser`, one untested branching `CheckoutService`, and one deferred data-only `CheckoutRequest`. The fixture uses the package versions emitted by the installed .NET 10.0.302 SDK template and passes:

```sh
dotnet test CheckoutRules.Tests.csproj
```

The ordinary adapter audit does not execute `dotnet`, MSBuild, NuGet restore, source generators, target-repository code, or tests. The reported command is deterministic repository guidance; native execution is a fixture-validation gate performed separately.

`examples/csharp-sdk-project-pair` contains `src/CheckoutRules/CheckoutRules.csproj` and `tests/CheckoutRules.Tests/CheckoutRules.Tests.csproj` connected by one literal relative `ProjectReference`. It keeps test helpers outside the candidate set, carries direct asserted evidence from the test project to `DiscountCalculator`, leaves `CheckoutService` untested, and defers the data-only `CheckoutRequest`. The fixture passes:

```sh
dotnet test tests/CheckoutRules.Tests/CheckoutRules.Tests.csproj
```

## Explicit Exclusions

The first slice does not claim:

- `.sln` or `.slnx` ownership
- more than one production/test project pair, transitive project edges, or multiple references
- `Directory.Build.props`, `Directory.Build.targets`, imported SDKs, conditional properties, or evaluated MSBuild graphs
- custom, removed, or explicitly included `Compile` items
- multi-targeted projects
- central package management, custom test adapters, Microsoft.Testing.Platform-only layouts, or framework versions inferred through imported properties
- namespace, alias, partial-type, generic-type, overload, receiver, local-result, helper, mock, reflection, source-generator, or dependency-graph resolution
- cross-project evidence outside the one verified production/test edge, or any transitive evidence

The next ownership slice should pressure this pair boundary against representative live repositories before deciding whether solution files, central package management, or deeper call evidence are the more valuable expansion.
