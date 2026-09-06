import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { it } from "node:test";
import { auditDartRepo } from "../src/adapters/dart/audit.js";
import { detectProjects } from "../src/core/project-detector.js";
import { assertAdapterConformance } from "./support/adapter-conformance.js";
import { assertMatchesSchema } from "./support/json-schema-validator.js";
import { auditRepoProjects, collectRepoProjectStats } from "../src/core/tool-api.js";

const fixture = path.resolve("examples/dart-test-basic");
const schema = JSON.parse(fs.readFileSync("schemas/audit-v1.schema.json", "utf8"));
const manifest = "name: checkout_rules\nenvironment:\n  sdk: '^3.0.0'\ndev_dependencies:\n  test: ^1.25.0\n";
function repo(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rta-dart-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const contents = { "pubspec.yaml": manifest, "lib/price.dart": "int price(int n) { if (n < 0) throw ArgumentError(); return n; }", ...files };
  for (const [name, content] of Object.entries(contents)) {
    if (content === null) continue;
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}
const entrypoint = (imports, body = "test('price', () { expect(price(1), 1); });") =>
  `import 'package:test/test.dart';\n${imports}\nvoid main() { ${body} }`;

it("audits Dart through the shared schema and every downstream consumer", () => {
  const audit = assertAdapterConformance({ adapterId: "dart", fixturePath: "examples/dart-test-basic", expectedMaturity: "experimental",
    expectedProfile: { languages: ["dart"], testFrameworks: ["dart-test"], testCommand: "dart test", confidence: "medium" } });
  assertMatchesSchema(audit, schema, "Dart audit");
  assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["lib/shipping.dart"]);
  assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["lib/price.dart"]);
  assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].usage, undefined);
  assert.deepEqual(audit.skipped.map((target) => target.path), ["lib/checkout_rules.dart"]);
});

it("audits Flutter widget conventions and relative imports", () => {
  const audit = assertAdapterConformance({ adapterId: "dart", fixturePath: "examples/dart-flutter-basic", expectedMaturity: "experimental",
    expectedProfile: { testFrameworks: ["flutter-test"], testCommand: "flutter test", confidence: "medium" } });
  assertMatchesSchema(audit, schema, "Flutter audit");
  assert.equal(audit.coveredButRisky[0].recommendedTestLevel, "component");
  assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].kind, "direct-relative-import");
});

it("detects pubspec projects, prunes caches, and isolates nested packages", (t) => {
  const root = repo(t, {
    "packages/child/pubspec.yaml": manifest.replace("checkout_rules", "child"),
    "packages/child/lib/child.dart": "void child() {}",
    ".dart_tool/cache/pubspec.yaml": manifest,
    ".pub-cache/hosted/pubspec.yaml": manifest,
    "lib/nested/pubspec.yaml": manifest.replace("checkout_rules", "nested"),
    "lib/nested/lib/nested.dart": "void nested() {}"
  });
  const detection = detectProjects(root);
  assert.equal(detection.projects.length, 3);
  assert.ok(detection.projects.every((project) => project.adapterIds.includes("dart")));
  assert.deepEqual(auditDartRepo(root).recommended.map((target) => target.path), ["lib/price.dart"]);
});

it("supports changed paths without removing full-repository test evidence", () => {
  for (const changedPath of ["lib/price.dart", "./lib/price.dart", "lib\\price.dart", path.join(fixture, "lib/price.dart")]) {
    const audit = auditDartRepo(fixture, { changedPaths: [changedPath] });
    assert.equal(audit.coveredButRisky.length, 1);
    assert.equal(audit.recommended.length, 1);
  }
  assert.deepEqual(auditDartRepo(fixture, { changedPaths: [] }).recommended, []);
});

it("withholds commands for missing, malformed, duplicate, or ambiguous metadata", (t) => {
  for (const pubspec of [null, "[broken", "- list", "null", "name: 123", "name: checkout_rules\nname: duplicate", "name: checkout_rules\ndependencies: []", "name: checkout_rules\ndev_dependencies: null", "name: checkout_rules", `${manifest}workspace: [packages/a]\n`]) {
    const audit = auditDartRepo(repo(t, { "pubspec.yaml": pubspec, "test/price_test.dart": entrypoint("import '../lib/price.dart';") }));
    assert.ok(audit.profile.blockers.length > 0);
    assert.equal(Object.hasOwn(audit.profile, "testCommand"), false);
    assertMatchesSchema(audit, schema, "blocked Dart audit");
  }
});

