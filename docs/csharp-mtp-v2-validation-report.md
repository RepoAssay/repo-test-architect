# C# Microsoft.Testing.Platform v2 Live Validation Report

Date: 2026-07-30

Repository: [`Lukdrasil/StepUpLogging`](https://github.com/Lukdrasil/StepUpLogging)

Pinned commit: [`958a048a2ff25d6d2d3a8291da4f8e020a4339b1`](https://github.com/Lukdrasil/StepUpLogging/commit/958a048a2ff25d6d2d3a8291da4f8e020a4339b1)

## Why This Repository

StepUpLogging provides one compact current MTP-v2 pressure case. Its root `global.json` selects `Microsoft.Testing.Platform`; its unique literal xUnit test edge targets `net10.0`, builds as an executable, and directly versions `xunit.v3.mtp-v2` 3.2.2 plus `Microsoft.Testing.Platform.MSBuild` 2.2.1. The project also retains `Microsoft.NET.Test.Sdk`, which verifies that explicit native MTP ownership can be reported without changing an already portable fallback package graph.

This boundary follows the current platform contract: .NET 10 selects MTP through `global.json`, while xUnit v3 exposes a dedicated MTP-v2 package and standalone executable model. See the official [`dotnet test` runner-selection documentation](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-test) and [xUnit v3 MTP documentation](https://xunit.net/docs/getting-started/v3/microsoft-testing-platform).

## Static Audit Result

Repository-wide detection keeps four unrelated example projects separate and selects the one exact production/test pair at the repository root. The selected audit reports:

| Command | Untested | Covered | Deferred | Evidence |
| --- | ---: | ---: | ---: | ---: |
| `dotnet test tests/Lukdrasil.StepUpLogging/Lukdrasil.StepUpLogging.Tests.csproj` | 1 | 11 | 0 | 29 |

The command has no blockers. Its profile records `repository-owned Microsoft.Testing.Platform v2 runner` and retains ordinary xUnit attributed-test evidence. Five repository-wide audits produced the same SHA-256 digest, `e421cb00b34080a5a0aa07a961805a75e2219209fa19ca831aebf1a2086e4a4b`.

The admitted static path is intentionally conjunctive: exact `xunit.v3.mtp-v2`, exact `Microsoft.Testing.Platform.MSBuild` with a literal or bounded-central 2.x-or-newer version, exact root runner selection, and either a literal .NET 10+ SDK pin or exclusively literal `net10.0`-or-newer test targets. Missing, malformed, VSTest, pre-.NET 10, MTP v1, conditional, or partially inferred ownership does not waive the existing test-SDK blocker.

## Native Validation

The exact emitted command passed all 244 tests on local Apple Silicon with .NET 10:

```text
Test run summary: Passed!
  total: 244
  failed: 0
  succeeded: 244
  skipped: 0
```

An exploratory run with `--nologo` failed before discovery because native MTP forwards that unrecognized VSTest-era option to the test application. Re-running the adapter's unchanged command passed. This confirms that the adapter should continue emitting the minimal project command instead of decorating it with runner-specific flags.

## Supported Conclusion

This probe validates the first native Microsoft.Testing.Platform ownership slice: a repository can replace the `Microsoft.NET.Test.Sdk` command prerequisite only when its current xUnit MTP-v2 host, version, root runner, and .NET 10 context are all explicit. It does not generalize to MTP v1 compatibility flags, TUnit, NUnit or MSTest MTP hosts, transitive-only package inference, solution ownership, or multiple project edges.
