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

## Foundation Repeated Audit

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

## Require And Constant Evidence Follow-Up

The next slice keeps the same repository and native command while replacing global basename inference where the checked-in load graph can prove more. A runnable test may contribute `ruby-constant-reference` only when:

- literal `require_relative` edges resolve from their owning file, while bare `require` uses `lib/` only because Gemfile statically includes rubyzip's sole root gemspec; every edge resolves to a repository-owned `.rb` file
- the source is reached within three edges from that runnable test
- a space-indented class/module declaration gives the source an exact constant
- that full constant is visibly referenced outside comments and strings
- the constant has exactly one owner among source files reachable by that test

A direct test-to-source edge is `direct`; a helper or entrypoint path is `referenced`. The rule does not infer a method call or assertion from the constant reference.

rubyzip's conventional path is a useful pressure case: `test/file_test.rb` requires `test_helper`, the helper requires `zip`, and `lib/zip.rb` requires `zip/file`. `Zip::File` is visibly referenced in the test and has one reachable owner on that path, so `lib/zip/file.rb` gains exact referenced evidence despite its globally duplicated `file.rb` basename. Filesystem tests load an additional class reopening, so those ambiguous paths do not claim the same ownership.

The unchanged native command was rerun after the evidence change and again passed 412 runs and 2,820 assertions with zero failures or errors. Five static audits produced:

| Measure | Evidence follow-up |
| --- | --- |
| Test command | `bundle exec rake test` |
| Untested candidates | 19 |
| Covered-but-risky candidates | 23 |
| Skipped targets | 6 |
| Evidence relationships | 80 |
| Evidence kinds | 77 `ruby-constant-reference`, 3 `filename-convention` |
| Evidence strengths | 2 direct, 75 referenced, 3 naming |
| Durations | 41 ms, 25 ms, 24 ms, 23 ms, 24 ms |
| Median | 24 ms |
| Canonical SHA-256 | `61cd271fb3bb95602dfb0451d1532f7dbeabb46b22f0781b0e529847343ed03b` |

No previously covered target is lost. Four targets move from untested to covered evidence: `lib/zip/errors.rb`, `lib/zip/file.rb`, `lib/zip/inflater.rb`, and `lib/zip/ioextras.rb`. The internal `lib/zip/filesystem/file.rb` remains untested because its `Zip::FileSystem::File` constant is not visibly referenced by the runnable tests; receiver access through `zf.file` is intentionally outside this slice.

## Method-Call And Assertion Usage Follow-Up

The next slice preserves the exact require graph and unique constant owner, then asks whether a runnable test visibly invokes behavior owned by that source. Usage is admitted only when:

- the call occurs inside a conventional `def test_*` Minitest body or RSpec `it`/`specify` body rather than setup or helper methods
- `Constant.method` matches a directly two-space-indented `def self.method`, a method directly inside `class << self`, or `.new` backed by the class's direct `initialize`
- dynamic dispatch, instance receivers, inherited/mixed-in/delegated methods, `extend self`, deferred lambdas, and custom assertion-shaped methods remain outside the rule
- `asserted` means the exact call is on the same line as a selected built-in Minitest assertion or RSpec `expect`, or one unique unreassigned local result is later consumed there; other exact calls are `called`

This boundary recovers common rubyzip shapes without inventing receiver flow. For example, `::Zip::Entry.new(...)` maps to `Zip::Entry#initialize`, `::Zip::File.count_entries(...)` maps to its exact singleton declaration, and stable locals such as a newly constructed entry can carry asserted usage only when that same local appears in a supported assertion. Calls through zip-file instance variables and helper-owned assertion methods remain reference-only.

The unchanged native command was rerun again after the usage change and passed 412 runs and 2,820 assertions with zero failures or errors. The candidate and relationship graph does not change; only the evidence precision increases. Five static audits produced:

| Measure | Usage follow-up |
| --- | --- |
| Test command | `bundle exec rake test` |
| Untested candidates | 19 |
| Covered-but-risky candidates | 23 |
| Skipped targets | 6 |
| Evidence relationships | 80 |
| Usage split | 16 asserted, 23 called, 38 reference-only, 3 naming |
| Durations | 62 ms, 39 ms, 39 ms, 38 ms, 37 ms |
| Median | 39 ms |
| Canonical SHA-256 | `a60a990cb960a76704cbcd7d432d332f8eb26d7051f274fc27ca330fae627aa3` |

## Remaining Uncertainty

The live audit now gives us a credible command, ownership, direct/reference, and first usage boundary, but it also keeps the next work concrete:

- exact reachable constants can now recover behavior-named tests and duplicate basenames, but only when one owner remains on that test's load graph
- helper/setup behavior, mixins, inheritance, instance receiver calls, shared/custom assertions, multiline assertion flow, and deeper result flow are not followed
- direct singleton methods and constructors can now claim called/asserted usage, while `extend self`, attribute/delegator generation, and runtime dispatch remain reference-only
- constant/reference evidence still cannot be equated with rubyzip's native line coverage; the adapter correctly reports only what it can statically attribute
- `test_*.rb`, maxitest, Rails, custom tasks, and mixed runners remain outside the first boundary

These are explicit limitations rather than silent coverage claims. The follow-up [Faraday validation](ruby-faraday-validation-report.md) now locks root RSpec helper ownership and preserves service-receiver exclusions before the rule expands further.

## Result

The experimental Ruby foundation is plausible enough to audit a real conventional gem with exact load-aware constant and usage attribution: detection, `lib/` ownership, runner declaration, command selection, bounded require reachability, unique constant and singleton-method ownership, runnable assertion tracing, repeatability, performance, downstream artifact conformance, and native verification all pass at an exact public commit. Ruby is not promoted; it still needs broader RSpec evidence, more repository shapes, and the shared three-role corpus before supported maturity is considered.
