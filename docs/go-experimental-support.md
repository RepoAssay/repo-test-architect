# Go Experimental Support

This matrix defines the bounded Go adapter and its first workspace-hardening slice. The adapter is registered as `experimental`: its single-module and `go.work` fixtures, native Go command validation, shared artifact pipeline, implementation coverage floor, golden snapshots, and model-consistency plan locks are complete, but live-repository corpus and generated large-module performance validation still precede a supported public-alpha claim.

## Current Bounded Coverage

| Area | Current support | Evidence used |
| --- | --- | --- |
| Project shape | Conventional modules rooted by `go.mod`; literal repository-contained `go.work` members and nested modules remain separate detected projects | root `go.mod`, module path, nearest ancestor `go.work`, literal `use` directives, and nested `go.mod` ownership boundaries |
| Test execution | Runnable standard-library `TestXxx`, `FuzzXxx`, and `ExampleXxx` functions in `_test.go` files | conventional filenames and literal `testing.T`/`testing.F` function signatures |
| Command | module-local `go test ./...` for an unblocked standalone or exactly declared workspace module with at least one runnable standard test | root module marker, runnable test evidence, complete nearest-workspace membership, and absence of out-of-scope execution markers |
| Test provenance | exact co-located `foo.go`/`foo_test.go` naming, unique same-package top-level functions/types, and exact external `package_test` imports through the module path | filename ownership, package declarations, literal imports/aliases, unique declarations, and visible calls or type construction |
| Candidate boundaries | parsers, mappers, validators, formatters, calculators, codecs, HTTP handlers, clients, services, repositories, external I/O, concurrency, and branching utilities | file paths, imports, declarations, branching, HTTP, I/O, goroutine, channel, and synchronization signals |
| Low-value boundaries | generated files, command wiring, struct-only DTOs, and files without detected runtime behavior | standard generated header, `package main`/`func main`, declarations, and source content |
| Changed-file audits | repository-relative and absolute source paths | normalized paths passed through the shared audit API |

`go-symbol-reference` evidence is `direct` with `called` usage for a uniquely owned top-level function call, or `referenced` for a uniquely owned type construction. A test-local declaration with the same name is not source evidence. Filename convention remains weaker `naming` evidence.

The adapter does not execute repository code, `go list`, module hooks, generators, or tests during an ordinary audit. The reported command is repository guidance, not a claim that it was run.

## Native Fixture Validation

On 2026-07-26, the checked-in standalone and two-module workspace fixtures passed module-local `go test ./...`, `go test -race ./...`, and `gofmt` validation with Go 1.26.5 on Darwin arm64. The workspace service imports its sibling pricing module through `go.work`, so the native check covers actual cross-module resolution. Audits remain static and do not execute project code.

## Explicit Blockers And Exclusions

The bounded adapter withholds the verification command and emits a blocker for:

- a direct aggregate `go.work` root audit instead of its detected module projects
- a module omitted by its nearest `go.work`
- malformed, escaping, absolute, missing, or otherwise unresolved `use` declarations in the nearest workspace
- any owned Go file with `//go:build` or legacy `// +build` constraints
- Ginkgo/Gomega execution
- a missing root `go.mod`
- no runnable standard-library test

Nested modules, `vendor`, `testdata`, dependency/build output directories, and symbolic links are excluded from the owning module audit. Nested `go.mod` roots remain independently discoverable.

The current evidence model does not resolve receiver methods, interfaces, embedding, generics, init-time behavior, internal test helpers, generated mocks, reflection, build-tag selection, cgo, workspace `replace` effects, custom commands, coverage profiles, runtime reachability, or assertion completeness. Testify may be reported as a setup signal, but no Testify-specific assertion claim is emitted.

## Promotion TODO

Promote `go` from `experimental` to `supported` only after:

1. A pinned three-repository corpus covers a conventional library, an HTTP/service application, and a difficult multi-package or nested-module ownership shape.
2. A generated large-module performance and evidence-count regression gate is added.
3. Live review finds no false ownership, command, or direct-evidence upgrades and converts concrete gaps into fixtures.
4. The shared release gate passes with Go included in package, CLI, MCP, schema, documentation, and cross-adapter checks.

Literal `go.work` ownership is complete for this bounded slice: the adapter parses single and block `use` directives without executing Go tooling, preserves each `go.mod` owner, blocks incomplete graphs, and never substitutes one aggregate-root command for module-local verification. Build-target configuration is the next static ownership hardening candidate.

Native test generation and repair loops remain deferred.
