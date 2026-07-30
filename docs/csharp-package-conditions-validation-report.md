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
| Evidence relationships | 18 |
| Asserted / called after direct-result follow-up | 14 / 5 |
| Latest direct asserted / called / indirect asserted | 15 / 2 / 1 |

Five repeated audits produced one root-normalized SHA-256 digest, `4d873dc46f7baed53e0a8ba83816b6e3d109e4b85fa0d160a8425157c64879e1`, with an 88 ms median from samples `124, 88, 88, 89, 85`. The profile records `literal target-conditioned package references` alongside the existing literal project-pair and multi-target conventions.

The live probe also exposed and locked an adjacent XML parsing defect: a `PackageReference` with child metadata previously swallowed later self-closing package entries. S7.Net places `GitHubActionsTestLogger` with child metadata before its self-closing test SDK and MSTest references. The corrected parser now retains all entries regardless of those two ordinary XML forms.

### Direct-result evidence follow-up

The same pin exposed four exact direct type calls whose stable local results are consumed by top-level MSTest assertions. The bounded follow-up upgrades `DataItem.FromAddress(...)`, `TPKT.Read(...)`, and two `Conversion` call paths from `called` to `asserted`. It accepts only a top-level `var` or explicit local assignment from `Type.Method(...)`, or a `var`/same-concrete-type assignment from `new Type(...)`, followed by a direct `Assert.*` or `.Should(...)` use before mutation. Interface-typed construction, reassignment, helper indirection, local functions, lambdas, and deeper flow remain excluded.

Candidate counts and the 19 relationship identities remain unchanged. Five follow-up audits produced one root-normalized digest, `0d1c131f69be3229cb6f431c6905ee7ffc6e5ed56c94c0bd2f79d241cec3da80`, with a 101 ms median from samples `139, 101, 98, 104, 99`. Usage changes from 10 asserted and 9 called relationships to 14 asserted and 5 called.

### Runnable-test body ownership follow-up

A subsequent trust-hardening pass confines basic `Type.Method(...)` and `new Type(...)` evidence to top-level calls in runnable attributed test bodies. Calls that occur only in a test-class constructor, field initializer, ordinary helper, nested local function, or deferred lambda no longer claim direct coverage. Exact immutable field receivers remain supported because the attributed test body itself must call them.

S7.Net makes the distinction visible without changing any candidate count: helper-only `S7String`, `S7WString`, and `String` relationships fall back from direct evidence to their exact filename convention, while `DateTime` and `DateTimeLong` remain directly called but no longer inherit assertions owned by helper methods. The latest graph contains 9 asserted direct, 7 called direct, and 3 naming relationships. Five audits produced digest `681b34f64d18bb4019550c871a3d43b4d573df826d4ef3275ea8cc6eb8e5c5ff` with a 103 ms median from samples `145, 107, 100, 103, 99`.

### MSTest expected-exception follow-up

The pinned `DateTime` and `DateTimeLong` tests also use MSTest `[ExpectedException]` methods whose complete body is one direct source call. The bounded rule upgrades that call only when the selected framework is MSTest, the attributed method contains one statement, and exactly one top-level `Type.Method(...)` or `new Type(...)` source call owns that statement. Multiple source calls, setup statements, wrapper calls, helpers, local functions, deferred lambdas, and similarly named non-MSTest attributes remain called or uncredited.

This moves only the `DateTime` and `DateTimeLong` relationships from called to asserted. Counts stay at 35 untested, 13 covered, 1 deferred, and 19 relationships, now split into 11 asserted direct, 5 called direct, and 3 naming. Five audits produced digest `2fbaecbad8128b75d36447257589943c851ef4da42ee69f9d540c65a3d3c5ce7` with a 104 ms median from samples `145, 104, 106, 103, 100`.

### Framework exception-assertion lambda follow-up

The next bounded rule recognizes exact single-expression lambdas owned by the selected framework's exception assertion methods: xUnit `Throws*`, NUnit `Throws*`/`Catch*`, and MSTest `ThrowsException*`/`ThrowsExactly*`. The assertion statement and lambda remain top-level, the lambda contains exactly one direct source `Type.Method(...)` or `new Type(...)` call, and optional async/await plus a trailing framework message are admitted. Block lambdas, wrapped or multiple source calls, captured assertion results, nested assertions, custom helpers, and wrong-framework method names remain excluded.

