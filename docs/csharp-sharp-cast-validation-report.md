# C# Sharp Cast Live Validation Report

This report records the second pinned public-repository audit for the experimental C# adapter. [`jjosh102/sharp-cast`](https://github.com/jjosh102/sharp-cast) was cloned and audited locally at [`57cd4f345af3d98698f9227b6b4de610c131686c`](https://github.com/jjosh102/sharp-cast/tree/57cd4f345af3d98698f9227b6b4de610c131686c) on 2026-07-28.

## Repository Shape

The repository contains four SDK-style projects and a solution file:

- `src/SharpCast.ModelConverter/SharpCast.ModelConverter.csproj` owns the converter library
- `tests/SharpCast.ModelConverter.Tests/SharpCast.ModelConverter.Tests.csproj` owns the xUnit tests and has one literal relative `ProjectReference` to the converter
- `src/SharpCast.Ui/SharpCast.Ui.csproj` is an unrelated Blazor application
- `tests/Benchmarks/Benchmarks.csproj` is an unrelated benchmark executable

The bounded detector finds exactly one literal test-to-production edge. It collapses only that pair to the common audit root, preserves the UI and benchmark projects as separate detected roots, and does not interpret `sharp-cast.sln` as ownership. The selected profile emits:

```sh
dotnet test tests/SharpCast.ModelConverter.Tests/SharpCast.ModelConverter.Tests.csproj
```

## Static Audit Result

The selected pair audits with high confidence and no blockers.

| Result | Count |
| --- | ---: |
| Untested candidates | 7 |
| Covered-but-risky candidates | 4 |
| Deferred contracts | 1 |
| Direct evidence relationships | 5 |

The four covered candidates are `CSharpToJsonConverter`, `CSharpToTypeScriptConverter`, `FormatUtility`, and `ConversionOptions`. The converter library's `IModelConverter` remains deferred as a contract. No source file from the UI or benchmark project enters the pair's candidate or evidence graph.

The seven untested results expose the next useful evidence boundary rather than an ownership defect. In particular, `JsonToCSharpConverter` and `TypeScriptToCSharpConverter` are exercised through test-class fields initialized with target-typed `new()`. Field receiver identity is intentionally excluded from the current local-only flow, so those sources remain visible instead of receiving guessed evidence.

## Native Validation

The adapter-selected command restored and built the exact production/test edge on .NET 10, then passed all 165 upstream tests:

| Native result | Count |
| --- | ---: |
| Passed | 165 |
| Failed | 0 |
| Skipped | 0 |

The unrelated Blazor and benchmark projects were not required by the selected command.

## Stability And Performance

Five direct audits produced the same root-normalized SHA-256 digest, `5c5363cde617af61d9f14752263504b8809598c9febc377f95696fc6cbc7ab83`.

| Run | Duration |
| --- | ---: |
| 1 | 37.5 ms |
| 2 | 14.0 ms |
| 3 | 15.0 ms |
| 4 | 13.7 ms |
| 5 | 14.4 ms |

The median was 14.4 ms. Every run retained 7 untested candidates, 4 covered candidates, 1 deferred contract, and 5 direct relationships.

## Remaining Boundary

This slice proves selection of one unique literal test edge inside a larger repository. It does not claim solution ownership, merge unrelated projects, choose among two valid test edges, follow transitive project references, or evaluate MSBuild. The live result makes exact field receiver identity with target-typed construction the clearest next evidence slice.