it("requires test dependencies, owned sources and a conventional entrypoint", (t) => {
  for (const files of [
    { "pubspec.yaml": "name: checkout_rules\nenvironment: {sdk: '^3.0.0'}" },
    { "lib/price.dart": null },
    { "dart_test.yaml": "platforms: [chrome]" },
    { "test/price_test.dart": "import 'package:test/test.dart'; void helper() { test('x', () {}); }" },
    { "test/price_test.dart": "import 'package:test/test.dart'; class C { void main() { test('x', () {}); } }" },
    { "test/price_test.dart": "import 'package:test/test.dart'; void main() => test('x', () {});" },
    { "test/price_test.dart": "import 'package:test/test.dart'; void main() { test('x', () {});" }
  ]) {
    const audit = auditDartRepo(repo(t, { "test/price_test.dart": entrypoint("import '../lib/price.dart';"), ...files }));
    assert.equal(Object.hasOwn(audit.profile, "testCommand"), false);
  }
});

it("never derives import evidence from comments, strings, conditional imports, or foreign paths", (t) => {
  for (const importText of [
    "// import '../lib/price.dart';", "/* outer /* nested */ import '../lib/price.dart'; */",
    "const note = \"import '../lib/price.dart';\";", "const note = r'''import '../lib/price.dart';''';",
    "const note = '''import '../lib/price.dart';''';", "const note = \"escaped \\\" import '../lib/price.dart';\";",
    "import '../lib/price.dart' if (dart.library.io) '../lib/other.dart';",
    "import '../lib/price.dart' deferred as p;", "import 'package:foreign/price.dart';",
    "import 'package:checkout_rules/../price.dart';", "import 'file:///lib/price.dart';",
    "import '/lib/price.dart';", "import '../../../lib/price.dart';", "import '../lib/%70rice.dart';",
    "import '../lib/price.dart?x';", "import '../lib/$name.dart';", "import '../lib/price.dart'"
  ]) {
    const audit = auditDartRepo(repo(t, { "test/price_test.dart": entrypoint(importText) }));
    assert.equal(audit.coveredButRisky.length, 0, importText);
  }
});

it("recognizes aliases and combinators without accepting hidden or unrelated registrations", (t) => {
  for (const [runner, call, expected] of [
    ["as checks", "checks.test('x', () {});", true],
    ["as checks", "test('x', () {});", false],
    ["hide test", "test('x', () {});", false],
    ["show group", "test('x', () {});", false],
    ["show test", "test('x', () {});", true],
    ["", "other.test('x', () {});", false],
    ["", "// test('x', () {});\n", false],
    ["", "const note = \"test('x', () {});\";", false]
  ]) {
    const content = `import 'package:test/test.dart' ${runner}; import '../lib/price.dart'; void main() async { ${call} }`;
    const audit = auditDartRepo(repo(t, { "test/price_test.dart": content }));
    assert.equal(audit.profile.testCommand === "dart test", expected, content);
  }
});

it("skips generated files and parts, keeps async behavior, and deduplicates imports", (t) => {
  const root = repo(t, {
    "lib/model.g.dart": "class Generated {}", "lib/part.dart": "part of 'price.dart'; void helper() {}",
    "lib/empty.dart": "/* empty */", "lib/fetch.dart": "Future<int> fetch() async { return await Future.value(1); }",
    "bin/main.dart": "void main() {}",
    "test/price_test.dart": entrypoint("import '../lib/price.dart'; import '../lib/price.dart'; import '../lib/part.dart';")
  });
  const audit = auditDartRepo(root);
  assert.equal(audit.skipped.length, 3);
  assert.equal(audit.coveredButRisky.length, 1);
  assert.equal(audit.coveredButRisky[0].existingTestEvidence.length, 1);
  assert.ok(audit.untestedCandidates.find((target) => target.path === "lib/fetch.dart").signals.includes("async-or-concurrency"));
});

