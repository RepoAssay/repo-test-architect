import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditPythonRepo } from "../src/adapters/python/audit.js";

const exampleRoot = path.resolve("examples/python-pytest-service");
const unittestRoot = path.resolve("examples/python-unittest-service");
const requirementsRoot = path.resolve("examples/python-requirements-pytest");
const packageLocalTestsRoot = path.resolve("examples/python-package-local-tests");
const setuptoolsRoot = path.resolve("examples/python-setuptools-pytest");
const uvRoot = path.resolve("examples/python-uv-pytest");
const poetryRoot = path.resolve("examples/python-poetry-pytest");
const noTestsRoot = path.resolve("examples/python-no-tests-yet");

describe("Python audit adapter", () => {
  it("detects pyproject, pytest, FastAPI, and existing test conventions", () => {
    const audit = auditPythonRepo(exampleRoot);

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.languages, ["python"]);
    assert.deepEqual(audit.profile.packageManagers, ["pyproject"]);
    assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
    assert.deepEqual(audit.profile.architectures, ["fastapi", "service-layer"]);
    assert.equal(audit.profile.testCommand, "pytest");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.existingTestLocations.includes("tests"));
    assert.ok(audit.profile.detectedConventions.includes("tests/test_*.py"));
    assert.ok(audit.profile.setupSignals.includes("pyproject"));
    assert.ok(audit.profile.setupSignals.includes("pytest dependency"));
    assert.ok(audit.profile.setupSignals.includes("fastapi dependency"));
  });

  it("separates routes, services, covered parsers, DTOs, and app wiring", () => {
    const audit = auditPythonRepo(exampleRoot);

    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["user_service:service:unit", "users:http-route:integration"]
    );
    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.name),
      ["parsers"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.name}:${target.kind}`),
      ["main:app-wiring", "models:dto"]
    );

    const route = audit.untestedCandidates.find((target) => target.name === "users");
    assert.deepEqual(route.signals, ["http-route", "status-handling"]);

    const service = audit.untestedCandidates.find((target) => target.name === "user_service");
    assert.ok(service.signals.includes("service-boundary"));
    assert.ok(service.signals.includes("async-or-concurrency"));
    assert.ok(service.signals.includes("external-boundary"));

    const parser = audit.coveredButRisky[0];
    assert.equal(parser.kind, "pure-logic");
    assert.deepEqual(parser.existingTestPaths, ["tests/test_parsers.py"]);
    assert.deepEqual(parser.existingTestEvidence, [{
      testPath: "tests/test_parsers.py",
      kind: "python-module-import",
      strength: "direct",
      usage: "asserted"
    }]);
    assert.ok(parser.signals.includes("matching-test"));
  });

  it("uses package-qualified imports without borrowing duplicate-basename coverage", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-import-owner-"));
    fs.mkdirSync(path.join(root, "src", "alpha"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "beta"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
    fs.writeFileSync(path.join(root, "src", "alpha", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(path.join(root, "src", "beta", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "tests", "test_parser.py"),
      `from alpha.parser import parse

"""
from beta.parser import parse
"""

def test_alpha_parser():
    assert parse("2") == 2
`
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/alpha/parser.py"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/beta/parser.py"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "tests/test_parser.py",
      kind: "python-module-import",
      strength: "direct",
      usage: "asserted"
    }]);
  });

  it("matches exact module imports when test and source filenames differ", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-import-name-"));
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "checkout", "price_parser.py"), "def parse_price(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "tests", "test_checkout_behavior.py"),
      `import checkout.price_parser as parser

def test_checkout_behavior():
    result = parser.parse_price("2")
    return result
`
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["checkout/price_parser.py"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "tests/test_checkout_behavior.py",
      kind: "python-module-import",
      strength: "direct",
      usage: "called"
    }]);
  });

  it("resolves exact relative imports inside the owning package", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-relative-import-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src", "checkout", "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
    fs.writeFileSync(path.join(root, "src", "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "src", "checkout", "tests", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "src", "checkout", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(path.join(root, "src", "checkout", "tax_parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "src", "checkout", "tests", "test_checkout_behavior.py"),
      `from ..parser import parse
