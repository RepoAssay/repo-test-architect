# Rust Alpha Support

The Rust adapter is supported at bounded public-alpha maturity. Its slices prove that conventional Cargo packages, static package-local source targets, literal source module graphs, and literal repository-contained workspace members can flow through project detection, audit, ranking, planning, explanations, placement, findings, stats, CLI/MCP-shaped calls, golden snapshots, and model-consistency checks without a Rust-specific report format.

## Supported Baseline

| Area | Supported boundary |
| --- | --- |
| Project ownership | One root `Cargo.toml` with a static `[package].name`, either standalone or an exact member of the nearest literal Cargo workspace |
| Source ownership | Rust files under `src/`, existing repository-contained `.rs` files named by static `[lib].path` and `[[bin]].path`, and their recursively resolved literal modules; files reachable only through exact `#[cfg(test)] mod ...;` edges are test support rather than production candidates; nested Cargo packages are separate detector roots |
| Module graph | Top-level `mod name;` using the unique Rust `name.rs` or `name/mod.rs` layout, plus static package-contained `#[path = "..."]` and raw-string path attributes; crate roots, ordinary module files, and `mod.rs` use their native relative bases; exact test-only state propagates through literal descendants while an unguarded path to the same file wins |
| Test harness | Built-in `#[test]` functions, or a static repository-contained `[[test]]` target using Cargo's built-in harness |
| Inline tests | Runnable tests inside an inline `#[cfg(test)] mod ...` block |
| Integration tests | Runnable `.rs` files under `tests/`; a static explicit target can establish the command without claiming macro-expanded symbol evidence |
| Workspace graph | Literal basic/literal-string `members`, optional `default-members`, repository-contained paths, existing package manifests, and a separately detected project per member; virtual roots are aggregate-only |
| Test command | `cargo test` for standalone packages or `cargo test -p <package>` for an exactly owned workspace package |
| Direct evidence | A unique source function called by its inline test module; an exact named function or inherent-type import called through `crate::`, parent-relative `super::`, the package name, or one unconditional exact crate-root `pub use crate::<module>::<symbol>` re-export; inherent associated calls require one uniquely owned type and method |
| Assertion usage | Direct calls inside `assert!`, `assert_eq!`, `assert_ne!`, and their `debug_assert` variants are `asserted`; other direct calls are `called` |
| Candidate filtering | Repository-relative and absolute `changedPaths`, including Windows separators |
| Native fixture gate | `cargo test`, `cargo check`, and `cargo fmt --check` |
| Generated scale gate | 400 behavioral modules, 200 integration tests, exactly 200 covered and 200 untested candidates, 200 direct evidence relationships, and one skipped crate-root wiring file under 5 seconds |

The adapter normalizes Cargo package names from hyphens to underscores for Rust import ownership. It masks comments, ordinary strings, raw strings, and simple character literals before recognizing tests, imports, calls, and assertion usage. An import alone never creates evidence.

`rust-symbol-reference` is deliberately direct and narrow. Integration evidence requires the exact audited crate name and one unique file owning the imported logical module path, including modules rooted outside `src/`. One exact unconditional crate-root re-export may preserve that identity through a literal `pub use crate::<module>::<symbol>` declaration; aliases are retained and imports alone still contribute nothing. Inline evidence can remain attached to its containing source file or follow an exact `crate::`/`super::` import. Function bindings require one uniquely declared top-level function. Named type bindings can prove `Type::method(...)` only when the file uniquely declares that type and one inherent implementation method with that name. Calls in comments or strings, unused or shadowed imports, test-local `self::` paths, wildcard imports or exports, conditional or chained re-exports, trait implementations, receiver calls, foreign crates, and ambiguous types, methods, or modules are excluded.

## Explicit Blockers And Exclusions

The current slices do not claim support for:

- globbed, computed, escaping, repository-external, missing, excluded, or otherwise incomplete Cargo workspace membership
- aggregate auditing or commands from a virtual Cargo workspace root
- custom test harnesses such as `harness = false`
- disabled, feature-gated, missing, escaping, or dynamic explicit test targets
- missing, escaping, repository-external, non-Rust, or non-static Cargo lib/bin target paths
- ambiguous or missing module files, declarations inside inline modules or macro bodies, dynamic/unsupported path attributes, macro-generated modules, `include!`, and traversal into nested Cargo packages
- test-only inference from broader `cfg` predicates, `cfg_attr`, feature/target predicates, or macro-generated declarations; only exact `#[cfg(test)]` module edges exclude production ownership
- dynamic or inherited manifest ownership
- conditional, chained, relative, module, or wildcard re-exports beyond one exact unconditional crate-root symbol re-export; wildcard imports
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

All three shapes are locked by Rust-specific unit tests, project detection/auditing coverage, audit and plan snapshots, and model-consistency scenarios. A generated 400-source/200-test module graph locks exact candidate, skipped-wiring, evidence, and timing behavior in every alpha and release check.

## Promotion Result

Rust is promoted from `experimental` to `supported` because all four promotion gates are complete:

1. serde_json, Starship, and ripgrep fill the conventional-library/service, framework-heavy application, and difficult-ownership roles with exact full-SHA pins.
2. All 21 Rust validation-corpus areas pass reviewed detection, ownership, command, evidence, ranking, stability, and performance checks.
3. Fresh five-run standardized measurements are digest-stable and blocker-free, with medians of 131 ms, 483 ms, and 107 ms respectively.
4. Native Cargo validation, the generated 400-source/200-test gate, shared conformance, implementation coverage, golden/model-consistency artifacts, package checks, and cross-platform alpha gates remain green.

Supported maturity remains bounded to this matrix. It does not imply evaluation of arbitrary Cargo graphs or feature sets, async/property/custom harness support, macro expansion, doctest evidence, receiver or trait identity, or general Rust type inference.

The first pinned live probe, [`BurntSushi/ripgrep`](https://github.com/BurntSushi/ripgrep) at `f9c05a949d1a0dc8e16dee28ca9605d38611faeb`, preserves the root package, ten literal workspace members, and a separate fuzz workspace. It exposed and fixed exact command ownership for a macro-driven built-in test target, proved static ownership of the root `[[bin]]` path, and then resolved all 23 files in that binary's literal module graph. The full native workspace passed 1,220 listed tests, and three module-graph audits were digest-stable with a 385 ms median. See the [Rust ripgrep Live Validation Report](rust-ripgrep-validation-report.md).

The second pinned probe, [`starship/starship`](https://github.com/starship/starship) at `7946f2d9fbb02a5be76856ed27ddb85da10af3da`, fills the framework-heavy application role with a root library/binary package, 245 source files, 1,230 passing native tests, and stable 487 ms audits. It exposed a false production owner and 94 inflated relationships from `src/test/mod.rs`, which is declared only through exact `#[cfg(test)]`. The corrected audit preserves all 239 production candidates while removing that test-support graph. See the [Rust Starship Live Validation Report](rust-starship-validation-report.md).

The third pinned probe, [`serde-rs/json`](https://github.com/serde-rs/json) at `a3e9758ffc88247ab82182cb2505867768a702e3`, fills the conventional-library role with a standalone parser crate, 235 passing native tests, and stable 131 ms audits. It exposed the missing exact crate-root re-export link: bounded support moves `src/de.rs`, `src/ser.rs`, and `src/value/mod.rs` from untested to covered through four direct relationships while leaving doctests, macros, helpers, receivers, traits, and wildcard paths unclaimed. See the [Rust serde_json Live Validation Report](rust-serde-json-validation-report.md).