it("does not mistake exported libraries with arrow functions or initializers for barrels", (t) => {
  const audit = auditDartRepo(repo(t, {
    "lib/arrow.dart": "export 'price.dart'; int adjusted(int n) => n + 1;",
    "lib/initializer.dart": "export 'price.dart'; final initialPrice = price(1);"
  }));
  assert.deepEqual(audit.skipped, []);
  assert.equal(audit.recommended.length, 3);
});

it("does not traverse symlinks to source or package metadata", { skip: process.platform === "win32" }, (t) => {
  const root = repo(t);
  const outside = repo(t, { "lib/foreign.dart": "void foreign() {}" });
  fs.symlinkSync(path.join(outside, "lib"), path.join(root, "lib/external"), "dir");
  assert.deepEqual(auditDartRepo(root).recommended.map((target) => target.path), ["lib/price.dart"]);
});

it("exposes Dart through CLI audit and project analysis", () => {
  const audit = JSON.parse(execFileSync(process.execPath, ["src/cli/index.js", "audit", fixture, "--adapter", "dart", "--format", "json"], { encoding: "utf8" }));
  assert.equal(audit.profile.testCommand, "dart test");
  const analysis = JSON.parse(execFileSync(process.execPath, ["src/cli/index.js", "analyze", fixture, "--format", "json"], { encoding: "utf8" }));
  assert.ok(JSON.stringify(analysis).includes("dart test"));
});

it("counts Dart package sources including bin while excluding caches and nested owners", (t) => {
  const root = repo(t, {
    "bin/tool.dart": "void main() {}",
    ".dart_tool/generated.dart": "void generated() {}",
    ".pub-cache/cached.dart": "void cached() {}",
    "packages/child/pubspec.yaml": manifest.replace("checkout_rules", "child"),
    "packages/child/lib/child.dart": "void child() {}"
  });
  const stats = collectRepoProjectStats(auditRepoProjects(root));
  assert.deepEqual(stats.sourceFiles.byLanguage.dart, { total: 3, audited: 3, unsupported: 0 });
});

it("follows at most three owned unconditional export edges without inventing calls", (t) => {
  const root = repo(t, {
    "lib/public.dart": "library checkout_rules; export 'one.dart'; export 'price.dart';",
    "lib/one.dart": "library; export 'two.dart';",
    "lib/two.dart": "export 'three.dart';",
    "lib/three.dart": "export 'four.dart'; int three() => 3;",
    "lib/four.dart": "int four() => 4;",
    "test/public_test.dart": entrypoint("import 'package:checkout_rules/public.dart';")
  });
  const audit = auditDartRepo(root);
  assert.deepEqual(audit.coveredButRisky.map((target) => target.path).sort(), ["lib/price.dart", "lib/three.dart"]);
  assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["lib/four.dart"]);
  assert.deepEqual(audit.skipped.map((target) => target.path), ["lib/one.dart", "lib/public.dart", "lib/two.dart"]);
  for (const target of audit.coveredButRisky) assert.deepEqual(target.existingTestEvidence, [
    { testPath: "test/public_test.dart", kind: "bounded-dependency", strength: "indirect" }
  ]);
  assertMatchesSchema(audit, schema, "export reachability audit");
});

it("rejects conditional, foreign, missing, nested-package and part export ownership", (t) => {
  const root = repo(t, {
    "lib/public.dart": "export 'price.dart' if (dart.library.io) 'other.dart'; export 'package:foreign/price.dart'; export 'missing.dart'; export 'part.dart'; export 'nested/lib/child.dart';",
    "lib/part.dart": "part of 'public.dart'; int partValue = 1;",
    "lib/nested/pubspec.yaml": manifest.replace("checkout_rules", "child"),
    "lib/nested/lib/child.dart": "int child() => 1;",
    "test/public_test.dart": entrypoint("import '../lib/public.dart';")
  });
  const audit = auditDartRepo(root);
  assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["lib/price.dart"]);
  assert.ok(audit.recommended.every((target) => !target.path.includes("nested")));
  assert.ok(audit.coveredButRisky.every((target) => target.path === "lib/public.dart"));
});

