# Go Cross-Package Source Validation Report

This report records bounded module-local source-edge pressure against [`riverqueue/river`](https://github.com/riverqueue/river) at `b6c733cf8699eeb825a0c719c6c81041817d87c9` and [`uber-go/zap`](https://github.com/uber-go/zap) at `5b81b37b81b8e2ed447a6f57991e372ee4fa5c8f`. It extends the existing one-hop evidence rule without executing Go tooling during an ordinary audit.

## Boundary Derived From Pressure

The first implementation allowed any directly evidenced source file to propagate through an exact module-local import. On River this retained candidate counts but expanded the root audit from 572 to 1,199 relationships. The result was too broad: a file with many callable declarations and many direct test paths could copy all those paths to every imported function call without proving which callable owned the edge.

The retained rule requires all of the following:

- the caller source file already has direct `called` test evidence
- the caller file declares exactly one callable function or method
- the dependency is inside the same `go.mod` owner and outside nested-module boundaries
- the caller uses the dependency through an exact default, named, or dot import
- the dependency function is exported and uniquely owned in its package directory
- the import alias is not blank or visibly shadowed

Only one hop is emitted. Existing indirect evidence never becomes another root, and source files with zero or multiple callable declarations remain uncredited.

## River Result

Three exact-pin root audits took 983, 896, and 937 ms. They report 6 untested, 47 covered, 10 skipped, and 576 relationships with normalized digest `37c91a11954bed715e62be18e779e4dbf4ee20606f348ea2b84878bee293a7eb`.

The four additions all target `internal/jobexecutor/job_executor.go`:

- `client_test.go`
- `example_complete_job_within_tx_test.go`
- `job_complete_tx_test.go`
- `metadata_test.go`

Each path directly exercises the sole callable in `metadata.go`, `MetadataSet`, whose exact module-local import calls exported `jobexecutor.MetadataUpdatesFromWorkContext`. No candidate category changes. River's previously reviewed native and service-prerequisite results remain recorded in the [Go Workspace Ownership Validation Report](go-ownership-validation-report.md).

## Zap And Control Repositories

Zap retains 2 untested, 48 covered, and 9 skipped targets while moving from 286 to 287 relationships. The addition connects `zaptest/observer/logged_entry_test.go` through the sole `LoggedEntry.ContextMap` callable in `zaptest/observer/logged_entry.go` to `zapcore.NewMapObjectEncoder` in `zapcore/memory_encoder.go`.

TOML, Chi, Resty, `go-retryablehttp`, and Afero remain semantically unchanged. The generated 400-source/200-test fixture also retains exactly 200 covered, 200 untested, and 200 evidence relationships within its five-second ceiling.

## Native Fixture

The checked-in standalone fixture now calls `internal/currency.Valid` from the directly tested, single-callable `price_parser.go`. On 2026-07-27 it passed `go test ./...`, `go test -race ./...`, and `gofmt` with Go 1.26.5 on Darwin arm64. Its golden audit and model-consistency scenario lock the cross-package `go-source-dependency` relationship and resulting plan item.

This slice does not claim multi-callable function-body ownership, cross-module reachability, interfaces, runtime dispatch, or dependencies beyond one source hop.

The later assertion-usage slice preserves the same River and Zap candidate and relationship counts while enriching entrypoint usage. River's current root digest is `a9ef959b5dae0685ab338d0a41ae8e6e70f73e3137654ea4ab91b46254c2ae6d`; Zap's is `ef7f291da706cf6f59f0f73c9ada5c455e9914c81edac203491b9387874eba61`. The assertion boundary is documented separately in the [Go Assertion-Usage Validation Report](go-assertion-validation-report.md).
