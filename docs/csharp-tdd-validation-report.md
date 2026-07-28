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

The five direct links consist of one `asserted` constructor use and four `called` uses. This is conservative: the tests store constructed instances in locals before invoking most methods, so the current adapter does not upgrade those method results to asserted evidence through receiver or local-result flow.

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

Five direct C# audits produced the same root-normalized SHA-256 digest, `092b7170addd080987743e9ccdc2ee95e9982872e1acca28561a1ecb04220565`.

| Run | Duration |
| --- | ---: |
| 1 | 72.5 ms |
| 2 | 70.4 ms |
| 3 | 70.4 ms |
| 4 | 70.4 ms |
| 5 | 70.3 ms |

The median was 70.4 ms for one collapsed production/test project pair.

## Remaining Boundary

The live probe validates the current literal pair boundary without requiring solution evaluation. It does not justify `.sln` ownership, inherited MSBuild properties, central package management, multi-targeting, transitive project graphs, or Microsoft.Testing.Platform-only layouts.

The clearest next evidence slice is bounded instance-receiver and local-result flow. The repository's tests construct concrete production types, store them in locals, call instance methods, and assert their results; recovering that chain would improve `called` versus `asserted` precision without widening project ownership or evaluating arbitrary MSBuild.
