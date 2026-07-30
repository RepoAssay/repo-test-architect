# C# NUnit 5 Samples Live Validation Report

Date: 2026-07-30

Repository: [`nunit/nunit-csharp-samples`](https://github.com/nunit/nunit-csharp-samples)

Pinned commit: [`2058fb69939911d647b817e0d7a871ba9e4d34a6`](https://github.com/nunit/nunit-csharp-samples/commit/2058fb69939911d647b817e0d7a871ba9e4d34a6)

## Why This Repository

The official NUnit C# samples provide a repository-wide pressure case rather than another hand-selected production/test pair. The pin contains six independent SDK-style test projects, five `net10.0` projects and one `net48;net10.0` project, all consuming versionless NUnit 5 beta, test SDK, adapter, analyzer, and coverage references through one root `Directory.Packages.props`.

That shape tests whether repository project detection keeps collocated owners separate, passes the repository root into each audit so central package metadata remains available, and emits one exact project-local command per owner without claiming solution-wide execution.

## Static Audit Result

`audit-projects` detects and audits all six project roots with no skipped projects or blockers:

| Project | Command | Untested | Covered | Deferred | Evidence |
| --- | --- | ---: | ---: | ---: | ---: |
| `AssertSyntax` | `dotnet test AssertSyntax.csproj` | 0 | 0 | 0 | 0 |
| `DataDrivenTests` | `dotnet test DataDrivenTests.csproj` | 0 | 0 | 0 | 0 |
| `ExpectedExceptionExample` | `dotnet test ExpectedExceptionExample.csproj` | 1 | 0 | 0 | 0 |
| `Money` | `dotnet test Money.csproj` | 0 | 2 | 1 | 2 |
| `TestCaseGeneration` | `dotnet test TestCaseGeneration.csproj` | 0 | 0 | 0 | 0 |
| `TimeoutRetryAttributeExample` | `dotnet test TimeoutRetryAttributeExample.csproj` | 0 | 1 | 0 | 1 |
| **Repository total** | **6 exact commands** | **1** | **3** | **1** | **3** |

The two `Money` relationships are direct asserted evidence from `MoneyTest.cs` to `Money.cs` and `MoneyBag.cs`; the `IMoney` interface is correctly deferred as a contract. The money sample mixes current `Assert.That(...)` usage with `ClassicAssert`, and the already-supported constraint form is enough to prove both concrete behaviors without granting package-wide credit.

The framework-driven custom-attribute examples stay deliberately conservative. `ExpectedExceptionAttribute` is invoked by NUnit through metadata and remains an untested high-risk branching utility. `TimeoutRetryAttribute` has an exact test filename but no direct test-body call, so it receives naming evidence only. The audit does not turn reflection or framework callbacks into invented direct coverage.

Five repository-wide audits produced one repository-root-normalized SHA-256 digest, `16359a2a5850c42421f997ae7d89adc78b4f766f7cec77b4c42e1f4fc2fe0489`, with a 7.1 ms median from samples `30.0, 9.7, 7.1, 6.9, 6.7` ms.

## Native Validation

Each emitted command was executed from its owning project directory with only `--nologo` added. The five `net10.0`-only projects passed completely, and the `net10.0` target of `AssertSyntax` also passed:

| Project | .NET 10 result |
| --- | ---: |
| `AssertSyntax` | 36 passed |
| `DataDrivenTests` | 44 passed |
| `ExpectedExceptionExample` | 2 passed |
| `Money` | 21 passed |
| `TestCaseGeneration` | 133 passed |
| `TimeoutRetryAttributeExample` | 2 passed |
| **Total** | **238 passed** |

The aggregate `AssertSyntax` command exits unsuccessfully on macOS after its successful `net10.0` run because the additional `net48` test host requires Mono, which is not installed locally. Restore and compilation succeeded for both targets. This is an honest host portability finding: it does not change the exact multi-target command or the zero-blocker static ownership result.

The timeout/retry sample reports three explicitly excluded demonstrations in its output while its two runnable tests pass. NUnit's final summary remains `2 passed, 0 skipped`, matching the repository's use of `[Explicit]` for intentionally failing demonstrations.

## Supported Conclusion

This probe validates the existing repository-aware routing boundary: six collocated independent C# test projects retain distinct owners and commands while sharing bounded central package metadata from the repository root. It also confirms current NUnit 5 package detection, NUnit attributed-test discovery, constraint assertions, literal multi-target ownership, and conservative framework-callback evidence on one current official sample repository.

No C# ownership or evidence rule is widened from this run. A future slice may investigate framework-owned custom attributes or broader `ClassicAssert` pressure, but only with provenance that distinguishes framework invocation from a direct test-body call.
