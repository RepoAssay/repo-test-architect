# Ruby Alpha Support

The Ruby adapter is experimental. Its first bounded slice proves that one conventional Bundler project can flow through project detection, audit, ranking, planning, explanations, findings, placement, stats, CLI/MCP calls, golden artifacts, model consistency, implementation coverage, and generated performance checks without a Ruby-specific artifact format.

## Supported Baseline

| Area | Experimental boundary |
| --- | --- |
| Project ownership | One root `Gemfile`; nested directories with their own `Gemfile` are separate detected projects |
| Source ownership | Repository-contained `.rb` files below `lib/`; symlinks and conventional build/output/vendor directories are excluded |
| Package metadata | Bundler through `Gemfile` and optional `Gemfile.lock`; zero or one root `.gemspec`; the selected runner may be declared directly in any of those exact files |
| Minitest discovery | Runnable `test/**/*_test.rb` files with a visible `Minitest::Test` subclass and `test_*` method |
| RSpec discovery | Runnable `spec/**/*_spec.rb` files with a visible `RSpec.describe`/`describe` group and `it`/`specify` example |
| Test command | `bundle exec rspec`, `bundle exec rake test` for a conventional default `Rake::TestTask` or `Minitest::TestTask`, or a bounded direct Minitest loader when no conventional Rake task exists |
| Existing-test evidence | `ruby-constant-reference` for a unique visible space-indented class/module constant reached through at most three exact literal repository-owned load edges; a uniquely resolved literal root `.rspec --require` helper may consume the first edge, bare requires use `lib/` only for one root gemspec statically included by Gemfile, relative requires resolve from their file, one direct source edge is `direct`, helper/entrypoint reachability is `referenced`, exact source-owned singleton/constructor calls and direct instance calls through one immutable constructor-local receiver in runnable bodies are `called`, and RSpec `described_class` may replace the receiver only under its nearest exact constant-owned `describe`; selected Minitest/RSpec assertions are `asserted`, and a unique basename remains `naming` fallback |
| Candidate filtering | Exact repository-relative, absolute, and Windows-separated `changedPaths` |
| Native fixture gate | `bundle check` followed by `bundle exec rake test` |
| Generated scale gate | 400 behavioral source files, 200 runnable Minitest files, exactly 200 covered and 200 untested candidates, and 200 naming relationships under 5 seconds |

The adapter masks ordinary Ruby comments and quoted strings before recognizing runnable tests, Rake tasks, methods, constants, references, and behavior signals. For RSpec, a safe literal `--require NAME` or `--require=NAME` in the root `.rspec` may resolve uniquely to one root or `spec/` helper and consumes one edge in the three-edge budget. Exact literal `require_relative` edges resolve from the owning file; bare `require` maps into `lib/` only when one root gemspec is statically included by the root Gemfile. Every edge must resolve to a repository-owned `.rb` file. A constant must have one owner among the source files reachable by that test; multiple reachable reopenings are withheld.

Usage is narrower than constant evidence. Only a conventional `def test_*` body or RSpec `it`/`specify` body can contribute it. An exact `Constant.method` call must match a directly declared `def self.method`, a method directly inside `class << self`, or `.new` backed by that class's direct `initialize`; all declarations use two-space lexical indentation. In RSpec, `described_class` may stand in for that exact constant only when the nearest containing static constant-first `describe` owns it; nested string groups and contexts inherit the owner, while a nearer exact constant group overrides it. One local assigned exactly once from that direct, unchained constructor may then call a directly declared instance method when the class does not override `.new` and the local is not block-shadowed. Such a call is `called`. It becomes `asserted` when the same line is a selected built-in Minitest assertion or RSpec `expect`, or when one unique unreassigned local receives the exact call and is later consumed by one of those assertions. A matching filename remains intentionally weaker `naming` evidence.

## Explicit Blockers And Exclusions

The first slice does not claim support for:

