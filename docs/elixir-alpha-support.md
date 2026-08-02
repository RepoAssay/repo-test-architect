# Elixir Experimental Support

The Elixir adapter is registered as experimental at a deliberately narrow Mix/ExUnit boundary. It establishes the shared audit, plan, explanation, ranking, project-analysis, CLI, MCP, golden, coverage, performance, packaging, and native-fixture contracts without implying broad Elixir support.

## Supported foundation

- one conventional root Mix application with `mix.exs`
- one literal `app: :name` and the matching `Name.MixProject` or legacy `Name.Mixfile` module using `Mix.Project`
- source ownership under `lib/**/*.ex`, with one exact conventional or app-prefixed flat-path primary module or protocol; related declarations may be adjacent, but duplicate primary FQNs are blockers
- runnable tests under `test/**/*_test.exs`, with one first-declared app-owned `*Test` primary module, exactly one `use ExUnit.Case`, and a quoted `test "..." do` body; nested fixture modules are allowed
- a root `test/test_helper.exs` containing a direct `ExUnit.start()` call
- the repository-native `mix test` command only when every foundation ownership requirement is proven
- direct fully qualified, unambiguous exact-alias, or exact grouped-alias module calls inside extracted test bodies, classified as called or asserted evidence
- conservative path-matching filename evidence when direct usage is not proven
- changed-path filtering, low-runtime module skipping, deterministic output, and generated 400-source/200-test pressure

## Explicit exclusions

The foundation does not claim Mix umbrellas, Phoenix/Ecto ownership, doctest or property-test evidence, custom compile/test paths, computed project metadata, dynamic module construction, macro expansion, protocol implementation or behaviour reachability, test templates, ExUnit setup/helper reachability, async-task result flow, or dependency-aware call resolution. Nested Mix roots are separate projects, installed `deps/` and `_build/` trees are ignored, and ambiguous metadata withholds `mix test`.

## Verification

```sh
npm run elixir:performance:check
npm run elixir:native:check
```

The native check copies the fixture to a temporary directory before running Mix so `_build` artifacts never enter the package fixture. Promotion requires representative public-repository audits and the same corpus scorecard used by supported adapters.

## Next slices

The first live pass against [`michalmuskala/jason`](elixir-jason-validation-report.md) recovered its legacy Mixfile, flat app namespace, protocol, app-owned tests, grouped aliases, and test-body-scoped evidence while preserving explicit ambiguity controls. The next useful pressure case should be framework-heavy or difficult-ownership Elixir. Umbrellas and framework-specific semantics remain separate decisions.
