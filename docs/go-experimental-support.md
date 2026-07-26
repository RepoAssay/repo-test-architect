# Go Experimental Support

This matrix defines the bounded Go adapter through its explicit build-target slice. The adapter is registered as `experimental`: its single-module, `go.work`, and build-target fixtures, native Go command validation, shared artifact pipeline, implementation coverage floor, golden snapshots, and model-consistency plan locks are complete, but live-repository corpus and generated large-module performance validation still precede a supported public-alpha claim.

## Current Bounded Coverage

| Area | Current support | Evidence used |
| --- | --- | --- |
| Project shape | Conventional modules rooted by `go.mod`; literal repository-contained `go.work` members and nested modules remain separate detected projects | root `go.mod`, module path, nearest ancestor `go.work`, literal `use` directives, and nested `go.mod` ownership boundaries |
| Test execution | Runnable standard-library `TestXxx`, `FuzzXxx`, and `ExampleXxx` functions in `_test.go` files | conventional filenames and literal `testing.T`/`testing.F` function signatures |
| Command | module-local `go test ./...` for an unblocked standalone or exactly declared workspace module with at least one runnable standard test | root module marker, runnable test evidence, complete nearest-workspace membership, and absence of out-of-scope execution markers |
| Build target | optional explicit `GOOS`, `GOARCH`, and custom tags for statically selectable files | boolean `//go:build` expressions, standard platform aliases, `unix`, and `_GOOS`, `_GOARCH`, or `_GOOS_GOARCH` filename suffixes |
| Test provenance | exact co-located `foo.go`/`foo_test.go` naming, unique same-package top-level functions/types, and exact external `package_test` imports through the module path | filename ownership, package declarations, literal imports/aliases, unique declarations, and visible calls or type construction |
| Candidate boundaries | parsers, mappers, validators, formatters, calculators, codecs, HTTP handlers, clients, services, repositories, external I/O, concurrency, and branching utilities | file paths, imports, declarations, branching, HTTP, I/O, goroutine, channel, and synchronization signals |
| Low-value boundaries | generated files, command wiring, struct-only DTOs, and files without detected runtime behavior | standard generated header, `package main`/`func main`, declarations, and source content |
| Changed-file audits | repository-relative and absolute source paths | normalized paths passed through the shared audit API |

`go-symbol-reference` evidence is `direct` with `called` usage for a uniquely owned top-level function call, or `referenced` for a uniquely owned type construction. A test-local declaration with the same name is not source evidence. Filename convention remains weaker `naming` evidence.

The adapter does not execute repository code, `go list`, module hooks, generators, or tests during an ordinary audit. The reported command is repository guidance, not a claim that it was run. Target selection is explicit rather than host-dependent: callers pass `goTarget: { goos, goarch, tags }`, or the CLI equivalents `--goos`, `--goarch`, and repeated `--go-tag` values.

## Native Fixture Validation

On 2026-07-26, the checked-in standalone and two-module workspace fixtures passed module-local `go test ./...`, `go test -race ./...`, and `gofmt` validation with Go 1.26.5 on Darwin arm64. The build-target fixture additionally passed `GOOS=darwin GOARCH=arm64 go test -tags=integration ./...` and its race-enabled equivalent. The workspace service imports its sibling pricing module through `go.work`, so the native check covers actual cross-module resolution. Audits remain static and do not execute project code.

## Explicit Blockers And Exclusions

The bounded adapter withholds the verification command and emits a blocker for:

- a direct aggregate `go.work` root audit instead of its detected module projects
- a module omitted by its nearest `go.work`
- malformed, escaping, absolute, missing, or otherwise unresolved `use` declarations in the nearest workspace
- constrained source files when no explicit `GOOS` and `GOARCH` target is supplied
- legacy-only `// +build` constraints, malformed expressions, unsupported target pairs, and environment-dependent tags such as `cgo`, release tags, compiler tags, or architecture feature tags
- Ginkgo/Gomega execution
- a missing root `go.mod`
- no runnable standard-library test

Nested modules, `vendor`, `testdata`, dependency/build output directories, and symbolic links are excluded from the owning module audit. Nested `go.mod` roots remain independently discoverable. With a valid target, matching constrained source and test files participate in ordinary evidence collection with `build-target-selected`; nonmatching source files remain visible as `build-target-excluded` deferred items and cannot contribute test evidence.

The current evidence model does not resolve receiver methods, interfaces, embedding, generics, init-time behavior, internal test helpers, generated mocks, reflection, cgo-dependent selection, release/compiler/architecture-feature tags, workspace `replace` effects, custom commands, coverage profiles, runtime reachability, or assertion completeness. Testify may be reported as a setup signal, but no Testify-specific assertion claim is emitted.

## Promotion TODO

Promote `go` from `experimental` to `supported` only after:

1. A pinned three-repository corpus covers a conventional library, an HTTP/service application, and a difficult multi-package or nested-module ownership shape.
2. A generated large-module performance and evidence-count regression gate is added.
3. Live review finds no false ownership, command, or direct-evidence upgrades and converts concrete gaps into fixtures.
4. The shared release gate passes with Go included in package, CLI, MCP, schema, documentation, and cross-adapter checks.

Literal `go.work` ownership and explicit build-target selection are complete for this bounded slice. The adapter parses single and block `use` directives without executing Go tooling, preserves each `go.mod` owner, blocks incomplete graphs, evaluates bounded target constraints without inheriting the host environment, and never substitutes one aggregate-root command for module-local verification. Large-module performance and the pinned live-repository corpus are the next promotion targets.

Native test generation and repair loops remain deferred.
