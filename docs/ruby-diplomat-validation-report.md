# Ruby Diplomat Live Validation Report

## Scope

This report records the fourth pinned live-repository pressure pass for the experimental Ruby adapter. The selected checkout is [`WeAreFarmGeek/diplomat`](https://github.com/WeAreFarmGeek/diplomat) at exact commit `313f94ff2582c7eb161e2aa775182db10ad14285`.

Diplomat supplies a current conventional Bundler repository with two root gems sharing one `lib/`, `spec/`, and root command environment. The pass asks when multiple root gemspecs can form one auditable project without executing the Gemfile or gemspecs.

## Repository Shape

At the selected pin, Diplomat has:

- one root `Gemfile`, `.rspec`, and `Rakefile`, with no checked-in lockfile
- `diplomat.gemspec` and `diplomatic_bag.gemspec`
- one exact top-level `gemspec name:` declaration for each gem
- one exact static gem name in each gemspec, using both supported declaration forms
- 32 Ruby files below `lib/`, producing 9 untested, 20 covered, and 3 skipped candidates
- 26 conventionally named RSpec files and a static RSpec development dependency

Before this slice, the adapter reported medium confidence, classified the root as a Ruby application, withheld its command, and emitted `Multiple root gemspecs require explicit Ruby package ownership.` Candidate and evidence classification still completed conservatively with 20 naming relationships.

## Complete Named Ownership Rule

Multiple root gemspecs now form one Ruby gem project only when all of these conditions hold:

- every root gemspec declares one unique exact static name through `spec.name = "NAME"` or the first literal argument to `Gem::Specification.new`
- the root Gemfile contains exactly one top-level `gemspec name: "NAME"` or `gemspec(name: "NAME")` declaration for every declared gem name
- no root gemspec is omitted, selected twice, or replaced by an unknown name
- no gemspec selection is nested, computed, path-based, hash-rocket, or carries additional options

The complete set contributes package architecture, setup signals, declared test dependencies, command ownership, and the conventional `lib/` bare-require load path together. Partial selection remains blocked because the adapter cannot yet prove which `lib/` paths belong to the selected subset. Database Cleaner's exact selection of only `database_cleaner-core` among two root gemspecs is an intentional negative example of that boundary.

## Native Validation

Diplomat declares Bundler `~> 2.2`, so Bundler 2.7.2 was installed alongside the machine's default Bundler 4 and used explicitly for dependency resolution. The adapter-selected command passed on Ruby 4.0.6:

```text
bundle _2.7.2_ exec rspec
```

Observed result:

- 281 examples
- 0 failures
- randomized execution completed in 0.13 seconds after loading

The ignored generated `Gemfile.lock` was moved outside the checkout before static measurements, restoring the clean exact pin.

## Audit Delta

| Measure | Before | After |
| --- | --- | --- |
| Architecture | `ruby-application` | `ruby-gem` |
| Confidence / blockers | medium / one | high / none |
| Test command | withheld | `bundle exec rspec` |
| Owned gemspec setup | none | `diplomat.gemspec`, `diplomatic_bag.gemspec` |
| Untested / covered / skipped | 9 / 20 / 3 | 9 / 20 / 3 |
| Evidence relationships | 20 naming | 20 naming |

The unchanged evidence graph is important. Diplomat's specs explicitly `require "spec_helper"`, but the current adapter does not resolve conventional test-helper load paths unless the root `.rspec` owns them. Package ownership therefore recovers the command without turning a runtime-supported helper path into unproven source evidence.

## Repeated Audit

Five audits of the restored exact checkout produced one digest before the slice and one after it:

| Measure | Before | After |
| --- | --- | --- |
| Durations | 66.194, 51.273, 50.659, 50.405, 50.653 ms | 67.745, 51.199, 50.436, 50.607, 50.840 ms |
| Median | 50.659 ms | 50.840 ms |
| Canonical SHA-256 | `56085adb2778c1f786242b3b7e1fd9c14b8ddbea53087c68e971a4b1aff80e3a` | `29fce44d989d3775ebf48b2f887619bdaa051f173dfe1715ecafbe90ac632a53` |

Factory Bot and Faraday retain their existing candidate counts, evidence relationship counts, and blocker-free profiles under the same implementation.

## Result

Diplomat validates a useful aggregate ownership rule without executing Bundler metadata or weakening source evidence. The adapter can now stand behind its command for a complete literal multi-gemspec root while keeping partial selection and unresolved test-helper reachability explicit. Exact conventional per-file `spec_helper` loading is the next evidence comparison exposed by this pin; path/partial gem ownership, dynamic gemspec syntax, Rails, and broader helper execution remain separate decisions.
