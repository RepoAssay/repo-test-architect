# Go Alpha Support

This matrix defines the bounded supported Go adapter through its pinned conventional-library, HTTP/service, and difficult-workspace-ownership validations. Its single-module, `go.work`, build-target, one-hop dependency, lexical masking, and generic-function fixtures; all three live roles; native Go command validation; generated large-module performance gate; shared artifact pipeline; implementation coverage floor; golden snapshots; model-consistency plan locks; and validation-corpus scorecards are complete.

## Current Bounded Coverage

| Area | Current support | Evidence used |
| --- | --- | --- |
| Project shape | Conventional modules rooted by `go.mod`; literal repository-contained `go.work` members and nested modules remain separate detected projects | root `go.mod`, module path, nearest ancestor `go.work`, literal `use` directives, and nested `go.mod` ownership boundaries |
| Test execution | Runnable standard-library `TestXxx`, `FuzzXxx`, and `ExampleXxx` functions in `_test.go` files | conventional filenames and literal `testing.T`/`testing.F` function signatures |
| Command | module-local `go test ./...` for an unblocked standalone or exactly declared workspace module with at least one runnable standard test | root module marker, runnable test evidence, complete nearest-workspace membership, and absence of out-of-scope execution markers |
| Build target | optional explicit `GOOS`, `GOARCH`, and custom tags for statically selectable files | boolean `//go:build` expressions, standard platform aliases, `unix`, and `_GOOS`, `_GOARCH`, or `_GOOS_GOARCH` filename suffixes |
| Test provenance | exact co-located `foo.go`/`foo_test.go` naming, unique same-package top-level functions/types, generic top-level function calls with inferred or explicit type arguments, value or pointer receiver methods called through a unique concrete local binding, exact external `package_test` imports through the module path using default, named, or dot imports, and one called same-package or bounded module-local source dependency | filename ownership, package declarations, literal imports/aliases, exported external identifiers, balanced generic declarations/instantiations, receiver type plus method ownership, unambiguous explicit types or exact simple non-generic constructor result positions, visible calls or type construction, one same-package unique function call, or one exported unique function call through an exact module-local import from a source file with exactly one callable declaration |
| Candidate boundaries | parsers, mappers, validators, formatters, calculators, codecs, HTTP handlers, clients, services, repositories, external I/O, concurrency, and branching utilities | file paths, imports, declarations, branching, HTTP, I/O, goroutine, channel, and synchronization signals |
| Low-value boundaries | generated files, command wiring, struct-only DTOs, and files without detected runtime behavior | standard generated header, `package main`/`func main`, declarations, and source content |
| Changed-file audits | repository-relative and absolute source paths | normalized paths passed through the shared audit API |

`go-symbol-reference` evidence is `direct` with `called` usage for a uniquely owned top-level function call or receiver method call, or `referenced` for a uniquely owned type construction. Receiver methods require a unique receiver-type/method declaration and a unique concrete test binding before `client.Authorize(...)`. The binding may be explicit, such as `client := Client{}` or `var client *Client = &Client{}`, or use `:=` with the exact result position of a unique, simple, non-generic function declaration such as `client, err := NewClient()`. Single and simple named or unnamed result lists are supported. Exact external-package default, named, and dot imports are supported. External evidence is limited to exported identifiers, while blank imports, unrelated paths, test-local shadows, chained constructor calls, interfaces, aliases, helper returns, reassignment, and duplicate or shadowed bindings contribute nothing. `go-source-dependency` is `indirect` with `viaUsage: called` for one function dependency from a directly called source file. Same-package calls retain the existing unique unqualified rule. Cross-package calls additionally require an exact module-local default, named, or dot import, an exported unique dependency function, no visible alias shadow, and exactly one callable declaration in the caller file. Evidence never propagates to a second source hop. Filename convention remains weaker `naming` evidence.

Go source is lexically masked before symbol matching. The bounded scanner distinguishes line and block comments, interpreted and raw strings, runes, and escapes so comment-shaped HTTP route strings cannot hide later calls and symbol-shaped literal text cannot become evidence.

The adapter does not execute repository code, `go list`, module hooks, generators, or tests during an ordinary audit. The reported command is repository guidance, not a claim that it was run. Target selection is explicit rather than host-dependent: callers pass `goTarget: { goos, goarch, tags }`, or the CLI equivalents `--goos`, `--goarch`, and repeated `--go-tag` values.

## Native Fixture Validation

On 2026-07-27, the checked-in standalone and two-module workspace fixtures passed module-local `go test ./...`, `go test -race ./...`, and `gofmt` validation with Go 1.26.5 on Darwin arm64. The standalone fixture binds `PaymentClient` from the named result position of `NewPaymentClient`, exercises it against `httptest`, and reaches `internal/currency.Valid` through the directly tested `ParsePrice` entrypoint; the build-target fixture additionally passed `GOOS=darwin GOARCH=arm64 go test -tags=integration ./...` and its race-enabled equivalent. The workspace service imports its sibling pricing module through `go.work`, so the native check covers actual cross-module resolution. Audits remain static and do not execute project code.

