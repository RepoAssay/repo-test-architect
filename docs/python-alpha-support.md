# Python Alpha Support

This matrix defines the bounded private-alpha support claim for the Python adapter. The common patterns below are locked by deterministic fixtures, model-consistency scenarios, and reviewed real-repository reports; layouts outside this boundary remain conservative or explicitly blocked.

## Current Common-Pattern Coverage

| Area | Current support | Evidence used |
| --- | --- | --- |
| Package and project shapes | Root and package-directory Python projects using `pyproject.toml`, `requirements.txt`, setuptools, uv, Poetry, or Hatch | project markers, lockfiles, conventional `src/` roots, declared-name roots, literal setuptools/Poetry package entries, and bounded setuptools find roots |
| Test frameworks | pytest, unittest, pytest-asyncio, AnyIO-marked tests, and Hypothesis | dependency/configuration text, test imports/decorators, `pytest.ini`, `.pytest.ini`, `pytest.toml`, `.pytest.toml`, plus conventional or statically configured test filenames |
| Commands | `pytest`, `python -m unittest`, Django `manage.py test`/`tests/runtests.py`, `uv run`, `poetry run`, explicitly configured `hatch test`, proven tox environments, and proven nox test sessions | detected framework and project-tool markers; Hatchling alone is treated only as a build backend, while Django/tox/nox commands require explicit runner evidence |
| Test locations | root `test/`, `testing/`, and `tests/`, package-local variants, and literal pytest `testpaths` | conventional directories plus bounded `test_*.py`, `*_test.py`, Django-style `tests.py`, or configured `python_files` matches |
| Pytest organization | fixtures in visible `conftest.py` or the consuming test module, bounded fixture dependency chains, async tests, parametrization, and property-based tests | exact source imports used in fixture bodies, fixture parameters/`usefixtures`, decorators, and test imports |
| Application boundaries | parsers, mappers, validators, formatters, calculators, services, clients, repositories, and branching utilities | path, function-name, branching, async, and external-I/O signals |
| HTTP boundaries | FastAPI routers/wiring, Django views/wiring, and Flask routes/wiring | framework imports, view paths, router/blueprint declarations, route decorators, and route paths |
| Coverage configuration | coverage.py configuration and branch mode | `.coveragerc`, `[tool.coverage.*]`, and `[coverage:*]` sections in `setup.cfg`/`tox.ini`; configuration is never treated as source-specific coverage proof |
| Low-value boundaries | application wiring, dataclass/Pydantic DTOs, package initializers, and files without detected runtime behavior | path, declarations, framework construction, and source content |
| Changed-file audits | repository-relative, current-directory-relative, absolute, and Windows-style source paths | normalized paths passed through the shared audit API |

The current adapter emits the shared audit, explanation, ranking, plan, findings, placement, and stats artifacts. Exact absolute package-qualified imports and bounded relative `from` imports emit direct `python-module-import` evidence. Explicit one-hop package initializer exports emit referenced `python-package-reexport` evidence. Exact absolute or relative imports used inside consumed pytest fixtures emit indirect `python-pytest-fixture` evidence, including bounded fixture dependencies. A statically used same-owner import from a called or asserted source entrypoint emits one-hop indirect `bounded-dependency` evidence. Supported framework clients can emit indirect `python-test-client-route` evidence for a uniquely matched route. Calls, assertions, fixture-value usage, and client requests are recorded only when statically visible. Filename matching remains structural: `foo.py` can match `test_foo.py` or `foo_test.py` in a recognized test directory, but duplicate basenames require package/test owner agreement or import proof.

Package ownership accepts non-empty literal `[tool.setuptools].packages` lists, bounded `[tool.setuptools.packages.find]` or `setup.cfg` `find:`/`find_namespace:` roots with simple top-level include/exclude globs, and Poetry `packages` entries with an optional literal `from` base. These declarations can own several packages or a PEP 420-style namespace without absorbing sibling documentation, support, or tooling directories. Computed `setup.py`, nested include patterns, per-package remapping, and arbitrary backend hooks remain unsupported.

Relative evidence is resolved from the test or fixture-support file's containing package and remains bound to that file's exact owned layout entry. This covers forms such as `from ..parser import parse` and `from .. import parser` in conventional, declarative, and implicit-namespace package-local tests. Imports outside an owned package, imports with too many leading dots, unresolved modules, and same-named modules under another import root receive no evidence.

Source dependency evidence traverses exactly one source edge from a test entrypoint that is visibly called or asserted, including an entrypoint consumed through a visible pytest fixture. The imported binding must appear outside its import statement, both source files must share the exact layout owner, and duplicate module names resolve only inside that owner. Imports guarded by a literal `if TYPE_CHECKING:`/`if typing.TYPE_CHECKING:` block, unused imports, filename-only entrypoints, cross-owner packages, and a dependency's own imports do not expand coverage. Cycles therefore terminate without graph traversal.

