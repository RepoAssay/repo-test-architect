# C# Central Packages Live Validation Report

Date: 2026-07-30

Repository: [`efcore/EFCore.CheckConstraints`](https://github.com/efcore/EFCore.CheckConstraints)

Pinned commit: [`20f0df70cbde15df054dd9f3633b3b974051dc54`](https://github.com/efcore/EFCore.CheckConstraints/commit/20f0df70cbde15df054dd9f3633b3b974051dc54)

## Why This Repository

EFCore.CheckConstraints is a clean two-project pressure case for NuGet Central Package Management. Its production and xUnit projects target literal `net10.0`, the test project has one literal edge to the library, and every `PackageReference` is versionless. Root `Directory.Build.props` enables central versions while root `Directory.Packages.props` supplies both literal versions and an exact one-level `$(EFCoreVersion)` alias declared in that same file.

This makes the repository a useful boundary test for four claims:

- central enablement can come from literal unconditional metadata in the nearest `Directory.Build.props` or `Directory.Packages.props`;
- each selected project uses only its nearest exact-cased, non-symbolic, repository-local `Directory.Packages.props`;
- every selected project package has a matching static `PackageVersion`;
- one-level version aliases declared literally in that same central file do not require arbitrary MSBuild evaluation.

## Static Audit Result

Project detection collapses `EFCore.CheckConstraints/EFCore.CheckConstraints.csproj` and `EFCore.CheckConstraints.Test/EFCore.CheckConstraints.Test.csproj` to the repository root. The selected audit reports:

| Measure | Result |
| --- | ---: |
| Verification command | `dotnet test EFCore.CheckConstraints.Test/EFCore.CheckConstraints.Test.csproj` |
| Blockers | 0 |
| Untested candidates | 10 |
| Covered but risky | 3 |
| Deferred/skipped | 0 |
| Evidence relationships | 3 |
| Direct asserted / called / naming | 0 / 3 / 0 |

Five repeated audits produced one SHA-256 digest, `f4317fa08976fe745a0f250176aa1b02ff758b2b08868392325f0872b4a2ed98`, with a 12.5 ms median. `bounded central package management` appears in the detected conventions, and `Directory.Packages.props` appears in the setup signals.

## Native Validation

The emitted repository-native command was executed unchanged:

```sh
dotnet test EFCore.CheckConstraints.Test/EFCore.CheckConstraints.Test.csproj --nologo
```

Restore resolved the central versions, both selected projects built against .NET 10, and all 118 tests passed in 396 ms.

## Supported Conclusion

This probe justifies bounded nearest-file central package validation for the selected C# projects. `ManagePackageVersionsCentrally` must resolve to a literal unconditional boolean in the project, `Directory.Build.props`, or `Directory.Packages.props`. Package IDs remain literal, and versions must be either literal or an exact one-level reference to a literal unconditional property declared in that same central file.

It does not justify imports, chained or external properties, conditions around central metadata or package references, repeated declarations, project-local `Version`/`VersionOverride`, `GlobalPackageReference`, symbolic central files, or arbitrary MSBuild/NuGet graph execution. Those shapes remain explicit command blockers.