from .. import tax_parser as taxes

def test_checkout_behavior():
    assert parse("2") == taxes.parse("2")
`
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.path),
      ["src/checkout/parser.py", "src/checkout/tax_parser.py"]
    );
    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.existingTestEvidence),
      [
        [{
          testPath: "src/checkout/tests/test_checkout_behavior.py",
          kind: "python-module-import",
          strength: "direct",
          usage: "asserted"
        }],
        [{
          testPath: "src/checkout/tests/test_checkout_behavior.py",
          kind: "python-module-import",
          strength: "direct",
          usage: "asserted"
        }]
      ]
    );
  });

  it("resolves relative imports used by consumed pytest fixtures", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-relative-fixture-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "checkout", "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "checkout", "tests", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "checkout", "price_parser.py"), "def parse_price(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "checkout", "tests", "conftest.py"),
      `import pytest
from ..price_parser import parse_price

@pytest.fixture
def parsed_price():
    return parse_price("2")
`
    );
    fs.writeFileSync(
      path.join(root, "checkout", "tests", "test_checkout_behavior.py"),
      `def test_checkout_behavior(parsed_price):
    assert parsed_price == 2
`
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["checkout/price_parser.py"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "checkout/tests/test_checkout_behavior.py",
      kind: "python-pytest-fixture",
      strength: "indirect",
      viaUsage: "asserted"
    }]);
  });

  it("keeps relative imports inside their exact source-layout owner", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-relative-owner-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src", "alpha", "tests"), { recursive: true });
    fs.mkdirSync(path.join(root, "vendor", "alpha"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[tool.poetry]
name = "duplicate-layout"
packages = [
  { include = "alpha", from = "src" },
  { include = "alpha", from = "vendor" },
]

[tool.poetry.group.dev.dependencies]
pytest = "^8.0"
`
    );
    fs.writeFileSync(path.join(root, "src", "alpha", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "src", "alpha", "tests", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "src", "alpha", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(path.join(root, "src", "alpha", "escape_parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(path.join(root, "vendor", "alpha", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "vendor", "alpha", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "src", "alpha", "tests", "test_behavior.py"),
      "from ..parser import parse\n\ndef test_behavior():\n    assert parse('2') == 2\n"
    );
    fs.writeFileSync(
      path.join(root, "src", "alpha", "tests", "test_escape.py"),
      "from ...alpha.escape_parser import parse\n\ndef test_escape():\n    assert parse('2') == 2\n"
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/alpha/parser.py"]);
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.path),
      ["src/alpha/escape_parser.py", "vendor/alpha/parser.py"]
    );
  });

  it("tracks one-hop package re-exports without claiming a direct module import", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-reexport-"));
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "from ._pricing import calculate as calculate\n");
    fs.writeFileSync(path.join(root, "checkout", "_pricing.py"), "def calculate(value):\n    return value if value > 0 else 0\n");
    fs.writeFileSync(
      path.join(root, "tests", "test_checkout_behavior.py"),
      `from checkout import calculate as checkout_total

def test_checkout_behavior():
    assert checkout_total(2) == 2
`
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["checkout/_pricing.py"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "tests/test_checkout_behavior.py",
      kind: "python-package-reexport",
      strength: "referenced",
      usage: "asserted"
    }]);
  });

  it("tracks source reachability through consumed pytest fixture dependencies", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-fixtures-"));
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "checkout", "price_parser.py"), "def parse_price(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "tests", "conftest.py"),
      `import pytest
from checkout.price_parser import parse_price

@pytest.fixture
def parsed_price():
    return parse_price("2")

@pytest.fixture
def checkout_client(parsed_price):
    return {"price": parsed_price}
`
    );
    fs.writeFileSync(
      path.join(root, "tests", "test_checkout.py"),
      `def test_checkout(checkout_client):
    assert checkout_client["price"] == 2
`
    );

    const audit = auditPythonRepo(root);

    assert.ok(audit.profile.detectedConventions.includes("pytest fixtures"));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["checkout/price_parser.py"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "tests/test_checkout.py",
      kind: "python-pytest-fixture",
      strength: "indirect",
      viaUsage: "asserted"
    }]);
  });

  it("detects async, parametrized, and Hypothesis pytest conventions", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-advanced-pytest-"));
    fs.mkdirSync(path.join(root, "rules"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[project]
name = "rules"
dependencies = ["pytest", "pytest-asyncio", "anyio", "hypothesis"]
`
    );
    fs.writeFileSync(path.join(root, "rules", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "rules", "validator.py"), "def validate(value):\n    return value > 0\n");
    fs.writeFileSync(
      path.join(root, "tests", "test_validator.py"),
      `import pytest
from hypothesis import given, strategies as st
from rules.validator import validate

@pytest.mark.asyncio
@pytest.mark.parametrize("value", [1, 2])
async def test_valid_values(value):
    assert validate(value)

@pytest.mark.anyio
async def test_anyio_value():
    assert validate(1)

@given(st.integers(min_value=1))
def test_property(value):
    assert validate(value)
`
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(audit.profile.testFrameworks, ["anyio", "hypothesis", "pytest", "pytest-asyncio"]);
    assert.ok(audit.profile.detectedConventions.includes("async tests"));
    assert.ok(audit.profile.detectedConventions.includes("pytest parametrization"));
    assert.ok(audit.profile.detectedConventions.includes("property-based tests"));
    assert.ok(audit.profile.setupSignals.includes("pytest async support"));
    assert.ok(audit.profile.setupSignals.includes("anyio test support"));
    assert.ok(audit.profile.setupSignals.includes("hypothesis dependency"));
  });

  it("detects Django view boundaries and tox test environments", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-django-tox-"));
    fs.mkdirSync(path.join(root, "shop"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "django\npytest\n");
    fs.writeFileSync(path.join(root, "tox.ini"), "[tox]\nenvlist = py\n[testenv]\ncommands = pytest\n");
    fs.writeFileSync(path.join(root, "shop", "__init__.py"), "");
    fs.writeFileSync(
      path.join(root, "shop", "views.py"),
      "from django.http import JsonResponse\n\ndef status(request):\n    return JsonResponse({'ok': True})\n"
    );
    fs.writeFileSync(path.join(root, "tests", "test_views.py"), "def test_placeholder():\n    assert True\n");

    const audit = auditPythonRepo(root);

    assert.ok(audit.profile.architectures.includes("django"));
    assert.equal(audit.profile.testCommand, "tox");
    assert.ok(audit.profile.setupSignals.includes("tox test environment"));
    const view = audit.coveredButRisky.find((target) => target.path === "shop/views.py");
    assert.equal(view.kind, "http-route");
    assert.ok(view.signals.includes("django-view"));
  });

  it("detects Django tests.py modules and manage.py test commands", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-django-manage-"));
    fs.mkdirSync(path.join(root, "shop"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "django\n");
    fs.writeFileSync(path.join(root, "manage.py"), "import os\nos.environ.setdefault('DJANGO_SETTINGS_MODULE', 'shop.settings')\n");
    fs.writeFileSync(path.join(root, "shop", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "shop", "views.py"), "from django.http import JsonResponse\n\ndef status(request):\n    return JsonResponse({'ok': True})\n");
    fs.writeFileSync(
      path.join(root, "shop", "tests.py"),
      "from django.test import SimpleTestCase\nfrom shop.views import status\n\nclass StatusTests(SimpleTestCase):\n    def test_status(self):\n        response = status(None)\n        self.assertEqual(response.status_code, 200)\n"
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(audit.profile.testFrameworks, ["unittest"]);
    assert.equal(audit.profile.testCommand, "python manage.py test");
    assert.ok(audit.profile.detectedConventions.includes("tests.py"));
    assert.ok(audit.profile.existingTestLocations.includes("package tests.py"));
    assert.deepEqual(audit.coveredButRisky[0].existingTestPaths, ["shop/tests.py"]);
  });

  it("detects Flask route boundaries, nox sessions, and branch coverage configuration", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-flask-nox-"));
    fs.mkdirSync(path.join(root, "webapp"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "pyproject.toml"), "[project]\nname = \"webapp\"\ndependencies = [\"flask\", \"pytest\"]\n");
    fs.writeFileSync(path.join(root, ".coveragerc"), "[run]\nbranch = true\n[report]\nfail_under = 85\n");
    fs.writeFileSync(
      path.join(root, "noxfile.py"),
      "import nox\n\n@nox.session\ndef tests(session):\n    session.run(\"pytest\", \"tests\")\n"
    );
    fs.writeFileSync(path.join(root, "webapp", "__init__.py"), "");
    fs.writeFileSync(
      path.join(root, "webapp", "routes.py"),
      "from flask import Blueprint, jsonify\n\nbp = Blueprint('api', __name__)\n\n@bp.get('/status')\ndef status():\n    return jsonify(ok=True)\n"
    );
    fs.writeFileSync(path.join(root, "tests", "test_routes.py"), "def test_placeholder():\n    assert True\n");

    const audit = auditPythonRepo(root);

    assert.ok(audit.profile.architectures.includes("flask"));
    assert.equal(audit.profile.testCommand, "nox -s tests");
    assert.ok(audit.profile.setupSignals.includes("nox test session"));
    assert.ok(audit.profile.setupSignals.includes("coverage config"));
    assert.ok(audit.profile.setupSignals.includes("branch coverage"));
    assert.ok(audit.profile.detectedConventions.includes("coverage configured"));
    assert.ok(audit.profile.detectedConventions.includes("branch coverage"));
    const route = audit.coveredButRisky.find((target) => target.path === "webapp/routes.py");
    assert.equal(route.kind, "http-route");
    assert.ok(route.signals.includes("flask-route"));
  });

  it("does not select tox or nox from dependencies and unrelated Python sessions alone", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-environment-guard-"));
    fs.mkdirSync(path.join(root, "rules"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
    fs.writeFileSync(path.join(root, "tox.ini"), "[tox]\nenvlist = py\n[testenv]\ndeps = pytest\ncommands = python -m compileall rules\n");
    fs.writeFileSync(path.join(root, "noxfile.py"), "import nox\n\n@nox.session\ndef build(session):\n    session.run(\"python\", \"scripts/build.py\")\n");
    fs.writeFileSync(path.join(root, "rules", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "rules", "validator.py"), "def validate(value):\n    return value > 0\n");
    fs.writeFileSync(path.join(root, "tests", "test_validator.py"), "from rules.validator import validate\n\ndef test_value():\n    assert validate(1)\n");

    const audit = auditPythonRepo(root);

    assert.equal(audit.profile.testCommand, "pytest");
    assert.ok(!audit.profile.setupSignals.includes("tox test environment"));
    assert.ok(!audit.profile.setupSignals.includes("nox test session"));
  });

  it("can limit candidates to changed source files while keeping repo profile", () => {
    const audit = auditPythonRepo(exampleRoot, {
      changedPaths: ["app/services/user_service.py"]
    });

    assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["user_service"]
    );
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
  });

  it("normalizes Windows-style changed source paths", () => {
    const audit = auditPythonRepo(exampleRoot, {
      changedPaths: ["app\\services\\user_service.py"]
    });

    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["user_service"]
    );
  });

  it("ignores changed test files for source target selection", () => {
    const audit = auditPythonRepo(exampleRoot, {
      changedPaths: ["tests/test_parsers.py"]
    });

    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
    assert.deepEqual(audit.recommended, []);
  });

  it("reports blockers while still finding candidates when no Python tests exist yet", () => {
    const audit = auditPythonRepo(noTestsRoot);

    assert.deepEqual(audit.profile.languages, ["python"]);
    assert.deepEqual(audit.profile.packageManagers, ["pyproject"]);
    assert.deepEqual(audit.profile.testFrameworks, []);
    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "low");
    assert.ok(audit.profile.blockers.includes("No supported Python test framework detected."));
    assert.ok(audit.profile.blockers.includes("No runnable Python test command detected from project markers."));
    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["billing_parser:pure-logic:unit", "payment_service:service:unit"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.name}:${target.kind}`),
      ["payment_response:dto"]
    );
  });

  it("detects unittest conventions and keeps covered parser evidence", () => {
    const audit = auditPythonRepo(unittestRoot);

    assert.deepEqual(audit.profile.packageManagers, ["pyproject"]);
    assert.deepEqual(audit.profile.testFrameworks, ["unittest"]);
    assert.equal(audit.profile.testCommand, "python -m unittest");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(audit.profile.detectedConventions.includes("*_test.py"));
    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.name}:${target.kind}:${target.existingTestPaths.join(",")}`),
      ["inventory_parser:pure-logic:tests/inventory_parser_test.py"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["inventory_service:service:unit"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.name}:${target.kind}`),
      ["inventory_response:dto"]
    );
  });

  it("detects requirements-based pytest projects", () => {
    const audit = auditPythonRepo(requirementsRoot);

    assert.deepEqual(audit.profile.packageManagers, ["pip"]);
    assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
    assert.equal(audit.profile.testCommand, "pytest");
    assert.equal(audit.profile.confidence, "medium");
    assert.ok(audit.profile.setupSignals.includes("requirements"));
    assert.ok(audit.profile.setupSignals.includes("pytest dependency"));
    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["shipping_client:service:unit", "shipping_mapper:pure-logic:unit"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.name}:${target.kind}`),
      ["shipping_response:dto"]
    );
  });

  it("detects package-local pytest conventions and matching tests", () => {
    const audit = auditPythonRepo(packageLocalTestsRoot);

    assert.deepEqual(audit.profile.packageManagers, ["pyproject"]);
    assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
    assert.equal(audit.profile.testCommand, "pytest");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(audit.profile.existingTestLocations.includes("package-local tests"));
    assert.ok(audit.profile.detectedConventions.includes("package-local tests/test_*.py"));
    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.name}:${target.kind}:${target.existingTestPaths.join(",")}`),
      ["calculator:pure-logic:src/checkout/tests/test_calculator.py"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["discount_service:service:unit"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.name}:${target.kind}`),
      ["checkout_response:dto"]
    );
  });

  it("detects setuptools pytest projects", () => {
    const audit = auditPythonRepo(setuptoolsRoot);

    assert.deepEqual(audit.profile.packageManagers, ["setuptools"]);
    assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
    assert.equal(audit.profile.testCommand, "pytest");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(audit.profile.existingTestLocations.includes("tests"));
    assert.ok(audit.profile.detectedConventions.includes("tests/test_*.py"));
    assert.ok(audit.profile.setupSignals.includes("pytest dependency"));
    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.name}:${target.kind}:${target.existingTestPaths.join(",")}`),
      ["order_validator:pure-logic:tests/test_order_validator.py"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["order_repository:service:unit"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.name}:${target.kind}`),
      ["order_response:dto"]
    );
  });

  it("prefers uv pytest commands when uv project markers exist", () => {
    const audit = auditPythonRepo(uvRoot);

    assert.deepEqual(audit.profile.packageManagers, ["pyproject", "uv"]);
    assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
    assert.equal(audit.profile.testCommand, "uv run pytest");
    assert.ok(audit.profile.setupSignals.includes("uv project"));
    assert.ok(audit.profile.setupSignals.includes("pytest dependency"));
    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.name}:${target.kind}:${target.existingTestPaths.join(",")}`),
      ["calculator:pure-logic:tests/test_calculator.py"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["payment_service:service:unit"]
    );
  });

  it("prefers Poetry pytest commands when Poetry project markers exist", () => {
    const audit = auditPythonRepo(poetryRoot);

    assert.deepEqual(audit.profile.packageManagers, ["poetry", "pyproject"]);
    assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
    assert.equal(audit.profile.testCommand, "poetry run pytest");
    assert.ok(audit.profile.setupSignals.includes("poetry project"));
    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.name}:${target.kind}:${target.existingTestPaths.join(",")}`),
      ["discounts:pure-logic:tests/test_discounts.py"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["order_service:service:unit"]
    );
  });

  it("prefers Hatch test commands when Hatch project markers exist", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-hatch-"));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[project]
name = "python-hatch-pytest"
dependencies = ["pytest"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.envs.default]
dependencies = ["pytest"]
`
    );
    fs.writeFileSync(
      path.join(root, "src", "rules.py"),
      `def is_valid(value):
    return value > 0
`
    );
    fs.writeFileSync(
      path.join(root, "tests", "test_rules.py"),
      `from src.rules import is_valid


def test_is_valid():
    assert is_valid(1)
`
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(audit.profile.packageManagers, ["hatch", "pyproject"]);
    assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
    assert.equal(audit.profile.testCommand, "hatch test");
    assert.ok(audit.profile.setupSignals.includes("hatch project"));
  });

  it("does not mistake a Hatchling build backend for a Hatch test environment", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-hatchling-"));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[project]
name = "python-hatchling-pytest"
dependencies = ["pytest"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
`
    );
    fs.writeFileSync(
      path.join(root, "src", "rules.py"),
      `def is_valid(value):
    return value > 0
`
    );
    fs.writeFileSync(
      path.join(root, "tests", "conftest.py"),
      `def pytest_configure(config):
    if config:
        return None
`
    );
    fs.writeFileSync(
      path.join(root, "tests", "helpers.py"),
      `def build_value(value):
    if value:
        return value
`
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(audit.profile.packageManagers, ["pyproject"]);
    assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
    assert.equal(audit.profile.testCommand, "pytest");
    assert.ok(!audit.profile.setupSignals.includes("hatch project"));
    assert.ok(![...audit.recommended, ...audit.skipped].some((target) => target.path.startsWith("tests/")));
  });

  it("keeps documentation and scripts outside an inferred declared package root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-package-root-"));
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "support"), { recursive: true });
    fs.mkdirSync(path.join(root, "docs_src"), { recursive: true });
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[project]
name = "checkout"
dependencies = ["pytest"]
`
    );
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "checkout", "price_parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(path.join(root, "support", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "support", "branching.py"), "def choose(value):\n    return value if value else None\n");
    fs.writeFileSync(path.join(root, "docs_src", "tutorial.py"), "def render(value):\n    return value if value else None\n");
    fs.writeFileSync(path.join(root, "scripts", "release.py"), "def release(value):\n    return value if value else None\n");

    const audit = auditPythonRepo(root);
    const auditedPaths = [...audit.recommended, ...audit.skipped].map((target) => target.path);

    assert.ok(auditedPaths.includes("checkout/price_parser.py"));
    assert.ok(!auditedPaths.includes("support/branching.py"));
    assert.ok(!auditedPaths.includes("docs_src/tutorial.py"));
    assert.ok(!auditedPaths.includes("scripts/release.py"));
  });

  it("prefers a conventional src root over repository tooling", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-src-root-"));
    fs.mkdirSync(path.join(root, "src", "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "meta"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
    fs.writeFileSync(path.join(root, "src", "checkout", "price_parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(path.join(root, "meta", "build.py"), "def build(value):\n    return value if value else None\n");

    const audit = auditPythonRepo(root);
    const auditedPaths = [...audit.recommended, ...audit.skipped].map((target) => target.path);

    assert.ok(auditedPaths.includes("src/checkout/price_parser.py"));
    assert.ok(!auditedPaths.includes("meta/build.py"));
  });

  it("keeps explicit multi-package ownership aligned with custom pytest discovery", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-multi-package-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "alpha"), { recursive: true });
    fs.mkdirSync(path.join(root, "beta"), { recursive: true });
    fs.mkdirSync(path.join(root, "quality"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.mkdirSync(path.join(root, "tools"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[project]
name = "multi-package"
dependencies = ["pytest"]

[tool.setuptools]
packages = ["alpha", "beta"]

[tool.pytest.ini_options]
testpaths = ["quality"]
python_files = ["check_*.py"]
`
    );
    fs.writeFileSync(path.join(root, "alpha", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "alpha", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(path.join(root, "beta", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "beta", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(path.join(root, "tools", "release.py"), "def release(value):\n    return value if value else None\n");
    fs.writeFileSync(path.join(root, "quality", "helpers.py"), "def build(value):\n    return value if value else None\n");
    fs.writeFileSync(
      path.join(root, "quality", "check_alpha.py"),
      "from alpha.parser import parse\n\ndef test_alpha():\n    assert parse('2') == 2\n"
    );
    fs.writeFileSync(
      path.join(root, "quality", "test_beta.py"),
      "from beta.parser import parse\n\ndef test_beta():\n    assert parse('2') == 2\n"
    );
    fs.writeFileSync(
      path.join(root, "tests", "check_beta.py"),
      "from beta.parser import parse\n\ndef test_beta():\n    assert parse('2') == 2\n"
    );

    const audit = auditPythonRepo(root);
    const auditedPaths = [...audit.recommended, ...audit.skipped].map((target) => target.path);

    assert.ok(audit.profile.existingTestLocations.includes("configured pytest location"));
    assert.ok(audit.profile.detectedConventions.includes("pytest testpaths"));
    assert.ok(audit.profile.detectedConventions.includes("pytest python_files"));
    assert.ok(audit.profile.setupSignals.includes("pytest config"));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["alpha/parser.py"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["beta/parser.py"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "quality/check_alpha.py",
      kind: "python-module-import",
      strength: "direct",
      usage: "asserted"
    }]);
    assert.ok(!auditedPaths.includes("quality/helpers.py"));
    assert.ok(!auditedPaths.includes("tools/release.py"));
  });

  it("uses bounded setuptools find roots for implicit namespace packages", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-namespace-find-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "lib", "acme", "payments"), { recursive: true });
    fs.mkdirSync(path.join(root, "lib", "other"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[project]
name = "acme-payments"
dependencies = ["pytest"]

[tool.setuptools.packages.find]
where = ["lib"]
include = ["acme*"]
`
    );
    fs.writeFileSync(
      path.join(root, "lib", "acme", "payments", "price_parser.py"),
      "def parse_price(value):\n    return int(value)\n"
    );
    fs.writeFileSync(
      path.join(root, "lib", "other", "branching.py"),
      "def choose(value):\n    return value if value else None\n"
    );
    fs.writeFileSync(
      path.join(root, "tests", "test_payment_behavior.py"),
      "from acme.payments.price_parser import parse_price\n\ndef test_payment():\n    assert parse_price('2') == 2\n"
    );

    const audit = auditPythonRepo(root);
    const auditedPaths = [...audit.recommended, ...audit.skipped].map((target) => target.path);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["lib/acme/payments/price_parser.py"]);
    assert.ok(!auditedPaths.includes("lib/other/branching.py"));
  });

  it("resolves relative imports inside a declared implicit namespace owner", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-relative-namespace-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "lib", "acme", "payments", "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[project]
name = "acme-payments"
dependencies = ["pytest"]

[tool.setuptools.packages.find]
where = ["lib"]
include = ["acme*"]
`
    );
    fs.writeFileSync(
      path.join(root, "lib", "acme", "payments", "price_parser.py"),
      "def parse_price(value):\n    return int(value)\n"
    );
    fs.writeFileSync(
      path.join(root, "lib", "acme", "payments", "tests", "test_behavior.py"),
      "from ..price_parser import parse_price\n\ndef test_behavior():\n    assert parse_price('2') == 2\n"
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.path),
      ["lib/acme/payments/price_parser.py"]
    );
  });

  it("uses literal Poetry package entries across declared source bases", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-poetry-packages-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "lib", "plugins"), { recursive: true });
    fs.mkdirSync(path.join(root, "support"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[tool.poetry]
name = "checkout-suite"
packages = [
  { include = "checkout" },
  { include = "plugins", from = "lib" },
]

[tool.poetry.group.dev.dependencies]
pytest = "^8.0"
`
    );
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "checkout", "price_parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(path.join(root, "lib", "plugins", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "lib", "plugins", "rule_parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(path.join(root, "support", "branching.py"), "def choose(value):\n    return value if value else None\n");
    fs.writeFileSync(
      path.join(root, "tests", "test_packages.py"),
      `from checkout.price_parser import parse as parse_price
from plugins.rule_parser import parse as parse_rule

def test_packages():
    assert parse_price("2") == parse_rule("2")
`
    );

    const audit = auditPythonRepo(root);
    const auditedPaths = [...audit.recommended, ...audit.skipped].map((target) => target.path);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.path),
      ["checkout/price_parser.py", "lib/plugins/rule_parser.py"]
    );
    assert.ok(!auditedPaths.includes("support/branching.py"));
  });

  it("honors pytest config precedence for custom testpaths and python_files", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-pytest-precedence-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "legacy"), { recursive: true });
    fs.mkdirSync(path.join(root, "verification"), { recursive: true });
    fs.writeFileSync(path.join(root, "pyproject.toml"), "[project]\nname = \"checkout\"\ndependencies = [\"pytest\"]\n");
    fs.writeFileSync(path.join(root, "pytest.ini"), "[pytest]\ntestpaths = legacy\npython_files = check_*.py\n");
    fs.writeFileSync(
      path.join(root, "pytest.toml"),
      "[pytest]\ntestpaths = [\"verification\"]\npython_files = [\"verify_*.py\"]\n"
    );
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "checkout", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "legacy", "check_parser.py"),
      "from checkout.parser import parse\n\ndef test_parse():\n    assert parse('2') == 2\n"
    );
    fs.writeFileSync(
      path.join(root, "verification", "verify_parser.py"),
      "from checkout.parser import parse\n\ndef test_parse():\n    assert parse('2') == 2\n"
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(audit.coveredButRisky[0].existingTestPaths, ["verification/verify_parser.py"]);
  });

  it("does not broaden invalid hidden pytest discovery outside the audit root", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-invalid-pytest-discovery-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
    fs.writeFileSync(path.join(root, ".pytest.ini"), "[pytest]\ntestpaths = ../outside\npython_files = [invalid].py\n");
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "checkout", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "tests", "test_parser.py"),
      "from checkout.parser import parse\n\ndef test_parse():\n    assert parse('2') == 2\n"
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["checkout/parser.py"]);
    assert.deepEqual(audit.coveredButRisky, []);
    assert.ok(audit.profile.setupSignals.includes("pytest config"));
  });

  for (const [configName, configText] of [
    ["pytest.ini", "[pytest]\ntestpaths = tests\n"],
    [".pytest.ini", "[pytest]\ntestpaths = tests\n"],
    ["pytest.toml", "[pytest]\ntestpaths = [\"tests\"]\n"],
    [".pytest.toml", "[pytest]\ntestpaths = [\"tests\"]\n"]
  ]) {
    it(`detects pytest from ${configName}`, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-pytest-config-"));
      fs.mkdirSync(path.join(root, "src"), { recursive: true });
      fs.writeFileSync(path.join(root, configName), configText);
      fs.writeFileSync(
        path.join(root, "src", "price_parser.py"),
        `def parse_price(value):
    return int(value)
`
      );

      const audit = auditPythonRepo(root);

      assert.deepEqual(audit.profile.testFrameworks, ["pytest"]);
      assert.equal(audit.profile.testCommand, "pytest");
      assert.ok(audit.profile.setupSignals.includes("pytest config"));
      assert.deepEqual(audit.profile.blockers, []);
    });
  }
});
