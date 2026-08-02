# Elixir Jason Live Validation Report

## Scope

This report records the first blind live-repository pass after the Elixir adapter foundation landed. The candidate was selected before inspecting its audit output: [`michalmuskala/jason`](https://github.com/michalmuskala/jason) at exact commit [`4ede42858eb19f80ec9e863aab52df466eab8608`](https://github.com/michalmuskala/jason/commit/4ede42858eb19f80ec9e863aab52df466eab8608).

Jason is a focused public JSON library with one root Mix application, conventional `lib/` and `test/` trees, ExUnit tests, doctests, and property tests. That made it a useful first pressure case for conventional ownership and evidence without introducing Phoenix, Ecto, umbrella, or service orchestration semantics.

## Blind Foundation Result

The unchanged foundation audit was deterministic but correctly withheld a command because it could not prove Jason's real conventions:

| Measure | Foundation result |
| --- | --- |
| Confidence | low |
| Test command | withheld |
| Blockers | Mix project ownership, all source ownership, no runnable conventional ExUnit module |
| Untested candidates | 10 |
| Covered-but-risky candidates | 0 |
| Skipped targets | 0 |
| Evidence relationships | 0 |
| Canonical SHA-256 | `834b7d4924252dbbb4c382ddc45eb8f83689ecb5892bed72f286ac5c23bcdc74` |

The gaps were concrete rather than a reason to weaken the whole boundary. Jason declares `Jason.Mixfile` for literal app `:jason`; uses flat files such as `lib/decoder.ex` for `Jason.Decoder`; sometimes places a related exception beside one primary owned module; declares `Jason.Encoder` as a protocol; names tests under the application namespace rather than requiring path equality; nests fixture modules inside tests; and uses exact grouped aliases such as `alias Jason.{EncodeError, Encoder}`.

## Bounded Correction

The adapter now accepts either exact `App.MixProject` or legacy `App.Mixfile`, while retaining the requirement for one literal app and one project module using `Mix.Project`. A source file may own one exact conventional module or one exact app-prefixed flat-path module, including a protocol, even when unrelated adjacent declarations exist. Duplicate owned FQNs across source files remain blockers and receive no evidence.

A runnable test must have one app-owned primary `*Test` module as its first declaration, exactly one `use ExUnit.Case`, and at least one quoted `test ... do` body. Nested fixture modules are allowed, but multiple primary test modules remain rejected. Direct evidence is limited to remote calls inside extracted test bodies. Fully qualified names, exact aliases, and exact grouped aliases are recognized; alias collisions remain unresolved. Calls in nested support modules or protocol implementations outside a test body do not become test evidence.

Installing normal Mix dependencies also exposed shared repository traversal drift. Project detection and aggregate project statistics now ignore generated `_build/` and `deps/` trees. Jason therefore remains two detected repository projects—the root library and its separate `bench/` Mix project—rather than expanding into ten installed dependency projects or counting dependency sources as audited application code.

## Corrected Repeated Audit

Five unchanged direct audits produced one canonical result:

| Measure | Corrected result |
| --- | --- |
| Confidence | high |
| Test command | `mix test` |
| Blockers | none |
| Untested candidates | 3 |
| Covered-but-risky candidates | 7 |
| Skipped targets | 0 |
| Evidence relationships | 10: 7 direct and 3 naming |
| Evidence usage | 6 asserted, 1 called, 3 naming |
| Durations | 22.697, 9.569, 8.727, 9.134, and 8.691 ms |
| Canonical SHA-256 | `af674155185c92357ff28534a4bc75dc234e8c66e64c518c4ed6af35418796f2` |

Direct evidence covers `Jason`, `Jason.Encoder`, `Jason.Fragment`, and `Jason.OrderedObject`. Exact filename fallback covers `Jason.Encode`, `Jason.Formatter`, and `Jason.Helpers`. The three remaining candidates are deliberately conservative:

- `Jason.Codegen` is not called directly by a runnable test.
- `Jason.Decoder` is exercised through private or indirect helper flow that the adapter does not infer.
- `Jason.Sigil` is covered through doctests, which remain outside the current evidence boundary.

The repository-wide analysis reports the root project at high confidence with `mix test`. It keeps `bench/` visible as a separate low-confidence Mix project with no `lib/`, ExUnit startup, tests, or command. This is honest auxiliary-project reporting rather than a reason to absorb the benchmark into the root audit.

## Standardized Corpus Review — 2026-08-02

A fresh detached checkout at the exact pin was measured five times through `npm run corpus:measure` before dependency installation:

| Measure | Standardized result |
| --- | --- |
| Test command | `mix test` |
| Untested / covered / skipped | 3 / 7 / 0 |
| Evidence relationships | 10 |
| Duration samples | 24, 10, 10, 9, 9 ms |
| Median | 10 ms |
| Canonical SHA-256 | `af674155185c92357ff28534a4bc75dc234e8c66e64c518c4ed6af35418796f2` |
| Scorecard | 7 of 7 areas pass |

Detection retained the root project plus the separate `bench/` Mix project. Ownership, evidence usage, and ranking retained the reviewed 3/7 split, seven direct relationships, three naming relationships, six asserted uses, and one called use. The top recommendations continue to put branching runtime modules ahead of the lower-risk surfaces without presenting naming evidence as behavioral coverage.

`MIX_ENV=test mix deps.get --check-locked` left tracked files clean and repeated the already documented Decimal advisory. The unchanged adapter-selected `mix test` then passed 445 checks. A three-run audit after dependency compilation retained the same semantic counts and canonical digest, confirming that `deps/` and `_build/` remain outside ownership. Stability, performance, and the native command are therefore freshly reviewed rather than inherited from the earlier live pass.

## Native Command Review

Hex 2.5.1 was installed locally so the untouched checkout could resolve its declared dependencies. The adapter-selected command was then run unchanged:

```text
mix test
```

It passed 410 tests, 26 doctests, and 9 properties—445 checks in total—with zero failures in about 2.4 seconds. Mix emitted a deprecated `preferred_cli_env` warning and type warnings, but they did not affect the result.

Dependency resolution also reported that the pinned lockfile selected Decimal 2.3.0 with advisory [`GHSA-rhv4-8758-jx7v`](https://github.com/advisories/GHSA-rhv4-8758-jx7v) / CVE-2026-32686. That upstream dependency observation is recorded transparently and is separate from adapter correctness.

## Remaining Boundary

The adapter still does not infer doctest or property-test evidence, imported helper reachability, setup/callback flow, protocol implementation reachability, arbitrary nested test ownership, umbrella or framework semantics, computed Mix metadata, custom paths, or dynamic module construction. Its lightweight body scanner is intentionally lexical rather than a full Elixir parser.

## Result

The first Elixir live audit was productive: it recovered a real conventional library from a complete blocker state to a stable high-confidence audit and exact native command without inventing indirect coverage. It also caught dependency-tree leakage in shared detection and stats. Jason is now a suitable conventional-library validation pin; the next distinct pressure case should exercise framework-heavy or difficult ownership rather than re-testing the same shape.
