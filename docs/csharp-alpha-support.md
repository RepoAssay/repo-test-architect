# C# Experimental Support

The C# adapter is experimental. Its bounded slices prove that one conventional SDK-style test project or one unique literal production/test project edge, including that pair amid unrelated projects, can flow through project detection, audit, ranking, planning, explanations, findings, stats, CLI/MCP-shaped calls, golden snapshots, and model-consistency checks without a C#-specific report format.

## Supported Boundary

| Area | Supported in this slice | Evidence or blocker boundary |
| --- | --- | --- |
| Project shape | Exactly one root SDK-style test `.csproj`, or one unique literal production/test edge using `Microsoft.NET.Sdk` or a direct derivative such as the Web SDK; unrelated projects remain separate | Two valid test edges, overlapping aggregate roots, and non-SDK projects are not merged into one owner |
| Project-pair edge | The selected test project has exactly one literal repository-contained `ProjectReference` resolving to the selected production project; the production project has no project edges | Property-expanded, wildcard, absolute, escaping, missing, additional, reverse, ambiguous, and transitive edges block command selection |
| Inherited metadata | The nearest exact-cased, non-symbolic, repository-local `Directory.Build.props` may supply literal unconditional `<TargetFramework>`, `<IsTestProject>`, and supported test-package `Include` declarations; project-local values retain precedence | Imports, conditional relevant groups/items, property expansion, inherited project/compile items, and symbolic props paths block command selection |
| Central package versions | The nearest exact-cased, non-symbolic, repository-local `Directory.Packages.props` may supply one static `PackageVersion` per selected-project package; central enablement is a literal unconditional boolean in the project, build props, or package props, and a version may use one exact same-file literal property alias | Imports, conditions, repeated or missing versions, chained/unresolved properties, dynamic IDs, local `Version`/`VersionOverride`, global references, and symbolic paths block command selection |
| Target framework | One static local or inherited `<TargetFramework>` per project; a pair uses the same literal value | `<TargetFrameworks>`, repeated, property-expanded, or mismatched pair values block command selection |
| Source ownership | Default SDK compile ownership below the selected production project directory; collocated single-project source remains owned below the audit root | Test-project helpers are not candidates; `bin`, `obj`, dependencies, fixtures, and custom `Compile` graphs are excluded |
| Test project | `Microsoft.NET.Test.Sdk` or static `<IsTestProject>true</IsTestProject>` plus a supported framework package | The exact test SDK remains required for the bounded native command |
| Frameworks | xUnit `[Fact]`/`[Theory]`, NUnit `[Test]`/`[TestCase]`/`[TestCaseSource]`, and MSTest `[TestMethod]`/`[DataTestMethod]` | Package and runnable attributed-test evidence must agree |
| Command | `dotnet test <test-project>.csproj` | Emitted only when project, edge, target, compile, test-runner, and ownership checks are complete |
| Direct evidence | One uniquely owned class, record, or struct used through `Type.Method(...)`, `new Type(...)`, an exact local initialized with `new Type(...)`, or an exact `private readonly Type field` inside one test class | Test-local declarations, duplicate source types, comments, strings, characters, and unused names contribute nothing |
| Receiver/result usage | A stable concrete local or exact private readonly concrete test field can prove `value.Method(...)`; fields use exact inline `new()`/`new Type(...)` or one assignment in the class's sole parameterless constructor. The direct call, one stable assigned local result, or one top-level inline `out var` consumed by `Assert.*` or `.Should(...)` is `asserted` | Receiver/result reassignment, predeclared/explicitly typed/multiple/nested `out` declarations, `ref`/`out` forwarding, mutable/static/interface/property/inherited/helper/partial field identity, multiple constructors, local shadows, nested local functions, deferred lambdas, and deeper result flow are rejected |
| Naming evidence | A unique `Foo.cs` to `FooTest.cs`/`FooTests.cs`/`FooSpec.cs`/`FooSpecs.cs` fallback | Used only when the same test has no stronger direct evidence for that source file |

The adapter classifies branching and fallible behavior, service and external boundaries, parsers, validators, calculators, formatters, mappers, repositories, controllers, and clients. Generated files, application startup wiring, data-only models, and interfaces are deferred with explicit reasons rather than promoted as direct test targets.

## Checked Fixtures

`examples/csharp-sdk-xunit-basic` is a collocated SDK-style xUnit test project targeting `net10.0`. It contains one directly asserted `PriceParser`, one untested branching `CheckoutService`, and one deferred data-only `CheckoutRequest`. The fixture uses the package versions emitted by the installed .NET 10.0.302 SDK template and passes:

```sh
dotnet test CheckoutRules.Tests.csproj
```

The ordinary adapter audit does not execute `dotnet`, MSBuild, NuGet restore, source generators, target-repository code, or tests. The reported command is deterministic repository guidance; native execution is a fixture-validation gate performed separately.

`examples/csharp-sdk-project-pair` contains `src/CheckoutRules/CheckoutRules.csproj` and `tests/CheckoutRules.Tests/CheckoutRules.Tests.csproj` connected by one literal relative `ProjectReference`. It keeps test helpers outside the candidate set, carries direct asserted evidence from a static call to `DiscountCalculator`, follows an exact `CheckoutService` local receiver through one result into xUnit, and defers the data-only `CheckoutRequest`. The fixture passes:

