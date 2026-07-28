# C# TDD Live Validation Report

This report records the first pinned public-repository audit for the experimental C# adapter. [`aelassas/tdd`](https://github.com/aelassas/tdd) was cloned and audited locally at [`aa81c10a1f251ed7f4c7fa3a64a79780a9f3f4fe`](https://github.com/aelassas/tdd/tree/aa81c10a1f251ed7f4c7fa3a64a79780a9f3f4fe) on 2026-07-28.

## Repository Shape

The pinned repository is a small .NET 8 solution with exactly two SDK-style projects:

- `src/Translator/Translator.csproj` owns the production library
- `tests/Translator.UnitTests/Translator.UnitTests.csproj` owns the xUnit tests and has one literal relative `ProjectReference` to the production project

Both projects declare the same static `net8.0` target framework. The test project directly declares `Microsoft.NET.Test.Sdk` and xUnit, uses default compile ownership, and does not rely on `Directory.Build.props`, `Directory.Build.targets`, central package management, or a dynamic project edge.

Repository detection collapses the pair to one supported audit root rather than reporting two unrelated projects. The profile selects the exact repository-relative command:

```sh
dotnet test tests/Translator.UnitTests/Translator.UnitTests.csproj
```

## Static Audit Result

The audit completes with high confidence and no blockers.

| Result | Count |
| --- | ---: |
| Detected/audited projects | 1 |
| Production source types | 6 |
| Untested candidates | 0 |
| Covered-but-risky candidates | 4 |
| Deferred contracts | 2 |
| Direct evidence relationships | 5 |

The four behavioral classes remain visible for review instead of disappearing behind a binary covered/uncovered label:

| Source | Classification | Static result | Why it remains useful |
| --- | --- | --- | --- |
| `Translator.cs` | high-risk utility | covered but risky | Branching translation and reverse-lookup behavior has two direct test relationships. |
| `TranslatorLoader.cs` | high-risk external boundary | covered but risky | File-system access is correctly recommended for integration-level review. |
| `TranslatorParser.cs` | high-risk parser | covered but risky | Branching and malformed-input behavior remains an explicit edge-case surface. |
| `TranslatorException.cs` | medium-risk utility | covered but risky | Direct construction is observed without claiming every throw path is asserted. |

`ITranslatorLoader.cs` and `ITranslatorParser.cs` are deferred as contracts. Test helpers remain outside the production candidate set.

The initial five direct links consisted of one `asserted` constructor use and four `called` uses. The tests store constructed instances in locals before invoking most methods, making this repository the pressure case for the bounded receiver/result follow-up below.

## Follow-Up Receiver And Result Flow

The adapter now follows a concrete local only when a runnable attributed test body initializes it through exact `var value = new Type(...)` or `Type value = new Type(...)` syntax. A direct `value.Method(...)` is `called`; that call inside `Assert.*`/`.Should(...)`, or one stable local result consumed by those APIs, is `asserted`.

The flow stops at receiver or result reassignment, `ref`/`out`, interface-typed locals, fields, properties, helper returns, nested local functions, and deferred lambdas. Candidate ownership, project ownership, and evidence strength do not widen.

On the pinned repository, all four candidate classifications and all five evidence relationships remain unchanged. Usage improves from one asserted/four called to four asserted/one called:

- `Translator`, `TranslatorLoader`, and `TranslatorParser` gain assertion proof from exact local receivers and results
- `TranslatorException` remains `called` because the observed construction is not itself assertion-result flow

## Native Validation

The repository targets .NET 8, so native validation used Homebrew's side-by-side .NET SDK 8.0.129 on Darwin arm64. The solution build passed with no warnings or errors:

```sh
dotnet build tdd.sln --no-restore
```

The adapter-selected test command restored and built both projects, then executed 26 tests:

| Native result | Count |
| --- | ---: |
| Passed | 22 |
| Failed | 4 |
| Skipped | 0 |

All four failures are in `TranslatorLoaderTest`. Each test supplies a fixture path containing Windows backslashes, while the pinned repository's test workflow runs only on `windows-latest`. On Darwin the paths remain literal backslash-containing filenames and `File.ReadAllLines` raises `FileNotFoundException`.

This is target-repository portability behavior, not an adapter command defect: the command restored the exact test project, built the verified production/test edge, discovered the expected test assembly, and reached the native runner. Excluding only `TranslatorLoaderTest` produced a clean 22/22 pass. More importantly, the static audit had already kept `TranslatorLoader` prominent as a high-risk external boundary with integration-level review, so the live failure reinforces the recommendation rather than contradicting it.

## Stability And Performance

Five direct C# audits after the receiver/result follow-up produced the same root-normalized SHA-256 digest, `fc70124699126c6a859273829d860b5ff2bde3e9a3a37ec8272b1dc1e23c041f`. The changed digest is expected from the three reviewed usage upgrades; candidate and relationship counts remain stable.

| Run | Duration |
| --- | ---: |
| 1 | 72.0 ms |
| 2 | 73.0 ms |
| 3 | 72.1 ms |
| 4 | 70.7 ms |
| 5 | 70.5 ms |

The median was 72.0 ms for one collapsed production/test project pair.

## Remaining Boundary

The live probe validates the current literal pair boundary without requiring solution evaluation. It does not justify `.sln` ownership, inherited MSBuild properties, central package management, multi-targeting, transitive project graphs, or Microsoft.Testing.Platform-only layouts.

Concrete local receiver and one-result assertion flow are now covered. Field/property ownership, interface dispatch, target-typed construction, receiver or result reassignment, helpers, nested local functions, deferred lambdas, and deeper data flow remain outside the evidence boundary. Another live probe should determine whether one of those patterns or inherited build/package metadata is the more valuable next slice.
