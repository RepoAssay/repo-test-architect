# Rust Experimental Support

The Rust adapter is experimental. Its current bounded slices prove that conventional Cargo packages, static package-local source targets, literal source module graphs, and literal repository-contained workspace members can flow through project detection, audit, ranking, planning, explanations, placement, findings, stats, CLI/MCP-shaped calls, golden snapshots, and model-consistency checks without a Rust-specific report format.

## Supported Baseline

| Area | Supported boundary |
| --- | --- |
| Project ownership | One root `Cargo.toml` with a static `[package].name`, either standalone or an exact member of the nearest literal Cargo workspace |
| Source ownership | Rust files under `src/`, existing repository-contained `.rs` files named by static `[lib].path` and `[[bin]].path`, and their recursively resolved literal modules; nested Cargo packages are separate detector roots |
| Module graph | Top-level `mod name;` using the unique Rust `name.rs` or `name/mod.rs` layout, plus static package-contained `#[path = "..."]` and raw-string path attributes; crate roots, ordinary module files, and `mod.rs` use their native relative bases |
| Test harness | Built-in `#[test]` functions, or a static repository-contained `[[test]]` target using Cargo's built-in harness |
| Inline tests | Runnable tests inside an inline `#[cfg(test)] mod ...` block |
| Integration tests | Runnable `.rs` files under `tests/`; a static explicit target can establish the command without claiming macro-expanded symbol evidence |
| Workspace graph | Literal basic/literal-string `members`, optional `default-members`, repository-contained paths, existing package manifests, and a separately detected project per member; virtual roots are aggregate-only |
| Test command | `cargo test` for standalone packages or `cargo test -p <package>` for an exactly owned workspace package |
| Direct evidence | A unique source function called by its inline test module; an exact named function or inherent-type import called through `crate::`, parent-relative `super::`, or the package name; inherent associated calls require one uniquely owned type and method |
| Assertion usage | Direct calls inside `assert!`, `assert_eq!`, `assert_ne!`, and their `debug_assert` variants are `asserted`; other direct calls are `called` |
| Candidate filtering | Repository-relative and absolute `changedPaths`, including Windows separators |
| Native fixture gate | `cargo test`, `cargo check`, and `cargo fmt --check` |

The adapter normalizes Cargo package names from hyphens to underscores for Rust import ownership. It masks comments, ordinary strings, raw strings, and simple character literals before recognizing tests, imports, calls, and assertion usage. An import alone never creates evidence.

`rust-symbol-reference` is deliberately direct and narrow. Integration evidence requires the exact audited crate name and one unique file owning the imported logical module path, including modules rooted outside `src/`. Inline evidence can remain attached to its containing source file or follow an exact `crate::`/`super::` import. Function bindings require one uniquely declared top-level function. Named type bindings can prove `Type::method(...)` only when the file uniquely declares that type and one inherent implementation method with that name. Calls in comments or strings, unused or shadowed imports, test-local `self::` paths, wildcard imports, trait implementations, receiver calls, foreign crates, and ambiguous types, methods, or modules are excluded.

## Explicit Blockers And Exclusions

The current slices do not claim support for:

- globbed, computed, escaping, repository-external, missing, excluded, or otherwise incomplete Cargo workspace membership
- aggregate auditing or commands from a virtual Cargo workspace root
- custom test harnesses such as `harness = false`
- disabled, feature-gated, missing, escaping, or dynamic explicit test targets
- missing, escaping, repository-external, non-Rust, or non-static Cargo lib/bin target paths
- ambiguous or missing module files, declarations inside inline modules or macro bodies, dynamic/unsupported path attributes, macro-generated modules, `include!`, and traversal into nested Cargo packages
- dynamic or inherited manifest ownership
- module re-exports and wildcard imports
- test-local `self::` ownership and `crate`, `self`, or `super` import traversal in integration evidence
- instance receiver-method or trait-dispatch identity
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

`examples/rust-cargo-custom-targets` adds a library root under `code/`, a binary root under `app/`, recursively declared file and directory modules, a static parent-relative path module, exact crate-relative unit and package-name integration evidence on a custom-root validator module, an asserted inherent `Calculator::total` call, untested module candidates, and a nearby unowned Rust file that must remain excluded.

All three shapes are locked by Rust-specific unit tests, project detection/auditing coverage, audit and plan snapshots, and model-consistency scenarios. Promotion beyond experimental should still wait for live-repository validation, performance pressure, and a broader syntax/evidence boundary.

The first pinned live probe, [`BurntSushi/ripgrep`](https://github.com/BurntSushi/ripgrep) at `f9c05a949d1a0dc8e16dee28ca9605d38611faeb`, preserves the root package, ten literal workspace members, and a separate fuzz workspace. It exposed and fixed exact command ownership for a macro-driven built-in test target, proved static ownership of the root `[[bin]]` path, and then resolved all 23 files in that binary's literal module graph. The full native workspace passed 1,220 listed tests, and three module-graph audits were digest-stable with a 385 ms median. See the [Rust ripgrep Live Validation Report](rust-ripgrep-validation-report.md).
