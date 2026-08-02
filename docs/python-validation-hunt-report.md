# Python Validation Hunt Report

This report records the real-repository evidence used to promote the Python adapter to bounded public-alpha support. Public repositories were shallow-cloned and audited locally without installing dependencies, running repository code, or uploading source.

## Discovery Profiles

The validation finder now exposes six Python profiles:

| Profile | Required root evidence | Validation purpose |
| --- | --- | --- |
| `python` | `pyproject.toml`, setuptools metadata, or a root test directory | general package and no-tests-yet shapes |
| `python-pytest` | pytest in project/configuration files or a root test directory | pytest configuration and command discovery |
| `python-fastapi` | FastAPI in `pyproject.toml` or `requirements.txt` | application, route, DTO, and service boundaries |
| `python-django` | Django in `pyproject.toml` or `requirements.txt` | Django view and project-wiring boundaries |
| `python-flask` | Flask in `pyproject.toml` or `requirements.txt` | Flask route, blueprint, and application-wiring boundaries |
| `python-advanced` | async/property-based dependencies, tox/nox, coverage config, or root tests | fixtures, async/parametrized/property-based conventions, environment runners, and coverage configuration |

The pytest profile recognizes `pyproject.toml`, `setup.cfg`, `tox.ini`, `pytest.ini`, and the modern `pytest.toml` and `.pytest.toml` forms. Framework profiles inspect exact root dependency files, and the advanced profile recognizes explicit tox/nox, coverage, async, and property-based markers. The finder also treats `uv.lock` and `poetry.lock` as quality/runnability signals.

## Selected Public Probes