```sh
dotnet test tests/CheckoutRules.Tests/CheckoutRules.Tests.csproj
```

`examples/csharp-sdk-unique-pair` adds unrelated Worker and benchmark projects around one Pricing/Pricing.Tests edge. Its root `Directory.Build.props` supplies the shared static target framework, while `Directory.Packages.props` supplies the selected test project's versions through literal entries and one same-file property alias. Detection collapses only the exact pair, direct audit excludes unrelated source, and the fixture locks both props setup signals, the central-package convention, command, and asserted inline `out var` result from a `private readonly` target-typed field through golden and model-consistency artifacts. It passes:

```sh
dotnet test tests/Pricing.Tests/Pricing.Tests.csproj
```

## Live Validation

The first pinned live probe audits [`aelassas/tdd`](https://github.com/aelassas/tdd) at `aa81c10a1f251ed7f4c7fa3a64a79780a9f3f4fe`. Project detection collapses its literal `net8.0` production/test pair to one supported root, selects the exact test-project command, and reports four covered-but-risky behavioral classes plus two deferred interfaces with no blockers. Five repeated audits are digest-stable with a 70.4 ms median.

Native validation builds cleanly and executes all 26 tests. Twenty-two pass on Darwin; four file-loader tests fail because their fixture paths use Windows backslashes and the upstream workflow runs on `windows-latest`. The static audit had already classified that loader as a high-risk external boundary and recommended integration-level review. See the [C# TDD Live Validation Report](csharp-tdd-validation-report.md).

The receiver/result follow-up preserves all four candidate classifications and all five direct relationships while upgrading usage from one asserted/four called to four asserted/one called. `Translator`, `TranslatorLoader`, and `TranslatorParser` gain assertion proof; `TranslatorException` remains conservatively called. Five follow-up audits are digest-stable with a 72.0 ms median.

The second pinned probe audits [`jjosh102/sharp-cast`](https://github.com/jjosh102/sharp-cast) at `57cd4f345af3d98698f9227b6b4de610c131686c`. Its four-project repository contains one unique xUnit-to-library edge plus unrelated Blazor and benchmark projects. The adapter selects the exact pair, emits a command that passes 165/165 upstream tests, and excludes every unrelated source file. Its field-receiver follow-up moves `JsonToCSharpConverter` and `TypeScriptToCSharpConverter` into covered evidence, changing the result from `7 / 4 / 1` with five relationships to `5 / 6 / 1` with eight. The inline-out follow-up preserves those counts while upgrading both JSON relationships and `CSharpToTypeScriptConverter` from called to asserted, producing six asserted and two called relationships. Five audits are digest-stable with a 28.3 ms median. See the [C# Sharp Cast Live Validation Report](csharp-sharp-cast-validation-report.md).

The third pinned probe audits [`kthompson/glob`](https://github.com/kthompson/glob) at `719a8593b7c7c085c832e5580f753355ce7ded85`. The selected library/test pair inherits `net8.0` from the root props file while an unrelated conditional build-tool package remains outside the admitted metadata. Detection keeps the Blazor app and benchmark separate, the exact test command has no blockers, and five audits are digest-stable with a 22.5 ms median. The local net8 test host passed all 179 tests through .NET 10's major-version roll-forward after full Git history was restored. See the [C# Glob Live Validation Report](csharp-glob-validation-report.md).

The fourth pinned probe audits [`efcore/EFCore.CheckConstraints`](https://github.com/efcore/EFCore.CheckConstraints) at `20f0df70cbde15df054dd9f3633b3b974051dc54`. Its two selected projects use versionless package references, literal central enablement in `Directory.Build.props`, and a `Directory.Packages.props` that combines literal versions with one same-file `$(EFCoreVersion)` alias. The exact command has no blockers, five audits are digest-stable with a 12.5 ms median, and the unchanged native command passes all 118 tests. See the [C# Central Packages Live Validation Report](csharp-central-packages-validation-report.md).

## Explicit Exclusions

The first slice does not claim:

- `.sln` or `.slnx` ownership
- more than one selectable production/test project edge, transitive project edges, multiple references, or solution-wide ownership
- `Directory.Build.targets`, imported SDKs, imported or chained props, conditional relevant metadata, property-expanded inherited metadata, or evaluated MSBuild graphs
- custom, removed, or explicitly included `Compile` items
- multi-targeted projects
- conditional, imported, chained, repeated, overridden, global, or symbolic central package metadata; custom test adapters; Microsoft.Testing.Platform-only layouts; or framework/package versions inferred through external properties
- namespace, alias, partial-type joining, generic-type, overload, target-typed construction outside the exact supported field shape, receiver/result reassignment, mutable/static/interface/property/inherited/helper field identity, helper-return, predeclared/explicitly typed/multiple/nested `out` declarations, `ref`/`out` forwarding, nested local-function, deferred-lambda, mock, reflection, source-generator, or dependency-graph resolution
- cross-project evidence outside the one verified production/test edge, or any transitive evidence

Literal pair selection now covers a unique test edge amid unrelated projects without claiming solution ownership, Sharp Cast proves exact test-class field receivers initialized through target-typed `new()` plus one stable inline `out var` result, Glob proves bounded nearest-file inherited metadata, and EFCore.CheckConstraints proves bounded central versions. Broader MSBuild evaluation, conditional or overridden central versions, and explicitly typed or multi-output flow remain pressure only when another pinned repository justifies them.
