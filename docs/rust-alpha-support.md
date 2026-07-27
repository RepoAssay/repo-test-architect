# Rust Experimental Support

The Rust adapter is experimental. Its current bounded slices prove that conventional Cargo packages and literal repository-contained workspace members can flow through project detection, audit, ranking, planning, explanations, placement, findings, stats, CLI/MCP-shaped calls, golden snapshots, and model-consistency checks without a Rust-specific report format.

## Supported Baseline

| Area | Supported boundary |
| --- | --- |
| Project ownership | One root `Cargo.toml` with a static `[package].name`, either standalone or an exact member of the nearest literal Cargo workspace |
| Source ownership | Rust files under `src/`; nested Cargo packages are separate detector roots |
| Test harness | Built-in `#[test]` functions |
| Inline tests | Runnable tests inside an inline `#[cfg(test)] mod ...` block |
| Integration tests | Runnable `.rs` files under `tests/` |
| Workspace graph | Literal basic/literal-string `members`, optional `default-members`, repository-contained paths, existing package manifests, and a separately detected project per member; virtual roots are aggregate-only |
| Test command | `cargo test` for standalone packages or `cargo test -p <package>` for an exactly owned workspace package |
| Direct evidence | A unique source function called by its inline test module, or an exact package-name and module-qualified `use` binding called by an integration test |
| Assertion usage | Direct calls inside `assert!`, `assert_eq!`, `assert_ne!`, and their `debug_assert` variants are `asserted`; other direct calls are `called` |
| Candidate filtering | Repository-relative and absolute `changedPaths`, including Windows separators |
| Native fixture gate | `cargo test`, `cargo check`, and `cargo fmt --check` |

The adapter normalizes Cargo package names from hyphens to underscores for Rust import ownership. It masks comments, ordinary strings, raw strings, and simple character literals before recognizing tests, imports, calls, and assertion usage. An import alone never creates evidence.

`rust-symbol-reference` is deliberately direct and narrow. Integration evidence requires the exact audited crate name and one unique file owning the imported module path. Inline evidence remains attached to the source file that contains the runnable test module. Calls in comments or strings, unused imports, foreign crates, and ambiguous modules are excluded.

## Explicit Blockers And Exclusions

The current slices do not claim support for:

- globbed, computed, escaping, repository-external, missing, excluded, or otherwise incomplete Cargo workspace membership
- aggregate auditing or commands from a virtual Cargo workspace root
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

`examples/rust-cargo-workspace-basic` adds a virtual workspace with two literal packages, an explicit default member, a path dependency, package-local inline and integration tests, exact `cargo test -p ...` commands, and an untested member-local validator.

Both shapes are locked by Rust-specific unit tests, project detection/auditing coverage, audit and plan snapshots, and model-consistency scenarios. Promotion beyond experimental should still wait for live-repository validation, performance pressure, and a broader syntax/evidence boundary.
