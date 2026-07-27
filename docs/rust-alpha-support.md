# Rust Experimental Support

The Rust adapter is experimental. Its first bounded slice proves that a conventional single-package Cargo repository can flow through project detection, audit, ranking, planning, explanations, placement, findings, stats, CLI/MCP-shaped calls, golden snapshots, and model-consistency checks without a Rust-specific report format.

## Supported Baseline

| Area | Supported boundary |
| --- | --- |
| Project ownership | One root `Cargo.toml` with a static `[package].name` |
| Source ownership | Rust files under `src/`; nested Cargo packages are separate detector roots |
| Test harness | Built-in `#[test]` functions |
| Inline tests | Runnable tests inside an inline `#[cfg(test)] mod ...` block |
| Integration tests | Runnable `.rs` files under `tests/` |
| Test command | `cargo test` when package ownership and the built-in harness are unambiguous |
| Direct evidence | A unique source function called by its inline test module, or an exact package-name and module-qualified `use` binding called by an integration test |
| Assertion usage | Direct calls inside `assert!`, `assert_eq!`, `assert_ne!`, and their `debug_assert` variants are `asserted`; other direct calls are `called` |
| Candidate filtering | Repository-relative and absolute `changedPaths`, including Windows separators |
| Native fixture gate | `cargo test`, `cargo check`, and `cargo fmt --check` |

The adapter normalizes Cargo package names from hyphens to underscores for Rust import ownership. It masks comments, ordinary strings, raw strings, and simple character literals before recognizing tests, imports, calls, and assertion usage. An import alone never creates evidence.

`rust-symbol-reference` is deliberately direct and narrow. Integration evidence requires the exact audited crate name and one unique file owning the imported module path. Inline evidence remains attached to the source file that contains the runnable test module. Calls in comments or strings, unused imports, foreign crates, and ambiguous modules are excluded.

## Explicit Blockers And Exclusions

The first slice does not claim support for:

- Cargo workspaces or virtual workspaces
- custom test harnesses such as `harness = false`
- dynamic or inherited manifest ownership
- module re-exports and wildcard imports
- `crate`, `self`, or `super` import traversal in integration evidence
- receiver-method or trait-dispatch identity
- feature, target, platform, or profile-specific command selection
- doctests, examples, benches, proc macros, build scripts, or generated-source ownership
- Tokio/async test attributes, rstest, proptest, quickcheck, criterion, or other nonstandard frameworks
- source dependency propagation beyond the directly evidenced file

These shapes remain visible through blockers or conservative missing evidence; the adapter does not silently treat them as covered.

## Checked-In Proof

`examples/rust-cargo-basic` contains:

- a root Cargo package and library crate
- an integration-tested fallible parser
- an inline-tested validator
- an untested branching service candidate
- data-only and module-wiring targets deferred from direct test recommendations

The fixture is locked by Rust-specific unit tests, shared adapter conformance, audit and plan snapshots, and a model-consistency scenario. Promotion beyond experimental should wait for live-repository validation, workspace ownership, performance pressure, and a broader syntax/evidence boundary.