Framework client evidence is bounded separately from generic source dependencies. FastAPI or Starlette `TestClient` must receive an exactly imported app whose source constructs `FastAPI` and statically includes one imported router. Flask `test_client()` must originate from an exactly imported app or factory whose source constructs `Flask` and statically registers one imported blueprint. A Django `Client` or recognized Django `TestCase` client requires exactly one literal `ROOT_URLCONF` and a direct literal `path()` mapping to an imported view. Module clients and visible pytest client fixtures are supported. Literal router, blueprint, registration, and URL prefixes are composed; query strings and fragments are removed from requests; simple FastAPI, Flask, and Django path-parameter segments can match one concrete request segment.

The request method and normalized path must identify exactly one owned route source. Wrong methods, computed request or route paths, `path` converters, ambiguous route registrations, comments and strings, unused fixtures, duplicate import roots, nested Django `include()`, and deeper application graphs receive no client evidence. Framework boot sources are excluded from generic one-hop dependency propagation, so constructing a client alone cannot mark every imported router as covered.

Pytest discovery reads one root configuration using pytest's precedence: `pytest.toml`/`.pytest.toml`, `pytest.ini`/`.pytest.ini`, `pyproject.toml`, `tox.ini`, then `setup.cfg`. Literal in-repository `testpaths` and simple basename `python_files` globs become authoritative test candidates; helpers and `conftest.py` inside those roots remain test support rather than production candidates. Absolute, parent-escaping, path-glob, bracket, and brace values are rejected instead of broadening the audit. See pytest's [configuration formats](https://docs.pytest.org/en/stable/reference/customize.html) and [Python collection settings](https://docs.pytest.org/en/stable/example/pythoncollection.html), plus setuptools [package discovery](https://setuptools.pypa.io/en/stable/userguide/package_discovery.html).

## Promotion Gate Evidence

The registry maturity changed to `supported` after these gates were satisfied:

- validate representative small-library, `src/` layout, package-local test, FastAPI, and no-tests-yet repositories
- scope source discovery to declared or conventional package roots without absorbing virtual environments, generated outputs, examples, or unrelated nested projects
- keep package-qualified direct imports, explicit one-hop package re-exports, and duplicate-basename safeguards locked by regression tests
- extend import evidence only where the adapter can prove the relationship, preserving filename-only evidence as structural
- cover pytest and unittest commands across plain pip, setuptools, uv, Poetry, and Hatch projects
- record known false positives, false negatives, unsupported layouts, and blocker behavior in a real-repository report
- add golden audit/plan fixtures and model-consistency locks for every heuristic changed by live validation
- keep the generated 400-source/200-test semantic and timing regression gate green
- keep `npm run alpha:check` passing in a clean local environment

## Known Gaps

- source discovery scopes conventional `src/` layouts, declared-name packages, literal multi-package declarations, and bounded setuptools find roots, but computed build metadata, unsupported nested/remapped discovery, standalone modules, and ambiguous undeclared flat layouts still fall back conservatively
- direct absolute and package-owned relative imports, explicit package re-exports, bounded pytest fixture dependencies, one-hop same-owner source dependencies, and the documented static framework-client route shapes are covered, but plugin-provided/dynamically requested fixtures, deeper or cross-owner source graphs, import hooks, and runtime-conditional imports are not resolved
- namespace packages are bounded to declared source/find roots; editable-install metadata, monorepos, generated clients, notebooks, C-extension modules, and dynamic import paths are not explicitly modeled
- FastAPI, Django, and Flask client evidence is limited to direct static router/blueprint/URLconf wiring; async clients, lifespan behavior, nested URLconfs, dynamic factories/configuration, middleware, ORM, templates, and dependency overrides are not modeled
- SQLAlchemy, database migrations, task queues, CLI frameworks, and Starlette beyond its synchronous `TestClient` convention have no dedicated boundary semantics
- parametrization and Hypothesis are detected as suite conventions, but generated cases, strategies, examples, and per-parameter source reachability are not expanded
- pytest configuration inheritance above the audited project, plugin-mutated discovery, `--ignore`/`norecursedirs`, and advanced glob semantics are not resolved
- runtime coverage, fixture runtime behavior, async event-loop policy, database isolation, and framework dependency overrides are not inferred from static evidence
- alternate test roots require literal in-repository `testpaths`; custom filenames require simple basename `python_files` globs without bracket, brace, or path syntax

## Non-Goals For Python Alpha

- native test generation or repair loops
- executing arbitrary package metadata to discover dynamic build configuration
- proving runtime branch or line coverage
- universal Python framework support
- automatic test moves or repository rewrites

The supported claim should remain bounded to this matrix. Long-tail layouts should produce conservative findings or explicit blockers rather than guessed ownership or coverage.