- Rails application ownership or Rails-native test commands
- mixed Minitest and RSpec command ownership in one project
- multiple root gemspec package ownership
- custom test roots, custom Rake task names, or computed runner commands
- test-unit, Cucumber, Capybara, property testing, mutation testing, or other Ruby test frameworks
- Bundler workspaces, path-gem graphs, engines, or umbrella repositories beyond separately detected literal `Gemfile` roots
- receivers from RSpec `let`/`subject`, helpers, setup, factories, parameters, fields, wrapping/chaining, or constructor overrides; dynamic/string/variable/parenthesized `describe` ownership; `described_class` aliases or use outside runnable examples; attributes/delegators, `extend self`, inherited/mixed-in/generated methods, shared examples, custom assertion methods, multiline assertion flow, or deeper result flow
- computed/dynamic requires, dynamic or nested `.rspec` configuration, ambiguous configured helpers, graphs deeper than three edges, tab-indented or dynamic constant declarations, constant assignment/`Class.new`, ambiguous reachable reopenings, partial or unqualified nested constant references
- metaprogrammed tests or behavior, dynamically defined methods, deferred lambdas, `public_send`/`send`, refinements, `autoload`, Zeitwerk inference, or runtime constant lookup
- heredoc, percent-literal, interpolation, or parser-complete Ruby semantics

These shapes remain blocked or receive conservative missing evidence rather than inferred coverage.

## Checked-In Proof

`examples/ruby-minitest-basic` contains one locked Bundler gem, a conventional Rake Minitest task, one parser test with an exact source require and visible unique constant, one untested service candidate, and module/data wiring that is deferred to consuming behavior. Run:

```text
npm run ruby:native:check
npm run ruby:performance:check
```

The third pinned role now supports exact group-owned `described_class`. The next evidence decision should compare bounded `let`/`subject` identity with broader conventional project ownership before attempting helpers, shared examples, deeper result flow, or Rails ownership.

The first live probe, [`rubyzip/rubyzip`](https://github.com/rubyzip/rubyzip) at `4209b022069d4d5646753dd5799e8771e4699e5c`, passed 412 native Minitest runs and 2,820 assertions with no failures. Its foundation pass added exact `Minitest::TestTask.create` command ownership and root-gemspec runner declarations. The first evidence follow-up moved the audit from 23/19 to 19/23 untested/covered through bounded require/constant attribution. The receiver follow-up preserves that graph while separating 15 asserted, 24 called, 38 reference-only, and 3 naming relationships: it recovers one direct `Zip::File#find_entry` assertion and removes two optimistic generated-reader assertions. See the [rubyzip Live Validation Report](ruby-rubyzip-validation-report.md).

The second live probe, [`lostisland/faraday`](https://github.com/lostisland/faraday) at `3725183bead9939d3575f2df8e16d8ca7acddf5e`, passed 639 native RSpec examples with no failures and 95.04% reported line coverage. Exact root `.rspec` helper ownership changes its unchanged 8/22 candidate split from 22 naming-only links to 45 relationships: 32 exact and 13 naming. Constructor-local pressure leaves 3 asserted, 2 called, 27 reference-only, and 13 naming relationships after correctly withholding generated `Connection#proxy` ownership. See the [Faraday Live Validation Report](ruby-faraday-validation-report.md).

The third live probe, [`thoughtbot/factory_bot`](https://github.com/thoughtbot/factory_bot) at `967d128e3710b9918f97c75b47b11251e85c2377`, passed 764 adapter-selected RSpec examples and the broader upstream 764-example plus 4-scenario suite. Exact group-owned `described_class` preserves its 21/28 candidate split and 56 relationships while moving four reviewed exact links to asserted usage, producing 21 asserted, 2 called, 20 exact reference-only, and 13 naming relationships. See the [Factory Bot Live Validation Report](ruby-factory-bot-validation-report.md).
