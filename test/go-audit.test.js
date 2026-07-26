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
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["payment_client.go"]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["price_parser.go"]);
    assert.deepEqual(audit.skipped.map((target) => [target.path, target.kind]), [["payment.go", "dto"]]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [
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

  it("blocks workspaces, build constraints, and Ginkgo execution", (t) => {
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
      "Go workspaces are outside the bounded single-module support matrix.",
      "Go build constraints require an explicit target configuration before audit ownership is complete.",
      "Ginkgo/Gomega execution is outside the bounded standard-library Go test support matrix."
    ]);
    assert.ok(audit.profile.setupSignals.includes("go.work"));
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