The first pinned live probe, [`BurntSushi/toml`](https://github.com/BurntSushi/toml) at `c6d720d83547bb8d7afb067ba9df8bad0323e2d1`, passed `go test ./...`, `go test -race ./...`, and `gofmt`. Its reviewed audit drove bounded source-dependency evidence and a project-detection fix for nested Go `testdata`. Full measurements and remaining gaps are recorded in the [Go Validation Hunt Report](go-validation-hunt-report.md).

The second pinned live probe, [`go-chi/chi`](https://github.com/go-chi/chi) at `8b258c7bb28f97a5f2a856ff7ef962578fec9215`, passed the same native checks under Darwin/arm64 and reported 82.9% statement coverage. Its HTTP wildcard routes drove Go-aware lexical masking, while its `!tinygo` middleware and nested example modules validated explicit target and project ownership. Full measurements are recorded in the [Go HTTP Validation Report](go-http-validation-report.md).

The third pinned live probe, [`riverqueue/river`](https://github.com/riverqueue/river) at `b6c733cf8699eeb825a0c719c6c81041817d87c9`, preserved all nine literal `go.work` owners and their module-local commands. Its generic driver conformance entrypoints drove balanced top-level generic function declaration and call evidence. Service-independent modules passed local ordinary and race-enabled tests; the remaining modules require the repository's PostgreSQL prerequisite and passed in the pinned upstream matrix. Full measurements are recorded in the [Go Workspace Ownership Validation Report](go-ownership-validation-report.md).

After adding explicitly typed receiver-method evidence, all three pinned corpus roles retained their candidate counts, evidence counts, and canonical audit digests. The live pass also caught and fixed an initial test-method shadow-set regression before any baseline was updated. Exact constructor-result evidence later retained every candidate classification while adding one direct relationship in TOML and one direct plus three bounded one-hop relationships in Chi; River remained byte-for-byte stable.

Post-promotion pressure against [`uber-go/zap`](https://github.com/uber-go/zap) at `5b81b37b81b8e2ed447a6f57991e372ee4fa5c8f` recovered seven natively exercised files hidden by exact external-package dot imports. The bounded fix moved the audit from 9 untested and 217 evidence relationships to 2 untested and 286 relationships while all three promoted corpus digests remained stable. Full measurements and the retained interface/release-tag boundaries are recorded in the [Go Dot-Import Validation Report](go-dot-import-validation-report.md).

Post-promotion constructor pressure against [`go-resty/resty`](https://github.com/go-resty/resty) at `503cee173b035791478d5c1f647f4202535591d0` recovered exact client method provenance from simple concrete constructor result positions. The audit retained 0 untested, 19 covered, and 2 skipped targets while moving from 117 to 119 evidence relationships; ordinary and race-enabled native suites plus formatting passed. Full measurements and exclusions are recorded in the [Go Constructor-Result Validation Report](go-constructor-validation-report.md).

Bounded cross-package pressure retains every candidate classification while adding four exact root-module relationships in River and one in Zap. River's links connect the single-callable `metadata.go` entrypoint to `internal/jobexecutor.MetadataUpdatesFromWorkContext`; Zap connects `LoggedEntry.ContextMap` to `zapcore.NewMapObjectEncoder`. Full measurements and ambiguity controls are recorded in the [Go Cross-Package Source Validation Report](go-cross-package-validation-report.md).

## Explicit Blockers And Exclusions

The bounded adapter withholds the verification command and emits a blocker for:

- a `go.work`-only aggregate root audit instead of its detected module projects
- a module omitted by its nearest `go.work`
- malformed, escaping, absolute, missing, or otherwise unresolved `use` declarations in the nearest workspace
- constrained source files when no explicit `GOOS` and `GOARCH` target is supplied
- legacy-only `// +build` constraints, malformed expressions, unsupported target pairs, and environment-dependent tags such as `cgo`, release tags, compiler tags, or architecture feature tags
- Ginkgo/Gomega execution
- a missing root `go.mod`
- no runnable standard-library test

Nested modules, `vendor`, `testdata`, dependency/build output directories, and symbolic links are excluded from the owning module audit. Nested `go.mod` roots remain independently discoverable. With a valid target, matching constrained source and test files participate in ordinary evidence collection with `build-target-selected`; nonmatching source files remain visible as `build-target-excluded` deferred items and cannot contribute test evidence.

The current evidence model does not resolve constructor results with complex, grouped, generic, chained, aliased, interface, helper, or non-`:=` shapes; reassigned, multiply bound, or parameter-inferred receivers; direct composite-literal method calls; interfaces; embedding; generic type construction or generic methods; init-time behavior; internal test helpers; generated mocks; reflection; dependencies beyond one source hop; cross-package calls from files with zero or multiple callable declarations; cross-module dependencies; cgo-dependent selection; release/compiler/architecture-feature tags; workspace `replace` effects; custom commands; coverage profiles; runtime reachability; or assertion completeness. Testify may be reported as a setup signal, but no Testify-specific assertion claim is emitted.

## Promotion Result

Go is promoted from `experimental` to `supported` because all four promotion gates are complete:

1. The generated 400-source/200-test module locks 200 covered candidates, 200 untested candidates, zero skipped candidates, 200 evidence links, and a broad 5-second regression ceiling.
2. The three pinned live reviews contain no unresolved false ownership, command, or direct-evidence upgrades.
3. All three cases are measured in `validation-corpus/v1`, including Chi's explicit Darwin/arm64 target, and pass all 21 shared scorecard areas.
4. The shared alpha and release gates include Go packaging, CLI, MCP, schema, documentation, and cross-adapter checks.

The supported boundary remains deliberately narrow. The adapter parses single and block `use` directives without executing Go tooling, preserves each `go.mod` owner, blocks incomplete graphs, evaluates bounded target constraints without inheriting the host environment, and never substitutes one aggregate-root command for module-local verification.

Native test generation and repair loops remain deferred.