| Repository | Audited commit | Role | Detected command | Untested | Covered | Skipped |
| --- | --- | --- | --- | ---: | ---: | ---: |
| [`tox-dev/tox-uv`](https://github.com/tox-dev/tox-uv) | `6268ef93cc32127855135fcf1ff32c1277f83aae` | modern `src/` package with pytest, Hatchling build metadata, and tox/uv integration | `pytest` | 5 | 3 | 1 |
| [`fastapi/asyncer`](https://github.com/fastapi/asyncer) | `783a462e0a70016d99cbb9baccf46aaa1cd38ca2` | compact declared-name package with uv, pytest 9 configuration, docs, and release scripts | `uv run pytest` | 0 | 2 | 0 |
| [`fastapi/full-stack-fastapi-template`](https://github.com/fastapi/full-stack-fastapi-template), `backend/` | `4d3d5e92c1ea6b3fa0fab02c41124844ec45bca8` | application package with FastAPI routes, SQLModel/Alembic persistence, and pytest | `pytest` | 5 | 10 | 8 |
| [`JoeanAmier/XHS-Downloader`](https://github.com/JoeanAmier/XHS-Downloader) | `cdc02d0da867473d0d020adf8d26a939794a1a51` | FastAPI application with uv metadata and production code but no supported test framework | none (blocked) | 25 | 0 | 10 |
| [`pallets/flask`](https://github.com/pallets/flask) | `36e4a824f340fdee7ed50937ba8e7f6bc7d17f81` | Flask framework repository with uv, pytest fixtures/parametrization, and branch coverage | `uv run pytest` | 4 | 16 | 2 |
| [`pytest-dev/pytest`](https://github.com/pytest-dev/pytest) | `264846d02f5c19ec481fc2f0ffb8892f8f60cd2e` | large `src/` package with a root `testing/` suite, fixtures, async/property-based cases, tox, and branch coverage | `tox` | 16 | 53 | 3 |
| [`django/django`](https://github.com/django/django) | `dca76b15c62a1118325b71678ce3235e2231198d` | large framework repository using unittest-derived Django cases, nested `tests.py` modules, and its own runner | `python tests/runtests.py` | 104 | 400 | 197 |

The first three audits are high confidence and report no blockers. The no-tests probe is intentionally low confidence and reports both "No supported Python test framework detected" and "No runnable Python test command detected from project markers" instead of inventing a setup. These are static adapter audits, not claims that the repositories' own test suites pass at the pinned commits.

The Flask, pytest, and Django audits are also high confidence and blocker-free. They were added after promotion to pressure suite organization and framework semantics; no dependencies or repository code were executed.

## Problems Exposed And Fixed

The first probe pass found three deterministic false signals:

- `conftest.py` and helper modules under `tests/` were treated as production candidates because only `test_*.py` and `*_test.py` files were excluded; all Python files under recognized test directories are now excluded from product recommendations
- the presence of Hatchling as a build backend incorrectly selected `hatch test`; Hatch is now selected only when an explicit `[tool.hatch.envs...]` test environment is present
- repository scripts, documentation examples, build helpers, and nested test fixtures leaked into recommendations; source discovery now prefers a conventional `src/` root, then a package matching the declared project name, then a sole unambiguous top-level package

After hardening, `tox-uv` no longer recommends test fixtures or `meta/hatch_build.py`, `asyncer` no longer recommends documentation and release scripts, and the FastAPI template remains scoped to its declared `app` package.

## Import Evidence Hardening

The second probe pass added two evidence kinds without changing the shared artifact model:

- `python-module-import` uses `direct` strength when a test imports the exact package-qualified source module
- `python-package-reexport` uses `referenced` strength when an explicit package initializer re-exports a source binding that the test imports or accesses through the package
- imported bindings and namespace members record `called` or `asserted` usage only when the static test source proves it
- comments and string literals are masked before import and usage matching
- filename evidence remains naming-only, and duplicate source basenames require import proof or matching package/test directory ownership

This moves `tox-uv` from zero to three covered modules, `asyncer` from zero to one covered core module, and the FastAPI backend from five to nine covered modules. `asyncer/_compat.py` remains untested, while `_main.py` is linked through three explicit package re-export uses.

## Advanced Pytest And Framework Hardening

The third probe pass added bounded mainstream-suite semantics:

- exact source imports used inside consumed pytest fixtures emit indirect `python-pytest-fixture` evidence, including fixture-to-fixture dependencies and visible `viaUsage`
- pytest-asyncio, AnyIO-marked tests, parametrization, and Hypothesis are reported as explicit framework/convention signals without expanding generated cases
- Django views and wiring plus Flask routes/blueprints and wiring have framework-specific boundary signals
- tox and nox become verification commands only when their configuration proves a test environment/session
- coverage.py and branch configuration are setup signals only and never source-specific coverage proof
- root `test/`, `testing/`, and `tests/` layouts plus Django-style nested `tests.py` modules are recognized

Live validation found that inferring pytest from `test_*.py` filenames alone misclassified Django, so pytest now requires configuration or an actual pytest import/decorator. Django's checked-in `tests/runtests.py` is selected instead. The initial Django audit also exposed repeated per-source parsing; test imports, functions, and fixture definitions are now indexed once. The current richer 4,935-link evidence graph has a 3.786-second median across three pinned-checkout runs, down from more than two minutes before indexing.

On pytest itself, 53 source targets have matching evidence: direct imports dominate, with package re-exports, filename conventions, and three bounded fixture relationships also present. Flask exercises direct and package-re-export evidence; Django exercises direct and structural filename evidence across its large suite.

## Remaining Evidence Boundary

The remaining coverage counts are intentionally conservative:

- `tox-uv` exercises several internal modules indirectly through tox plugin registration and integration fixtures; that reachability is not inferred from importing the public plugin entrypoint
- the FastAPI route filename matches remain structural where tests reach routes by booting the application rather than importing route modules directly
- package-root inference does not yet resolve multiple declared packages, namespace packages, standalone modules, or arbitrary build-backend configuration
- fixture evidence does not execute fixture factories, resolve plugin-provided/dynamic fixtures, or infer runtime scope and teardown behavior
- Django and Flask application boot, middleware, database isolation, dependency overrides, and framework test-client reachability remain outside the static relationship claim

These gaps should stay visible rather than being upgraded from framework presence or application boot alone.

## Promotion Verdict

The bounded support gates are met: the adapter has deterministic fixtures and model-consistency locks for its changed heuristics, direct and explicit re-export evidence remains conservative, public probes cover small-package, `src/`, FastAPI, and no-tests-yet shapes, and the full local alpha gate passes. Python is therefore registered as `supported` within the limits in [Python Alpha Support](python-alpha-support.md).

## Post-Promotion Validation Pressure

1. Add bounded dependency evidence for source modules reached through directly imported application or plugin entrypoints.
2. Validate relative imports, namespace packages, and multiple declared packages without executing build metadata.
3. Keep framework application/test-client reachability separate from direct route/view-module evidence.
4. Add dedicated persistence, task-queue, and CLI semantics only when real-repository evidence justifies them.

Post-report hardening now covers literal setuptools/Poetry multi-package declarations, bounded setuptools namespace find roots, authoritative root pytest `testpaths`/`python_files` discovery, exact package-local relative imports, one-hop same-owner source dependency evidence, and route-specific FastAPI/Starlette, Flask, and Django client evidence without executing metadata or booting an application. Standardized measurements pass for Asyncer (13 ms median, 6 evidence links), the FastAPI template backend (15 ms, 19 links), and Django (2,129 ms, 4,935 links after immutable parsed test/support-file indexing), with stable normalized audit digests.
