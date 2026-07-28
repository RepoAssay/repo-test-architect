import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditDetectedProjects } from "../src/core/project-auditor.js";

describe("project auditor", () => {
  it("audits a literal C# production/test pair once at the common root", () => {
    const result = auditDetectedProjects(path.resolve("examples/csharp-sdk-project-pair"));

    assert.deepEqual(result.summary, { projectCount: 1, auditedProjectCount: 1, skippedProjectCount: 0 });
    assert.equal(result.audits[0].projectId, ".");
    assert.equal(result.audits[0].adapterId, "csharp");
    assert.equal(result.audits[0].audit.profile.testCommand, "dotnet test tests/CheckoutRules.Tests/CheckoutRules.Tests.csproj");
    assert.deepEqual(result.audits[0].audit.profile.blockers, []);
  });

  it("audits one unique C# test edge without merging unrelated projects", () => {
    const result = auditDetectedProjects(path.resolve("examples/csharp-sdk-unique-pair"));

    assert.deepEqual(result.summary, { projectCount: 3, auditedProjectCount: 3, skippedProjectCount: 0 });
    const selectedPair = result.audits.find((entry) => entry.projectId === ".");
    assert.equal(selectedPair.adapterId, "csharp");
    assert.equal(selectedPair.audit.profile.testCommand, "dotnet test tests/Pricing.Tests/Pricing.Tests.csproj");
    assert.deepEqual(selectedPair.audit.profile.blockers, []);
    assert.deepEqual(selectedPair.audit.coveredButRisky.map((target) => target.path), ["src/Pricing/PriceCalculator.cs"]);
    assert.deepEqual(
      result.audits.filter((entry) => entry.projectId !== ".").map((entry) => [entry.projectId, entry.audit.profile.testCommand]),
      [
        ["benchmarks/Pricing.Benchmarks", undefined],
        ["src/Worker", undefined]
      ]
    );
  });

  it("audits Cargo workspace packages independently with exact package commands", () => {
    const result = auditDetectedProjects(path.resolve("examples/rust-cargo-workspace-basic"));

    assert.deepEqual(result.summary, {
      projectCount: 2,
      auditedProjectCount: 2,
      skippedProjectCount: 0
    });
    assert.deepEqual(result.audits.map((entry) => ({
      projectId: entry.projectId,
      adapterId: entry.adapterId,
      testCommand: entry.audit.profile.testCommand,
      blockers: entry.audit.profile.blockers,
      workspaceOwned: entry.audit.profile.setupSignals.includes("Cargo workspace member")
    })), [
      {
        projectId: "crates/pricing",
        adapterId: "rust",
        testCommand: "cargo test -p workspace-pricing",
        blockers: [],
        workspaceOwned: true
      },
      {
        projectId: "services/checkout",
        adapterId: "rust",
        testCommand: "cargo test -p workspace-checkout",
        blockers: [],
        workspaceOwned: true
      }
    ]);
  });

  it("passes one explicit Go build target into detected Go projects", () => {
    const result = auditDetectedProjects(path.resolve("examples/go-build-target-basic"), {
      goTarget: { goos: "darwin", goarch: "arm64", tags: ["integration"] }
    });

    assert.deepEqual(result.summary, { projectCount: 1, auditedProjectCount: 1, skippedProjectCount: 0 });
    assert.equal(result.audits[0].adapterId, "go");
    assert.equal(
      result.audits[0].audit.profile.testCommand,
      "GOOS=darwin GOARCH=arm64 go test -tags=integration ./..."
    );
    assert.deepEqual(result.audits[0].audit.coveredButRisky.map((target) => target.path), [
      "price_parser.go",
      "tax_service_darwin_arm64.go"
    ]);
  });

  it("audits go.work members independently with module-local commands", () => {
    const result = auditDetectedProjects(path.resolve("examples/go-workspace-basic"));

    assert.deepEqual(result.summary, {
      projectCount: 2,
      auditedProjectCount: 2,
      skippedProjectCount: 0
    });
    assert.deepEqual(result.audits.map((entry) => ({
      projectId: entry.projectId,
      adapterId: entry.adapterId,
      testCommand: entry.audit.profile.testCommand,
      blockers: entry.audit.profile.blockers,
      workspaceOwned: entry.audit.profile.setupSignals.includes("go.work module")
    })), [
      {
        projectId: "libraries/pricing",
        adapterId: "go",
        testCommand: "go test ./...",
        blockers: [],
        workspaceOwned: true
      },
      {
        projectId: "services/checkout",
        adapterId: "go",
        testCommand: "go test ./...",
        blockers: [],
        workspaceOwned: true
      }
    ]);
  });

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

  it("audits a complete literal nested Maven reactor once at the aggregate root", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-project-nested-maven-"));
    const coreRoot = path.join(root, "platform", "core");
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(coreRoot, "src", "main", "java"), { recursive: true });
    fs.mkdirSync(path.join(coreRoot, "src", "test", "java"), { recursive: true });
    fs.writeFileSync(path.join(root, "pom.xml"), "<project><groupId>com.example</groupId><artifactId>root</artifactId><modules><module>platform</module></modules></project>\n");
    fs.writeFileSync(path.join(root, "mvnw"), "#!/bin/sh\n");
    fs.writeFileSync(path.join(root, "platform", "pom.xml"), "<project><groupId>com.example</groupId><artifactId>platform</artifactId><modules><module>core</module></modules></project>\n");
    fs.writeFileSync(path.join(coreRoot, "pom.xml"), "<project><groupId>com.example</groupId><artifactId>core</artifactId><dependencies><dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId></dependency></dependencies></project>\n");
    fs.writeFileSync(path.join(coreRoot, "src", "main", "java", "TokenParser.java"), "class TokenParser { String parse(String value) { return value.trim(); } }\n");
    fs.writeFileSync(path.join(coreRoot, "src", "test", "java", "TokenParserTest.java"), "import org.junit.jupiter.api.Test; class TokenParserTest { @Test void parses() { new TokenParser().parse(\"x\"); } }\n");

    const result = auditDetectedProjects(root);
    const rootAudit = result.audits.find((entry) => entry.projectId === ".")?.audit;
    assert.deepEqual(result.summary, { projectCount: 1, auditedProjectCount: 1, skippedProjectCount: 0 });
    assert.equal(rootAudit.profile.testCommand, "./mvnw test");
    assert.deepEqual(rootAudit.profile.blockers, []);
    assert.deepEqual(rootAudit.coveredButRisky.map((target) => target.path), ["platform/core/src/main/java/TokenParser.java"]);
  });

  it("audits Gradle children separately from a computed aggregate boundary", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-project-incomplete-gradle-"));
    const coreRoot = path.join(root, "core");
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src", "main", "kotlin"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin"), { recursive: true });
    fs.mkdirSync(path.join(coreRoot, "src", "main", "kotlin"), { recursive: true });
    fs.mkdirSync(path.join(coreRoot, "src", "test", "kotlin"), { recursive: true });
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), 'include(":core", dynamicProject)\n');
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'plugins { kotlin("jvm") version "2.0.0" }\ndependencies { testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "gradlew"), "#!/bin/sh\n");
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "RootParser.kt"), "class RootParser { fun parse(value: String) = value.trim() }\n");
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "RootParserTest.kt"), "import kotlin.test.Test\nclass RootParserTest { @Test fun parses() { RootParser().parse(\"x\") } }\n");
    fs.writeFileSync(path.join(coreRoot, "build.gradle.kts"), 'plugins { kotlin("jvm") }\ndependencies { testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(coreRoot, "src", "main", "kotlin", "TokenParser.kt"), "class TokenParser { fun parse(value: String) = value.trim() }\n");
    fs.writeFileSync(path.join(coreRoot, "src", "test", "kotlin", "TokenParserTest.kt"), "import kotlin.test.Test\nclass TokenParserTest { @Test fun parses() { TokenParser().parse(\"x\") } }\n");

    const result = auditDetectedProjects(root);
    const rootAudit = result.audits.find((entry) => entry.projectId === ".")?.audit;
    const coreAudit = result.audits.find((entry) => entry.projectId === "core")?.audit;

    assert.deepEqual(result.summary, { projectCount: 2, auditedProjectCount: 2, skippedProjectCount: 0 });
    assert.equal(rootAudit.profile.testCommand, undefined);
    assert.ok(rootAudit.profile.blockers.includes("Gradle settings include declarations must use literal repository-contained project paths."));
    assert.equal(coreAudit.profile.testCommand, "gradle test");
    assert.deepEqual(coreAudit.coveredButRisky.map((target) => target.path), ["src/main/kotlin/TokenParser.kt"]);
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

  it("passes repository-owned pytest discovery into nested Python audits", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-project-python-inherited-discovery-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const projectRoot = path.join(root, "packages", "checkout");
    fs.mkdirSync(path.join(projectRoot, "checkout"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "quality"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pytest.ini"),
      `[pytest]
testpaths = packages/checkout/quality
python_files = check_*.py
`
    );
    fs.writeFileSync(
      path.join(projectRoot, "pyproject.toml"),
      `[project]
name = "checkout"
dependencies = ["pytest"]
`
    );
    fs.writeFileSync(path.join(projectRoot, "checkout", "__init__.py"), "");
    fs.writeFileSync(path.join(projectRoot, "checkout", "parser.py"), "def parse(value):\n    return int(value)\n");
    fs.writeFileSync(
      path.join(projectRoot, "quality", "check_parser.py"),
      "from checkout.parser import parse\n\ndef test_parse():\n    assert parse('2') == 2\n"
    );

    const result = auditDetectedProjects(root);
    const project = result.audits.find((entry) => entry.projectRoot === "packages/checkout");

    assert.ok(project);
    assert.equal(project.audit.profile.testCommand, "pytest");
    assert.ok(project.audit.profile.setupSignals.includes("inherited pytest config"));
    assert.deepEqual(project.audit.coveredButRisky.map((target) => target.path), ["checkout/parser.py"]);
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

  it("preserves bounded Python test-client route evidence in project audits", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-project-python-test-client-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "app", "routes"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pyproject.toml"),
      `[project]
name = "checkout-api"
dependencies = ["fastapi", "pytest"]
`
    );
    fs.writeFileSync(path.join(root, "app", "__init__.py"), "");
    fs.writeFileSync(
      path.join(root, "app", "main.py"),
      "from fastapi import FastAPI\nfrom .routes.checkout import router\n\napp = FastAPI()\napp.include_router(router)\n"
    );
    fs.writeFileSync(
      path.join(root, "app", "routes", "checkout.py"),
      "from fastapi import APIRouter\n\nrouter = APIRouter()\n\n@router.get('/checkout')\ndef checkout():\n    return {'ok': True}\n"
    );
    fs.writeFileSync(
      path.join(root, "tests", "test_api_behavior.py"),
      "from fastapi.testclient import TestClient\nfrom app.main import app\n\nclient = TestClient(app)\n\ndef test_api_behavior():\n    assert client.get('/checkout').status_code == 200\n"
    );

    const result = auditDetectedProjects(root);
    const audit = result.audits[0].audit;

    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["app/routes/checkout.py"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "tests/test_api_behavior.py",
      kind: "python-test-client-route",
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
