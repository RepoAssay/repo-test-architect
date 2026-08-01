# Ruby Licensed Post-Promotion Validation Report

## Scope

This report records the first blind live-repository pressure pass after Ruby reached supported maturity. The candidate was selected before inspecting its audit output from the checked-in Ruby discovery profile: [`licensee/licensed`](https://github.com/licensee/licensed) at exact commit `2db4c2a2743e159e9bf1931c9c3b2df2de8ff4bf`.

The goal was to test whether a fresh, maintained Bundler/Minitest repository remained inside the documented boundary or exposed an unsupported shape without receiving false confidence.

## Repository Shape

The exact checkout contains:

- one root `Gemfile`, committed `Gemfile.lock`, and `licensed.gemspec`
- 53 Ruby source files below `lib/`
- 51 `test/**/*_test.rb` files
- one exact default `Rake::TestTask.new(:test)` plus generated source-specific tasks
- `minitest/autorun`, `minitest-hooks`, and Mocha setup through `test/test_helper.rb`
- 235 `describe` declarations and 631 `it` declarations, with zero `def test_*` methods
- a CI matrix that runs `script/test core` separately from source-specific setup and test commands

This is Minitest's spec-style DSL, not the supported `Minitest::Test` subclass plus `test_*` method shape.

## Audit Result

The supported Ruby adapter reports medium confidence with the blocker:

```text
No runnable conventional Minitest or RSpec test detected.
```

It still owns and classifies the bounded `lib/` sources, producing:

- 48 untested candidates
- 0 covered-but-risky candidates
- 5 skipped wiring/data targets
- 0 evidence relationships
- no test command

Five clean audits completed in 38, 22, 20, 20, and 20 ms, for a 20 ms median. Every run produced canonical digest `b2cfb00cc62ce2d6ded61dacdce87a6ed3a90d21d50039f9b437109a43d36ea2`.

The blocker is conservative and accurate. The adapter does not reinterpret bare `describe` as RSpec, does not treat dormant DSL bodies as runnable, and does not attach naming or constant evidence from an unsupported runner shape.

## Native Command Review

Ruby `4.0.6` and the lockfile's Bundler `4.0.8` resolved all 56 gems without changing the checkout.

The otherwise conventional default command is not a valid whole-repository verification command in a fresh checkout:

```text
bundle exec rake test
```

It executed 562 runs and 1,357 assertions, but finished with 20 failures, 37 errors, and 3 skips because source-specific fixtures and external toolchains had not been prepared. Licensed's CI intentionally splits those tests into setup-and-run jobs such as `script/source-setup/npm` followed by `script/test npm`.

The upstream core command passed once the checkout retained the repository name expected by its path-sensitive tests:

```text
script/test core
```

Observed result:

- 330 runs
- 1,063 assertions
- 0 failures
- 0 errors
- 0 skips

`script/test core` is a repository-owned wrapper around a named `test:core` task. It is outside the current exact command boundary, which accepts a conventional default Rake task rather than inferring custom suite partitions and prerequisite scripts.

## Decision

Do not add Minitest spec discovery by itself. On this pin, recognizing `describe`/`it` without also understanding the custom suite partition would remove the blocker and expose a failing default verification command. That would be less trustworthy than the current conservative result.

A future slice can revisit this shape when it can jointly prove:

- exact Minitest activation through a repository-owned helper
- bounded top-level and nested `describe`/`it` execution without confusing RSpec or arbitrary DSLs
- exact constant ownership and assertion usage inside those runnable bodies
- static ownership of one safe custom suite command, or an explicit blocker when setup-partitioned tasks have no single repository-wide command

## Result

The first post-promotion audit found a real and common-looking Ruby shape, but no supported-boundary correctness regression. Detection, source ownership, candidate classification, stability, performance, and blocker behavior are sound. The test reinforces why supported maturity remains bounded: Minitest spec DSL and setup-partitioned custom commands should be added together, not inferred independently.