it("terminates export cycles and retains the strongest evidence once per test", (t) => {
  for (const imports of [
    "import '../lib/public.dart'; import '../lib/price.dart'; import 'package:checkout_rules/price.dart';",
    "import '../lib/price.dart'; import '../lib/public.dart';"
  ]) {
    const root = repo(t, {
      "lib/public.dart": "export 'second.dart'; export 'price.dart';",
      "lib/second.dart": "export 'public.dart'; export 'price.dart';",
      "test/public_test.dart": entrypoint(imports)
    });
    const audit = auditDartRepo(root);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [
      { testPath: "test/public_test.dart", kind: "direct-relative-import", strength: "direct" }
    ]);
  }
});

it("defers abstract repository declarations while preserving abstract classes with behavior", (t) => {
  const audit = auditDartRepo(repo(t, {
    "lib/repository.dart": "import 'price.dart'; abstract class Repository { Future<int> read(String key); }",
    "lib/interface.dart": "abstract interface class Store { int get value; }",
    "lib/default.dart": "abstract class Defaults { int read() => 1; }",
    "lib/observer.dart": "abstract class Observer { void changed() {} }",
    "lib/initialized.dart": "abstract class Initialized { final value = DateTime.now(); }"
  }));
  assert.deepEqual(audit.skipped.map((target) => target.path), ["lib/interface.dart", "lib/repository.dart"]);
  assert.ok(audit.skipped.every((target) => target.signals.includes("type-only")));
  assert.equal(audit.recommended.length, 4);
});

it("keeps nested interpolation strings opaque to import and registration discovery", (t) => {
  const fakeImport = "const note = '${'import \"../lib/price.dart\";'}';";
  const audit = auditDartRepo(repo(t, { "test/price_test.dart": entrypoint(fakeImport) }));
  assert.equal(audit.coveredButRisky.length, 0);
  for (const expression of [
    "'test(\"fake\", () {});'",
    "{'key': 'test(\"fake\", () {});'}",
    "/* outer /* nested */ } */ 'test(\"fake\", () {});'",
    "// }\n 'test(\"fake\", () {});'",
    "r'test(\"fake\", () {});'",
    "'''test(\"fake\", () {});'''"
  ]) {
    const content = entrypoint("import '../lib/price.dart';", "final note = '${" + expression + "}';");
    const blocked = auditDartRepo(repo(t, { "test/price_test.dart": content }));
    assert.equal(blocked.profile.testCommand, undefined, expression);
    assert.equal(blocked.coveredButRisky.length, 0, expression);
    const real = auditDartRepo(repo(t, { "test/price_test.dart": content.replace("final note", "test('real', () {}); final note") }));
    assert.equal(real.profile.testCommand, "dart test", expression);
    assert.equal(real.coveredButRisky.length, 1, expression);
  }
});

it("applies successive import combinators as filters rather than merging their names", (t) => {
  for (const [tail, expected] of [
    ["show test show group", false],
    ["show test, group show test", true],
    ["hide group show test", true],
    ["show test hide test", false],
    ["hide test show group", false]
  ]) {
    const content = `import 'package:test/test.dart' ${tail}; import '../lib/price.dart'; void main() { test('x', () {}); }`;
    const audit = auditDartRepo(repo(t, { "test/price_test.dart": content }));
    assert.equal(audit.profile.testCommand === "dart test", expected, tail);
    assert.equal(audit.coveredButRisky.length, expected ? 1 : 0, tail);
  }
});

it("fails closed on unterminated or excessively nested interpolation", (t) => {
  let nested = "'test(\"fake\", () {});'";
  for (let index = 0; index < 40; index++) nested = "'${" + nested + "}'";
  for (const body of ["final note = '${ // no closing brace", "final note = '${ /* unclosed", "final note = " + nested + ";"]) {
    const audit = auditDartRepo(repo(t, { "test/price_test.dart": entrypoint("import '../lib/price.dart';", body) }));
    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.coveredButRisky.length, 0);
  }
});

it("only trusts generated-code markers in the leading comment header", (t) => {
  const audit = auditDartRepo(repo(t, {
    "lib/strings.dart": "const text = '''\n// GENERATED CODE - DO NOT MODIFY BY HAND\n'''; int value() => 1;",
    "lib/generated.dart": "// License\n// GENERATED CODE - DO NOT MODIFY BY HAND\nint generated() => 1;"
  }));
  assert.deepEqual(audit.skipped.map((target) => target.path), ["lib/generated.dart"]);
  assert.ok(audit.recommended.some((target) => target.path === "lib/strings.dart"));
});
