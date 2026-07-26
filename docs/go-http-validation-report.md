# Go HTTP Validation Report

This report records the second pinned public-repository audit for the experimental Go adapter. The source repository was cloned at an exact commit and audited locally. Native Go execution was used only to review the static artifact; ordinary audits still do not run repository code or consume coverage profiles.

## Discovery And Selection

The validation finder now exposes a `go-http` profile requiring a root `go.mod`, a root `_test.go` file, and an HTTP signal in `README.md`. [`go-chi/chi`](https://github.com/go-chi/chi) was selected for the HTTP/service role because it is an actively maintained, standard-library-compatible router for Go HTTP services with a small core, a substantial middleware package, nested example modules, and explicit build selection.

| Repository | Audited commit | Role | Detected root command | Untested | Covered | Skipped | Median audit |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| [`go-chi/chi`](https://github.com/go-chi/chi) | `8b258c7bb28f97a5f2a856ff7ef962578fec9215` | HTTP router and middleware | `GOOS=darwin GOARCH=arm64 go test ./...` | 14 | 23 | 10 | 73 ms |

Three post-hardening audits took 105, 73, and 72 ms. They produced the same normalized audit digest, `30549ee5288778c890f6b13a165e0155fda4112eb872474431137e26de25973e`, with 66 evidence relationships.

## Native Validation

On 2026-07-26, the pinned checkout passed with Go 1.26.5 on Darwin arm64:

- `go test ./...`
- `go test -race ./...`
- `gofmt` cleanliness

The ordinary and race-enabled root suites each completed in about 28 seconds; the middleware tests intentionally exercise timeouts and throttling. `go test -coverprofile` reported 82.9% statement coverage across the root router and middleware packages. The two nested example modules compile but contain no runnable standard Go tests, matching the adapter's explicit blockers for those owners.

## Problems Exposed And Fixed

The live audit exposed a lexical false negative in direct evidence. `mux_test.go` directly calls `Chain`, and native coverage reports every function in `chain.go` at 100%, but the adapter reported the file as untested. A route string containing `/*` appeared before the call and a later string contained `*/`; the old comment regular expression treated those string contents as a real block comment and masked the call between them.

Go comments and string or rune literals are now masked by a single bounded lexical scan. It distinguishes code, line comments, block comments, interpreted strings, raw strings, runes, and escapes while preserving newlines and source positions. Comment-shaped text inside an HTTP route string can no longer hide later symbols, and symbol-shaped text inside real strings or comments remains excluded. The evidence rules themselves are unchanged: the recovered relationship is still a same-package, uniquely owned top-level function call.

With the pinned Darwin/arm64 target, the pre-fix root audit reported 15 untested, 22 covered, 10 skipped, and 49 evidence relationships. After the lexical fix it reports 14 untested, 23 covered, 10 skipped, and 66 relationships. `chain.go` moved to covered through a direct `go-symbol-reference` from `mux_test.go` plus bounded indirect evidence from `tree_test.go`. The additional relationships were previously hidden calls and type constructions in the same masked spans.

## Target And Project Ownership Review

`middleware/profiler.go` declares `//go:build !tinygo`. An untargeted static audit therefore keeps its command blocked instead of inheriting the host environment. Supplying the explicit Darwin/arm64 target selects that file and emits the exact root command shown above.

Repository analysis detects three independent Go modules:

- the root module is high confidence, has one verification command, and has no blockers
- `_examples/rest` is independently owned and blocked because it has no runnable standard test
- `_examples/versions` is independently owned and blocked for the same reason

This produces complete adapter coverage for all three detected projects, two honest no-test blockers, and one executable root verification command. The root audit excludes the nested modules while retaining the other examples that Go includes in the root module's `./...` pattern.

## Reviewed Boundary

The HTTP/service probe passes the reviewed detection, ownership, target, command, evidence, ranking, stability, and performance areas for this bounded shape:

- build-constrained HTTP middleware requires an explicit reproducible target
- nested example modules retain independent ownership and do not contaminate the root command
- HTTP handlers and middleware with no native statement coverage remain untested
- `chain.go` is recovered from an exact top-level call without claiming package-wide coverage
- receiver methods, interface dispatch, route runtime reachability, and assertion completeness remain outside the evidence claim

## Corpus Progress

This checkout completes the second of the three required Go promotion roles. It remains documented here rather than entering `validation-corpus/v1` early, because the current corpus contract contains the supported adapters only. The [Go workspace ownership validation](go-ownership-validation-report.md) subsequently completed the final live role. The remaining promotion work is the generated large-module performance and evidence-count regression gate, followed by an explicit support decision and entry of all three cases into the shared corpus.
