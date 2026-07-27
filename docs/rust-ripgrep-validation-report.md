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

| Result | Count |
| --- | ---: |
| Detected/audited projects | 12 |
| Exact package commands | 10 |
| Blocked no-test packages | 2 |
| Untested candidates | 30 |
| Covered-but-risky candidates | 24 |
| Deferred targets | 9 |
| Direct evidence relationships | 24 |

## Native Validation

The checkout passed with Rust 1.97.1 and Cargo 1.97.1 on Darwin arm64:

- `cargo test --workspace`
- `cargo test -p ripgrep`
- `cargo check --workspace`
- `cargo fmt --all --check`

The workspace run listed 1,220 tests across its native harnesses. The recovered root command ran 118 unit tests from the custom binary target and 323 macro-generated integration tests, all passing.

## Stability And Performance

Three post-fix project audits produced the same normalized SHA-256 digest, `b500f60776a9ea094563ad80274985228cfddcc73b8f7592bc6078963b05efdd`.

| Run | Duration |
| --- | ---: |
| 1 | 295 ms |
| 2 | 248 ms |
| 3 | 245 ms |

The median was 248 ms for twelve detected and audited projects.

## Remaining Boundary

The root binary lives at the manifest-declared custom path `crates/core/main.rs`, outside the current `src/` ownership boundary. The adapter therefore recovers the correct root verification command but does not claim root candidates or evidence. Method/trait dispatch, macro-expanded test-to-source evidence, doctest evidence, feature-specific targets, and the fuzz harness also remain outside the current matrix.

The live result supports the literal workspace and explicit built-in target slices, but it does not justify promotion beyond experimental. Custom Cargo target paths are the clearest next ownership slice.
