# Ruby Factory Bot Live Validation Report

## Scope

This report records the third pinned live-repository pressure pass for the experimental Ruby adapter. The selected checkout is [`thoughtbot/factory_bot`](https://github.com/thoughtbot/factory_bot) at exact commit `967d128e3710b9918f97c75b47b11251e85c2377`.

Factory Bot supplies a current, conventional RSpec gem with widespread `described_class` use. The pass asks whether that receiver can be tied to an exact source constant without executing RSpec group metadata, memoization, hooks, helpers, or shared examples.

## Repository Shape

At the selected pin, Factory Bot has:

- one root `Gemfile`, one root `factory_bot.gemspec`, and one checked-in lockfile
- 53 `.rb` files below `lib/`, of which 49 are auditable and 4 are skipped wiring or generated/data targets
- 73 conventionally named RSpec files, with 35 using `described_class`, `subject`, or `let`
- a static RSpec dependency in the root gemspec and a root `.rspec` requiring `spec_helper`
- a broader upstream `all_specs` task that combines unit RSpec, acceptance RSpec, and Cucumber

The bounded adapter reports high confidence, no blockers, and selects `bundle exec rspec`. Its pre-slice audit contained 21 untested, 28 covered, 4 skipped, and 56 evidence relationships: 43 exact constant links plus 13 naming fallbacks.

## Native Validation

Dependencies were installed with Ruby 4.0.6 and the lockfile-selected Bundler 2.7.2. The native `sqlite3` dependency also required the local `pkg-config` implementation supplied by Homebrew's `pkgconf`. Generated coverage and temporary output were moved outside the checkout after each run, restoring a clean exact pin.

The adapter-selected command passed:

```text
bundle exec rspec
```

Observed result:

- 764 examples
- 0 failures
- 98.51% reported line coverage (`1,325 / 1,345`)
- one upstream RSpec deprecation warning

The repository's broader `bundle exec rake all_specs` task also passed independently: 333 unit examples, 431 acceptance examples, 4 Cucumber scenarios, and 18 Cucumber steps all completed without failures. Its combined SimpleCov report was 96.73% (`1,331 / 1,376`). The adapter intentionally owns only the statically declared RSpec command; passing Cucumber remains native context, not a claim that the bounded adapter audits Cucumber evidence.

## Exact `described_class` Boundary

Inside a runnable RSpec `it` or `specify` example, `described_class` may now stand in for one exact source constant only when the nearest containing constant-owned `describe` group starts with a static class/module constant. A nested string-labelled `describe` or `context` inherits that owner, while a nearer exact constant-owned `describe` replaces it.

Once resolved, the existing direct method rules remain unchanged: the source must uniquely own the constant and directly declare the singleton method, constructor, or constructor-local instance method; selected assertions still require inline use or one stable result local.

The slice deliberately rejects:

- string-, variable-, method-, or parenthesized group expressions
- `described_class` in hooks, memoized `let`/`subject` declarations, helpers, and shared examples
- aliases such as `klass = described_class`
- generated, inherited, mixed-in, or dynamically dispatched methods
- any receiver outside a runnable example body

## Reviewed Audit Delta

Candidate classification and relationship ownership are unchanged. Four exact relationships gain stronger usage after direct review:

| Source and spec | Before | After | Reviewed reason |
| --- | --- | --- | --- |
| `lib/factory_bot/definition.rb` → `definition_spec.rb` | called | asserted | exact constructed local calls directly declared instance methods consumed by `expect` |
| `lib/factory_bot/sequence.rb` → `sequence_spec.rb` | called | asserted | exact `described_class.find` and `find_by_uri` calls occur inside `expect` |
| `lib/factory_bot/strategy.rb` → `strategy_spec.rb` | reference-only | asserted | one stable result from exact `lookup_strategy` is consumed by `expect` |
| `lib/factory_bot/decorator/attribute_hash.rb` → `attribute_hash_spec.rb` | reference-only | asserted | exact constructor-local `attributes` calls are consumed by `expect` |

| Measure | Before | After |
| --- | ---: | ---: |
| Untested / covered / skipped | 21 / 28 / 4 | 21 / 28 / 4 |
| Evidence relationships | 56 | 56 |
| Exact / naming evidence | 43 / 13 | 43 / 13 |
| Asserted | 17 | 21 |
| Called | 4 | 2 |
| Exact reference-only | 22 | 20 |
| Naming | 13 | 13 |

## Repeated Audit

Five audits of the restored exact checkout produced one canonical digest:

| Measure | Result |
| --- | --- |
| Test command | `bundle exec rspec` |
| Confidence / blockers | high / none |
| Untested / covered / skipped | 21 / 28 / 4 |
| Evidence relationships | 56 |
| Evidence kinds | 43 exact, 13 naming |
| Usage split | 21 asserted, 2 called, 20 reference-only, 13 naming |
| Durations | 87.244 ms, 54.122 ms, 51.397 ms, 50.237 ms, 49.768 ms |
| Median | 51.397 ms |
| Canonical SHA-256 | `ad9e86af7304e245277c26647cf35ce170c7e274371f59875b810c26bfea61e3` |

## Result

Factory Bot validates a useful RSpec identity rule without opening general memoized execution. The third exact pin now covers conventional Minitest, service-oriented RSpec configuration, and class-oriented RSpec `described_class` pressure. Ruby remains experimental: `let`/`subject` identity, shared examples, helper execution, Cucumber evidence, broader package ownership, Rails, and the formal three-role promotion corpus remain later decisions.
