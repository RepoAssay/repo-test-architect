import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditGoRepo } from "../src/adapters/go/audit.js";

function createRepo(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-go-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return root;
}

describe("Go adapter", () => {
  it("audits the conventional standard-library fixture", () => {
    const audit = auditGoRepo(path.resolve("examples/go-testing-basic"));

    assert.deepEqual(audit.profile, {
      root: path.resolve("examples/go-testing-basic"),
      languages: ["go"],
      packageManagers: ["go-modules"],
      testFrameworks: ["go-testing"],
      architectures: ["go-module", "http-service"],
      testCommand: "go test ./...",
      detectedConventions: ["*_test.go", "TestXxx", "table-driven tests"],
      existingTestLocations: ["root _test.go"],
      setupSignals: ["go.mod", "module path", "standard testing package"],
      confidence: "high",
      blockers: []
    });
    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), [
      "payment_client.go",
      "price_parser.go",
      "internal/currency/validator.go",
      "price_normalizer.go"
    ]);
    assert.deepEqual(audit.skipped.map((target) => [target.path, target.kind]), [["payment.go", "dto"]]);
    assert.deepEqual(audit.coveredButRisky.find((target) => target.path === "price_parser.go").existingTestEvidence, [
      {
        testPath: "price_parser_test.go",
        kind: "go-symbol-reference",
        strength: "direct",
        usage: "called"
      },
      {
        testPath: "price_parser_test.go",
        kind: "filename-convention",
        strength: "naming"
      }
    ]);
    assert.deepEqual(audit.coveredButRisky.find((target) => target.path === "price_normalizer.go").existingTestEvidence, [
      {
        testPath: "price_parser_test.go",
        kind: "go-source-dependency",
        strength: "indirect",
        viaUsage: "called"
      }
    ]);
    assert.deepEqual(audit.coveredButRisky.find((target) => target.path === "internal/currency/validator.go").existingTestEvidence, [
      {
        testPath: "price_parser_test.go",
        kind: "go-source-dependency",
        strength: "indirect",
        viaUsage: "called"
      }
    ]);
  });

  it("selects explicit GOOS, GOARCH, tags, and filename-constrained files", () => {
    const audit = auditGoRepo(path.resolve("examples/go-build-target-basic"), {
      goTarget: { goos: "darwin", goarch: "arm64", tags: ["integration"] }
    });

    assert.equal(audit.profile.testCommand, "GOOS=darwin GOARCH=arm64 go test -tags=integration ./...");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.profile.architectures, ["go-module", "go-target-darwin-arm64"]);
    assert.deepEqual(audit.profile.detectedConventions, [
      "*_test.go",
      "TestXxx",
      "//go:build",
      "GOOS/GOARCH filename constraints"
    ]);
    assert.ok(audit.profile.setupSignals.includes("Go target darwin/arm64"));
    assert.ok(audit.profile.setupSignals.includes("Go build tags integration"));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), [
      "price_parser.go",
      "tax_service_darwin_arm64.go"
    ]);
    assert.deepEqual(audit.skipped.map((target) => [target.path, target.kind]), [
      ["tax_service_windows_amd64.go", "build-target-excluded"]
    ]);
    assert.ok(audit.coveredButRisky[1].signals.includes("build-target-selected"));
  });

  it("withholds target-specific files and commands without explicit target configuration", () => {
    const audit = auditGoRepo(path.resolve("examples/go-build-target-basic"));

    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "medium");
    assert.deepEqual(audit.profile.blockers, [
      "Go build constraints require explicit GOOS and GOARCH target configuration before audit ownership is complete."
    ]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["price_parser.go"]);
    assert.deepEqual(audit.skipped.map((target) => [target.path, target.kind]), [
      ["tax_service_darwin_arm64.go", "build-constrained"],
      ["tax_service_windows_amd64.go", "build-constrained"]
    ]);
  });

  it("evaluates boolean build expressions, custom tags, and target aliases", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/target\n",
      "service_linux_arm64.go": "//go:build linux && unix && (enterprise || premium) && !windows\n\npackage target\nfunc Run() {}\n",
      "service_linux_arm64_test.go": "//go:build linux && unix && enterprise\n\npackage target\nimport \"testing\"\nfunc TestRun(t *testing.T) { Run() }\n",
      "service_windows_amd64.go": "//go:build windows || premium\n\npackage target\nfunc Run() {}\n"
    });

    const audit = auditGoRepo(root, {
      goTarget: { goos: "android", goarch: "arm64", tags: ["enterprise", "enterprise"] }
    });

    assert.equal(audit.profile.testCommand, "GOOS=android GOARCH=arm64 go test -tags=enterprise ./...");
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["service_linux_arm64.go"]);
    assert.deepEqual(audit.skipped.map((target) => target.path), ["service_windows_amd64.go"]);
  });

  it("blocks legacy, malformed, and environment-dependent build expressions", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/target\n",
      "parser.go": "package target\nfunc Parse(value string) string { return value }\n",
      "parser_test.go": "package target\nimport \"testing\"\nfunc TestParse(t *testing.T) { _ = Parse(\"ok\") }\n",
      "legacy_linux.go": "// +build linux\n\npackage target\nfunc Legacy() {}\n",
      "cgo_linux.go": "//go:build cgo && linux\n\npackage target\nfunc Native() {}\n",
      "broken_linux.go": "//go:build linux && (amd64 ||\n\npackage target\nfunc Broken() {}\n"
    });

    const audit = auditGoRepo(root, {
      goTarget: { goos: "linux", goarch: "amd64", tags: [] }
    });

    assert.equal(audit.profile.testCommand, undefined);
    assert.ok(audit.profile.blockers.includes(
      "Go build constraints include syntax or environment-dependent tags outside the bounded target evaluator."
    ));
    assert.deepEqual(audit.skipped.map((target) => target.path), [
      "broken_linux.go",
      "cgo_linux.go",
      "legacy_linux.go"
    ]);
  });

  it("rejects invalid or environment-overriding target options", () => {
    assert.throws(
      () => auditGoRepo(path.resolve("examples/go-testing-basic"), {
        goTarget: { goos: "linux", goarch: "unknown", tags: [] }
      }),
      /Unsupported Go build target: linux\/unknown/
    );
    assert.throws(
      () => auditGoRepo(path.resolve("examples/go-testing-basic"), {
        goTarget: { goos: "linux", goarch: "amd64", tags: ["cgo"] }
      }),
      /cannot override environment-defined tag: cgo/
    );
  });

  it("keeps a declared go.work module as an independent command owner", () => {
    const audit = auditGoRepo(path.resolve("examples/go-workspace-basic/services/checkout"));

    assert.equal(audit.profile.testCommand, "go test ./...");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.profile.architectures, ["go-module", "go-workspace-module"]);
    assert.deepEqual(audit.profile.setupSignals, [
      "go.mod",
      "go.work (nearest workspace)",
      "module path",
      "go.work module",
      "standard testing package"
    ]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["checkout_service.go"]);
  });

  it("blocks command ownership for modules omitted by the nearest workspace", (t) => {
    const workspace = createRepo(t, {
      "go.work": "go 1.22\nuse ./listed\n",
      "listed/go.mod": "module example.com/listed\n",
      "unlisted/go.mod": "module example.com/unlisted\n",
      "unlisted/parser.go": "package unlisted\nfunc Parse(value string) string { return value }\n",
      "unlisted/parser_test.go": "package unlisted\nimport \"testing\"\nfunc TestParse(t *testing.T) { _ = Parse(\"ok\") }\n"
    });

    const audit = auditGoRepo(path.join(workspace, "unlisted"));

    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "medium");
    assert.deepEqual(audit.profile.blockers, [
      "The module is not declared by the nearest Go workspace, so command ownership is incomplete."
    ]);
    assert.ok(audit.profile.setupSignals.includes("go.work (nearest workspace)"));
    assert.ok(!audit.profile.setupSignals.includes("go.work module"));
  });

  it("blocks incomplete or escaping workspace module graphs", (t) => {
    const workspace = createRepo(t, {
      "go.work": "go 1.22\nuse (\n  `./module` // owned\n  ./missing\n  ../external\n)\n",
      "module/go.mod": "module example.com/module\n",
      "module/parser.go": "package module\nfunc Parse(value string) string { return value }\n",
      "module/parser_test.go": "package module\nimport \"testing\"\nfunc TestParse(t *testing.T) { _ = Parse(\"ok\") }\n"
    });

    const audit = auditGoRepo(path.join(workspace, "module"));

    assert.equal(audit.profile.testCommand, undefined);
    assert.deepEqual(audit.profile.blockers, [
      "Go workspace use directives must resolve to literal repository-contained modules before command ownership is complete."
    ]);
    assert.ok(audit.profile.setupSignals.includes("go.work module"));
  });

  it("accepts a quoted literal workspace member with an inline comment", (t) => {
    const workspace = createRepo(t, {
      "go.work": "go 1.22\nuse \"./module\" // exact member\n",
      "module/go.mod": "module example.com/module\n",
      "module/parser.go": "package module\nfunc Parse(value string) string { return value }\n",
      "module/parser_test.go": "package module\nimport \"testing\"\nfunc TestParse(t *testing.T) { _ = Parse(\"ok\") }\n"
    });

    const audit = auditGoRepo(path.join(workspace, "module"));

    assert.equal(audit.profile.testCommand, "go test ./...");
    assert.deepEqual(audit.profile.blockers, []);
  });

  it("blocks malformed workspace blocks and invalid quoted paths", (t) => {
    const workspace = createRepo(t, {
      "go.work": "go 1.22\nuse (\n  ./module\n  \"\\xZZ\"\n  malformed)\n",
      "module/go.mod": "module example.com/module\n",
      "module/parser.go": "package module\nfunc Parse(value string) string { return value }\n",
      "module/parser_test.go": "package module\nimport \"testing\"\nfunc TestParse(t *testing.T) { _ = Parse(\"ok\") }\n"
    });

    const audit = auditGoRepo(path.join(workspace, "module"));

    assert.equal(audit.profile.testCommand, undefined);
    assert.deepEqual(audit.profile.blockers, [
      "Go workspace use directives must resolve to literal repository-contained modules before command ownership is complete."
    ]);
  });

  it("keeps workspace-root audits aggregate-only", () => {
    const audit = auditGoRepo(path.resolve("examples/go-workspace-basic"));

    assert.equal(audit.profile.testCommand, undefined);
    assert.deepEqual(audit.profile.blockers, [
      "No root go.mod detected for the bounded Go module adapter.",
      "No runnable standard Go test detected.",
      "Go workspace roots must be audited through their declared module projects."
    ]);
    assert.deepEqual(audit.recommended, []);
  });

  it("requires a root module and a runnable standard test", (t) => {
    const root = createRepo(t, {
      "parser.go": "package sample\nfunc Parse(value string) string { return value }\n",
      "helper_test.go": "package sample\nfunc helper() {}\n"
    });

    const audit = auditGoRepo(root);

    assert.deepEqual(audit.profile.packageManagers, []);
    assert.deepEqual(audit.profile.testFrameworks, []);
    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "low");
    assert.deepEqual(audit.profile.blockers, [
      "No root go.mod detected for the bounded Go module adapter.",
      "No runnable standard Go test detected."
    ]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["parser.go"]);
  });

  it("uses unique same-package symbols without crediting test-local shadows", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/sample\n\ngo 1.22\n",
      "parser.go": "package sample\nfunc Parse(value string) string { return value }\n",
      "formatter.go": "package sample\nfunc Format(value string) string { return value }\n",
      "coverage_test.go": [
        "package sample",
        "import \"testing\"",
        "type testHarness struct{}",
        "func (testHarness) Parse() string { return \"method\" }",
        "func Format(value string) string { return \"shadow\" }",
        "func TestCoverage(t *testing.T) {",
        "  _ = Parse(\"ok\")",
        "  _ = Format(\"ok\")",
        "}",
        ""
      ].join("\n")
    });

    const audit = auditGoRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["parser.go"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["formatter.go"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "coverage_test.go",
      kind: "go-symbol-reference",
      strength: "direct",
      usage: "called"
    }]);
  });

  it("resolves receiver methods through unique explicitly typed local bindings", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/methods\n\ngo 1.22\n",
      "parser.go": "package methods\ntype Parser struct{}\nfunc (Parser) Transform(value string) string { return value }\n",
      "formatter.go": "package methods\ntype Formatter struct{}\nfunc (Formatter) Transform(value string) string { return value }\n",
      "validator.go": "package methods\ntype Validator struct{}\nfunc (*Validator) Validate(value string) bool { return value != \"\" }\n",
      "method_test.go": [
        "package methods",
        "import \"testing\"",
        "func TestMethods(t *testing.T) {",
        "  parser := Parser{}",
        "  if parser.Transform(\"ok\") != \"ok\" { t.Fatal() }",
        "  var validator *Validator = &Validator{}",
        "  if !validator.Validate(\"ok\") { t.Fatal() }",
        "}",
        ""
      ].join("\n")
    });

    const audit = auditGoRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["parser.go", "validator.go"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["formatter.go"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "method_test.go",
      kind: "go-symbol-reference",
      strength: "direct",
      usage: "called"
    }, {
      testPath: "method_test.go",
      kind: "go-symbol-reference",
      strength: "referenced"
    }]);
  });

  it("resolves an explicitly typed receiver through an exact external package alias", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/shop\n\ngo 1.22\n",
      "price/client.go": "package price\ntype Client struct{}\nfunc (Client) Fetch() int { return 42 }\n",
      "price/client_test.go": [
        "package price_test",
        "import (",
        "  \"testing\"",
        "  pricing \"example.com/shop/price\"",
        ")",
        "func TestFetch(t *testing.T) {",
        "  client := pricing.Client{}",
        "  if client.Fetch() != 42 { t.Fatal() }",
        "}",
        ""
      ].join("\n")
    });

    const audit = auditGoRepo(root);

    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [
      { testPath: "price/client_test.go", kind: "go-symbol-reference", strength: "direct", usage: "called" },
      { testPath: "price/client_test.go", kind: "go-symbol-reference", strength: "referenced" },
      { testPath: "price/client_test.go", kind: "filename-convention", strength: "naming" }
    ]);
  });

  it("resolves exact external-package dot imports without blank-import or local-shadow leakage", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/shop\n\ngo 1.22\n",
      "price/parser.go": "package price\nfunc Parse(value string) string { return value }\n",
      "price/client.go": "package price\ntype Client struct{}\nfunc (Client) Fetch() int { return 42 }\n",
      "price/shadow.go": "package price\nfunc Shadow() int { return 1 }\n",
      "price/blank.go": "package price\nfunc Blank() int { return 1 }\n",
      "price/hidden.go": "package price\nfunc hidden() int { return 1 }\n",
      "price/dot_test.go": [
        "package price_test",
        "import (",
        "  \"testing\"",
        "  . \"example.com/shop/price\"",
        ")",
        "func TestDotImport(t *testing.T) {",
        "  client := Client{}",
        "  if Parse(\"ok\") != \"ok\" || client.Fetch() != 42 { t.Fatal() }",
        "  hidden := func() int { return 2 }",
        "  _ = hidden()",
        "}",
        ""
      ].join("\n"),
      "price/local_test.go": [
        "package price_test",
        "import (",
        "  \"testing\"",
        "  . \"example.com/shop/price\"",
        ")",
        "func TestShadow(t *testing.T) {",
        "  Shadow := func() int { return 2 }",
        "  if Shadow() != 2 { t.Fatal() }",
        "}",
        ""
      ].join("\n"),
      "price/blank_test.go": [
        "package price_test",
        "import (",
        "  \"testing\"",
        "  _ \"example.com/shop/price\"",
        ")",
        "func TestBlank(t *testing.T) {",
        "  Blank := func() int { return 2 }",
        "  _ = Blank()",
        "}",
        ""
      ].join("\n")
    });

    const audit = auditGoRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["price/parser.go", "price/client.go"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), [
      "price/blank.go",
      "price/hidden.go",
      "price/shadow.go"
    ]);
    assert.deepEqual(audit.coveredButRisky[1].existingTestEvidence, [
      { testPath: "price/dot_test.go", kind: "go-symbol-reference", strength: "direct", usage: "called" },
      { testPath: "price/dot_test.go", kind: "go-symbol-reference", strength: "referenced" }
    ]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "price/dot_test.go",
      kind: "go-symbol-reference",
      strength: "direct",
      usage: "called"
    }]);
  });

  it("resolves receiver methods through exact concrete constructor result positions", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/constructors\n\ngo 1.22\n",
      "client.go": "package constructors\ntype Client struct{}\nfunc (*Client) Fetch() int { return 1 }\n",
      "validator.go": "package constructors\ntype Validator struct{}\nfunc (Validator) Validate() bool { return true }\n",
      "factory.go": [
        "package constructors",
        "func NewClient() *Client { return &Client{} }",
        "func NewValidator() (validator Validator, err error) { return Validator{}, nil }",
        ""
      ].join("\n"),
      "constructor_test.go": [
        "package constructors",
        "import \"testing\"",
        "func TestConstructors(t *testing.T) {",
        "  client := NewClient()",
        "  if client == nil { t.Fatal() }",
        "  if client.Fetch() != 1 { t.Fatal() }",
        "  validator, err := NewValidator()",
        "  if err != nil || !validator.Validate() { t.Fatal() }",
        "}",
        ""
      ].join("\n")
    });

    const audit = auditGoRepo(root);

    assert.deepEqual(audit.untestedCandidates, []);
    for (const path of ["client.go", "validator.go"]) {
      assert.ok(audit.coveredButRisky.find((target) => target.path === path).existingTestEvidence.some((entry) =>
        entry.testPath === "constructor_test.go" && entry.strength === "direct" && entry.usage === "called"
      ));
    }
    assert.ok(audit.coveredButRisky.find((target) => target.path === "factory.go").existingTestEvidence.some((entry) =>
      entry.testPath === "constructor_test.go" && entry.strength === "direct" && entry.usage === "called"
    ));
  });

  it("resolves constructor bindings through exact named and dot external-package imports", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/shop\n\ngo 1.22\n",
      "price/client.go": "package price\ntype Client struct{}\nfunc (*Client) Fetch() int { return 42 }\n",
      "price/factory.go": "package price\nfunc NewClient() (*Client, error) { return &Client{}, nil }\n",
      "price/named_test.go": [
        "package price_test",
        "import (",
        "  \"testing\"",
        "  pricing \"example.com/shop/price\"",
        ")",
        "func TestNamedConstructor(t *testing.T) {",
        "  client, err := pricing.NewClient()",
        "  if err != nil || client.Fetch() != 42 { t.Fatal() }",
        "}",
        ""
      ].join("\n"),
      "price/dot_test.go": [
        "package price_test",
        "import (",
        "  \"testing\"",
        "  . \"example.com/shop/price\"",
        ")",
        "func TestDotConstructor(t *testing.T) {",
        "  client, err := NewClient()",
        "  if err != nil || client.Fetch() != 42 { t.Fatal() }",
        "}",
        ""
      ].join("\n")
    });

    const audit = auditGoRepo(root);
    const client = audit.coveredButRisky.find((target) => target.path === "price/client.go");

    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(client.existingTestEvidence, [
      { testPath: "price/dot_test.go", kind: "go-symbol-reference", strength: "direct", usage: "called" },
      { testPath: "price/named_test.go", kind: "go-symbol-reference", strength: "direct", usage: "called" }
    ]);
  });

  it("rejects interface, alias, reassigned, and ambiguously shadowed receiver bindings", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/method-shadows\n\ngo 1.22\n",
      "runner.go": "package shadows\ntype Runner interface { Run() int }\ntype Client struct{}\nfunc (Client) Run() int { return 1 }\nfunc (Client) AsRunner() Runner { return Client{} }\n",
      "alias.go": "package shadows\ntype Alias = Client\nfunc NewAlias() Alias { return Client{} }\n",
      "factory.go": "package shadows\nfunc NewClient() Client { return Client{} }\nfunc NewRunner() Runner { return Client{} }\n",
      "service.go": "package shadows\ntype Service struct{}\nfunc (Service) Run() int { return 1 }\n",
      "worker.go": "package shadows\ntype Worker struct{}\nfunc (Worker) Work() int { return 1 }\n",
      "method_test.go": [
        "package shadows",
        "import \"testing\"",
        "func TestMethods(t *testing.T) {",
        "  runner := NewRunner()",
        "  _ = runner.Run()",
        "  alias := NewAlias()",
        "  _ = alias.Run()",
        "  chained := NewClient().AsRunner()",
        "  _ = chained.Run()",
        "  service := Service{}",
        "  service = Service{}",
        "  _ = service.Run()",
        "  worker := Worker{}",
        "  if true { worker := Worker{}; _ = worker.Work() }",
        "  _ = worker.Work()",
        "}",
        ""
      ].join("\n")
    });

    const audit = auditGoRepo(root);

    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["runner.go"]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["alias.go", "factory.go", "service.go", "worker.go"]);
    for (const path of ["service.go", "worker.go"]) {
      assert.deepEqual(audit.coveredButRisky.find((target) => target.path === path).existingTestEvidence, [{
        testPath: "method_test.go",
        kind: "go-symbol-reference",
        strength: "referenced"
      }]);
    }
  });

  it("propagates one called same-package source dependency without two-hop or local-shadow leakage", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/dependency\n",
      "parse.go": "package dependency\nfunc Parse() int { return helper() }\n",
      "helper.go": "package dependency\nfunc helper() int { return deep() }\n",
      "deep.go": "package dependency\nfunc deep() int { return 1 }\n",
      "shadow.go": "package dependency\nfunc Shadow() int { helper := func() int { return 2 }; return helper() }\n",
      "parse_test.go": "package dependency\nimport \"testing\"\nfunc TestParse(t *testing.T) { if Parse() != 1 { t.Fatal() } }\n",
      "shadow_test.go": "package dependency\nimport \"testing\"\nfunc TestShadow(t *testing.T) { if Shadow() != 2 { t.Fatal() } }\n"
    });

    const audit = auditGoRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["parse.go", "helper.go", "shadow.go"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["deep.go"]);
    assert.equal(audit.coveredButRisky[0].kind, "pure-logic");
    assert.deepEqual(audit.coveredButRisky[1].existingTestEvidence, [
      {
        testPath: "parse_test.go",
        kind: "go-source-dependency",
        strength: "indirect",
        viaUsage: "called"
      }
    ]);
  });

  it("propagates one exact module-local cross-package function dependency", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/service\n\ngo 1.22\n",
      "service.go": [
        "package service",
        "import \"example.com/service/internal/validate\"",
        "func Handle(value string) string { return validate.Normalize(value) }",
        ""
      ].join("\n"),
      "service_test.go": "package service\nimport \"testing\"\nfunc TestHandle(t *testing.T) { if Handle(\"ok\") != \"ok\" { t.Fatal() } }\n",
      "named.go": "package service\nimport validator \"example.com/service/internal/validate\"\nfunc Named(value string) string { return validator.Normalize(value) }\n",
      "named_test.go": "package service\nimport \"testing\"\nfunc TestNamed(t *testing.T) { if Named(\"ok\") != \"ok\" { t.Fatal() } }\n",
      "dot.go": "package service\nimport . \"example.com/service/internal/validate\"\nfunc Dot(value string) string { return Normalize(value) }\n",
      "dot_test.go": "package service\nimport \"testing\"\nfunc TestDot(t *testing.T) { if Dot(\"ok\") != \"ok\" { t.Fatal() } }\n",
      "internal/validate/normalize.go": "package validate\nfunc Normalize(value string) string { return deep(value) }\n",
      "internal/validate/deep.go": "package validate\nfunc deep(value string) string { return value }\n"
    });

    const audit = auditGoRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path).sort(), [
      "dot.go",
      "internal/validate/normalize.go",
      "named.go",
      "service.go"
    ]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["internal/validate/deep.go"]);
    assert.deepEqual(
      audit.coveredButRisky.find((target) => target.path === "internal/validate/normalize.go").existingTestEvidence,
      ["dot_test.go", "named_test.go", "service_test.go"].map((testPath) => ({
        testPath,
        kind: "go-source-dependency",
        strength: "indirect",
        viaUsage: "called"
      }))
    );
  });

  it("rejects external, blank, shadowed, and uncalled cross-package source edges", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/service\n\ngo 1.22\n",
      "service.go": [
        "package service",
        "import validator \"example.com/service/internal/validate\"",
        "var _ = validator.Normalize",
        "type localValidator struct{}",
        "func (localValidator) Normalize(value string) string { return value }",
        "func Handle(value string) string { validator := localValidator{}; return validator.Normalize(value) }",
        ""
      ].join("\n"),
      "service_test.go": "package service\nimport \"testing\"\nfunc TestHandle(t *testing.T) { if Handle(\"ok\") != \"ok\" { t.Fatal() } }\n",
      "internal/validate/normalize.go": "package validate\nfunc Normalize(value string) string { return value }\n",
      "internal/blank/blank.go": "package blank\nfunc Run() int { return 1 }\n",
      "blank.go": "package service\nimport _ \"example.com/service/internal/blank\"\nfunc Blank() int { return 1 }\n",
      "external.go": "package service\nimport outside \"example.net/outside\"\nfunc External() int { return outside.Run() }\n",
      "uncalled.go": "package service\nimport \"example.com/service/internal/unused\"\nfunc Uncalled() int { return unused.Run() }\n",
      "internal/unused/unused.go": "package unused\nfunc Run() int { return 1 }\n",
      "ambiguous.go": "package service\nimport multi \"example.com/service/internal/multi\"\nfunc First() int { return multi.Run() }\nfunc Second() int { return 2 }\n",
      "ambiguous_test.go": "package service\nimport \"testing\"\nfunc TestFirst(t *testing.T) { if First() != 1 { t.Fatal() } }\n",
      "internal/multi/multi.go": "package multi\nfunc Run() int { return 1 }\n"
    });

    const audit = auditGoRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["ambiguous.go", "service.go"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), [
      "blank.go",
      "internal/blank/blank.go",
      "external.go",
      "internal/multi/multi.go",
      "internal/validate/normalize.go",
      "uncalled.go",
      "internal/unused/unused.go"
    ]);
  });

  it("keeps symbol calls visible between comment-like HTTP route strings", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/http-service\n",
      "chain.go": "package service\nfunc Chain() int { return 1 }\n",
      "router_test.go": `package service
import "testing"
func TestWildcardRoute(t *testing.T) {
  prefix := "/*"
  if Chain() != 1 { t.Fatal("unexpected chain") }
  suffix := "*/"
  if prefix + suffix == "" { t.Fatal("unexpected route") }
}
`
    });

    const audit = auditGoRepo(root);

    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [
      {
        testPath: "router_test.go",
        kind: "go-symbol-reference",
        strength: "direct",
        usage: "called"
      }
    ]);
  });

  it("does not treat symbol-shaped strings, runes, or comments as calls", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/lexical-masking\n",
      "visible.go": "package masking\nfunc Visible() int { return 1 }\n",
      "string_only.go": "package masking\nfunc StringOnly() int { return 1 }\n",
      "raw_only.go": "package masking\nfunc RawOnly() int { return 1 }\n",
      "comment_only.go": "package masking\nfunc CommentOnly() int { return 1 }\n",
      "block_only.go": "package masking\nfunc BlockOnly() int { return 1 }\n",
      "router_test.go": "package masking\nimport \"testing\"\nfunc TestMasking(t *testing.T) {\n  _ = \"StringOnly() escaped \\\" // /* */\"\n  _ = `RawOnly()\n/* still raw */`\n  _ = '\\''\n  // CommentOnly() \"not a string\n  /* BlockOnly() `not a raw string` */\n  if Visible() != 1 { t.Fatal(\"unexpected value\") }\n}\n"
    });

    const audit = auditGoRepo(root);

    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), [
      "block_only.go",
      "comment_only.go",
      "raw_only.go",
      "string_only.go"
    ]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["visible.go"]);
    assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].usage, "called");
  });

  it("resolves exact external test-package imports and aliases", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/shop\n\ngo 1.22\n",
      "price/parser.go": "package price\nfunc Parse(value string) string { return value }\n",
      "price/types.go": "package price\ntype Amount struct { Value int }\n",
      "price/parser_test.go": [
        "package price_test",
        "import (",
        "  \"testing\"",
        "  pricing \"example.com/shop/price\"",
        ")",
        "func TestParse(t *testing.T) {",
        "  _ = pricing.Parse(\"42\")",
        "  _ = pricing.Amount{Value: 42}",
        "}",
        ""
      ].join("\n")
    });

    const audit = auditGoRepo(root);
    const parser = audit.coveredButRisky.find((target) => target.path === "price/parser.go");

    assert.ok(parser);
    assert.ok(audit.profile.detectedConventions.includes("external test package"));
    assert.deepEqual(parser.existingTestEvidence, [
      { testPath: "price/parser_test.go", kind: "go-symbol-reference", strength: "direct", usage: "called" },
      { testPath: "price/parser_test.go", kind: "filename-convention", strength: "naming" }
    ]);
    assert.deepEqual(audit.skipped.find((target) => target.path === "price/types.go")?.kind, "dto");
  });

  it("resolves generic function declarations, explicit type arguments, and one source hop", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/generic\n\ngo 1.22\n",
      "exercise.go": "package generic\nfunc Exercise[\n  T ~[]byte | ~string,\n](value T) T { return normalize(value) }\n",
      "normalize.go": "package generic\nfunc normalize[T ~[]byte | ~string](value T) T { return value }\n",
      "exercise_test.go": [
        "package generic_test",
        "import (",
        "  \"testing\"",
        "  driver \"example.com/generic\"",
        ")",
        "func TestExercise(t *testing.T) {",
        "  if driver.Exercise[string](\"ok\") != \"ok\" { t.Fatal() }",
        "}",
        ""
      ].join("\n")
    });

    const audit = auditGoRepo(root);

    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["exercise.go", "normalize.go"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [
      { testPath: "exercise_test.go", kind: "go-symbol-reference", strength: "direct", usage: "called" },
      { testPath: "exercise_test.go", kind: "filename-convention", strength: "naming" }
    ]);
    assert.deepEqual(audit.coveredButRisky[1].existingTestEvidence, [
      { testPath: "exercise_test.go", kind: "go-source-dependency", strength: "indirect", viaUsage: "called" }
    ]);
  });

  it("recognizes runnable fuzz and example conventions", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/sample\n\ngo 1.22\n",
      "codec.go": "package sample\nfunc Encode(value string) string { return value }\n",
      "codec_test.go": [
        "package sample",
        "import \"testing\"",
        "func FuzzEncode(f *testing.F) { f.Fuzz(func(t *testing.T, value string) { _ = Encode(value) }) }",
        "func ExampleEncode() { _ = Encode(\"ok\") }",
        ""
      ].join("\n")
    });

    const audit = auditGoRepo(root);

    assert.deepEqual(audit.profile.detectedConventions, ["*_test.go", "FuzzXxx", "ExampleXxx"]);
    assert.equal(audit.profile.testCommand, "go test ./...");
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["codec.go"]);
  });

  it("accepts a root-owned workspace module while blocking build constraints and Ginkgo execution", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/sample\n\nrequire github.com/onsi/ginkgo/v2 v2.0.0\n",
      "go.work": "go 1.22\nuse .\n",
      "platform.go": "//go:build linux\n\npackage sample\nfunc Platform() string { return \"linux\" }\n",
      "service.go": "package sample\nfunc Run() error { return nil }\n",
      "suite_test.go": [
        "package sample",
        "import (",
        "  \"testing\"",
        "  . \"github.com/onsi/ginkgo/v2\"",
        ")",
        "func TestSuite(t *testing.T) { RegisterFailHandler(func(string, ...int) {}); _ = Run() }",
        ""
      ].join("\n")
    });

    const audit = auditGoRepo(root);

    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "low");
    assert.deepEqual(audit.profile.blockers, [
      "Go build constraints require explicit GOOS and GOARCH target configuration before audit ownership is complete.",
      "Ginkgo/Gomega execution is outside the bounded standard-library Go test support matrix."
    ]);
    assert.ok(audit.profile.setupSignals.includes("go.work"));
    assert.ok(audit.profile.setupSignals.includes("go.work module"));
    assert.deepEqual(audit.skipped.find((target) => target.path === "platform.go")?.kind, "build-constrained");
  });

  it("classifies command wiring, HTTP handlers, concurrency, generated files, and utilities conservatively", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/sample\n\ngo 1.22\n",
      "main.go": "package main\nfunc main() {}\n",
      "handler.go": "package main\nimport \"net/http\"\nfunc Handle(w http.ResponseWriter, r *http.Request) { if r.Method == http.MethodGet { w.WriteHeader(200) } }\n",
      "worker.go": "package main\nimport \"sync\"\nfunc Work() { var group sync.WaitGroup; go group.Wait() }\n",
      "utility.go": "package main\nfunc Choose(ok bool) int { if ok { return 1 }; return 0 }\n",
      "generated.go": "// Code generated by sample. DO NOT EDIT.\npackage main\nfunc Generated() {}\n",
      "handler_test.go": "package main\nimport \"testing\"\nfunc TestHandle(t *testing.T) { _ = Handle }\n"
    });

    const audit = auditGoRepo(root);

    assert.equal(audit.coveredButRisky.find((target) => target.path === "handler.go")?.kind, "http-handler");
    assert.equal(audit.untestedCandidates.find((target) => target.path === "worker.go")?.kind, "concurrent-service");
    assert.equal(audit.untestedCandidates.find((target) => target.path === "utility.go")?.kind, "utility");
    assert.equal(audit.skipped.find((target) => target.path === "main.go")?.kind, "app-wiring");
    assert.equal(audit.skipped.find((target) => target.path === "generated.go")?.kind, "generated");
  });

  it("excludes nested modules, vendor, and testdata from the owning audit", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/root\n\ngo 1.22\n",
      "parser.go": "package root\nfunc Parse(value string) string { return value }\n",
      "parser_test.go": "package root\nimport \"testing\"\nfunc TestParse(t *testing.T) { _ = Parse(\"ok\") }\n",
      "nested/go.mod": "module example.com/nested\n",
      "nested/nested_service.go": "package nested\nfunc Run() {}\n",
      "vendor/example.com/dependency/client.go": "package dependency\nfunc Call() {}\n",
      "testdata/fixture.go": "package fixture\nfunc Load() {}\n"
    });

    const audit = auditGoRepo(root);
    const allPaths = [...audit.recommended, ...audit.skipped].map((target) => target.path);

    assert.deepEqual(allPaths, ["parser.go"]);
  });

  it("filters candidates by repository-relative and absolute changed paths", (t) => {
    const root = createRepo(t, {
      "go.mod": "module example.com/sample\n\ngo 1.22\n",
      "parser.go": "package sample\nfunc Parse(value string) string { return value }\n",
      "formatter.go": "package sample\nfunc Format(value string) string { return value }\n",
      "parser_test.go": "package sample\nimport \"testing\"\nfunc TestParse(t *testing.T) { _ = Parse(\"ok\") }\n"
    });

    const relativeAudit = auditGoRepo(root, { changedPaths: ["formatter.go"] });
    const absoluteAudit = auditGoRepo(root, { changedPaths: [path.join(root, "parser.go")] });

    assert.deepEqual(relativeAudit.recommended.map((target) => target.path), ["formatter.go"]);
    assert.deepEqual(absoluteAudit.recommended.map((target) => target.path), ["parser.go"]);
  });
});
