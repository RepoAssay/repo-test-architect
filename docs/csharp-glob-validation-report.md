# C# Glob Live Validation Report

Date: 2026-07-30

Repository: [`kthompson/glob`](https://github.com/kthompson/glob)

Pinned commit: [`719a8593b7c7c085c832e5580f753355ce7ded85`](https://github.com/kthompson/glob/commit/719a8593b7c7c085c832e5580f753355ce7ded85)

## Why This Repository

Glob is the first C# live probe in the corpus whose selected projects obtain their target framework from `Directory.Build.props`. The repository also pressures ownership rather than presenting a synthetic two-project tree: five `.csproj` files include the Glob library and xUnit project, a Blazor app, a benchmark executable, and build tooling. The root props file contains a conditional build-tool package reference alongside the unconditional literal `net8.0` framework.

This makes the repository a useful boundary test for three claims:

- the nearest repository-local `Directory.Build.props` can supply literal unconditional target and test metadata without evaluating MSBuild;
- unrelated conditional package metadata does not invalidate an otherwise static framework declaration;
- one exact production/test edge remains selectable without absorbing the app, benchmark, or build project.

## Static Audit Result

Project detection collapses `src/Glob/Glob.csproj` and `test/Glob.Tests/Glob.Tests.csproj` to the repository root. `src/GlobApp` and `test/Glob.Benchmarks` remain separate detected projects, while the ignored `build` directory does not become product ownership. The selected audit reports:

| Measure | Result |
| --- | ---: |
| Verification command | `dotnet test test/Glob.Tests/Glob.Tests.csproj` |
| Blockers | 0 |
| Untested candidates | 19 |
| Covered but risky | 8 |
| Deferred/skipped | 1 |
| Evidence relationships | 10 |
| Direct asserted / called / naming | 1 / 8 / 1 |

Five repeated audits produced one SHA-256 digest, `f03ccd59342ab838858d6eb9e0f9498e58ced7a9e49c7ebac34d63c895c57d76`, with a 22.5 ms median. The inherited `net8.0` value and `Directory.Build.props` path appear in the profile setup signals.

## Native Validation

The first shallow checkout could restore packages but Nerdbank.GitVersioning correctly refused to calculate a version height without the missing Git history. After fetching the full history, both selected projects built. The local machine has only the .NET 10 runtime, so the net8 test host was exercised with the runtime's documented major-version roll-forward switch:

```sh
DOTNET_ROLL_FORWARD=Major dotnet test test/Glob.Tests/Glob.Tests.csproj --no-restore
```

All 179 tests passed in 183 ms. The adapter continues to emit the repository-native command without a machine-specific environment override; the roll-forward setting records a local validation prerequisite, not inferred repository policy.

## Supported Conclusion

This probe justifies bounded `Directory.Build.props` inheritance for the nearest exact-cased, non-symbolic, repository-local file. Project-local values retain precedence. Literal unconditional `<TargetFramework>`, `<IsTestProject>`, and supported test-package `Include` declarations can participate in selection.

It does not justify `Directory.Build.targets`, imports, conditional relevant declarations, property-expanded values, inherited project or compile items, multiple target frameworks, or arbitrary MSBuild graph execution. At the time of this probe, it also did not justify central package evaluation; the later [C# Central Packages Live Validation Report](csharp-central-packages-validation-report.md) widens that separate boundary without changing Glob's evidence.
