import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditDetectedProjects } from "../src/core/project-auditor.js";

describe("project auditor", () => {
  it("audits supported detected projects and reports unsupported projects", () => {
    const result = auditDetectedProjects(path.resolve("examples/polyglot-workspace"));

    assert.equal(result.schemaVersion, "project-audits/v1");
    assert.deepEqual(result.summary, {
      projectCount: 3,
      auditedProjectCount: 3,
      skippedProjectCount: 0
    });
    assert.deepEqual(
      result.audits.map((entry) => ({
        projectId: entry.projectId,
        adapterId: entry.adapterId,
        schemaVersion: entry.audit.schemaVersion
      })),
      [
        {
          projectId: "apps/android",
          adapterId: "kotlin",
          schemaVersion: "audit/v1"
        },
        {
          projectId: "apps/web",
          adapterId: "javascript",
          schemaVersion: "audit/v1"
        },
        {
          projectId: "services/api",
          adapterId: "python",
          schemaVersion: "audit/v1"
        }
      ]
    );
    assert.deepEqual(result.skippedProjects, []);
  });

  it("audits a conventionally owned Gradle module graph once at the aggregate root", () => {
    const result = auditDetectedProjects(path.resolve("examples/kotlin-gradle-module-graph-junit"));

    assert.deepEqual(result.summary, {
      projectCount: 1,
      auditedProjectCount: 1,
      skippedProjectCount: 0
    });
    assert.equal(result.audits[0].projectId, ".");
    assert.equal(result.audits[0].adapterId, "kotlin");
    assert.deepEqual(result.audits[0].audit.untestedCandidates.map((target) => target.name), ["TokenFormatter"]);
    assert.deepEqual(result.audits[0].audit.coveredButRisky.map((target) => target.name), ["TokenParser"]);
  });

  it("preserves owning workspace package-manager commands in project audits", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-project-pnpm-workspace-"));
    const packageRoot = path.join(root, "packages", "checkout");
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(packageRoot, "test"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ private: true }));
    fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
    fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lock\n");
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ scripts: { test: "vitest run" }, devDependencies: { vitest: "latest" } })
    );
    fs.writeFileSync(path.join(packageRoot, "src", "checkout.ts"), "export function checkout(value) { return value; }\n");
    fs.writeFileSync(
      path.join(packageRoot, "test", "checkout.test.ts"),
      "import { test } from 'vitest';\nimport { checkout } from '../src/checkout';\ntest('checkout', () => checkout('ok'));\n"
    );

    const result = auditDetectedProjects(root);
    const checkout = result.audits.find((entry) => entry.projectId === "packages/checkout");

    assert.equal(result.summary.projectCount, 2);
    assert.deepEqual(checkout.audit.profile.packageManagers, ["pnpm"]);
    assert.equal(checkout.audit.profile.testCommand, "pnpm run test");
    assert.ok(checkout.audit.profile.setupSignals.includes("pnpm workspace"));
  });

  it("preserves explicitly inherited runner config and custom test locations in project audits", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-project-runner-config-"));
    const packageRoot = path.join(root, "packages", "checkout");
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(packageRoot, "quality"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ private: true, packageManager: "pnpm@10.0.0", workspaces: ["packages/*"] })
    );
    fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lock\n");
    fs.writeFileSync(
      path.join(root, "config", "vitest.shared.ts"),
      "export default { test: { include: ['quality/**/*.check.ts'] } };\n"
    );
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ scripts: { test: "vitest run --config ../../config/vitest.shared.ts" } })
    );
    fs.writeFileSync(
      path.join(packageRoot, "src", "checkout.ts"),
      "export function checkout(value) { if (!value) throw new Error('missing'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(packageRoot, "quality", "checkout.check.ts"),
      "import { checkout } from '../src/checkout';\ncheckout('ok');\n"
    );

    const result = auditDetectedProjects(root);
    const checkout = result.audits.find((entry) => entry.projectId === "packages/checkout");

    assert.equal(result.summary.projectCount, 2);
    assert.deepEqual(checkout.audit.profile.testFrameworks, ["vitest"]);
    assert.equal(checkout.audit.profile.testCommand, "pnpm run test");
    assert.deepEqual(checkout.audit.profile.existingTestLocations, ["custom test location"]);
    assert.ok(checkout.audit.profile.setupSignals.includes("vitest config (owning workspace)"));
    assert.deepEqual(checkout.audit.coveredButRisky.map((target) => target.path), ["src/checkout.ts"]);
  });

  it("preserves conditional JavaScript package-export ownership in project audits", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-project-conditional-exports-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "@example/dual-runtime",
        exports: {
          ".": {
            import: "./dist/esm-entry.mjs",
            require: "./dist/commonjs-entry.cjs"
          }
        },
        scripts: { test: "node --test" }
      })
    );
    fs.writeFileSync(
      path.join(root, "src", "esm-entry.mts"),
      "export function esmFeature(value) { if (!value) throw new Error('missing'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "src", "commonjs-entry.cts"),
      "export function commonjsFeature(value) { if (!value) throw new Error('missing'); return value; }\n"
    );
    fs.writeFileSync(
      path.join(root, "test", "import-branch.test.mts"),
      "import { esmFeature } from '@example/dual-runtime';\nesmFeature('esm');\n"
    );
    fs.writeFileSync(
      path.join(root, "test", "require-branch.test.cts"),
      "const { commonjsFeature } = require('@example/dual-runtime');\ncommonjsFeature('cjs');\n"
    );

    const result = auditDetectedProjects(root);

    assert.equal(result.summary.projectCount, 1);
    assert.deepEqual(
      result.audits[0].audit.coveredButRisky.map((target) => target.path),
      ["src/commonjs-entry.cts", "src/esm-entry.mts"]
    );
    assert.deepEqual(result.audits[0].audit.untestedCandidates, []);
  });

  it("preserves bounded browser route evidence in project audits", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-project-browser-route-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
    fs.mkdirSync(path.join(root, "cypress", "e2e"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { "test:e2e": "cypress run" }, devDependencies: { cypress: "latest" } })
    );
    fs.writeFileSync(path.join(root, "cypress.config.ts"), "export default {};\n");
    fs.writeFileSync(
      path.join(root, "src", "routes", "checkout.ts"),
      `router.get("/checkout", (request, response) => response.send(request.query));\n`
    );
    fs.writeFileSync(
      path.join(root, "cypress", "e2e", "checkout.cy.ts"),
      `describe("checkout", () => it("opens", () => cy.visit("/checkout")));\n`
    );

    const result = auditDetectedProjects(root);
    const audit = result.audits[0].audit;

    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [
      {
        testPath: "cypress/e2e/checkout.cy.ts",
        kind: "browser-route-match",
        strength: "indirect"
      }
    ]);
  });

  it("preserves Python package ownership and configured pytest discovery in project audits", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-project-python-discovery-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "alpha"), { recursive: true });
    fs.mkdirSync(path.join(root, "beta"), { recursive: true });
    fs.mkdirSync(path.join(root, "quality"), { recursive: true });
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
    fs.writeFileSync(
      path.join(root, "quality", "check_alpha.py"),
      "from alpha.parser import parse\n\ndef test_alpha():\n    assert parse('2') == 2\n"
    );

    const result = auditDetectedProjects(root);
    const audit = result.audits[0].audit;
    const auditedPaths = [...audit.recommended, ...audit.skipped].map((target) => target.path);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["alpha/parser.py"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["beta/parser.py"]);
    assert.ok(audit.profile.existingTestLocations.includes("configured pytest location"));
    assert.ok(!auditedPaths.includes("tools/release.py"));
  });

  it("preserves bounded Python relative-import evidence in project audits", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-project-python-relative-import-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src", "checkout", "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[project]
name = "checkout"
dependencies = ["pytest"]
`
    );
    fs.writeFileSync(path.join(root, "src", "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "src", "checkout", "tests", "__init__.py"), "");
    fs.writeFileSync(path.join(root, "src", "checkout", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "src", "checkout", "tests", "test_behavior.py"),
      "from ..parser import parse\n\ndef test_behavior():\n    assert parse('2') == 2\n"
    );

    const result = auditDetectedProjects(root);
    const audit = result.audits[0].audit;

    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/checkout/parser.py"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "src/checkout/tests/test_behavior.py",
      kind: "python-module-import",
      strength: "direct",
      usage: "asserted"
    }]);
  });

  it("preserves bounded Python source dependency evidence in project audits", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-project-python-source-dependency-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[project]
name = "checkout"
dependencies = ["pytest"]
`
    );
    fs.writeFileSync(path.join(root, "checkout", "__init__.py"), "");
    fs.writeFileSync(
      path.join(root, "checkout", "service.py"),
      "from .parser import parse\n\ndef calculate(value):\n    return parse(value)\n"
    );
    fs.writeFileSync(path.join(root, "checkout", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(root, "tests", "test_service_behavior.py"),
      "from checkout.service import calculate\n\ndef test_service_behavior():\n    assert calculate('2') == 2\n"
    );

    const result = auditDetectedProjects(root);
    const audit = result.audits[0].audit;
    const parser = audit.coveredButRisky.find((target) => target.path === "checkout/parser.py");

    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["checkout/parser.py", "checkout/service.py"]);
    assert.deepEqual(parser.existingTestEvidence, [{
      testPath: "tests/test_service_behavior.py",
      kind: "bounded-dependency",
      strength: "indirect",
      viaUsage: "asserted"
    }]);
  });

  it("passes project-relative changed paths into matching project adapters", () => {
    const result = auditDetectedProjects(path.resolve("examples/polyglot-workspace"), {
      changedPaths: [
        "apps/android/src/main/kotlin/CheckoutCalculator.kt",
        "apps/web/src/sessionClient.ts",
        "services/api/app.py"
      ]
    });

    assert.deepEqual(
      result.audits.map((entry) => ({
        projectId: entry.projectId,
        untested: entry.audit.untestedCandidates.map((target) => target.path)
      })),
      [
        {
          projectId: "apps/android",
          untested: ["src/main/kotlin/CheckoutCalculator.kt"]
        },
        {
          projectId: "apps/web",
          untested: ["src/sessionClient.ts"]
        },
        {
          projectId: "services/api",
          untested: ["app.py"]
        }
      ]
    );
  });

  it("can exclude project roots before auditing", () => {
    const result = auditDetectedProjects(path.resolve("examples/polyglot-workspace"), {
      excludeProjectRoots: ["apps/**"]
    });

    assert.deepEqual(result.summary, {
      projectCount: 1,
      auditedProjectCount: 1,
      skippedProjectCount: 0
    });
    assert.deepEqual(
      result.audits.map((entry) => entry.projectId),
      ["services/api"]
    );
  });

  it("normalizes absolute changed paths before project adapter dispatch", () => {
    const repoRoot = path.resolve("examples/polyglot-workspace");
    const result = auditDetectedProjects(repoRoot, {
      changedPaths: [path.join(repoRoot, "apps", "web", "src", "sessionClient.ts")]
    });

    assert.deepEqual(
      result.audits.map((entry) => ({
        projectId: entry.projectId,
        untested: entry.audit.untestedCandidates.map((target) => target.path)
      })),
      [
        {
          projectId: "apps/android",
          untested: []
        },
        {
          projectId: "apps/web",
          untested: ["src/sessionClient.ts"]
        },
        {
          projectId: "services/api",
          untested: []
        }
      ]
    );
  });

  it("normalizes current-directory changed paths before project adapter dispatch", () => {
    const result = auditDetectedProjects(path.resolve("examples/polyglot-workspace"), {
      changedPaths: ["./apps/web/src/sessionClient.ts"]
    });

    assert.deepEqual(
      result.audits.map((entry) => ({
        projectId: entry.projectId,
        untested: entry.audit.untestedCandidates.map((target) => target.path)
      })),
      [
        {
          projectId: "apps/android",
          untested: []
        },
        {
          projectId: "apps/web",
          untested: ["src/sessionClient.ts"]
        },
        {
          projectId: "services/api",
          untested: []
        }
      ]
    );
  });
});
