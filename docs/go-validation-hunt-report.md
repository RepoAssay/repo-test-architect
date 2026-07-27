# Go Validation Hunt Report

This report records the first pinned public-repository audit for the bounded Go adapter, which has since reached supported alpha maturity. The source repository was shallow-cloned at an exact commit and audited locally. No source was uploaded. Unlike an ordinary static audit, the validation pass also ran the repository's native tests to compare our conservative evidence graph with observed package coverage.

## Discovery And Selection

The validation finder now exposes a `go` profile requiring a root `go.mod` and a root `_test.go` file. A search across maintained Go libraries was compared against focused parser and validation candidates. [`BurntSushi/toml`](https://github.com/BurntSushi/toml) was selected for the conventional-library role because it has a dependency-free root module, 22 production Go files, eight Go test files, multiple owned packages, standard-library tests, fuzz and example functions, and no build constraints at the pinned commit.

| Repository | Audited commit | Role | Detected command | Untested | Covered | Skipped | Median audit |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| [`BurntSushi/toml`](https://github.com/BurntSushi/toml) | `c6d720d83547bb8d7afb067ba9df8bad0323e2d1` | conventional parser library | `go test ./...` | 8 | 7 | 7 | 252 ms |

The callable-ownership remeasurement took 314, 252, and 245 ms. All three audits produced the same normalized audit digest, `66badf372d16fbf101c350ebf23fd6b6e16609456158de38f3a9073f468e2538`, with 28 evidence relationships, including two whose existing entrypoint usage is asserted.

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

The relationship is `indirect` with `viaUsage: called`. It is not propagated from filename evidence, type references, existing indirect evidence, selectors, other packages, or a second source hop. At that stage this moved three core files from untested to covered without upgrading the six zero-coverage command-support, tag-tooling, conformance-runner, and OSS-Fuzz files. Later callable-body review showed that `type_fields.go` and `type_toml.go` received only file-wide links copied from unrelated sibling callables, so those two targets are again honestly untested under the exact one-hop model.

The live parser file also revealed that an exact `parse.go` basename was classified as a generic branching utility because the bounded pure-logic vocabulary recognized `parser` but not `parse`. Exact path-token recognition now treats `parse` as pure transformation logic without matching unrelated names such as `sparse`.

Before these fixes the direct audit reported nine untested, six covered, seven skipped, and 19 evidence relationships. The first-slice hardened audit reported six untested, nine covered, seven skipped, and 42 relationships; the promotion remeasurement retains those candidate counts and reports 49 relationships after generic top-level function support.

## Reviewed Boundary

The first conventional-library probe passes the reviewed detection, ownership, command, evidence, ranking, stability, and performance areas for its bounded shape:

- the root `go.mod` is the only project owner; nested `testdata` remains fixture data
- `go test ./...` exactly matches the native module command
- direct symbol evidence remains package- and directory-qualified
- one-hop dependency evidence is explicit and weaker than direct evidence
- command entrypoints and declaration-only files stay deferred
- repeated audits are semantically stable and comfortably below the current cross-platform performance budget

Receiver methods without an explicit type or exact simple concrete constructor result, interfaces, reflection, dynamic calls, deeper source graphs, cross-module dependencies, helper/custom assertions, deeper result flow, and runtime reachability remain outside the claim. The native coverage comparison showed why those gaps matter, but they remain visible rather than being inferred from package-wide test presence.

## Corpus Progress

This checkout is the conventional-library role in `validation-corpus/v1`. Together with the [Go HTTP validation](go-http-validation-report.md) and [Go workspace ownership validation](go-ownership-validation-report.md), it gives supported Go three exact-pin passing roles with stable repeated audits and recorded performance distributions.

The explicitly typed receiver-method slice was remeasured against this exact checkout without changing its candidate counts, 49 evidence relationships, or canonical digest. Its new direct method claim remains limited to tests that visibly bind a concrete receiver type.

The exact constructor-result slice retained the same candidate counts and added one reviewed direct relationship, producing 50 relationships and the digest recorded above. Only simple concrete result positions bound by `:=` qualify.

The later assertion-usage slice retained all 50 relationships and candidate classifications while upgrading three exact standard-library condition relationships. Its then-current digest and timing are detailed in the [Go Assertion-Usage Validation Report](go-assertion-validation-report.md).

The parser-owned receiver and callable slice supersedes that file-wide relationship baseline. It removes 26 leaked indirect links, recovers four exact direct method links across `lex.go`, `error.go`, and `meta.go`, and produces the current counts and digest above. The reviewed delta is detailed in the [Go Receiver And Callable Ownership Validation Report](go-callable-ownership-validation-report.md).