S7.Net upgrades only `S7String` and `S7WString` from filename conventions to direct asserted relationships. Plain `String` remains naming-only because its exception checks call test helpers instead of the source inside the framework lambda. Counts remain 35 untested, 13 covered, 1 deferred, and 19 relationships, now split into 13 asserted direct, 5 called direct, and 1 naming. Five audits produced digest `bb035df93e749bfec265b13e1801e25ab4946a50a0cb36e6a853640926f7791d` with a 106 ms median from samples `151, 104, 106, 109, 103`.

### One-hop test-helper follow-up

The remaining `String` relationship is exercised through a same-class `private static` test helper. The bounded helper rule requires a unique non-generic block-bodied helper, one direct top-level helper call from a runnable test, and exactly one top-level source type call in the helper. It emits a distinct `csharp-test-helper` relationship with indirect strength and `viaUsage`, allowing downstream reports to distinguish helper reachability from a direct test-body call. Direct evidence from the same test file wins rather than creating a duplicate relationship.

Uncalled, public or instance, overloaded, multi-source, nested, lambda-owned, locally shadowed, cross-class/file, chained, receiver, and helper-return shapes remain excluded. `String` moves from naming to indirect called evidence because its helper assertion uses `CollectionAssert`, which is not yet part of the bounded assertion vocabulary. Counts remain 35 untested, 13 covered, 1 deferred, and 19 relationships, split into 13 asserted direct, 5 called direct, and 1 called indirect. Five audits produced digest `7eb1d36f04368c7ca4dc845cde920870a809a2294cba81ae3fb14af192a5cf0e` with a 115 ms median from samples `159, 114, 115, 119, 112`.

### Framework collection/string assertion follow-up

The selected NUnit or MSTest framework now admits top-level static `CollectionAssert.*` and `StringAssert.*` statements to the same bounded assertion-usage paths as `Assert.*`: inline direct calls, stable direct or receiver results, exact inline `out var` results, immutable test-field receivers, and the one-hop helper body. xUnit projects keep those owner spellings called rather than asserted, preventing a lookalike custom class from gaining framework credit there. Existing mutation, nesting, deferred-lambda, and deeper-flow rejections remain unchanged.

On S7.Net, `ConnectionRequest` and `TsapPair` move from direct called to direct asserted usage inside visible `CollectionAssert.AreEqual(...)` statements, while `String` moves from indirect called to indirect asserted through its bounded helper. Counts remain 35 untested, 13 covered, 1 deferred, and 19 relationships, now split into 15 asserted direct, 3 called direct, and 1 asserted indirect. Five audits produced digest `fe016f99fc7ab972eb6048dcc9e7e7c0dabe190eed4ffb2a8f08964ecadbfc9e` with a 113 ms median from samples `162, 113, 112, 115, 111`.

### Well-known System type-collision follow-up

When a test file imports the root `System` namespace, unqualified references to a bounded set of well-known root types such as `DateTime`, `Guid`, and `String` no longer prove a same-named source type. A dotted source qualification remains eligible, as does an exact alias whose right-hand side matches the unique source namespace and type; an explicit `System.Type` qualification remains rejected. The guard applies consistently to direct calls, constructors, stable results, receivers, exception assertions, and one-hop helper evidence.

S7.Net exposes the false positive in `DateTimeLongTests.cs`: its unqualified `new DateTime(...)` expressions are `System.DateTime`, not calls to `S7.Net.Types.DateTime`. Removing that one called relationship leaves every candidate classification and all other evidence unchanged. The exact `Boolean = S7.Net.Types.Boolean` alias remains directly asserted. Counts are 35 untested, 13 covered, 1 deferred, and 18 relationships, split into 15 asserted direct, 2 called direct, and 1 asserted indirect. Five audits produced digest `616cefd4bb73e781157cc1182f0677153955b1fc720bdbf2c3bf529f0dd9c856` with a 141 ms median from samples `191, 142, 137, 141, 134`.

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
