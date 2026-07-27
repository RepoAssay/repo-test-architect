# Go Dot-Import Validation Report

This report records post-promotion pressure against [`uber-go/zap`](https://github.com/uber-go/zap) at exact commit `5b81b37b81b8e2ed447a6f57991e372ee4fa5c8f`. The checkout is a multi-package logging library with standard-library tests, external `_test` packages, constructor-heavy APIs, interface-returning factories, and package-local test support. Repository code was executed only for native validation; ordinary audits remain static.

## Selection And Native Review

Zap was selected after comparing it with Resty, `go-retryablehttp`, and Afero. Its 143 Go files and 77 test files add a distinct multi-package, external-test-package shape without requiring a database or another service.

On 2026-07-26, the pinned checkout passed with Go 1.26.5 on Darwin arm64:

- `go test ./...`
- `go test -race ./...`
- `gofmt` cleanliness

`go test -coverprofile` reported 92.5% statement coverage across the module. The root package reported 99.5%, `zapcore` 97.3%, and `zaptest/observer` 98.4%. Native coverage is corroborating review evidence only; the adapter does not execute these commands or read coverage profiles during an audit.

## Gap Exposed And Fixed

The pre-fix audit reported 9 untested, 41 covered, 9 skipped, and 217 evidence relationships. Seven of the untested files were heavily exercised: `zaptest/observer/observer.go` and six `zapcore` files covering console encoding, errors, hooks, level filtering, sampling, and tee composition.

Those external `_test` packages import their exact module-local package with declarations such as:

```go
import . "go.uber.org/zap/zapcore"
```

The adapter already resolved default and named aliases but discarded the dot alias, so every otherwise exact unqualified symbol call in those files lost provenance. The fix retains `.` as an exact external-package import mode and applies the existing directory, package, unique-symbol, test-local-shadow, call-shape, and explicit receiver-binding checks to unqualified names. External-package evidence is restricted to exported identifiers; blank imports and unrelated package paths remain ineligible.

After the fix, the audit reports 2 untested, 48 covered, 9 skipped, and 286 evidence relationships. The seven recovered files agree with native coverage. `zapcore/error.go` is recovered through the existing one-hop source rule from a directly called dot-imported entrypoint; the other six gain direct calls and, where applicable, filename evidence.

Three repeated post-fix audits took 1,026, 962, and 960 ms and produced one normalized digest, `64594e7a19a33fcf688ebdae51691c1a7dffa6d5f835edebcd2c10693cb58318`.

## Boundary Review

The two remaining untested files, `internal/ztest/timeout.go` and `internal/ztest/writer.go`, both reported 0% native statement coverage at the pin. The adapter therefore does not need package-wide or internal-helper inference to make the audit agree with the observed suite.

Zap still contains constructor-created interface values and calls through those interfaces. This slice does not infer their concrete receiver types, expand interface dispatch, or add cross-package source dependencies. It recovers only symbols made statically visible by an exact dot import.

The static profile continues to withhold a verification command unless build selection is fully explicit. Zap contains platform constraints, the `tools` tag, and a `go1.21` release tag; release-tag evaluation remains outside the bounded target model even though the pinned checkout's native command was reviewed successfully.

All three promoted Go validation-corpus cases retained their candidate counts, evidence counts, and canonical audit digests after this change. Zap remains a post-promotion pressure report rather than a fourth passing corpus role because its release-tag command boundary is intentionally unresolved.

The later exact constructor-result slice retains Zap's candidate counts, 286 relationships, and conservative interface-returning factory boundary. Bounded cross-package source evidence subsequently adds one indirect relationship from `zaptest/observer/logged_entry_test.go` through the sole `LoggedEntry.ContextMap` callable to `zapcore.NewMapObjectEncoder`, for 287 relationships without changing a candidate category.

The later assertion-usage and parser-scope slices retain those 287 relationships and all candidate classifications while upgrading 56 exact Testify relationships. Its current three-run median is 662 ms and normalized digest is `ef7f291da706cf6f59f0f73c9ada5c455e9914c81edac203491b9387874eba61`; details are recorded in the [Go Assertion-Usage Validation Report](go-assertion-validation-report.md) and [Go Parser-Scoped Binding Validation Report](go-parser-scope-validation-report.md).
