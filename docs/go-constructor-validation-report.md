# Go Constructor-Result Validation Report

This report records post-promotion pressure against [`go-resty/resty`](https://github.com/go-resty/resty) at exact commit `503cee173b035791478d5c1f647f4202535591d0`. Resty is a constructor-heavy HTTP client with 19 runtime candidates and a large standard-library test suite. Repository code was executed only for native validation; ordinary audits remain static.

## Selection And Native Review

Resty was compared with `go-retryablehttp`, Afero, and Zap after exact dot-import support landed. It supplied the clearest repeated case where tests bind a concrete client directly from a top-level constructor and then call receiver methods.

On 2026-07-27, the pinned checkout passed with Go 1.26.5 on Darwin arm64:

- `go test ./...`
- `go test -race ./...` in 107.923 seconds
- `gofmt` cleanliness

The checkout contains platform-constrained transport files. An ordinary untargeted audit therefore withholds a verification command according to the existing explicit-target policy even though the native host run was reviewed successfully.

## Gap Exposed And Fixed

Before this slice, receiver methods required a binding that spelled the concrete type in the test. A declaration such as `client := New()` carried direct evidence for `New`, but subsequent `client` methods could not be attributed to `*Client` even though the source declaration stated `func New() *Client`.

The bounded rule now indexes only unique top-level functions whose declarations expose simple concrete result positions. A test binding qualifies only when:

- `:=` binds the exact result count and position of that function call
- the call is the complete right-hand side rather than a chained selector or helper expression
- the receiver binding remains unique and is not reassigned
- same-package or exact module-local default, named, or dot import ownership is proven
- external constructor and method identifiers are exported

Single results, `(*Client, error)`, and equivalent fully named result lists are covered. Generic constructors, grouped or mixed result declarations, interfaces, aliases, helper returns, chained calls, `var` inference, assignment, parameters, embedding, and reflection remain uncredited.

## Static Measurements

The baseline audit reported 0 untested, 19 covered, 2 skipped, and 117 evidence relationships. The bounded audit retains every candidate classification and reports 119 relationships with normalized digest `1609fc14f89b36babe350822ca98737eaa321f0e409b7370a0b8be5eadaad487`.

Three cached audits took 1,525, 1,428, and 1,424 ms. A same-machine baseline worktree took 1,359, 1,316, and 1,307 ms. The generated 400-source/200-test Go performance fixture remained within its 5-second ceiling at roughly 300 ms with its exact 200 covered, 200 untested, and 200-evidence contract unchanged.

The net Resty change is three additions and one removal:

- `client.go` gains direct evidence from `request_test.go`
- `debug.go` gains one-hop evidence from `request_test.go`
- `resty.go` gains one-hop evidence from `request_test.go`
- `response.go` loses a stale direct relationship from `request_test.go` because tuple-aware assignment counting now detects that receiver's reassignment

The removed relationship is a precision correction, not lost constructor support.

## Shared-Corpus And Pressure Review

All three promoted Go roles retain their candidate classifications. TOML moves from 49 to 50 relationships through the concrete `MetaData` result of `toml.Decode`; Chi moves from 66 to 70 through `NewRouter() *Mux` plus three existing bounded one-hop consequences; River remains at 572 relationships with the same canonical digest.

The subsequent cross-package slice keeps TOML and Chi stable and moves River from 572 to 576 relationships through four reviewed module-local edges; it is documented separately in the [Go Cross-Package Source Validation Report](go-cross-package-validation-report.md).

The later assertion-usage slice leaves Resty byte-for-byte unchanged at 119 relationships and normalized digest `1609fc14f89b36babe350822ca98737eaa321f0e409b7370a0b8be5eadaad487`, making it the negative control for assertion inference. Details are recorded in the [Go Assertion-Usage Validation Report](go-assertion-validation-report.md).

The other pressure repositories remain conservative: `go-retryablehttp`, Afero, and Zap do not change. No pressure repository changes candidate category.

This slice closes the common direct-constructor receiver gap without claiming interface dispatch, flow-sensitive inference, or package-wide coverage.

The later receiver/callable-ownership slice resolves each constructor binding at its exact call site and removes file-wide indirect leakage. Resty now reports `1 / 18 / 2` candidates and 98 relationships while recovering five direct client/response method links; `debug.go` loses only unrelated indirect evidence. Current measurements are recorded in the [Go Receiver And Callable Ownership Validation Report](go-callable-ownership-validation-report.md).
