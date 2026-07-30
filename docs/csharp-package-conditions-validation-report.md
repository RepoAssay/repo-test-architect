# C# Target-Conditioned Packages Live Validation Report

Date: 2026-07-30

Repository: [`S7NetPlus/s7netplus`](https://github.com/S7NetPlus/s7netplus)

Pinned commit: [`534d9fd69dedb6db1a61f0ce13b94ab8e7f98f26`](https://github.com/S7NetPlus/s7netplus/commit/534d9fd69dedb6db1a61f0ce13b94ab8e7f98f26)

## Why This Repository

This historical S7.Net revision is a compact two-project pressure case for target-conditioned NuGet dependencies. The production project declares seven literal target frameworks. Its `System.Memory` reference is active only when `TargetFramework` is not `net5.0`, `net6.0`, or `net7.0`, expressed as three literal inequality atoms joined by `And`. The MSTest project targets the literal subset `net462;net6.0;net7.0` and has one project reference to the library.

The slice admits only project-local package conditions whose complete truth table can be derived from the project's literal target list. One condition may be placed on either a `PackageReference` or its `ItemGroup`. Its atoms must all compare `$(TargetFramework)` with declared literal monikers, use one comparison operator (`==` or `!=`) and one join operator (`And` or `Or`), and select a non-empty proper subset. Conditions on test SDK/framework packages, nested conditions, mixed expressions, functions, parentheses, undeclared targets, and inherited conditions used by selected test or central-package metadata remain blockers.

## Static Audit Result

Project detection selects `S7.Net/S7.Net.csproj` and `S7.Net.UnitTest/S7.Net.UnitTest.csproj`. The selected audit reports:

| Measure | Result |
| --- | ---: |
| Verification command | `dotnet test S7.Net.UnitTest/S7.Net.UnitTest.csproj` |
| Blockers | 0 |
| Untested candidates | 35 |
| Covered but risky | 13 |
| Deferred/skipped | 1 |
| Evidence relationships | 19 |
| Asserted / called after direct-result follow-up | 14 / 5 |

Five repeated audits produced one root-normalized SHA-256 digest, `4d873dc46f7baed53e0a8ba83816b6e3d109e4b85fa0d160a8425157c64879e1`, with an 88 ms median from samples `124, 88, 88, 89, 85`. The profile records `literal target-conditioned package references` alongside the existing literal project-pair and multi-target conventions.

The live probe also exposed and locked an adjacent XML parsing defect: a `PackageReference` with child metadata previously swallowed later self-closing package entries. S7.Net places `GitHubActionsTestLogger` with child metadata before its self-closing test SDK and MSTest references. The corrected parser now retains all entries regardless of those two ordinary XML forms.

### Direct-result evidence follow-up

The same pin exposed four exact direct type calls whose stable local results are consumed by top-level MSTest assertions. The bounded follow-up upgrades `DataItem.FromAddress(...)`, `TPKT.Read(...)`, and two `Conversion` call paths from `called` to `asserted`. It accepts only a top-level `var` or explicit local assignment from `Type.Method(...)`, or a `var`/same-concrete-type assignment from `new Type(...)`, followed by a direct `Assert.*` or `.Should(...)` use before mutation. Interface-typed construction, reassignment, helper indirection, local functions, lambdas, and deeper flow remain excluded.

Candidate counts and the 19 relationship identities remain unchanged. Five follow-up audits produced one root-normalized digest, `0d1c131f69be3229cb6f431c6905ee7ffc6e5ed56c94c0bd2f79d241cec3da80`, with a 101 ms median from samples `139, 101, 98, 104, 99`. Usage changes from 10 asserted and 9 called relationships to 14 asserted and 5 called.

### Runnable-test body ownership follow-up

A subsequent trust-hardening pass confines basic `Type.Method(...)` and `new Type(...)` evidence to top-level calls in runnable attributed test bodies. Calls that occur only in a test-class constructor, field initializer, ordinary helper, nested local function, or deferred lambda no longer claim direct coverage. Exact immutable field receivers remain supported because the attributed test body itself must call them.

S7.Net makes the distinction visible without changing any candidate count: helper-only `S7String`, `S7WString`, and `String` relationships fall back from direct evidence to their exact filename convention, while `DateTime` and `DateTimeLong` remain directly called but no longer inherit assertions owned by helper methods. The latest graph contains 9 asserted direct, 7 called direct, and 3 naming relationships. Five audits produced digest `681b34f64d18bb4019550c871a3d43b4d573df826d4ef3275ea8cc6eb8e5c5ff` with a 103 ms median from samples `145, 107, 100, 103, 99`.

## Native Validation

The emitted command was executed unchanged apart from `--nologo`:

```sh
dotnet test S7.Net.UnitTest/S7.Net.UnitTest.csproj --nologo
```

Restore succeeded and all three test targets (`net462`, `net6.0`, and `net7.0`) built. Test execution then aborted for environmental reasons: the historical project forces `PlatformTarget=x64`, while the local Apple Silicon installation has only an arm64 .NET host, and the `net462` target additionally requires Mono.

A diagnostic `net7.0` run with an arm64 runtime, .NET 10 major-version roll-forward, and no source changes reached the tests. It passed 25 and failed 11 before aborting because S7.Net's test server requires the native Snap7 library, for which the pinned repository carries Windows binaries but no macOS dylib. These failures are preserved as native portability findings; they do not alter the zero-blocker static ownership result or justify changing the emitted repository command.

## Supported Conclusion

This probe justifies a finite target-condition evaluator for project-local package items, not general MSBuild evaluation. Exact equality and inequality atoms, plus a uniform `And` or `Or` chain, are admitted only when every mentioned target exists in the already validated literal target list and evaluation selects a strict subset.

Configuration, OS, platform, compatibility functions, mixed boolean/comparison operators, nested conditions, conditional test infrastructure, inherited conditional central/test package items, and arbitrary MSBuild expressions remain explicit blockers when they affect selected metadata.
