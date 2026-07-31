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

## Service-Boundary Finding

Faraday confirms that the next useful uncertainty is receiver identity, not broader loading. Source such as request/response JSON middleware is heavily exercised natively, but many specs construct it through `let(:middleware) { described_class.new(...) }`, call it through a test helper such as `process`, and assert the returned state later. Other specs construct `conn` in `let` and call `conn.get` or `conn.post` from runnable examples or lazily evaluated helpers.

Those shapes remain naming or reference-only. The adapter does not infer that `described_class` names a particular source owner, execute RSpec memoization, follow helper methods, credit shared examples, or treat instance calls as source-owned merely because a constant is visible elsewhere in the file. Faraday's 95.04% native line coverage therefore does not turn into a static claim the adapter cannot prove.

## Result

The RSpec load boundary is now credible and regression-backed: one exact root option, one uniquely owned helper, the existing finite require budget, exact constant ownership, native verification, repeatable output, and conservative usage all agree on a real service library. Ruby remains experimental. A later receiver slice should start with direct, immutable constructor-to-local identity inside runnable examples before considering RSpec `let`, `subject`, `described_class`, shared examples, helper execution, or Rails ownership.
