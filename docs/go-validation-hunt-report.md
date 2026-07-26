# Go Validation Hunt Report

This report records the first pinned public-repository audit for the experimental Go adapter. The source repository was shallow-cloned at an exact commit and audited locally. No source was uploaded. Unlike an ordinary static audit, the validation pass also ran the repository's native tests to compare our conservative evidence graph with observed package coverage.

## Discovery And Selection

The validation finder now exposes a `go` profile requiring a root `go.mod` and a root `_test.go` file. A search across maintained Go libraries was compared against focused parser and validation candidates. [`BurntSushi/toml`](https://github.com/BurntSushi/toml) was selected for the conventional-library role because it has a dependency-free root module, 22 production Go files, eight Go test files, multiple owned packages, standard-library tests, fuzz and example functions, and no build constraints at the pinned commit.

| Repository | Audited commit | Role | Detected command | Untested | Covered | Skipped | Median audit |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| [`BurntSushi/toml`](https://github.com/BurntSushi/toml) | `c6d720d83547bb8d7afb067ba9df8bad0323e2d1` | conventional parser library | `go test ./...` | 6 | 9 | 7 | 28 ms |

Three post-hardening audits took 54, 28, and 27 ms. They produced the same normalized audit digest, `7876d40c30c40a8b0a857c1d15cdc2207cb2f8e335fa6e25d2dc52781c7faed5`, with 42 evidence relationships.

## Native Validation

On 2026-07-26, the pinned checkout passed with Go 1.26.5 on Darwin arm64:

- `go test ./...`
- `go test -race ./...`
- `gofmt` cleanliness

The ordinary suite completed in about 0.4 seconds and the race-enabled suite in about 1.6 seconds. `go test -coverprofile` reported 68.4% statement coverage across all packages. Native coverage is corroborating review evidence only; the adapter does not read coverage profiles or execute repository code during an audit.

## Problems Exposed And Fixed

The first full `analyze` pass found a false project boundary. `testdata/Cargo.toml` is a TOML parser fixture, but project detection reported it as an unsupported Rust project and downgraded repository audit coverage to partial. Nested `testdata` is now a traversal boundary for project detection and project stats, while a `testdata` directory passed directly as the repository root still detects its own markers. The same checkout now produces one supported Go project, complete audit coverage, one verification command, and no blockers.

The direct Go audit also exposed conservative evidence gaps. `parse.go`, `type_fields.go`, and `type_toml.go` appeared untested even though native coverage showed their important functions were exercised through directly called functions in `decode.go`, `encode.go`, and `meta.go`. The adapter now emits `go-source-dependency` evidence for one statically visible same-package source hop when:

- a runnable test directly calls a uniquely owned top-level function in the entry source file
- that source file makes an unqualified call to a uniquely owned top-level function in another selected file in the same package directory
- no local variable, package variable, or function parameter visibly shadows that dependency name

The relationship is `indirect` with `viaUsage: called`. It is not propagated from filename evidence, type references, existing indirect evidence, selectors, other packages, or a second source hop. This moved the three genuinely exercised core files from untested to covered without upgrading the six zero-coverage command-support, tag-tooling, conformance-runner, and OSS-Fuzz files.

The live parser file also revealed that an exact `parse.go` basename was classified as a generic branching utility because the bounded pure-logic vocabulary recognized `parser` but not `parse`. Exact path-token recognition now treats `parse` as pure transformation logic without matching unrelated names such as `sparse`.

Before these fixes the direct audit reported nine untested, six covered, seven skipped, and 19 evidence relationships. After hardening it reports six untested, nine covered, seven skipped, and 42 relationships.

## Reviewed Boundary

The first conventional-library probe passes the reviewed detection, ownership, command, evidence, ranking, stability, and performance areas for its bounded shape:

- the root `go.mod` is the only project owner; nested `testdata` remains fixture data
- `go test ./...` exactly matches the native module command
- direct symbol evidence remains package- and directory-qualified
- one-hop dependency evidence is explicit and weaker than direct evidence
- command entrypoints and declaration-only files stay deferred
- repeated audits are semantically stable and comfortably below the current cross-platform performance budget

Receiver methods, interfaces, reflection, dynamic calls, deeper source graphs, cross-package dependencies, assertion completeness, and runtime reachability remain outside the claim. The native coverage comparison showed why those gaps matter, but they remain visible rather than being inferred from package-wide test presence.

## Corpus Progress

This checkout is the first of the three required Go promotion roles. It is recorded here rather than in `validation-corpus/v1`, whose current contract requires every included adapter to provide all three roles. The remaining Go corpus work is:

1. a maintained HTTP or service application
2. a difficult multi-package, nested-module, or `go.work` ownership graph
3. the generated large-module performance and evidence-count regression gate

When all three pinned roles are reviewed, they can enter the shared corpus together and support an explicit experimental-to-supported decision.
