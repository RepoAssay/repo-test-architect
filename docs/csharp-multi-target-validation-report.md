# C# Multi-Target Live Validation Report

Date: 2026-07-30

Repository: [`matthewrosse/ErrorOrAspNetCoreExtensions`](https://github.com/matthewrosse/ErrorOrAspNetCoreExtensions)

Pinned commit: [`b4244dd08bf5f3dd7b9ce1bea71a5abceb5a94bf`](https://github.com/matthewrosse/ErrorOrAspNetCoreExtensions/commit/b4244dd08bf5f3dd7b9ce1bea71a5abceb5a94bf)

## Why This Repository

ErrorOrAspNetCoreExtensions is a clean pressure case for literal multi-target ownership. Its production project targets `net8.0;net9.0;net10.0`, while its xUnit project targets `net10.0` and has one literal `ProjectReference` to the production project. It also uses bounded central package management, so the new target-framework rule composes with the prior package slice rather than bypassing it.

Microsoft documents `TargetFrameworks` as a semicolon-delimited list and documents that `dotnet test` runs a multi-targeted test project for each target framework. The adapter therefore admits literal lists without choosing a hidden target itself. For a production/test pair, every test target must occur literally in the production list; it does not infer compatibility between different target framework monikers. See Microsoft's [`TargetFrameworks` property](https://learn.microsoft.com/en-us/dotnet/core/project-sdk/msbuild-props#targetframeworks) and [`dotnet test` multi-targeting behavior](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-test#description).

## Static Audit Result

Project detection selects `src/ErrorOrAspNetCoreExtensions/ErrorOrAspNetCoreExtensions.csproj` and `test/ErrorOrAspNetCoreExtensions.Tests.Unit/ErrorOrAspNetCoreExtensions.Tests.Unit.csproj`. The selected audit reports:

| Measure | Result |
| --- | ---: |
| Verification command | `dotnet test test/ErrorOrAspNetCoreExtensions.Tests.Unit/ErrorOrAspNetCoreExtensions.Tests.Unit.csproj` |
| Blockers | 0 |
| Untested candidates | 6 |
| Covered but risky | 0 |
| Deferred/skipped | 1 |
| Evidence relationships | 0 |

Five repeated audits produced one SHA-256 digest, `5fb277f14deec2bfdba0a679b22d8011b5142691601550b6b487b653dea16067`, with a 2.4 ms median. The profile records `dotnet-multi-target-project`, the `literal multi-target framework ownership` convention, both literal target lists, and the central package file.

The zero evidence count is intentionally conservative. The production behavior is distributed across repeated partial extension-type declarations, which are outside the adapter's unique-type evidence rule. This probe validates target and command ownership; it does not justify joining partial declarations or inferring extension-method provenance.

## Native Validation

The emitted repository-native command was executed unchanged apart from the non-semantic `--nologo` switch:

```sh
dotnet test test/ErrorOrAspNetCoreExtensions.Tests.Unit/ErrorOrAspNetCoreExtensions.Tests.Unit.csproj --nologo
```

Restore selected the shared `net10.0` target for the project edge, both projects built with the repository-pinned .NET 10 SDK, and all 49 tests passed in 32 ms.

The checked `csharp-sdk-project-pair` fixture now locks the same target-superset shape: its production project targets `net8.0;net9.0;net10.0`, its test project targets `net10.0`, and its unchanged native command passes 2/2 tests.

## Supported Conclusion

This probe justifies literal unconditional local or nearest-props `TargetFrameworks` lists. Lists must contain at least two unique static target monikers. Conditions, property expansion, repeated declarations, empty entries, and duplicate entries remain blockers. A selected pair is supported only when every test target is listed literally by the production project, case-insensitively; compatibility substitution such as `net462` against `netstandard2.0` remains outside the static boundary.

The slice does not evaluate MSBuild, choose one target from a multi-targeted test project, infer framework compatibility, or admit conditional target metadata. Those shapes remain explicit command blockers.
