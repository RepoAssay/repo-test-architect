# Ruby Helper And Factory Return Live Validation Report

## Scope

This report records the fifth pinned live-repository pressure pass for the experimental Ruby adapter. The positive checkout is [`dinie-tech/sdk-ruby`](https://github.com/dinie-tech/sdk-ruby) at exact commit `11048303d772928775ca35e05465749dada24f78`. The complementary negative checkout is [`somleng/cgrates-ruby`](https://github.com/somleng/cgrates-ruby) at `a9aacc4790c1f56e00d49c107e3af64f081cfe7b`.

The pass asks when a test can retain exact class identity after receiving an object from one source-owned factory method or one same-file RSpec helper. It deliberately does not add general helper execution, lexical constant resolution, mixin ownership, or arbitrary return-flow analysis.

## Exact Return Boundary

A source factory may supply an instance receiver only when:

- the unique source class directly declares `initialize`, directly declares the later instance method, and does not override `.new`
- the direct singleton factory body consists only of `new(...)` or `self.new(...)`
- a runnable test binds one unreassigned, unshadowed local from the exact factory call

A same-file RSpec helper may supply the same receiver only when:

- the helper is declared directly in a normal containing `describe` or `context`, outside shared examples
- its whole body is one direct `Constant.new(...)` or `described_class.new(...)` expression
- `described_class` has the same exact nearest constant owner at declaration and use
- the nearest helper declaration for that name remains exact; an unknown inner override blocks the outer identity
- a runnable example binds one stable local from the direct helper call

The existing direct instance-method and assertion rules then apply. Chained or multi-statement returns, helper modules, setup hooks, Minitest helpers, unqualified nested constants, direct chaining on the helper call, blocks, wrapping, receiver reassignment, dynamic dispatch, inherited or mixed-in methods, and deeper helper/result flow remain uncredited.

## Dinie Native Validation

Dinie is a conventional RSpec gem with a root `Gemfile`, `.rspec`, gemspec, Rakefile, `lib/`, and `spec/`. Its runtime specs define direct same-group helpers such as `build_client`, `build_manager`, and `build_session_manager`, each returning `described_class.new(...)`. The returned clients and managers are repeatedly bound to stable locals before directly declared methods are asserted.

Dependencies were installed with Ruby 4.0.6 and Bundler 4.0.16. The adapter-selected command passed:

```text
bundle exec rspec
```

Observed result:

- 579 examples
- 0 failures
- randomized execution completed in 1.04 seconds after loading

Bundler generated an ignored `Gemfile.lock`; it was moved outside the checkout before static measurements, restoring the clean exact pin.

## Reviewed Dinie Delta

Candidate and relationship ownership do not change. Three existing exact relationships gain assertion-backed receiver usage:

| Source and spec | Before | After | Reviewed reason |
| --- | --- | --- | --- |
| `lib/dinie/runtime/http.rb` → `spec/runtime/http_spec.rb` | reference-only | asserted | exact `build_client` return is bound to a stable `HttpClient` local that calls directly declared methods inside `expect` |
| `lib/dinie/runtime/token_manager.rb` → `spec/runtime/session_mode_spec.rb` | called | asserted | exact session/partner manager helper returns feed stable `TokenManager#access_token` receiver assertions |
| `lib/dinie/runtime/token_manager.rb` → `spec/runtime/token_manager_spec.rb` | reference-only | asserted | exact `build_manager` return feeds stable direct `access_token` and `invalidate!` receiver assertions |

| Measure | Before | After |
| --- | ---: | ---: |
| Untested / covered / skipped | 26 / 19 / 11 | 26 / 19 / 11 |
| Evidence relationships | 47 | 47 |
| Asserted | 5 | 8 |
| Called | 4 | 3 |
| Exact reference-only | 31 | 29 |
| Naming | 7 | 7 |
| Canonical SHA-256 | `aabad91b16a30a8064922fc01627802d2ad6c87396ffe606c18646cb1a9cc4af` | `6d89b3608d2f4d8d330a61721082430e91a036ebf3d6fb10f8f001db70c744d6` |

Five restored after-slice audits completed in 210.748, 185.246, 180.239, 168.603, and 166.804 ms, for a 180.239 ms median and one canonical digest.

## CGRateS Negative Control

CGRateS uses a realistic same-file helper shape, but its specs sit inside `module CGRateS` and the helper returns unqualified `Client.new(...)` or `FakeClient.new(...)`. Resolving those names to `CGRateS::Client` and `CGRateS::FakeClient` would require lexical constant ownership beyond this slice. The adapter therefore preserves its high-confidence `bundle exec rspec` profile, 2 / 2 / 2 candidate split, and two evidence relationships without upgrading either helper receiver.

Its native command passed 27 examples with zero failures. The checkout was restored after Bundler refreshed one lockfile dependency, and before/after static audits share digest `18d3542a3670090d9edf15f0c9d108d43bc04f9831a2523593f17e9c729a525b`.

## Result

The slice recovers useful helper-return evidence without treating arbitrary test support as executed source. Dinie proves the positive same-group `described_class` path; CGRateS proves that lexical shorthand stays visible rather than guessed. Exact source factory returns are regression-backed under the same stable-local boundary, while live source-factory expansion awaits a representative repository that exercises the shape directly.
