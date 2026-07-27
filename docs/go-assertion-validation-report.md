# Go Assertion-Usage Validation Report

This report records bounded assertion-usage pressure against the three pinned Go corpus repositories plus post-promotion Zap and Resty controls. The slice enriches existing `go-symbol-reference` and `go-source-dependency` relationships; it does not create package-wide coverage or move candidate classifications.

## Retained Boundary

A direct function or receiver-method call is `asserted` only when it is:

- inside the final condition of an `if` whose top-level branch calls `Error`, `Errorf`, `Fail`, `FailNow`, `Fatal`, or `Fatalf` on an exact `*testing.T` or `*testing.F` parameter
- inside a supported assertion call from an exact default, named, or dot import of `github.com/stretchr/testify/assert` or `github.com/stretchr/testify/require`
- assigned through one unique, unreassigned `:=` binding that is consumed by one of those assertion bodies

Inline `if` initializers are credited through their result binding only when the final condition checks it. The adapter rejects unrelated or nested failure branches, Testify alias shadows, helper assertions, reassigned or duplicate result bindings, arbitrary assertion packages, and deeper result flow. When one test path produces both `called` and `asserted` evidence for the same relationship, the asserted form wins. A bounded source hop preserves the direct entrypoint's `viaUsage` without claiming that the dependency itself was asserted.

## Pinned Corpus Results

All candidate and relationship counts remained unchanged:

| Repository | Candidates (`untested / covered / skipped`) | Relationships | Asserted | Three-run samples (ms) | Median (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| [`BurntSushi/toml`](https://github.com/BurntSushi/toml) at `c6d720d` | `6 / 9 / 7` | 50 | 3 | `287 / 245 / 238` | 245 |
| [`go-chi/chi`](https://github.com/go-chi/chi) at `8b258c7` | `14 / 23 / 10` | 70 | 2 | `623 / 563 / 560` | 563 |
| [`riverqueue/river`](https://github.com/riverqueue/river) at `b6c733c` | `6 / 47 / 10` | 576 | 12 | `960 / 885 / 899` | 899 |

The normalized corpus digests are now:

- TOML: `9489b38da82cabd66db1f0ccd50a01a18e304f8f9077ceaa019d319d0b046979`
- Chi: `d452349229f777e8ff24bd67dc0d1440451625dc6c188e41dd1c41399a00e3fc`
- River: `a9ef959b5dae0685ab338d0a41ae8e6e70f73e3137654ea4ab91b46254c2ae6d`

TOML and Chi provide the standard-library proof. River's 12 upgrades are exact `require` calls, including `ClientFromContext`, notifier behavior, maintenance startup, uniqueness checks, and worker output. The initial implementation raised River's audit to roughly 1.43 seconds by repeatedly rescanning large test files; indexing unique result bindings once per test file restored the measured median below the preceding 937 ms corpus baseline.

## Post-Promotion Controls

Zap provides the strongest Testify pressure. Its audit retains `2 / 48 / 9` candidates and 287 relationships, of which 56 are asserted. Three runs took 696, 614, and 615 ms (median 615 ms), with normalized digest `ef7f291da706cf6f59f0f73c9ada5c455e9914c81edac203491b9387874eba61`. Reviewed examples include direct `assert.Equal`, `assert.NoError`, `require.Equal`, receiver-method assertions, and 19 existing one-hop relationships whose entrypoints now carry `viaUsage: asserted`.

Resty is the negative control. It retains `0 / 19 / 2`, 119 relationships, zero assertion upgrades, and its previous digest `1609fc14f89b36babe350822ca98737eaa321f0e409b7370a0b8be5eadaad487`; its three samples were 1,510, 1,484, and 1,440 ms. The rule therefore does not infer assertion usage merely from constructor-heavy tests or a nearby failure API.

The generated 400-source/200-test fixture remains exactly 200 covered, 200 untested, and 200 evidence relationships inside its five-second ceiling. The checked-in native Go fixtures continue to pass ordinary, race-enabled, and formatting checks. Example output comments, custom/helper assertion APIs, multi-hop aliases, and full control-flow completeness remain outside this claim.
