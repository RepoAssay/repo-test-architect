# Elixir Experimental Support

The Elixir adapter is registered as experimental at a deliberately narrow Mix/ExUnit boundary. It establishes the shared audit, plan, explanation, ranking, project-analysis, CLI, MCP, golden, coverage, performance, packaging, and native-fixture contracts without implying broad Elixir support.

## Supported foundation

- one conventional root Mix application with `mix.exs`
- one literal `app: :name` and the matching `Name.MixProject` module using `Mix.Project`
- source ownership under `lib/**/*.ex`, with one module matching the conventional path and app namespace
- runnable tests under `test/**/*_test.exs`, with one path-matching module, `use ExUnit.Case`, and a literal `test "..." do` block
- a root `test/test_helper.exs` containing a direct `ExUnit.start()` call
- the repository-native `mix test` command only when every foundation ownership requirement is proven
- direct fully qualified or unambiguous exact-alias module calls, classified as called or asserted evidence
- conservative path-matching filename evidence when direct usage is not proven
- changed-path filtering, low-runtime module skipping, deterministic output, and generated 400-source/200-test pressure

## Explicit exclusions

The foundation does not claim Mix umbrellas, Phoenix/Ecto ownership, doctests, custom compile/test paths, computed project metadata, dynamic module construction, macro expansion, protocols/behaviours, test templates, ExUnit setup/helper reachability, async-task result flow, or dependency-aware call resolution. Nested Mix roots are separate projects, and ambiguous metadata withholds `mix test`.

## Verification

```sh
npm run elixir:performance:check
npm run elixir:native:check
```

The native check copies the fixture to a temporary directory before running Mix so `_build` artifacts never enter the package fixture. Promotion requires representative public-repository audits and the same corpus scorecard used by supported adapters.

## Next slices

The next useful work is live-repository pressure on conventional libraries, followed by evidence and command refinements driven by observed gaps. Umbrellas and framework-specific semantics remain separate decisions.
