# Rust serde_json Live Validation Report

This report records the third pinned public-repository audit for the Rust adapter and its conventional-library promotion role. [`serde-rs/json`](https://github.com/serde-rs/json) was cloned and audited locally at [`a3e9758ffc88247ab82182cb2505867768a702e3`](https://github.com/serde-rs/json/tree/a3e9758ffc88247ab82182cb2505867768a702e3) on 2026-07-31.

## Repository Shape

serde_json is a standalone Rust 2021 parser and serialization library. The pin contains one root Cargo package, 71 Rust files, 37 production candidates or deferrals, and 154 statically visible built-in test functions across its default and feature-gated sources. Its test surface combines ordinary integration tests, generated module declarations, macros, compile tests, and extensive doctests.

The bounded adapter detects one high-confidence package with:

- the exact `cargo test` command
- one conventional library root and its complete literal module graph
- built-in integration tests under `tests/`
- no ownership or command blockers

This fills the conventional-library/service role without depending on a workspace graph or application framework.

## Native Validation

The unchanged default command passed locally with Rust and Cargo 1.97.1:

```console
cargo test
```

The result was 138 passing default integration tests, 97 passing doctests, one nightly-only UI test explicitly ignored, and zero failures: 235 passes in total. `cargo check` and `cargo fmt --all --check` also passed. The pinned commit's [upstream CI run](https://github.com/serde-rs/json/actions/runs/30402544807) is green, as are its subsequent scheduled runs at the same SHA.

## Initial Audit And Live Finding

The initial audit selected `cargo test`, reported no blockers, and was stable across five runs:

| Result | Initial count |
| --- | ---: |
| Untested candidates | 29 |
| Covered-but-risky candidates | 0 |
| Deferred targets | 8 |
| Direct evidence relationships | 0 |

The zero-evidence result was conservative but unnecessarily narrow. serde_json's integration tests import exact public crate-root names such as `serde_json::{from_str, to_string, Value}`. The library root exposes those names through literal declarations such as `pub use crate::de::{from_slice, from_str, ...};`. The adapter understood direct module-qualified imports but did not map a statically exact crate-root re-export back to its one owned source module.

## Exact Crate-Root Re-Export Boundary

The Rust evidence index now follows a crate-root re-export only when all ownership remains literal and unique:

- the declaration is top-level `pub use crate::<literal module>::<symbol>` or a literal grouped form
- the re-export is declared by the exact library root
- the module resolves to one owned source file
- the imported function or inherent type/method is unique in that file
- the integration test imports the exact public name and directly calls it inside a runnable built-in test

Aliases are preserved on both sides. Wildcard exports, non-`crate::` chains, conditional `cfg`/`cfg_attr` exports, module aliases, foreign crates, test-local shadows, trait methods, instance receivers, macros, helpers, and doctests remain excluded. An import alone still contributes no evidence.

A positive and near-miss fixture locks exact functions, inherent associated calls, aliases, doc attributes, conditional exports, wildcard exports, and relative export chains.

## Corrected Audit

After the bounded fix, five audits produced the same canonical SHA-256 digest, `23b8e4753067e977f149fb49ed2d31b51d58ee26493afeea8fc2fcd6e13786cc`.

| Result | Initial | Corrected |
| --- | ---: | ---: |
| Untested candidates | 29 | 26 |
| Covered-but-risky candidates | 0 | 3 |
| Deferred targets | 8 | 8 |
| Direct evidence relationships | 0 | 4 |

The four exact relationships connect `tests/map.rs` and `tests/test.rs` to `src/de.rs`, `src/ser.rs`, and `src/value/mod.rs`. Two are asserted and two are called. No candidate or relationship is inferred from the repository's 97 passing doctests or from its unsupported macro, helper, receiver, trait, wildcard, or generated-module paths.

| Run | Corrected audit duration |
| --- | ---: |
| 1 | 166 ms |
| 2 | 133 ms |
| 3 | 130 ms |
| 4 | 131 ms |
| 5 | 130 ms |

The standardized corrected median is 131 ms.

## Promotion-Role Review

| Area | Status | Evidence |
| --- | --- | --- |
| Detection | pass | One exact standalone Cargo library package with high confidence |
| Ownership | pass | One literal library/module graph; tests, generated modules, and ignored roots remain separate |
| Command | pass | Exact `cargo test`; local native and pinned upstream runs pass |
| Evidence | pass | Four exact root-re-export relationships without wildcard, receiver, trait, macro, helper, or doctest inference |
| Ranking | pass | Three directly evidenced source files move to covered while 26 unsupported-evidence candidates remain visible |
| Stability | pass | Five corrected audits share one canonical digest |
| Performance | pass | 131 ms corrected median with 37 production candidates or deferrals |

This completes Rust's conventional-library role. Together with Starship's framework-heavy application and ripgrep's difficult workspace ownership, all three promotion roles pass the shared seven-area scorecard.

## Remaining Boundary

serde_json demonstrates why supported maturity must remain bounded. The native suite proves much more runtime coverage than the static adapter claims, especially through doctests, generated test modules, root macros, helper functions, trait implementations, and instance receiver chains. Those files remain conservatively untested in the audit unless a runnable built-in test proves an already-supported direct relationship.

The promotion claim is therefore not universal Rust coverage inference. It is a supported, deterministic Cargo ownership and direct-evidence boundary whose omissions stay visible rather than becoming false confidence.
