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
  it("reports five development-only phases without changing the audit artifact", () => {
    const timings = [];
    const baseline = auditPythonRepo(exampleRoot);
    const profiled = auditPythonRepo(exampleRoot, {
      onPhaseTiming: (timing) => timings.push(timing)
    });

    assert.deepEqual(profiled, baseline);
    assert.deepEqual(timings.map(({ adapterId, phase }) => `${adapterId}:${phase}`), [
      "python:traversal-and-text-read",
      "python:project-and-build-ownership",
      "python:source-discovery-and-index",
      "python:test-parsing-and-index",
      "python:evidence-classification-and-artifact"
    ]);
    assert.ok(timings.every(({ durationMs }) => Number.isFinite(durationMs) && durationMs >= 0));
    assert.equal(Object.hasOwn(profiled, "auditPhaseTimings"), false);
  });

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

  it("credits one statically used same-owner source dependency", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-source-dependency-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "from .public import public as public\n");
    fs.writeFileSync(
      path.join(root, "checkout", "public.py"),
      `from __future__ import annotations
from typing import TYPE_CHECKING
from .service import calculate as calculate_service
from .unused import unused

if TYPE_CHECKING:
    from .typed import Typed

def public(value: Typed):
    if value:
        return calculate_service(value)
    return 0
`
    );
    fs.writeFileSync(
      path.join(root, "checkout", "service.py"),
      `from .deep import deep

def calculate(value):
    if value:
        return deep(value)
    return 0
`
    );
    fs.writeFileSync(path.join(root, "checkout", "deep.py"), "def deep(value):\n    if value:\n        return int(value)\n    return 0\n");
    fs.writeFileSync(path.join(root, "checkout", "unused.py"), "def unused(value):\n    if value:\n        return int(value)\n    return 0\n");
    fs.writeFileSync(path.join(root, "checkout", "typed.py"), "class Typed:\n    def valid(self, value):\n        return bool(value) if value else False\n");
    fs.writeFileSync(
      path.join(root, "tests", "test_public_behavior.py"),
      "from checkout import public\n\ndef test_public_behavior():\n    assert public('2') == 2\n"
    );

    const audit = auditPythonRepo(root);
    const service = audit.coveredButRisky.find((target) => target.path === "checkout/service.py");

    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.path),
      ["checkout/public.py", "checkout/service.py"]
    );
    assert.deepEqual(service.existingTestEvidence, [{
      testPath: "tests/test_public_behavior.py",
      kind: "bounded-dependency",
      strength: "indirect",
      viaUsage: "asserted"
    }]);
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.path),
      ["checkout/deep.py", "checkout/typed.py", "checkout/unused.py"]
    );
  });

  it("propagates one source edge from a consumed pytest fixture", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-fixture-dependency-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(
      path.join(root, "checkout", "service.py"),
      "from .parser import parse\n\ndef calculate(value):\n    return parse(value)\n"
    );
    fs.writeFileSync(path.join(root, "checkout", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "tests", "conftest.py"),
      `import pytest
from checkout.service import calculate

@pytest.fixture
def calculated():
    return calculate("2")
`
    );
    fs.writeFileSync(
      path.join(root, "tests", "test_checkout.py"),
      "def test_checkout(calculated):\n    assert calculated == 2\n"
    );

    const audit = auditPythonRepo(root);
    const parser = audit.coveredButRisky.find((target) => target.path === "checkout/parser.py");

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["checkout/parser.py", "checkout/service.py"]);
    assert.deepEqual(parser.existingTestEvidence, [{
      testPath: "tests/test_checkout.py",
      kind: "bounded-dependency",
      strength: "indirect",
      viaUsage: "asserted"
    }]);
  });

  it("keeps source dependencies cycle-safe and inside the exact layout entry", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-source-owner-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src", "alpha"), { recursive: true });
    fs.mkdirSync(path.join(root, "vendor", "alpha"), { recursive: true });
    fs.mkdirSync(path.join(root, "beta"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[tool.poetry]
name = "source-owners"
packages = [
  { include = "alpha", from = "src" },
  { include = "alpha", from = "vendor" },
  { include = "beta" },
]

[tool.poetry.group.dev.dependencies]
pytest = "^8.0"
`
    );
    fs.writeFileSync(path.join(root, "src", "alpha", "__init__.py"), "");
    fs.writeFileSync(
      path.join(root, "src", "alpha", "entry.py"),
      `import alpha.helper as helper
from beta.parser import parse as beta_parse

def run(value):
    if value:
        return helper.handle(value) + beta_parse(value)
    return 0
`
    );
    fs.writeFileSync(
      path.join(root, "src", "alpha", "helper.py"),
      "import alpha.entry as entry\n\ndef handle(value):\n    return int(value) if entry else 0\n"
    );
    fs.writeFileSync(path.join(root, "vendor", "alpha", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "vendor", "alpha", "helper.py"), "def handle(value):\n    if value:\n        return int(value)\n    return 0\n");
    fs.writeFileSync(path.join(root, "beta", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "beta", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "tests", "test_entry_behavior.py"),
      "from alpha.entry import run\n\ndef test_entry_behavior():\n    assert run('2') == 4\n"
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.path),
      ["src/alpha/entry.py", "src/alpha/helper.py"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.path),
      ["beta/parser.py", "vendor/alpha/helper.py"]
    );
  });

  it("does not propagate from an imported but unused test entrypoint", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-unused-entrypoint-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(
      path.join(root, "checkout", "entry.py"),
      "from .helper import handle\n\ndef run(value):\n    if value:\n        return handle(value)\n    return 0\n"
    );
    fs.writeFileSync(path.join(root, "checkout", "helper.py"), "def handle(value):\n    if value:\n        return int(value)\n    return 0\n");
    fs.writeFileSync(
      path.join(root, "tests", "test_behavior.py"),
      "from checkout.entry import run\n\ndef test_behavior():\n    assert True\n"
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["checkout/entry.py"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["checkout/helper.py"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "tests/test_behavior.py",
      kind: "python-module-import",
      strength: "direct"
    }]);
  });

  it("matches a FastAPI TestClient request through exact app and router wiring", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-fastapi-client-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "app", "routes"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "fastapi\npytest\n");
    fs.writeFileSync(path.join(root, "app", "__init__.py"), "");
    fs.writeFileSync(
      path.join(root, "app", "main.py"),
      `from fastapi import FastAPI
from app.routes.users import router as users_router

app = FastAPI()
app.include_router(users_router, prefix="/v1")
`
    );
    fs.writeFileSync(
      path.join(root, "app", "routes", "users.py"),
      `from fastapi import APIRouter

router = APIRouter(prefix="/users")

@router.get("/{user_id}")
def get_user(user_id):
    if not user_id:
        return None
    return {"id": user_id}

@router.post("/{user_id}")
def update_user(user_id):
    if not user_id:
        return None
    return {"id": user_id}
`
    );
    fs.writeFileSync(
      path.join(root, "tests", "test_users.py"),
      `from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_user():
    response = client.get("/v1/users/user-1?expanded=true")
    assert response.status_code == 200
`
    );

    const audit = auditPythonRepo(root);
    const route = audit.coveredButRisky.find((target) => target.path === "app/routes/users.py");

    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(route.existingTestEvidence, [{
      testPath: "tests/test_users.py",
      kind: "python-test-client-route",
      strength: "indirect",
      viaUsage: "asserted"
    }]);
  });

  it("preserves physical lines when masking continued strings in route functions", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-continued-string-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "app", "routes"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "fastapi\npytest\n");
    fs.writeFileSync(path.join(root, "app", "__init__.py"), "");
    fs.writeFileSync(
      path.join(root, "app", "main.py"),
      `from fastapi import FastAPI
from app.routes.status import router

app = FastAPI()
app.include_router(router)
`
    );
    fs.writeFileSync(
      path.join(root, "app", "routes", "status.py"),
      `from fastapi import APIRouter

router = APIRouter()

@router.get("/status")
def status():
    label = "ready\\
now"
    return {"label": label}
`
    );
    fs.writeFileSync(
      path.join(root, "tests", "test_status.py"),
      `from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_status():
    response = client.get("/status")
    assert response.status_code == 200
`
    );

    const audit = auditPythonRepo(root);
    const route = audit.coveredButRisky.find((target) => target.path === "app/routes/status.py");

    assert.deepEqual(route.existingTestEvidence, [{
      testPath: "tests/test_status.py",
      kind: "python-test-client-route",
      strength: "indirect",
      viaUsage: "asserted"
    }]);
  });

  it("matches a consumed Flask client fixture through a literal application factory", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-flask-client-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "webapp"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "flask\npytest\n");
    fs.writeFileSync(
      path.join(root, "webapp", "__init__.py"),
      `from flask import Flask
from .routes import bp

def create_app():
    app = Flask(__name__)
    app.register_blueprint(bp, url_prefix="/api")
    return app
`
    );
    fs.writeFileSync(
      path.join(root, "webapp", "routes.py"),
      `from flask import Blueprint, jsonify

bp = Blueprint("orders", __name__, url_prefix="/v1/orders")

@bp.route("/<int:order_id>", methods=["POST"])
def update_order(order_id):
    if not order_id:
        return jsonify(error="missing"), 400
    return jsonify(id=order_id)
`
    );
    fs.writeFileSync(
      path.join(root, "tests", "conftest.py"),
      `import pytest
from webapp import create_app

@pytest.fixture
def client():
    return create_app().test_client()
`
    );
    fs.writeFileSync(
      path.join(root, "tests", "test_orders.py"),
      `def test_update_order(client):
    response = client.post("/api/v1/orders/7")
    assert response.status_code == 200
`
    );

    const audit = auditPythonRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["webapp/routes.py"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "tests/test_orders.py",
      kind: "python-test-client-route",
      strength: "indirect",
      viaUsage: "asserted"
    }]);
  });

  it("reuses lexical test-support facts across fixture and framework-client evidence", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-parsed-facts-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "app", "routes"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "fastapi\npytest\n");
    fs.writeFileSync(path.join(root, "app", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "app", "routes", "__init__.py"), "");
    fs.writeFileSync(
      path.join(root, "app", "main.py"),
      "from fastapi import FastAPI\nfrom .routes.items import router\n\napp = FastAPI()\napp.include_router(router)\n"
    );
    fs.writeFileSync(
      path.join(root, "app", "routes", "items.py"),
      "from fastapi import APIRouter\n\nrouter = APIRouter()\n\n@router.get('/items')\ndef list_items(limit=10):\n    if limit < 1:\n        return {'items': []}\n    return {'items': ['item']}\n"
    );
    fs.writeFileSync(path.join(root, "app", "service.py"), "def load_items():\n    return ['item']\n");
    fs.writeFileSync(path.join(root, "app", "decoy.py"), "def decoy(value):\n    if value:\n        return 'untested'\n    return 'still untested'\n");
    fs.writeFileSync(
      path.join(root, "tests", "conftest.py"),
      `import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.service import load_items

IGNORED_EXAMPLE = """
from app.decoy import decoy

@pytest.fixture
def phantom_client():
    return TestClient(app)
"""

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def items():
    return load_items()
`
    );
    fs.writeFileSync(
      path.join(root, "tests", "test_cached_consumers.py"),
      `def test_items(client, items):
    response = client.get("/items")
    assert response.status_code == 200
    assert items == ["item"]
`
    );

    const audit = auditPythonRepo(root);
    const route = audit.coveredButRisky.find((target) => target.path === "app/routes/items.py");
    const service = audit.coveredButRisky.find((target) => target.path === "app/service.py");

    assert.ok(route, JSON.stringify(audit, null, 2));
    assert.ok(service, JSON.stringify(audit, null, 2));
    assert.deepEqual(route.existingTestEvidence, [{
      testPath: "tests/test_cached_consumers.py",
      kind: "python-test-client-route",
      strength: "indirect",
      viaUsage: "asserted"
    }]);
    assert.deepEqual(service.existingTestEvidence, [{
      testPath: "tests/test_cached_consumers.py",
      kind: "python-pytest-fixture",
      strength: "indirect",
      viaUsage: "asserted"
    }]);
    assert.ok(audit.untestedCandidates.some((target) => target.path === "app/decoy.py"));
  });

  it("matches Django TestCase client requests through the configured root URLconf", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-django-client-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "shop"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "django\n");
    fs.writeFileSync(path.join(root, "manage.py"), "import os\nos.environ.setdefault('DJANGO_SETTINGS_MODULE', 'shop.settings')\n");
    fs.writeFileSync(path.join(root, "shop", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "shop", "settings.py"), "ROOT_URLCONF = \"shop.urls\"\n");
    fs.writeFileSync(
      path.join(root, "shop", "urls.py"),
      `from django.urls import path
from .views import order_status

urlpatterns = [
    path("orders/<int:order_id>/", order_status),
]
`
    );
    fs.writeFileSync(
      path.join(root, "shop", "views.py"),
      `from django.http import JsonResponse

def order_status(request, order_id):
    if not order_id:
        return JsonResponse({"error": "missing"}, status=400)
    return JsonResponse({"id": order_id})
`
    );
    fs.writeFileSync(
      path.join(root, "tests", "test_orders.py"),
      `from django.test import TestCase

class OrderTests(TestCase):
    def test_order_status(self):
        response = self.client.get("/orders/7/")
        self.assertEqual(response.status_code, 200)
`
    );

    const audit = auditPythonRepo(root);
    const view = audit.coveredButRisky.find((target) => target.path === "shop/views.py");

    assert.deepEqual(view.existingTestEvidence, [{
      testPath: "tests/test_orders.py",
      kind: "python-test-client-route",
      strength: "indirect",
      viaUsage: "asserted"
    }]);
  });

  it("does not turn app boot, wrong methods, dynamic requests, or duplicate roots into route evidence", (t) => {
    const roots = [];
    t.after(() => roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

    const wrongMethodRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-client-near-miss-"));
    roots.push(wrongMethodRoot);
    fs.mkdirSync(path.join(wrongMethodRoot, "app", "routes"), { recursive: true });
    fs.mkdirSync(path.join(wrongMethodRoot, "tests"), { recursive: true });
    fs.writeFileSync(path.join(wrongMethodRoot, "requirements.txt"), "fastapi\npytest\n");
    fs.writeFileSync(path.join(wrongMethodRoot, "app", "__init__.py"), "");
    fs.writeFileSync(
      path.join(wrongMethodRoot, "app", "main.py"),
      "from fastapi import FastAPI\nfrom .routes.orders import router\n\napp = FastAPI()\napp.include_router(router)\n"
    );
    fs.writeFileSync(
      path.join(wrongMethodRoot, "app", "routes", "orders.py"),
      "from fastapi import APIRouter\n\nrouter = APIRouter()\n\n@router.post('/orders')\ndef create_order():\n    return {'ok': True}\n"
    );
    fs.writeFileSync(
      path.join(wrongMethodRoot, "tests", "conftest.py"),
      "import pytest\nfrom fastapi.testclient import TestClient\nfrom app.main import app\n\n@pytest.fixture\ndef client():\n    return TestClient(app)\n"
    );
    fs.writeFileSync(
      path.join(wrongMethodRoot, "tests", "test_client_mismatch.py"),
      `def test_orders(client):
    path = "/orders"
    response = client.get("/orders")
    client.post(path)
    assert response.status_code == 405
`
    );

    const wrongMethodAudit = auditPythonRepo(wrongMethodRoot);
    assert.deepEqual(wrongMethodAudit.coveredButRisky, []);
    assert.deepEqual(wrongMethodAudit.untestedCandidates.map((target) => target.path), ["app/routes/orders.py"]);

    const duplicateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-client-duplicate-root-"));
    roots.push(duplicateRoot);
    for (const owner of ["src", "vendor"]) {
      fs.mkdirSync(path.join(duplicateRoot, owner, "alpha", "routes"), { recursive: true });
      fs.writeFileSync(path.join(duplicateRoot, owner, "alpha", "__init__.py"), "");
      fs.writeFileSync(
        path.join(duplicateRoot, owner, "alpha", "app.py"),
        "from fastapi import FastAPI\nfrom .routes.status import router\n\napp = FastAPI()\napp.include_router(router)\n"
      );
      fs.writeFileSync(
        path.join(duplicateRoot, owner, "alpha", "routes", "status.py"),
        "from fastapi import APIRouter\n\nrouter = APIRouter()\n\n@router.get('/status')\ndef status():\n    return {'ok': True}\n"
      );
    }
    fs.mkdirSync(path.join(duplicateRoot, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(duplicateRoot, "pyproject.toml"),
      `[tool.poetry]
name = "duplicate-client-roots"
packages = [
  { include = "alpha", from = "src" },
  { include = "alpha", from = "vendor" },
]

[tool.poetry.group.dev.dependencies]
pytest = "^8.0"
fastapi = "^0.100"
`
    );
    fs.writeFileSync(
      path.join(duplicateRoot, "tests", "test_status.py"),
      "from fastapi.testclient import TestClient\nfrom alpha.app import app\n\nclient = TestClient(app)\n\ndef test_status():\n    assert client.get('/status').status_code == 200\n"
    );

    const duplicateAudit = auditPythonRepo(duplicateRoot);
    assert.deepEqual(duplicateAudit.coveredButRisky, []);
    assert.deepEqual(
      duplicateAudit.untestedCandidates.map((target) => target.path),
      ["src/alpha/routes/status.py", "vendor/alpha/routes/status.py"]
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
      `import nox

@nox.session
def build(session):
    session.run("python", "scripts/build.py")

@nox.session(name="tests")
def verification(session):
    session.run("pytest", "tests")
`
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
    fs.writeFileSync(
      path.join(root, "noxfile.py"),
      "import nox\n\n@nox.session\ndef build(session):\n    \"\"\"session.run(\"pytest\") is only an example.\"\"\"\n    # session.run(\"pytest\")\n    session.run(\"python\", \"scripts/build.py\")\n\ndef helper(session):\n    session.run(\"pytest\")\n"
    );
    fs.writeFileSync(path.join(root, "rules", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "rules", "validator.py"), "def validate(value):\n    return value > 0\n");
    fs.writeFileSync(path.join(root, "tests", "test_validator.py"), "from rules.validator import validate\n\ndef test_value():\n    assert validate(1)\n");

    const audit = auditPythonRepo(root);

    assert.equal(audit.profile.testCommand, "pytest");
    assert.ok(!audit.profile.setupSignals.includes("tox test environment"));
    assert.ok(!audit.profile.setupSignals.includes("nox test session"));
  });

  it("blocks competing tox and nox test commands", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-runner-ambiguity-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
    fs.writeFileSync(path.join(root, "tox.ini"), "[tox]\nenvlist = py\n[testenv]\ncommands = pytest\n");
    fs.writeFileSync(
      path.join(root, "noxfile.py"),
      "import nox\n\n@nox.session\ndef tests(session):\n    session.run(\"pytest\", \"tests\")\n"
    );
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "checkout", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "tests", "test_parser.py"),
      "from checkout.parser import parse\n\ndef test_parse():\n    assert parse('2') == 2\n"
    );

    const audit = auditPythonRepo(root);

    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "medium");
    assert.deepEqual(audit.profile.blockers, [
      "Multiple runnable Python test commands detected from project markers: tox, nox -s tests."
    ]);
    assert.ok(audit.profile.setupSignals.includes("tox test environment"));
    assert.ok(audit.profile.setupSignals.includes("nox test session"));
    assert.ok(!audit.profile.blockers.includes("No runnable Python test command detected from project markers."));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["checkout/parser.py"]);
  });

  it("blocks multiple proven nox test sessions", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-nox-ambiguity-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "requirements.txt"), "pytest\n");
    fs.writeFileSync(
      path.join(root, "noxfile.py"),
      `import nox
from nox import session

@session
def ignored_alias(current):
    current.run("pytest")

@nox.session
def unit(session):
    session.run("pytest", "tests/unit")

@nox.session
async def integration(session):
    session.run("python", "-m", "unittest", "tests.integration")
`
    );
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "checkout", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(path.join(root, "tests", "test_parser.py"), "def test_placeholder():\n    assert True\n");

    const audit = auditPythonRepo(root);

    assert.equal(audit.profile.testCommand, undefined);
    assert.deepEqual(audit.profile.blockers, [
      "Multiple runnable Python test commands detected from project markers: nox -s unit, nox -s integration."
    ]);
    assert.ok(audit.profile.setupSignals.includes("nox test session"));
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

  it("inherits bounded pytest discovery from the repository owner", (t) => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-inherited-pytest-"));
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
    const root = path.join(repositoryRoot, "packages", "checkout");
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "quality"), { recursive: true });
    fs.writeFileSync(
      path.join(repositoryRoot, "pytest.ini"),
      `[pytest]
testpaths = packages/checkout/quality
python_files = check_*.py
`
    );
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[project]
name = "checkout"
dependencies = ["pytest"]
`
    );
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "checkout", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "quality", "check_parser.py"),
      "from checkout.parser import parse\n\ndef test_parse():\n    assert parse('2') == 2\n"
    );

    const audit = auditPythonRepo(root, { repositoryRoot });

    assert.equal(audit.profile.testCommand, "pytest");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.setupSignals.includes("inherited pytest config"));
    assert.ok(audit.profile.existingTestLocations.includes("configured pytest location"));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["checkout/parser.py"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestPaths, ["quality/check_parser.py"]);
  });

  it("blocks inherited pytest commands that select another project", (t) => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-inherited-pytest-ambiguous-"));
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
    const root = path.join(repositoryRoot, "packages", "checkout");
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "quality"), { recursive: true });
    fs.mkdirSync(path.join(repositoryRoot, "shared-tests"), { recursive: true });
    fs.writeFileSync(
      path.join(repositoryRoot, "pytest.ini"),
      `[pytest]
testpaths =
    packages/checkout/quality
    shared-tests
python_files = check_*.py
`
    );
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[project]
name = "checkout"
dependencies = ["pytest"]
`
    );
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "checkout", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "quality", "check_parser.py"),
      "from checkout.parser import parse\n\ndef test_parse():\n    assert parse('2') == 2\n"
    );
    fs.writeFileSync(path.join(repositoryRoot, "shared-tests", "check_shared.py"), "def test_shared():\n    assert True\n");

    const audit = auditPythonRepo(root, { repositoryRoot });

    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "medium");
    assert.deepEqual(audit.profile.blockers, [
      "Inherited pytest testpaths cannot be bounded to the audited project."
    ]);
    assert.ok(!audit.profile.blockers.includes("No runnable Python test command detected from project markers."));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["checkout/parser.py"]);
  });

  it("keeps project-local pytest configuration ahead of an ancestor", (t) => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-local-pytest-precedence-"));
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
    const root = path.join(repositoryRoot, "packages", "checkout");
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "quality"), { recursive: true });
    fs.mkdirSync(path.join(repositoryRoot, "shared-tests"), { recursive: true });
    fs.writeFileSync(path.join(repositoryRoot, "pytest.ini"), "[pytest]\ntestpaths = shared-tests\n");
    fs.writeFileSync(
      path.join(root, "pytest.toml"),
      "[pytest]\ntestpaths = [\"quality\"]\npython_files = [\"check_*.py\"]\n"
    );
    fs.writeFileSync(path.join(root, "pyproject.toml"), "[project]\nname = \"checkout\"\ndependencies = [\"pytest\"]\n");
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "checkout", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "quality", "check_parser.py"),
      "from checkout.parser import parse\n\ndef test_parse():\n    assert parse('2') == 2\n"
    );

    const audit = auditPythonRepo(root, { repositoryRoot });

    assert.equal(audit.profile.testCommand, "pytest");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(!audit.profile.setupSignals.includes("inherited pytest config"));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["checkout/parser.py"]);
  });

  it("does not inherit pytest configuration above the repository owner", (t) => {
    const outerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-python-pytest-boundary-"));
    t.after(() => fs.rmSync(outerRoot, { recursive: true, force: true }));
    const repositoryRoot = path.join(outerRoot, "repository");
    const root = path.join(repositoryRoot, "packages", "checkout");
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "quality"), { recursive: true });
    fs.writeFileSync(
      path.join(outerRoot, "pytest.ini"),
      "[pytest]\ntestpaths = repository/packages/checkout/quality\npython_files = check_*.py\n"
    );
    fs.writeFileSync(path.join(root, "pyproject.toml"), "[project]\nname = \"checkout\"\ndependencies = [\"pytest\"]\n");
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "checkout", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "quality", "check_parser.py"),
      "from checkout.parser import parse\n\ndef test_parse():\n    assert parse('2') == 2\n"
    );

    const audit = auditPythonRepo(root, { repositoryRoot });

    assert.ok(!audit.profile.setupSignals.includes("inherited pytest config"));
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["checkout/parser.py"]);
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
