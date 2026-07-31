# Ruby rubyzip Live Validation Report

## Scope

This report records the first live-repository pressure pass for the experimental Ruby adapter. The selected checkout is [`rubyzip/rubyzip`](https://github.com/rubyzip/rubyzip) at exact commit `4209b022069d4d5646753dd5799e8771e4699e5c`.

The goal is foundation validation, not promotion. The pass asks whether one conventional Bundler gem with `lib/`, Minitest, a root gemspec, and a project-owned Rake command can be audited without executing Ruby metadata or claiming direct evidence that the adapter cannot yet prove.

## Candidate Screen

Three current public gems were shallow-cloned and audited at exact commits:

| Repository | Commit | Shape | Initial audit |
| --- | --- | --- | --- |
| [`mperham/connection_pool`](https://github.com/mperham/connection_pool) | `b262ff998159848dfe49ee31fe421cb933c818e4` | small gem, `test_*.rb`, maxitest/minitest extensions | medium confidence; no supported runnable test because the first slice intentionally accepts only `*_test.rb` |
| [`rubyzip/rubyzip`](https://github.com/rubyzip/rubyzip) | `4209b022069d4d5646753dd5799e8771e4699e5c` | conventional gem, `lib/`, 46 `*_test.rb` files, Minitest task | high confidence; 23 untested, 19 covered, 6 skipped, 19 naming relationships |
| [`lostisland/faraday`](https://github.com/lostisland/faraday) | `3725183bead9939d3575f2df8e16d8ca7acddf5e` | conventional HTTP gem, `lib/`, RSpec | high confidence; 8 untested, 22 covered, 3 skipped, 22 naming relationships |

rubyzip was selected because it exercises the Minitest half of the initial boundary with enough source/test pressure to expose command and basename-ownership gaps. Faraday remains a useful later RSpec/service candidate. connection_pool is useful negative pressure for alternate test naming and maxitest ownership.

## Repository Shape

At the selected pin, rubyzip has:

- one root `Gemfile` and one root `rubyzip.gemspec`
- 48 `.rb` files below `lib/`
- 46 conventionally named `test/**/*_test.rb` files plus helpers and test data
- a static `minitest` development dependency in the root gemspec
- `Minitest::TestTask.create` in the root `Rakefile`
- upstream test and lint workflows green at the exact commit: [Tests](https://github.com/rubyzip/rubyzip/actions/runs/28435762750) and [Linter](https://github.com/rubyzip/rubyzip/actions/runs/28435762714)

## Native Validation

The repository was left unchanged and installed with Ruby 4.0.6 and Bundler 4.0.16 using a user-owned gem home. The exact adapter-selected command passed:

```text
bundle exec rake test
```

Observed native result:

- 412 runs
- 2,820 assertions
- 0 failures
- 0 errors
- 2 skips
- 96.29% reported line coverage (`2,207 / 2,292`)
- 78.52% reported branch coverage (`552 / 703`)

The first install attempt also exposed a local setup issue: Bundler tried to replace a Homebrew Cellar plugin through the default shared gem directory. The local shell now uses `$HOME/.gem/ruby/4.0.0` as `GEM_HOME`, keeping future gem installs user-owned while retaining Homebrew Ruby and its default gems.

## Live Finding And Bounded Change

The initial audit recognized the Minitest suite but selected the bounded direct loader because the Rake recognizer only understood `Rake::TestTask.new`. rubyzip uses the equally static default form:

```ruby
Minitest::TestTask.create do |test|
  test.test_globs = 'test/**/*_test.rb'
end
```

The adapter now recognizes only top-level visible `Minitest::TestTask.create` with no task argument or exact `:test`, alongside the existing bounded `Rake::TestTask` form. That changes the selected command to `bundle exec rake test`, matching both the repository's default test task and its upstream CI. Custom task names and arbitrary Rake evaluation remain excluded.

The live screen also confirmed that static runner dependencies must be accepted from one exact root gemspec, not only `Gemfile` or `Gemfile.lock`. The adapter now accepts a literal `add_development_dependency` or `add_dependency` for `minitest`, `rspec`, or `rspec-core` in that one owned gemspec.

## Final Repeated Audit

Five unchanged audits produced one canonical digest:

| Measure | Result |
| --- | --- |
| Test command | `bundle exec rake test` |
| Untested candidates | 23 |
| Covered-but-risky candidates | 19 |
| Skipped targets | 6 |
| Evidence relationships | 19 |
| Durations | 23 ms, 11 ms, 11 ms, 10 ms, 10 ms |
| Median | 11 ms |
| Canonical SHA-256 | `c192fe90d3874a622fba48250bfec7ff7d6b161cef08ba6660fc9308c25b57a0` |

The 19 relationships are deliberately naming-only. They connect one runnable test basename to one unique source basename and do not claim that a source constant or method was visibly called or asserted.

## Remaining Uncertainty

The live audit gives us a credible first command and ownership boundary, but it also makes the next work concrete:

- same-named files such as `lib/zip/file.rb` and `lib/zip/filesystem/file.rb` remain untested because global basename evidence is ambiguous even when the test directory could potentially qualify ownership
- tests whose names describe behavior rather than one source file do not create evidence
- helpers, mixins, inheritance, receiver calls, shared assertions, and indirect behavior are not followed
- naming evidence cannot be compared directly with rubyzip's native line coverage; the adapter correctly reports only what it can statically attribute
- `test_*.rb`, maxitest, Rails, custom tasks, and mixed runners remain outside the first boundary

These are explicit limitations rather than silent coverage claims. The next Ruby slice should use this pin to add directory-qualified or exact `require`/constant evidence before broadening framework ownership.

## Result

The experimental Ruby foundation is plausible enough to audit a real conventional gem: detection, `lib/` ownership, runner declaration, command selection, repeatability, performance, downstream artifact conformance, and native verification all pass at an exact public commit. Ruby is not promoted; it still needs deeper evidence, more repository shapes, and the shared three-role corpus before supported maturity is considered.
