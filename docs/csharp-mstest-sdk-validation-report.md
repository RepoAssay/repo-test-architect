# C# MSTest.Sdk v4 Live Validation Report

Date: 2026-07-31

Primary repository: [`dorssel/usbipd-win`](https://github.com/dorssel/usbipd-win)

Pinned commit: [`15e5f85663482d0698f080eeb41950ca839e8893`](https://github.com/dorssel/usbipd-win/commit/15e5f85663482d0698f080eeb41950ca839e8893)

## Why This Repository

usbipd-win is a useful MSTest.Sdk ownership target because its root `global.json` versions `MSTest.Sdk` 4.3.3 through `msbuild-sdks`, selects `Microsoft.Testing.Platform`, and pins .NET SDK 10.0.302. `UnitTests/UnitTests.csproj` then uses the versionless `Sdk="MSTest.Sdk"` form and has one literal `ProjectReference` to `Usbipd/Usbipd.csproj`.

The bounded contract follows Microsoft's current guidance: `MSTest.Sdk` can be versioned inline or in the root `global.json`, uses Microsoft.Testing.Platform by default, and can opt back into VSTest with `UseVSTest`. `IsTestApplication=false` marks a helper library rather than a runnable test application. See [Get started with MSTest](https://learn.microsoft.com/en-gb/dotnet/core/testing/unit-testing-mstest-getting-started) and [MSTest SDK configuration](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-mstest-sdk).

## usbipd-win Static Audit

Before this slice, repository-wide detection exposed `UnitTests` and `Usbipd` as separate project roots. The bounded MSTest.Sdk reader now resolves the version from `global.json`, recognizes the test application, and collapses the one literal edge. The root audit records:

| Command | Framework | Untested | Covered | Deferred | Evidence |
| --- | --- | ---: | ---: | ---: | ---: |
| withheld | MSTest | 27 | 14 | 3 | 15 |

The profile includes `repository-owned MSTest.Sdk v4 MTP runner`, `global.json`, and `MSTest.Sdk@4.3.3`. Five repeated audits produced the same SHA-256 digest, `69aa79183254ea8f0712f9a2c834183d62b76cd69499d6e4d6ed475158c00855`.

The command remains withheld for three concrete reasons:

- both selected projects express the target as `$(MainTargetFramework)`, whose root literal definition is not yet admitted through bounded MSBuild property evaluation;
- static command selection therefore cannot prove literal target membership for the pair;
- `Usbipd.csproj` extends default ownership with a custom `Compile Include="../Usbipd.Automation/*.cs"` graph.

This is the intended pressure result: the new slice owns the real MSTest runner and project edge without pretending that it can evaluate the rest of usbipd-win's build graph.

## Root Target Alias Follow-up

Both selected projects use the exact value `$(MainTargetFramework)`, and the nearest repository-root `Directory.Build.props` declares `<MainTargetFramework>net10.0</MainTargetFramework>` exactly once in an unconditional property group. The bounded follow-up resolves that single hop for either `TargetFramework` or `TargetFrameworks`. Conditional, repeated, chained, nested, target-owned, local-only, non-literal, or mixed-expression aliases remain unsupported.

The current profile records `bounded root target-framework property alias`, `Directory.Build.props`, and `MainTargetFramework=net10.0`. The framework-evaluation and missing-static-target blockers disappear. Candidate and evidence counts remain `27 / 14 / 3 / 15`; the only remaining blocker is:

```text
Custom MSBuild Compile item graphs are outside the bounded C# project-pair slice.
```

Five current audits produced the same root-normalized SHA-256 digest, `1183ee92d1a8edd8d3ec3b0edb5019bf46aaf590552e9769809cafbe05eb21b4`, with a 179.5 ms median from samples `269.6, 181.1, 179.5, 173.1, 170.8` ms.

## Literal Compile Include Follow-up

`Usbipd.csproj` has one self-closing `<Compile Include="../Usbipd.Automation/*.cs" LinkBase="Usbipd.Automation" />` item. The bounded follow-up admits exactly one direct `*.cs` glob when its directory resolves to a real, repository-contained directory and its matches are regular non-symbolic files. It rejects conditions, multiple items, recursive or property-expanded globs, explicit files, child metadata, `Remove`/`Update`, disabled defaults, and empty or escaping paths.

The root audit now owns all nine linked Automation sources and records `literal repository-contained Compile includes` plus `Compile Include=../Usbipd.Automation/*.cs`. Six linked files have direct test evidence, two are untested, and `IsExternalInit.cs` is deferred. The complete result is:

| Command | Blockers | Untested | Covered | Deferred | Evidence |
| --- | ---: | ---: | ---: | ---: | ---: |
| `dotnet test UnitTests/UnitTests.csproj` | 0 | 29 | 20 | 4 | 28 |

Five audits share root-normalized digest `217512fa1b455feb2a9a464b706f3f06ef6ba2296e6c820c5f7aff89a2be1450`, with a 200.4 ms median from samples `290.6, 203.7, 200.4, 192.4, 194.2` ms.

The unchanged command restores and reaches compilation locally, then fails on Apple Silicon because Microsoft.Windows.CsWin32 reports `PInvoke005` for AnyCPU and cannot generate the Windows SetupAPI surface. The exact pinned commit's upstream `windows-latest` workflow builds with `Platform=x64` and passes all 3,037 tests. This is a host/platform distinction rather than an ownership blocker, so the adapter retains its minimal project command.

## Complementary Static Command Probe

[`afscrome/mtp-playground`](https://github.com/afscrome/mtp-playground) at [`d68ef5abcc82786abe19d3a7e2f5c04f6443da23`](https://github.com/afscrome/mtp-playground/commit/d68ef5abcc82786abe19d3a7e2f5c04f6443da23) supplies the smaller positive command shape. Its `mstestdemo` project uses `MSTest.Sdk/4.0.2`, inherits a literal `net10.0` target, and shares the root MTP runner selection. The audit emits `dotnet test mstestdemo.csproj` with no blockers, detects MSTest, and records one deferred candidate. Five audits share digest `16ded6d90d8eb7cfc54d81b1a2a20266a05c94fe334e8c907308056d1977988b`.

The native command could not be launched unchanged because this checkout pins SDK 10.0.103 with roll-forward disabled, while the local machine has SDK 10.0.302. That is a pinned toolchain availability finding, not an adapter blocker.

## Complementary Native Probe

[`That-One-Nerd/Nerd_STF`](https://github.com/That-One-Nerd/Nerd_STF) at [`53e35f6fe60643bb3e98fce32cc3562244a8dda1`](https://github.com/That-One-Nerd/Nerd_STF/commit/53e35f6fe60643bb3e98fce32cc3562244a8dda1) supplies native MSTest.Sdk v4 execution without an unavailable SDK pin. Its root selects Microsoft.Testing.Platform and its test project uses `MSTest.Sdk/4.0.1` with `net10.0`. The exact project command passed locally on Apple Silicon:

```text
dotnet test UnitTests/UnitTests.csproj
Passed: 19, Failed: 0, Skipped: 0
```

The static repository audit recognizes the MSTest.Sdk runner but withholds its own command for an unrelated existing boundary: the test project's `net10.0` target is not a literal member of the production project's historical multi-target list. Native execution and static command proof are therefore complementary rather than conflated.

## Supported Conclusion

The combined slices admit exact MSTest.Sdk v4 test applications when the SDK version, Microsoft.Testing.Platform runner, and .NET 10+ context are all static and repository-owned, including one exact target-framework property hop and one contained direct compile glob. They reject missing or pre-v4 versions, `UseVSTest`, helper libraries, inferred runner ownership, and broader dynamic MSBuild metadata. usbipd-win is now a zero-blocker, high-confidence audit with an exact project command and complete ownership of its directly linked C# sources.
