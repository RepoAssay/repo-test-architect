# Ruby Faraday Live Validation Report

## Scope

This report records the second live-repository pressure pass for the experimental Ruby adapter. The selected checkout is [`lostisland/faraday`](https://github.com/lostisland/faraday) at exact commit `3725183bead9939d3575f2df8e16d8ca7acddf5e`.

The pass targets the RSpec and service-library half of the bounded adapter. It asks whether runner-owned setup can contribute exact load evidence without treating RSpec `let`, `subject`, shared examples, support helpers, or dynamic eager loading as source-call proof.

## Repository Shape

At the selected pin, Faraday has:

- one root `Gemfile`, one root `faraday.gemspec`, and no checked-in lockfile
- 33 auditable `.rb` files below `lib/`
- 26 conventionally named `spec/**/*_spec.rb` files using RSpec
- a static RSpec declaration in `Gemfile`
- a root `.rspec` with the literal option `--require spec_helper`
- `spec/spec_helper.rb`, which literally requires `faraday` and also dynamically loads wider source and support globs

The initial audit was high-confidence and selected `bundle exec rspec`, but reported 8 untested, 22 covered, 3 skipped, and 22 naming-only relationships. The specs do not repeat `require "spec_helper"`; RSpec owns that load through `.rspec`, so the existing require graph could not reach source files.

## Native Validation

Dependencies were installed with Ruby 4.0.6 and Bundler 4.0.16 in the existing user-owned gem home. Bundler's ignored generated lockfile and RSpec's ignored coverage output were moved outside the checkout before static repeatability measurements, restoring the exact upstream tree. The adapter-selected command passed:

```text
bundle exec rspec
```

Observed native result:

- 639 examples
- 0 failures
- 95.04% reported line coverage (`1,459 / 1,535`)
- only upstream SimpleCov deprecation warnings and the expected local Coveralls notice

## Live Finding And Bounded Change

The adapter now reads only the root `.rspec` and accepts a literal `--require NAME` or `--require=NAME` option when `NAME` uses a safe relative path and resolves uniquely to one repository-owned `.rb` file at the root or below `spec/`. That configured helper is one edge in the existing three-edge require budget. From there, ordinary exact `require` and `require_relative` rules remain unchanged.

For Faraday, the bounded path is:

```text
spec/faraday/*_spec.rb -> spec/spec_helper.rb -> lib/faraday.rb -> lib/faraday/*.rb
```

The root `.rspec` is also emitted as a setup signal. Dynamic or interpolated options, escaping paths, nested `.rspec` files, ambiguous helper paths, and `Dir[...]` loads remain excluded.

This changes evidence precision without changing candidate classification:

| Measure | Before | After |
| --- | ---: | ---: |
| Untested candidates | 8 | 8 |
| Covered-but-risky candidates | 22 | 22 |
| Skipped targets | 3 | 3 |
| Evidence relationships | 22 | 45 |
| Exact `ruby-constant-reference` | 0 | 32 |
| Naming fallback | 22 | 13 |
| Asserted / called usage | 0 / 0 | 4 / 1 |

All 32 exact links are `referenced` because the configured helper and entrypoint consume earlier graph edges. The usage upgrades still require exact source-owned singleton or constructor calls inside runnable `it`/`specify` bodies; the configuration edge does not relax that rule.

## Repeated Audit

Five audits of the restored exact checkout produced one normalized digest:

| Measure | Result |
| --- | --- |
| Test command | `bundle exec rspec` |
| Untested / covered / skipped | 8 / 22 / 3 |
| Evidence relationships | 45 |
| Evidence kinds | 32 exact, 13 naming |
| Usage split | 4 asserted, 1 called, 27 reference-only, 13 naming |
| Durations | 45.169 ms, 24.587 ms, 25.211 ms, 23.963 ms, 23.200 ms |
| Median | 24.587 ms |
| Canonical SHA-256 | `8104c987971177b1aa8780f03217105b8de4b6247a5d8d70ef0b93b75075f62c` |

## Direct Receiver Follow-Up

The direct receiver follow-up admits only one local bound exactly once from an unchained `Constant.new` inside a runnable example, followed by a direct call to an instance method declared on that same class. At this stage, a direct `.new` override, reassignment, block shadow, deferred execution, generated reader/delegator, helper/factory return, wrapping, dynamic dispatch, and RSpec `let`/`subject`/`described_class` identity remained excluded. Constructor assertions were also tightened: asserting `local.generated_reader` no longer turns the constructor itself into asserted usage.

Faraday's candidate and relationship graph remains unchanged, but `lib/faraday/connection.rb` moves from asserted to called because the relevant assertion reads the generated `proxy` option rather than a directly declared `Faraday::Connection` instance method. No speculative service receiver is added. The unchanged native command again passed 639 examples with zero failures and 95.04% line coverage. Five restored-tree audits produced:

| Measure | Receiver follow-up |
| --- | --- |
| Test command | `bundle exec rspec` |
| Untested / covered / skipped | 8 / 22 / 3 |
| Evidence relationships | 45 |
| Evidence kinds | 32 exact, 13 naming |
| Usage split | 3 asserted, 2 called, 27 reference-only, 13 naming |
| Durations | 47.713 ms, 25.874 ms, 26.429 ms, 25.082 ms, 25.271 ms |
| Median | 25.874 ms |
| Canonical SHA-256 | `bd6799d7baf4b05e47bd275a9a0c138aa605ff3dd6685a15f040cc6eeaa70a0e` |

## Service-Boundary Finding

Faraday confirms that the remaining receiver uncertainty is memoized and helper-mediated identity, not broader loading. Source such as request/response JSON middleware is heavily exercised natively, but many specs construct it through `let(:middleware) { described_class.new(...) }`, call it through a test helper such as `process`, and assert the returned state later. Other specs construct `conn` in `let` and call `conn.get` or `conn.post` from runnable examples or lazily evaluated helpers.

Those shapes remained naming or reference-only in this pass. The adapter did not yet infer that `described_class` named a particular source owner, execute RSpec memoization, follow helper methods, credit shared examples, or treat instance calls as source-owned merely because a constant was visible elsewhere in the file. Faraday's 95.04% native line coverage therefore did not turn into a static claim the adapter could not prove.

## Exact Memoized Receiver Follow-Up

The memoized receiver follow-up admits only an exact one-line `let` or `subject` whose body is an unchained `Constant.new(...)` or group-owned `described_class.new(...)`. Named subjects expose the declared name and `subject`; unnamed subjects expose only `subject`. The definition and example must share normal containing RSpec groups, the nearest declaration of each receiver wins, and an unknown inner override blocks an outer exact identity. A `described_class` memo is also rejected when the consuming example has a nearer constant owner.

Multiline bodies, `let!`/`subject!`, constructor blocks, chained results, aliases, shared examples, local reassignment, block shadowing, helper flow, implicit matcher syntax, and generated/inherited methods remain excluded. Existing direct declaration and assertion rules are unchanged.

Three reviewed exact relationships improve without changing Faraday's candidates or 45-link graph:

| Relationship | Before | After | Reviewed direct methods |
| --- | --- | --- | --- |
| `Connection` → `connection_spec.rb` | called | asserted | `close`, `options`, `build_url`, `build_request`, and `build_exclusive_url` |
| `Error` → `error_spec.rb` | reference-only | asserted | `backtrace`, `inspect`, and response projection methods |
| `Response` → `response_spec.rb` | reference-only | asserted | `status`, `body`, `headers`, `finished?`, `finish`, `success?`, and related direct methods |

Factory Bot provides the conservative comparison: its 56 relationships remain unchanged because the remaining memoized calls use inherited/generated methods, constructor blocks, shared examples, or implicit `should`/`its` syntax. The adapter-selected native commands again passed 639 Faraday examples and 764 Factory Bot examples with zero failures.

Five restored-tree audits of each pin produced one digest per repository:

| Measure | Faraday | Factory Bot |
| --- | --- | --- |
| Untested / covered / skipped | 8 / 22 / 3 | 21 / 28 / 4 |
| Evidence relationships | 45 | 56 |
| Usage split | 6 asserted, 1 called, 25 reference-only, 13 naming | 21 asserted, 2 called, 20 reference-only, 13 naming |
| Durations | 61.675, 53.832, 54.578, 52.747, 52.882 ms | 96.636, 65.555, 64.047, 63.299, 62.285 ms |
| Median | 53.832 ms | 64.047 ms |
| Canonical SHA-256 | `af4437cbee783ab4afc03bdb36d056d65d9f063fd75a88c53b2f3fd206b2a626` | `ad9e86af7304e245277c26647cf35ce170c7e274371f59875b810c26bfea61e3` |

## Result

The RSpec load, direct receiver, exact group-owned `described_class`, one-line constructor-memo, and later same-file shared-example boundaries are regression-backed across Faraday, the [Factory Bot validation](ruby-factory-bot-validation-report.md), and the [shared-example pass](ruby-shared-example-validation-report.md). This pin now fills Ruby's framework-heavy promotion role. Multiline/eager memoization, implicit matcher semantics, cross-file or computed shared examples/helpers, generated methods, broader project ownership, and Rails ownership remain outside the supported boundary.
