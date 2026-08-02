# Elixir Experimental Support

The Elixir adapter is registered as experimental at a deliberately narrow Mix/ExUnit boundary. It establishes the shared audit, plan, explanation, ranking, project-analysis, CLI, MCP, golden, coverage, performance, packaging, and native-fixture contracts without implying broad Elixir support.

## Supported foundation

- one conventional root Mix application with `mix.exs`
- one literal `app: :name` and the matching `Name.MixProject` or legacy `Name.Mixfile` module using `Mix.Project`
- source ownership under `lib/**/*.ex`, with one exact conventional or app-prefixed flat-path primary module or protocol; exact segment casing may preserve an acronym, one terminal singular protocol may own an otherwise exact plural path, and one all-uppercase terminal acronym namespace may split a matching snake-case terminal; repeated declarations must resolve to the same exact FQN, while normalized or different-declaration collisions remain blockers
- conventional `lib/mix/tasks/**/*.ex` ownership for exact `Mix.Tasks.*` modules and matching exact Mix task test modules
- runnable tests under `test/**/*_test.exs`, with one first-declared app-owned `*Test` primary module or exact conventional `Mix.Tasks.*Test`, one owned ExUnit case use, and a quoted `test "..." do` body; nested fixture modules are allowed
- literal `test/support` compilation through `elixirc_paths(Mix.env())` and a static `elixirc_paths(:test)` list, with exact app-owned `__using__/1` wrapper chains that resolve to one `use ExUnit.Case`
- a root `test/test_helper.exs` containing a direct `ExUnit.start()` call, optionally with static boolean, `nil`, number, or literal-atom keyword values
- the repository-native `mix test` command only when every foundation ownership requirement is proven
- direct fully qualified, unambiguous exact-alias, or exact grouped-alias module calls inside extracted test bodies, classified as called or asserted evidence
- conservative path-matching filename evidence when direct usage is not proven
- changed-path filtering, low-runtime module skipping, deterministic output, and generated 400-source/200-test pressure

## Explicit exclusions

The foundation does not claim Mix umbrellas, Phoenix/Ecto ownership, doctest or property-test evidence, arbitrary compile/test paths, computed project metadata, dynamic module construction, general macro expansion, protocol implementation or behaviour reachability, ExUnit setup/helper/import reachability, computed or collection-valued startup options, async-task result flow, or dependency-aware call resolution. Local wrapper recognition establishes runnable-test ownership only. Nested Mix roots are separate projects, installed `deps/` and `_build/` trees are ignored, and ambiguous metadata withholds `mix test`.

## Verification

```sh
npm run elixir:performance:check
npm run elixir:native:check
```

The native check copies the fixture to a temporary directory before running Mix so `_build` artifacts never enter the package fixture. Promotion requires representative public-repository audits and the same corpus scorecard used by supported adapters.

## Next slices

The first live pass against [`michalmuskala/jason`](elixir-jason-validation-report.md) recovered its legacy Mixfile, flat app namespace, protocol, app-owned tests, grouped aliases, and test-body-scoped evidence. The framework-heavy [`elixir-plug/plug`](elixir-plug-validation-report.md) pass recovered case-normalized acronym modules, one terminal singular protocol, and static ExUnit startup options. The difficult-ownership [`absinthe-graphql/absinthe`](elixir-absinthe-validation-report.md) pass added literal compiled-support wrapper chains, conventional Mix tasks, repeated exact declarations, and terminal acronym namespaces without inferring framework reachability. All three planned comparison roles are complete; the next step is the portfolio-wide adapter evidence analysis. Umbrellas and framework-specific semantics remain separate decisions.
