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
| Existing-test evidence | Naming-level evidence only when one runnable `_test.rb` or `_spec.rb` basename resolves to exactly one `lib/` source basename |
| Candidate filtering | Exact repository-relative, absolute, and Windows-separated `changedPaths` |
| Native fixture gate | `bundle check` followed by `bundle exec rake test` |
| Generated scale gate | 400 behavioral source files, 200 runnable Minitest files, exactly 200 covered and 200 untested candidates, and 200 naming relationships under 5 seconds |

The adapter masks ordinary Ruby comments and quoted strings before recognizing runnable tests, Rake tasks, methods, and behavior signals. A matching filename is intentionally `naming` evidence: it can establish that a test is plausibly associated with one source file, but it does not claim a visible call or assertion.

## Explicit Blockers And Exclusions

The first slice does not claim support for:

- Rails application ownership or Rails-native test commands
- mixed Minitest and RSpec command ownership in one project
- multiple root gemspec package ownership
- custom test roots, custom Rake task names, or computed runner commands
- test-unit, Cucumber, Capybara, property testing, mutation testing, or other Ruby test frameworks
- Bundler workspaces, path-gem graphs, engines, or umbrella repositories beyond separately detected literal `Gemfile` roots
- direct constant, method, receiver, require, helper, shared-example, factory, or assertion evidence
- metaprogrammed tests or behavior, dynamically defined methods, refinements, `autoload`, Zeitwerk inference, or runtime constant lookup
- heredoc, percent-literal, interpolation, or parser-complete Ruby semantics

These shapes remain blocked or receive conservative missing evidence rather than inferred coverage.

## Checked-In Proof

`examples/ruby-minitest-basic` contains one locked Bundler gem, a conventional Rake Minitest task, one directly named parser test, one untested service candidate, and module/data wiring that is deferred to consuming behavior. Run:

```text
npm run ruby:native:check
npm run ruby:performance:check
```

The next slices should build on the pinned conventional probe with exact `require`/constant evidence, then expand RSpec and Rails ownership only where live audits justify narrow rules.

The first live probe, [`rubyzip/rubyzip`](https://github.com/rubyzip/rubyzip) at `4209b022069d4d5646753dd5799e8771e4699e5c`, passed 412 native Minitest runs and 2,820 assertions with no failures. It added exact `Minitest::TestTask.create` command ownership and root-gemspec runner declarations while preserving naming-only evidence and ambiguous-basename rejection. See the [rubyzip Live Validation Report](ruby-rubyzip-validation-report.md).
