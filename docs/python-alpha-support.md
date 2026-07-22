# Python Alpha Support

This matrix defines the bounded private-alpha support claim for the Python adapter. The common patterns below are locked by deterministic fixtures, model-consistency scenarios, and reviewed real-repository reports; layouts outside this boundary remain conservative or explicitly blocked.

## Current Common-Pattern Coverage

| Area | Current support | Evidence used |
| --- | --- | --- |
| Package and project shapes | Root and package-directory Python projects using `pyproject.toml`, `requirements.txt`, setuptools, uv, Poetry, or Hatch | project markers, lockfiles, tool tables, conventional `src/` roots, declared-name package roots, and conservative top-level package inference |
| Test frameworks | pytest, unittest, pytest-asyncio, AnyIO-marked tests, and Hypothesis | dependency/configuration text, test imports/decorators, `pytest.ini`, `pytest.toml`, `.pytest.toml`, plus conventional test filenames |
| Commands | `pytest`, `python -m unittest`, Django `manage.py test`/`tests/runtests.py`, `uv run`, `poetry run`, explicitly configured `hatch test`, proven tox environments, and proven nox test sessions | detected framework and project-tool markers; Hatchling alone is treated only as a build backend, while Django/tox/nox commands require explicit runner evidence |
| Test locations | root `test/`, `testing/`, and `tests/`, plus package-local `test/` and `tests/` directories | conventional directories and `test_*.py`, `*_test.py`, or Django-style `tests.py` filenames |
| Pytest organization | fixtures in visible `conftest.py` or the consuming test module, bounded fixture dependency chains, async tests, parametrization, and property-based tests | exact source imports used in fixture bodies, fixture parameters/`usefixtures`, decorators, and test imports |
| Application boundaries | parsers, mappers, validators, formatters, calculators, services, clients, repositories, and branching utilities | path, function-name, branching, async, and external-I/O signals |
| HTTP boundaries | FastAPI routers/wiring, Django views/wiring, and Flask routes/wiring | framework imports, view paths, router/blueprint declarations, route decorators, and route paths |
| Coverage configuration | coverage.py configuration and branch mode | `.coveragerc`, `[tool.coverage.*]`, and `[coverage:*]` sections in `setup.cfg`/`tox.ini`; configuration is never treated as source-specific coverage proof |
| Low-value boundaries | application wiring, dataclass/Pydantic DTOs, package initializers, and files without detected runtime behavior | path, declarations, framework construction, and source content |
| Changed-file audits | repository-relative, current-directory-relative, absolute, and Windows-style source paths | normalized paths passed through the shared audit API |

The current adapter emits the shared audit, explanation, ranking, plan, findings, placement, and stats artifacts. Exact package-qualified imports emit direct `python-module-import` evidence. Explicit one-hop package initializer exports emit referenced `python-package-reexport` evidence. Exact imports used inside consumed pytest fixtures emit indirect `python-pytest-fixture` evidence, including bounded fixture dependencies. Calls, assertions, and fixture-value usage are recorded only when statically visible. Filename matching remains structural: `foo.py` can match `test_foo.py` or `foo_test.py` in a recognized test directory, but duplicate basenames require package/test owner agreement or import proof.

## Promotion Gate Evidence

The registry maturity changed to `supported` after these gates were satisfied:

- validate representative small-library, `src/` layout, package-local test, FastAPI, and no-tests-yet repositories
- scope source discovery to declared or conventional package roots without absorbing virtual environments, generated outputs, examples, or unrelated nested projects
- keep package-qualified direct imports, explicit one-hop package re-exports, and duplicate-basename safeguards locked by regression tests
- extend import evidence only where the adapter can prove the relationship, preserving filename-only evidence as structural
- cover pytest and unittest commands across plain pip, setuptools, uv, Poetry, and Hatch projects
- record known false positives, false negatives, unsupported layouts, and blocker behavior in a real-repository report
- add golden audit/plan fixtures and model-consistency locks for every heuristic changed by live validation
- keep `npm run alpha:check` passing in a clean local environment

## Known Gaps

- source discovery scopes conventional `src/` layouts, declared-name packages, and repositories with one unambiguous top-level package, but complex build metadata, multiple owned packages, and standalone modules still fall back to repository-wide non-test discovery
- direct absolute imports, explicit package re-exports, and bounded pytest fixture dependencies are covered, but relative test imports, application boot paths, plugin-provided fixtures, dynamically requested fixtures, and bounded source dependencies are not resolved
- namespace packages, editable installs, monorepos, generated clients, notebooks, C-extension modules, and dynamic import paths are not explicitly modeled
- Django and Flask have bounded view/route and wiring semantics; deeper ORM, middleware, template, application-factory, and framework test-client reachability is not modeled
- SQLAlchemy, database migrations, task queues, CLI frameworks, and Starlette beyond FastAPI conventions have no dedicated boundary semantics
- parametrization and Hypothesis are detected as suite conventions, but generated cases, strategies, examples, and per-parameter source reachability are not expanded
- pytest configuration in every supported file/table form and custom test discovery patterns need broader validation
- runtime coverage, fixture runtime behavior, async event-loop policy, database isolation, and framework dependency overrides are not inferred from static evidence
- alternate test roots are bounded to conventional `test`, `testing`, and `tests` directory names; arbitrary `python_files`/`testpaths` patterns are reported only where current configuration parsing recognizes them

## Non-Goals For Python Alpha

- native test generation or repair loops
- executing arbitrary package metadata to discover dynamic build configuration
- proving runtime branch or line coverage
- universal Python framework support
- automatic test moves or repository rewrites

The supported claim should remain bounded to this matrix. Long-tail layouts should produce conservative findings or explicit blockers rather than guessed ownership or coverage.
