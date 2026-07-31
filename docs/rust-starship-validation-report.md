# Rust Starship Live Validation Report

This report records the second pinned public-repository audit for the experimental Rust adapter and its first framework-heavy application role. [`starship/starship`](https://github.com/starship/starship) was cloned and audited locally at [`7946f2d9fbb02a5be76856ed27ddb85da10af3da`](https://github.com/starship/starship/tree/7946f2d9fbb02a5be76856ed27ddb85da10af3da) on 2026-07-31.

## Repository Shape

Starship is an end-user shell-prompt application with one root Cargo package, a library crate, a binary crate, 245 Rust files under `src/`, and 126 source files containing built-in tests. Its dependency graph includes Clap command parsing, Git integration through `gix`, TOML/JSON/YAML configuration, platform-specific notification and system APIs, formatting, filesystem scanning, and a large set of runtime prompt modules.

The bounded adapter detects one high-confidence Cargo package with:

- the exact `cargo test` command
- library and binary architecture signals
- a complete literal source-module graph
- inline `#[cfg(test)]` modules using the built-in harness
- no ownership or command blockers

This makes Starship a representative framework-heavy application rather than another conventional library or difficult workspace graph.

## Native Validation

The final local run used Rust and Cargo 1.97.1, a normal terminal capability value, and Apple Git 2.50.1 ahead of an older Homebrew Git 2.30.1:

```console
cargo test
```

The native result was 1,230 passing library tests, 39 ignored tests, zero failures, and empty binary/doc-test suites. The first two local attempts exposed host prerequisites rather than repository defects: `TERM=dumb` intentionally disables Starship prompt rendering, and Git 2.30.1 lacks behavior assumed by current Git fixture tests. With those prerequisites corrected, the unchanged Cargo command passed. The pinned commit's [upstream test workflow](https://github.com/starship/starship/actions/runs/30574454084) also passes stable and nightly jobs on Ubuntu, macOS, and Windows.

## Initial Audit And Live Finding

Five initial audits were digest-stable and selected `cargo test` with no blockers:

| Result | Initial count |
| --- | ---: |
| Untested candidates | 189 |
| Covered-but-risky candidates | 51 |
| Deferred targets | 5 |
| Direct evidence relationships | 144 |

The result contained one false production owner. `src/lib.rs` declares `src/test/mod.rs` only through an exact `#[cfg(test)] mod test;` edge. That file contains the shared `ModuleRenderer` and fixture machinery used by Starship's inline tests, but it is not part of the production crate graph. The adapter nevertheless treated it as a covered business-logic candidate and attached 94 relationships from application test modules to the test-support file.

## Exact Test-Only Module Boundary

The Rust module graph now records whether a literal module edge is guarded by exact `#[cfg(test)]`. Files reachable only through that edge, plus their literal descendants, are excluded from production candidates and source-evidence ownership.

The rule remains deliberately narrow:

- an unguarded production path to the same physical file wins over a test-only path
- static `#[path = "..."]` remains supported on the guarded declaration
- exact `#[cfg(test)]` propagates through nested literal modules
- broader predicates such as `cfg(any(test, feature = "fixtures"))`, `cfg(not(test))`, `cfg_attr`, computed paths, and macro-generated declarations are not treated as test-only proof
- external test-only modules do not gain new source relationships merely because they are excluded from production ownership

A generated positive/near-miss fixture locks the direct test-only graph, nested descendants, broader predicates, runtime modules, and one file reached by both production and test-only paths.

## Corrected Audit

After the fix, five audits produced the same canonical SHA-256 digest, `89da7c8cabf2f0ee23866dcedced4dd506322e866f616956c2017b2c51dcc3f0`.

| Result | Initial | Corrected |
| --- | ---: | ---: |
| Untested candidates | 189 | 189 |
| Covered-but-risky candidates | 51 | 50 |
| Deferred targets | 5 | 5 |
| Direct evidence relationships | 144 | 50 |

The 239 genuine production candidates and all five existing deferrals remain unchanged. Only `src/test/mod.rs` and its 94 test-support relationships disappear.

| Run | Corrected audit duration |
| --- | ---: |
| 1 | 550 ms |
| 2 | 492 ms |
| 3 | 487 ms |
| 4 | 484 ms |
| 5 | 482 ms |

The corrected median is 487 ms, comfortably inside the generated Rust gate's separate 5-second cross-platform ceiling.

## Promotion-Role Review

| Area | Status | Evidence |
| --- | --- | --- |
| Detection | pass | One exact root Cargo package with library, binary, built-in tests, and high confidence |
| Ownership | pass | Production module graph excludes the exact test-only support graph without losing dual-reachable source files |
| Command | pass | Exact `cargo test`; native and three-platform upstream runs pass with current host prerequisites |
| Evidence | pass | Direct relationships drop from 144 to 50 by removing test-helper ownership rather than inventing downstream reachability |
| Ranking | pass | The same 239 production candidates remain reviewable; only the false test-support candidate disappears |
| Stability | pass | Five corrected audits share one canonical digest |
| Performance | pass | 487 ms corrected median with unchanged production scope |

This is a completed framework-heavy promotion role, but Rust remains experimental until the conventional-library/service role and final cross-role review are complete.

## Remaining Boundary

Most Starship prompt modules are exercised through shared `ModuleRenderer` helpers and runtime name dispatch. The adapter intentionally leaves those files untested unless a runnable test body proves an already-supported direct source relationship. It does not infer production coverage through the test-support module, dynamic module lookup, macros, receiver identity, trait dispatch, or arbitrary helper call graphs.

That conservative under-crediting is visible and preferable to the removed false production claim. A conventional Rust library/service is now the remaining live-corpus role before a promotion review.
