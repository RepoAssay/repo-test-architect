# Rust ripgrep Live Validation Report

This report records the first pinned public-repository audit for the experimental Rust adapter. [`BurntSushi/ripgrep`](https://github.com/BurntSushi/ripgrep) was cloned and audited locally at [`f9c05a949d1a0dc8e16dee28ca9605d38611faeb`](https://github.com/BurntSushi/ripgrep/tree/f9c05a949d1a0dc8e16dee28ca9605d38611faeb) on 2026-07-27.

## Repository Shape

The pinned root manifest is both the `ripgrep` package and a Cargo workspace. Its literal `members` array declares ten library packages under `crates/`. A nested `fuzz/Cargo.toml` deliberately starts a separate one-package workspace so it does not join the root graph.

Project detection returns twelve independent Cargo roots:

- the root `ripgrep` package
- all ten literal root-workspace members
- the separate `fuzz` workspace package

The root and all ten declared members retain package identity. The fuzz package is not misattributed to the root workspace.

## Live Finding And Fix

Before the live hardening, the adapter emitted nine exact package commands and three blockers. The root package was blocked even though its manifest statically declares `autotests = false` plus a built-in `[[test]]` target at `tests/tests.rs`. That target imports a local `rgtest!` macro whose expansion supplies `#[test]`, so literal attribute scanning cannot see the runnable functions in each invoking file.

The adapter now accepts an explicit Cargo test target as built-in harness evidence when:

- `[[test]]` has a static `path`, or a static `name` resolving to `tests/<name>.rs`
- the target path is repository-contained and exists inside the audited package
- `harness` and `test` are not `false`
- the target does not require feature selection

This restores the exact `cargo test -p ripgrep` command and high profile confidence without manufacturing source-to-test relationships. Disabled targets, custom harnesses, feature-gated targets, missing files, and escaping paths remain excluded.

After the fix, ten of twelve projects have exact package commands. The `grep` facade has no native tests at the pin, and the separate fuzz package declares fuzz binaries rather than built-in tests, so both retain honest no-test blockers.

## Follow-Up Source Target Slice

The root package also declares `crates/core/main.rs` through a static `[[bin]].path`. The adapter now treats an existing package-local `.rs` file named by `[lib].path` or `[[bin]].path` as an exact source root. Missing, escaping, external, non-Rust, and non-static declared paths block command confidence.

This adds `crates/core/main.rs` as one high-risk untested root candidate and classifies the package as a binary. It does not claim the neighboring `crates/core/` module tree, because Cargo names only the crate root and bounded `mod` traversal is not implemented. Command ownership and all existing evidence relationships remain unchanged.

| Result | Count |
| --- | ---: |
| Detected/audited projects | 12 |
| Exact package commands | 10 |
| Blocked no-test packages | 2 |
| Untested candidates | 31 |
| Covered-but-risky candidates | 24 |
| Deferred targets | 10 |
| Direct evidence relationships | 24 |

## Native Validation

The checkout passed with Rust 1.97.1 and Cargo 1.97.1 on Darwin arm64:

- `cargo test --workspace`
- `cargo test -p ripgrep`
- `cargo check --workspace`
- `cargo fmt --all --check`

The workspace run listed 1,220 tests across its native harnesses. The recovered root command ran 118 unit tests from the custom binary target and 323 macro-generated integration tests, all passing.

## Stability And Performance

Three project audits after the source-target follow-up produced the same normalized SHA-256 digest, `948b6a739ea356f92f76e053389b56cb915cfb985b0af5ba2f5fb0e67c533ad9`.

| Run | Duration |
| --- | ---: |
| 1 | 301 ms |
| 2 | 250 ms |
| 3 | 246 ms |

The median was 250 ms for twelve detected and audited projects.

## Remaining Boundary

The root binary at `crates/core/main.rs` is now an exact source candidate, but its sibling modules remain outside ownership until a bounded Rust module graph can prove them. The adapter does not infer source evidence from the macro-generated integration tests. Method/trait dispatch, macro-expanded test-to-source evidence, doctest evidence, feature-specific targets, and the fuzz harness also remain outside the current matrix.

The live result supports the literal workspace, explicit built-in test target, and static lib/bin source-target slices, but it does not justify promotion beyond experimental. Bounded crate-module traversal is the clearest next source-ownership slice.
