# C# Sharp Cast Live Validation Report

This report records the second pinned public-repository audit for the experimental C# adapter and its field-receiver follow-up. [`jjosh102/sharp-cast`](https://github.com/jjosh102/sharp-cast) was cloned and audited locally at [`57cd4f345af3d98698f9227b6b4de610c131686c`](https://github.com/jjosh102/sharp-cast/tree/57cd4f345af3d98698f9227b6b4de610c131686c) on 2026-07-28, then re-audited at the same pin on 2026-07-30.

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

The initial selected-pair audit completed with high confidence and no blockers.

| Result | Count |
| --- | ---: |
| Untested candidates | 7 |
| Covered-but-risky candidates | 4 |
| Deferred contracts | 1 |
| Direct evidence relationships | 5 |

The four covered candidates are `CSharpToJsonConverter`, `CSharpToTypeScriptConverter`, `FormatUtility`, and `ConversionOptions`. The converter library's `IModelConverter` remains deferred as a contract. No source file from the UI or benchmark project enters the pair's candidate or evidence graph.

The seven initial untested results exposed the next useful evidence boundary rather than an ownership defect. In particular, `JsonToCSharpConverter` and `TypeScriptToCSharpConverter` are exercised through test-class fields initialized with target-typed `new()`.

## Field Receiver Follow-up

The follow-up admits only exact `private readonly` concrete fields initialized inline with `new()`/`new Type(...)`, or assigned exactly once in the test class's sole parameterless constructor. Calls remain owned by runnable test bodies, and the existing one-hop result assertion rule can upgrade them. Mutable, static, interface-typed, property, inherited, helper-created, cross-partial, shadowed, reassigned, and deferred receiver shapes remain uncredited.

| Result | Initial | Follow-up |
| --- | ---: | ---: |
| Untested candidates | 7 | 5 |
| Covered-but-risky candidates | 4 | 6 |
| Deferred contracts | 1 | 1 |
| Direct evidence relationships | 5 | 8 |

`TypeScriptToCSharpConverter` is assertion-proven because its field call's local result reaches xUnit. `JsonToCSharpConverter` gains two call-proven relationships from its class and record tests; their asserted conversion output arrives through an `out` parameter, so it is deliberately not upgraded beyond `called`. No unrelated UI or benchmark source enters the audit.

## Native Validation

The adapter-selected command restored and built the exact production/test edge on .NET 10, then passed all 165 upstream tests:

| Native result | Count |
| --- | ---: |
| Passed | 165 |
| Failed | 0 |
| Skipped | 0 |

The unrelated Blazor and benchmark projects were not required by the selected command.

## Stability And Performance

The initial five audits produced root-normalized digest `5c5363cde617af61d9f14752263504b8809598c9febc377f95696fc6cbc7ab83` with a 14.4 ms median. Five follow-up audits produced the same new root-normalized SHA-256 digest, `f3806a31ad40af325eaeb51710daa91bb9725e2d5a552959259a19dd373f2c07`.

| Run | Duration |
| --- | ---: |
| 1 | 50.2 ms |
| 2 | 23.0 ms |
| 3 | 22.9 ms |
| 4 | 22.9 ms |
| 5 | 22.5 ms |

The follow-up median was 22.9 ms. Every run retained 5 untested candidates, 6 covered candidates, 1 deferred contract, and 8 direct relationships.

## Remaining Boundary

These slices prove selection of one unique literal test edge inside a larger repository and exact immutable field receiver identity without broad member-flow inference. They do not claim solution ownership, merge unrelated projects, choose among two valid test edges, follow transitive project references, evaluate MSBuild, or follow `out` values into later assertions. The two JSON-converter relationships make that last boundary the clearest next evidence slice.
