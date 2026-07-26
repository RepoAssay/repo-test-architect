# Go Workspace Ownership Validation Report

This report records the third pinned public-repository audit for the bounded Go adapter, which has since reached supported alpha maturity. The source repository was cloned at an exact commit and audited locally. The checkout exercises a root module, eight nested modules, and a literal `go.work` graph without collapsing their commands or evidence into one aggregate owner.

## Discovery And Selection

The validation finder now exposes a `go-workspace` profile requiring a root `go.mod`, a literal root `go.work` `use` directive, and a root `_test.go` file. Maintained workspace candidates were compared for member count, real tests in nested modules, checkout size, and native command feasibility. [`riverqueue/river`](https://github.com/riverqueue/river) was selected for the difficult-ownership role because its workspace declares nine modules spanning the root package, command tooling, database driver APIs, driver implementations, conformance tests, shared utilities, and public types.

| Repository | Audited commit | Role | Projects | Commands | Untested | Covered | Skipped | Median audit |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [`riverqueue/river`](https://github.com/riverqueue/river) | `b6c733cf8699eeb825a0c719c6c81041817d87c9` | difficult `go.work` ownership graph | 9 | 9 | 15 | 95 | 42 | 622 ms |

Three post-hardening repository audits took 712, 622, and 614 ms. They produced the same normalized project-audit digest, `62dff714c5ccadb78383acb9796e9627bb4cca5cddfdb2d3c032fb5b855df383`, with 662 evidence relationships. The pinned tree contains 296 Go files, including 144 test files.

The shared corpus measures the same exact checkout through the direct root-module adapter contract: three audits took 540, 458, and 467 ms, for a 467 ms median, 6 untested, 47 covered, 10 skipped, and 572 evidence relationships. Their normalized audit digest is `ec066fabe92b0af4c352a72b4098636b9a2c6a21fd3276b91ee99bebae5b9ae9`. The repository-level figures above remain the ownership review across all nine detected projects; the direct measurement is the reproducible per-case corpus baseline.

## Native Validation

On 2026-07-26, the pinned checkout was reviewed with Go 1.26.5 on Darwin arm64. The three service-independent modules passed both ordinary and race-enabled module-local commands:

- `riverdriver`: `go test ./...` and `go test -race ./...`
- `riverdriver/riversqlite`: `go test ./...` and `go test -race ./...`
- `rivertype`: `go test ./...` and `go test -race ./...`

The complete checkout was `gofmt` clean. The other six module-local suites were invoked and reached their tests, but require the repository's PostgreSQL service and `river_test` database; without that prerequisite they failed with the expected connection-refused errors. At the exact pinned commit, [River's upstream build-and-test run](https://github.com/riverqueue/river/actions/runs/30190318870) passed its race-enabled suite on Go 1.26 with PostgreSQL 14 through 18 and on Go 1.25 with PostgreSQL 18. This distinction is retained in the report: `go test ./...` is the correct module-local command, while service provisioning remains a repository execution prerequisite rather than a fact inferred by the static adapter.

## Problem Exposed And Fixed

The pre-hardening audit preserved all nine owners and commands, but the `riverdriver/riverdrivertest` conformance module reported six untested files, zero covered files, nine skipped files, and no evidence. Its external-package tests call the exported generic entrypoint `riverdrivertest.Exercise`, which then calls same-package generic helpers across the module. The declaration collector only recognized `func Name(`, so it missed `func Name[T constraint](`. The runtime classifier had the same blind spot and could mistake files containing local structs plus generic functions for DTO-only files.

Top-level generic function declarations are now parsed with balanced type-parameter brackets, including nested slice or array syntax and multiline declarations. Direct evidence recognizes both inferred calls and explicit instantiations such as `Exercise[int](...)`. Runtime function classification uses the same balanced declaration rule, and the existing one-hop rule may then connect a directly called generic entrypoint to unique same-package helper functions. Receiver methods, deeper hops, cross-package dependencies, and runtime dispatch remain outside the claim.

The focused fixture uses an aliased external test package, an explicitly instantiated generic entrypoint, a generic helper constraint, and one same-package source hop. After the fix, `riverdriver/riverdrivertest` reports all 15 production files covered with 15 evidence relationships and no untested or skipped files.

Across all nine projects, the pre-fix audit reported 22 untested, 79 covered, 51 skipped, and 321 evidence relationships. The hardened audit reports 15 untested, 95 covered, 42 skipped, and 662 relationships. Most of the additional root relationships come from exact calls to generic constructors already spread across many runnable tests, plus the existing weaker one-hop propagation from those directly called source files.

## Ownership And Command Review

Project detection returns exactly the nine literal workspace members:

- `.`
- `cmd/river`
- `riverdriver`
- `riverdriver/riverdatabasesql`
- `riverdriver/riverdrivertest`
- `riverdriver/riverpgxv5`
- `riverdriver/riversqlite`
- `rivershared`
- `rivertype`

Each project retains its own `go.mod`, nearest-workspace membership signal, high-confidence profile, and working-directory-relative `go test ./...` command. Parent audits stop at nested `go.mod` boundaries, so driver implementations and shared utilities do not leak into their ancestors. The root is both the workspace directory and a declared `.` module, so it remains a valid module owner rather than an aggregate-only pseudo-project. The checkout has no build constraints, and no host-derived target was needed.

## Reviewed Boundary

The difficult-ownership probe passes the reviewed detection, ownership, command, evidence, ranking, stability, and live-performance areas for this bounded shape:

- all literal `go.work` members are detected once and audited independently
- nested module boundaries exclude descendant sources and tests from parent evidence
- all nine runnable owners receive module-local commands without an aggregate substitute
- generic top-level calls retain exact package, directory, and symbol provenance
- generic entrypoints may contribute only the existing one same-package source hop
- repeated full-repository audits are semantically stable and remain below one second locally
- database prerequisites are documented without claiming that the static command provisions them

Workspace `replace` effects, repository-external members, constructor-inferred or ambiguous receiver methods, interface dispatch, generic type construction, reflection, deeper or cross-package dependencies, service provisioning, coverage profiles, runtime reachability, and assertion completeness remain outside the bounded adapter.

## Corpus Progress

This checkout is the difficult-ownership role in `validation-corpus/v1`. The conventional-library, HTTP/service, and difficult-ownership probes are all pinned, measured, reviewed, and passing. Together with the generated large-module gate and complete release surface, they support Go's promotion to bounded supported alpha maturity.

The explicitly typed receiver-method slice was remeasured against this exact checkout without changing its candidate counts, 572 evidence relationships, or canonical digest. A test-local method name initially exposed and fixed a shadow-set regression before the corpus baseline could move; methods no longer suppress same-named top-level source functions.
