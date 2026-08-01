# Ruby Shared Example Live Validation Report

## Scope

This report records the sixth pinned live-repository pressure pass for the experimental Ruby adapter. It revisits [`lostisland/faraday`](https://github.com/lostisland/faraday) at exact commit `3725183bead9939d3575f2df8e16d8ca7acddf5e` and [`thoughtbot/factory_bot`](https://github.com/thoughtbot/factory_bot) at `967d128e3710b9918f97c75b47b11251e85c2377`.

The pass asks when a same-file RSpec shared-example body is provably runnable under an exact source constant. It also corrects the inverse case: an example body inside a shared declaration is dormant until a supported inclusion proves otherwise and must not contribute call or assertion usage merely because its text is visible.

## Exact Binding Boundary

A shared body contributes usage only when:

- `shared_examples` or `shared_examples_for` has an exact quoted literal name, no parameters, and a `do` body
- the declaration is in the same runnable spec file, appears before the inclusion, and is either top-level or a direct member of a normal `describe` or `context`
- `it_behaves_like` or `include_examples` uses the same exact literal name, with no arguments or block, directly inside a normal group
- the inclusion sits below a nearest exact constant-first `describe`
- exactly one visible declaration wins at the nearest group depth

Direct and exactly parenthesized literal forms are accepted. The inclusion owner's constant binds `described_class` inside the selected shared `it` and `specify` bodies. Existing direct call, stable local, and assertion rules then apply, but shared-example memos and helpers do not cross the binding boundary.

Cross-file declarations, shared contexts, parameterized declarations or inclusions, inclusion blocks, dynamic or interpolated names, duplicate nearest declarations, nested shared-example inclusion chains, and `it_should_behave_like` remain uncredited. Unsupported or dormant bodies still provide ordinary visible constant-reference evidence, but no execution usage.

## Faraday Validation

Faraday contains exact top-level shared declarations and same-file literal `it_behaves_like` calls, including `initializer with url` and `default connection options`. The native command passed:

```text
bundle exec rspec
```

Observed result:

- 639 examples
- 0 failures
- 95.04% line coverage, 1,459 of 1,535 lines

The audit remains stable at 8 untested, 22 covered, and 3 skipped candidates with 45 evidence relationships: 6 asserted, 1 called, 25 exact reference-only, and 13 naming. The exact shared syntax is recognized, but it does not inflate the graph: the relevant direct relationship was already asserted, while other bodies depend on subjects, memos, generated readers, or chained calls outside the bounded receiver rules.

## Factory Bot Negative Control

Factory Bot's shared-example pressure is deliberately broader than this slice. Its prominent sequence examples accept parameters, definition-loading examples use `shared_examples_for` with block-bearing legacy `it_should_behave_like` inclusions, and strategy examples depend on shared subjects, memos, and implicit matchers.

Its native RSpec command passed:

- 764 examples
- 0 failures
- 98.51% line coverage, 1,325 of 1,345 lines

The adapter preserves the prior 21 untested, 28 covered, and 4 skipped split and all 56 relationships: 21 asserted, 2 called, 20 exact reference-only, and 13 naming. No parameterized or helper-driven shared behavior is guessed.

## Result

The slice makes shared-example execution evidence bidirectional and conservative: exact literal same-file inclusion can now bind `described_class`, while dormant bodies stop looking runnable. Faraday proves the supported syntax against a real suite, Factory Bot keeps the excluded RSpec metaprogramming boundary honest, and focused regressions prove positive class and stable-local assertion usage plus the dormant, dynamic, parameterized, block-bearing, shared-context, and duplicate-name rejections.
