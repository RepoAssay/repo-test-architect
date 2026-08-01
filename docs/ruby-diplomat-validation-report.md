# Ruby Diplomat Live Validation Report

## Scope

This report records the fourth pinned live-repository pressure pass for the experimental Ruby adapter. The selected checkout is [`WeAreFarmGeek/diplomat`](https://github.com/WeAreFarmGeek/diplomat) at exact commit `313f94ff2582c7eb161e2aa775182db10ad14285`.

Diplomat supplies a current conventional Bundler repository with two root gems sharing one `lib/`, `spec/`, and root command environment. The initial pass asks when multiple root gemspecs can form one auditable project without executing the Gemfile or gemspecs; the evidence follow-up asks when RSpec's conventional per-file `spec_helper` load path can be owned without executing helper code.

## Repository Shape

At the selected pin, Diplomat has:

- one root `Gemfile`, `.rspec`, and `Rakefile`, with no checked-in lockfile
- `diplomat.gemspec` and `diplomatic_bag.gemspec`
- one exact top-level `gemspec name:` declaration for each gem
- one exact static gem name in each gemspec, using both supported declaration forms
- 32 Ruby files below `lib/`, producing 9 untested, 20 covered, and 3 skipped candidates
- 26 conventionally named RSpec files and a static RSpec development dependency
- 23 runnable spec files with an exact zero-indented literal `require 'spec_helper'`; the root `.rspec` does not load that helper

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

The unchanged evidence graph was important at this stage. Diplomat's specs explicitly `require "spec_helper"`, but the package-ownership slice did not yet resolve conventional test-helper load paths unless the root `.rspec` owned them. Package ownership therefore recovered the command without prematurely turning a runtime-supported helper path into source evidence.

## Repeated Audit

Five audits of the restored exact checkout produced one digest before the slice and one after it:

| Measure | Before | After |
| --- | --- | --- |
| Durations | 66.194, 51.273, 50.659, 50.405, 50.653 ms | 67.745, 51.199, 50.436, 50.607, 50.840 ms |
| Median | 50.659 ms | 50.840 ms |
| Canonical SHA-256 | `56085adb2778c1f786242b3b7e1fd9c14b8ddbea53087c68e971a4b1aff80e3a` | `29fce44d989d3775ebf48b2f887619bdaa051f173dfe1715ecafbe90ac632a53` |

Factory Bot and Faraday retain their existing candidate counts, evidence relationship counts, and blocker-free profiles under the same implementation.

## Per-File Spec Helper Follow-Up

RSpec adds the project `spec/` default path to `$LOAD_PATH`. The follow-up therefore resolves only an exact zero-indented literal `require "spec_helper"` or `require("spec_helper")` from a runnable `spec/**/*_spec.rb` file to `spec/spec_helper.rb`. That conventional helper consumes the first edge in the existing three-edge graph and takes precedence over a same-named `lib/spec_helper.rb`. Nested, computed, interpolated, alternate-name, explicit `spec/`-path, missing-helper, and non-RSpec forms remain uncredited.

Diplomat's helper exactly requires `diplomat`, making the repository-owned `lib/diplomat.rb` entrypoint reachable. Its internal `require_libs` call constructs paths dynamically, so the adapter stops there rather than treating the helper as proof for every internal file.

| Measure | Multi-gemspec slice | Per-file helper follow-up |
| --- | --- | --- |
| Untested / covered / skipped | 9 / 20 / 3 | 8 / 21 / 3 |
| Evidence relationships | 20 naming | 6 exact + 20 naming |
| Exact usage | none | 1 asserted, 1 called, 4 reference-only |
| Newly covered source | none | `lib/diplomat.rb` |
| Canonical SHA-256 | `29fce44d989d3775ebf48b2f887619bdaa051f173dfe1715ecafbe90ac632a53` | `cf7e08a848e975045418b4b1fa233006863dd9125ff60e3a18dbfa11a8197ab2` |

Five restored audits completed in 70.143, 53.861, 53.479, 52.548, and 52.578 ms, for a 53.479 ms median and one canonical digest. The exact links belong to `configure_spec.rb`, `event_spec.rb`, `kv_spec.rb`, `lock_spec.rb`, `node_spec.rb`, and `service_spec.rb`; tests that mention only a nested `Diplomat::*` constant do not count as exact entrypoint references. Factory Bot remains at 21/28/4 with 56 relationships, Faraday at 8/22/3 with 45, and rubyzip at 19/23/6 with 80.

## Result

Diplomat validates both a useful aggregate ownership rule and one exact conventional RSpec helper path without executing Bundler metadata or helper code. The adapter can stand behind its command for a complete literal multi-gemspec root and connect six visible entrypoint references through per-file `spec_helper`, while keeping partial gem selection, dynamic internal fan-out, alternate helpers, path/dynamic gemspec syntax, Rails, and broader helper execution as separate decisions.
