# Elixir Plug Live Validation Report

## Scope

This report records the second blind Elixir live-repository pass and the first framework-heavy pressure role. The candidate was selected before inspecting its audit output: [`elixir-plug/plug`](https://github.com/elixir-plug/plug) at exact commit [`2463704245eccacb2c528d7651cf86120b9f0543`](https://github.com/elixir-plug/plug/commit/2463704245eccacb2c528d7651cf86120b9f0543).

Plug is a maintained HTTP composition library rather than another standalone data utility. Its 42 production source files cover connections, parsers, sessions, uploads, routing, security, telemetry, and OTP support while retaining one root Mix application and a locally executable ExUnit workflow.

## Blind Result

Five unchanged audits produced one stable but command-blocked result:

| Measure | Blind result |
| --- | --- |
| Confidence | medium |
| Test command | withheld |
| Blockers | incomplete conventional source ownership; no direct zero-option ExUnit startup |
| Untested candidates | 16 |
| Covered-but-risky candidates | 26 |
| Skipped targets | 0 |
| Evidence relationships | 34: 23 direct and 11 naming |
| Durations | 165.356, 147.507, 143.333, 141.449, and 144.095 ms |
| Canonical SHA-256 | `70ec845f3f04dc4c9edf8062a88a9d84e1fd585a5769a5be666cc83279ab7ef8` |

The adapter already found substantial evidence and all ordinary modules. Its two blockers came from exact real-world conventions:

- nine paths preserve established acronym casing in the owned module, including `Plug.CSRFProtection`, `Plug.HTML`, `Plug.MIME`, `Plug.Parsers.JSON`, `Plug.Parsers.MULTIPART`, `Plug.Parsers.URLENCODED`, `Plug.Session.COOKIE`, `Plug.Session.ETS`, and `Plug.SSL`
- `lib/plug/exceptions.ex` owns singular protocol `Plug.Exception` alongside related error modules
- `test/test_helper.exs` directly calls `ExUnit.start(assert_receive_timeout: 200)` rather than the zero-option form

## Bounded Correction

Conventional source ownership now compares each exact module-path segment case-insensitively while preserving the declaration's real FQN in the audit. It also permits one terminal singular protocol declaration for an otherwise exact plural source path. Both rules still require the literal application namespace and exactly one matching primary declaration. A case-normalized collision such as `App.JSON` beside `App.Json`, or a singular-protocol/plural collision in one source file, remains unresolved and blocks the command.

The root helper may now contain one direct `ExUnit.start(...)` call with zero or more static keyword options whose values are booleans, `nil`, numbers, or literal atoms. Computed calls, collections, string contents, interpolations, and indirect startup remain rejected. The profile records case-normalized ownership, terminal-plural ownership, and static startup options when those rules are used.

No Plug, HTTP, callback, protocol-implementation, or behaviour reachability was added. Existing direct evidence still requires an exact remote call inside a recognized test body; filename fallback remains naming-only.

## Corrected Repeated Audit

Five unchanged corrected audits produced one canonical result:

| Measure | Corrected result |
| --- | --- |
| Confidence | high |
| Test command | `mix test` |
| Blockers | none |
| Untested candidates | 9 |
| Covered-but-risky candidates | 33 |
| Skipped targets | 0 |
| Evidence relationships | 44: 30 direct and 14 naming |
| Evidence usage | 14 asserted, 16 called, 14 naming |
| Durations | 200.563, 181.417, 179.569, 181.817, and 181.033 ms |
| Canonical SHA-256 | `8fe631906b7a71f6e560c098b37ab9da9091d5980a26772c6b9f5ff5a0fcfe03` |

Recovered evidence includes asserted calls to `Plug.CSRFProtection`, `Plug.Session.COOKIE`, and `Plug.Session.ETS`; direct calls to singular protocol `Plug.Exception`; and conservative filename evidence for `Plug.HTML`, `Plug.Parsers.JSON`, and `Plug.SSL`.

The remaining nine candidates are `Plug.Adapters.Cowboy`, `Plug.Conn.Unfetched`, `Plug.Conn.Utils`, `Plug.MIME`, `Plug.Parsers.MULTIPART`, `Plug.Parsers.URLENCODED`, `Plug.Session.Store`, `Plug.Upload.Supervisor`, and `Plug.Application`. They are compatibility, internal, OTP, behaviour, or parser surfaces without an exact direct call in a recognized test body. The native suite may exercise several indirectly, but the adapter does not convert framework or callback reachability into direct evidence.

## Standardized Corpus Review — 2026-08-02

A fresh detached checkout at the exact pin was measured five times through `npm run corpus:measure` before dependency installation:

| Measure | Standardized result |
| --- | --- |
| Test command | `mix test` |
| Untested / covered / skipped | 9 / 33 / 0 |
| Evidence relationships | 44 |
| Duration samples | 202, 179, 181, 181, 178 ms |
| Median | 181 ms |
| Canonical SHA-256 | `8fe631906b7a71f6e560c098b37ab9da9091d5980a26772c6b9f5ff5a0fcfe03` |
| Scorecard | 7 of 7 areas pass |

Detection retained one root Mix project. Ownership, evidence usage, and ranking retained the reviewed 9/33 split, 30 direct relationships, 14 naming relationships, 14 asserted uses, and 16 called uses. High-risk runtime and security boundaries remain prioritized while framework, callback, and protocol reachability stay conservative.

`MIX_ENV=test mix deps.get --check-locked` left tracked files clean. The unchanged adapter-selected `mix test` then passed 688 checks. A three-run audit after dependency compilation retained the same semantic counts and canonical digest, confirming that installed dependencies do not enter project or evidence ownership. Stability, performance, and the native command are therefore freshly reviewed rather than inherited from the earlier live pass.

## Native Command Review

The pinned checkout resolved its lockfile with:

```text
MIX_ENV=test mix deps.get --check-locked
```

The adapter-selected command was then run unchanged:

```text
mix test
```

On local Elixir 1.20.2 and OTP 29.0.4 it compiled Plug and its declared dependencies, then passed 612 tests and 76 doctests—688 checks in total—with zero failures in 0.6 seconds. Installing dependencies did not create additional detected projects or inflate aggregate source statistics, confirming the `_build/` and `deps/` exclusions added by the Jason pass.

## Remaining Boundary

The adapter does not infer behaviour callbacks, protocol implementations, OTP application or supervisor reachability, parser delegation, Plug pipelines, macro expansion, setup/helper flow, doctest evidence, computed startup options, custom Mix aliases, umbrella ownership, or Phoenix/Ecto semantics. Static startup option support is intentionally smaller than ExUnit's full runtime option surface.

## Result

Plug fills a distinct framework-heavy Elixir pressure role. The live pass recovered exact established acronym, plural-file, and static ExUnit startup conventions while leaving framework execution paths conservative. Together, Jason and Plug now cover conventional-library and framework-heavy shapes; the next useful Elixir live audit should target difficult project or command ownership before any promotion decision.
