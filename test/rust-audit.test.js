import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditRustRepo } from "../src/adapters/rust/audit.js";

describe("Rust audit adapter", () => {
  it("audits a bounded Cargo package with inline and integration test evidence", () => {
    const root = path.resolve("examples/rust-cargo-basic");
    const audit = auditRustRepo(root);

    assert.deepEqual(audit.profile, {
      root,
      languages: ["rust"],
      packageManagers: ["cargo"],
      testFrameworks: ["rust-test"],
      architectures: ["cargo-package", "library"],
      testCommand: "cargo test",
      detectedConventions: ["literal Rust module graph", "inline cfg(test) modules", "Cargo integration tests"],
      existingTestLocations: ["inline #[cfg(test)] modules", "tests/ integration tests"],
      setupSignals: ["Cargo.toml", "Rust 2024 edition"],
      confidence: "high",
      blockers: []
    });
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/service.rs"]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/parser.rs", "src/validator.rs"]);
    assert.deepEqual(audit.skipped.map((target) => target.path), ["src/lib.rs", "src/model.rs"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "tests/parser_test.rs",
      kind: "rust-symbol-reference",
      strength: "direct",
      usage: "asserted"
    }]);
    assert.deepEqual(audit.coveredButRisky[1].existingTestEvidence, [{
      testPath: "src/validator.rs",
      kind: "rust-symbol-reference",
      strength: "direct",
      usage: "asserted"
    }]);
  });

  it("filters Rust candidates with portable changed paths", () => {
    const root = path.resolve("examples/rust-cargo-basic");
    const relative = auditRustRepo(root, { changedPaths: ["src\\service.rs"] });
    const absolute = auditRustRepo(root, { changedPaths: [path.join(root, "src", "parser.rs")] });

    assert.deepEqual(relative.untestedCandidates.map((target) => target.path), ["src/service.rs"]);
    assert.deepEqual(relative.coveredButRisky, []);
    assert.deepEqual(relative.skipped, []);
    assert.deepEqual(absolute.coveredButRisky.map((target) => target.path), ["src/parser.rs"]);
  });

  it("keeps a literal Cargo workspace member as an independent command owner", () => {
    const root = path.resolve("examples/rust-cargo-workspace-basic/services/checkout");
    const audit = auditRustRepo(root);

    assert.deepEqual(audit.profile, {
      root,
      languages: ["rust"],
      packageManagers: ["cargo"],
      testFrameworks: ["rust-test"],
      architectures: ["cargo-package", "cargo-workspace-package", "library"],
      testCommand: "cargo test -p workspace-checkout",
      detectedConventions: ["literal Rust module graph", "Cargo integration tests"],
      existingTestLocations: ["tests/ integration tests"],
      setupSignals: [
        "Cargo.toml",
        "Cargo.toml (nearest workspace)",
        "Rust 2024 edition",
        "Cargo workspace member",
        "Cargo workspace default member"
      ],
      confidence: "high",
      blockers: []
    });
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/validator.rs"]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/service.rs"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestPaths, ["tests/service_test.rs"]);
  });

  it("keeps a virtual Cargo workspace root aggregate-only", () => {
    const audit = auditRustRepo(path.resolve("examples/rust-cargo-workspace-basic"));

    assert.equal(audit.profile.testCommand, undefined);
    assert.deepEqual(audit.profile.architectures, ["cargo-workspace"]);
    assert.deepEqual(audit.profile.blockers, [
      "Cargo workspace roots must be audited through their declared package projects.",
      "No runnable built-in Rust #[test] detected."
    ]);
    assert.deepEqual(audit.recommended, []);
  });

  it("blocks omitted and incomplete Cargo workspace ownership", (t) => {
    const workspace = createRustRepo(t, {
      "Cargo.toml": [
        "[workspace]",
        "members = [\"listed\", \"missing\", \"crates/*\"]",
        "default-members = [\"unlisted\"]",
        "resolver = \"3\"",
        ""
      ].join("\n"),
      "listed/Cargo.toml": cargoPackage("listed"),
      "unlisted/Cargo.toml": cargoPackage("unlisted"),
      "unlisted/src/lib.rs": rustSourceWithTest("parse")
    });

    const audit = auditRustRepo(path.join(workspace, "unlisted"));

    assert.equal(audit.profile.testCommand, undefined);
    assert.deepEqual(audit.profile.blockers, [
      "Cargo workspace members and default-members must resolve to literal repository-contained packages before command ownership is complete."
    ]);
    assert.ok(!audit.profile.setupSignals.includes("Cargo workspace member"));
  });

  it("blocks a valid but unlisted package in the nearest Cargo workspace", (t) => {
    const workspace = createRustRepo(t, {
      "Cargo.toml": "[workspace]\nmembers = [\"listed\"]\nresolver = \"3\"\n",
      "listed/Cargo.toml": cargoPackage("listed"),
      "unlisted/Cargo.toml": cargoPackage("unlisted"),
      "unlisted/src/lib.rs": rustSourceWithTest("parse")
    });

    const audit = auditRustRepo(path.join(workspace, "unlisted"));

    assert.equal(audit.profile.testCommand, undefined);
    assert.deepEqual(audit.profile.blockers, [
      "The package is not literally declared by the nearest Cargo workspace, so command ownership is incomplete."
    ]);
  });

  it("selects an exact package command for a non-virtual workspace root", (t) => {
    const root = createRustRepo(t, {
      "Cargo.toml": [
        "[package]",
        "name = \"root-package\"",
        "version = \"0.1.0\"",
        "edition = \"2024\"",
        "",
        "[workspace]",
        "members = []",
        "resolver = \"3\"",
        ""
      ].join("\n"),
      "src/lib.rs": rustSourceWithTest("parse")
    });

    const audit = auditRustRepo(root);

    assert.equal(audit.profile.testCommand, "cargo test -p root-package");
    assert.deepEqual(audit.profile.architectures, ["cargo-package", "cargo-workspace-package", "library"]);
    assert.deepEqual(audit.profile.blockers, []);
  });

  it("selects a built-in explicit Cargo test target without inventing macro evidence", (t) => {
    const root = createRustRepo(t, {
      "Cargo.toml": [
        "[package]",
        "name = \"macro-tests\"",
        "version = \"0.1.0\"",
        "edition = \"2024\"",
        "autotests = false",
        "",
        "[[test]]",
        "name = \"integration\"",
        "path = \"tests/suite.rs\"",
        ""
      ].join("\n"),
      "src/lib.rs": "pub fn parse() -> usize { 1 }\n",
      "tests/suite.rs": [
        "macro_rules! generated_test {",
        "    ($name:ident) => { #[test] fn $name() { assert_eq!(1, 1); } };",
        "}",
        "generated_test!(works);",
        ""
      ].join("\n")
    });

    const audit = auditRustRepo(root);

    assert.equal(audit.profile.testCommand, "cargo test");
    assert.deepEqual(audit.profile.testFrameworks, ["rust-test"]);
    assert.deepEqual(audit.profile.detectedConventions, ["explicit Cargo test target"]);
    assert.deepEqual(audit.profile.existingTestLocations, ["Cargo explicit test targets"]);
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/lib.rs"]);
    assert.deepEqual(audit.coveredButRisky, []);
  });

  it("does not select disabled, custom, feature-gated, or escaping Cargo test targets", (t) => {
    const root = createRustRepo(t, {
      "Cargo.toml": [
        "[package]",
        "name = \"bounded-targets\"",
        "version = \"0.1.0\"",
        "",
        "[[test]]",
        "name = \"disabled\"",
        "test = false",
        "",
        "[[test]]",
        "name = \"custom\"",
        "harness = false",
        "",
        "[[test]]",
        "name = \"feature\"",
        "required-features = [\"integration\"]",
        "",
        "[[test]]",
        "name = \"escaping\"",
        "path = \"../outside.rs\"",
        ""
      ].join("\n"),
      "src/lib.rs": "pub fn parse() -> usize { 1 }\n",
      "tests/disabled.rs": "fn helper() {}\n",
      "tests/custom.rs": "fn main() {}\n",
      "tests/feature.rs": "fn helper() {}\n"
    });

    const audit = auditRustRepo(root);

    assert.equal(audit.profile.testCommand, undefined);
    assert.deepEqual(audit.profile.testFrameworks, []);
    assert.deepEqual(audit.profile.detectedConventions, []);
    assert.ok(audit.profile.blockers.includes("Custom Rust test harnesses are outside the bounded built-in test support matrix."));
    assert.ok(audit.profile.blockers.includes("No runnable built-in Rust #[test] detected."));
  });

  it("owns static package-local Cargo lib and bin source targets", (t) => {
    const root = createRustRepo(t, {
      "Cargo.toml": [
        "[package]",
        "name = \"custom-targets\"",
        "version = \"0.1.0\"",
        "edition = \"2024\"",
        "",
        "[lib]",
        "path = 'code/library.rs'",
        "",
        "[[bin]]",
        "name = \"custom-targets\"",
        "path = \"./app/main.rs\"",
        ""
      ].join("\n"),
      "code/library.rs": [
        "pub fn calculate(value: usize) -> usize { value + 1 }",
        "#[cfg(test)]",
        "mod tests { use super::calculate; #[test] fn calculates() { assert_eq!(calculate(1), 2); } }",
        ""
      ].join("\n"),
      "app/main.rs": "fn render(value: usize) -> String { value.to_string() }\nfn main() { println!(\"{}\", render(1)); }\n",
      "other/unowned.rs": "pub fn unrelated() -> usize { 1 }\n"
    });

    const audit = auditRustRepo(root);

    assert.deepEqual(audit.profile.architectures, ["cargo-package", "library", "binary"]);
    assert.equal(audit.profile.testCommand, "cargo test");
    assert.deepEqual(audit.profile.detectedConventions, ["explicit Cargo source target", "inline cfg(test) modules"]);
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["code/library.rs"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["app/main.rs"]);
    assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].testPath, "code/library.rs");
    assert.ok(!audit.recommended.some((target) => target.path === "other/unowned.rs"));
  });

  it("blocks unresolved Cargo lib and bin paths without widening source ownership", (t) => {
    const root = createRustRepo(t, {
      "Cargo.toml": [
        "[package]",
        "name = \"unresolved-targets\"",
        "version = \"0.1.0\"",
        "",
        "[lib]",
        "path = \"../outside.rs\"",
        "",
        "[[bin]]",
        "name = \"missing\"",
        "path = \"app/missing.rs\"",
        "",
        "[[bin]]",
        "name = \"dynamic\"",
        "path = { value = \"app/main.rs\" }",
        "",
        "[[bin]]",
        "name = \"duplicate\"",
        "path = \"app/main.rs\"",
        "path = \"app/other.rs\"",
        ""
      ].join("\n"),
      "src/lib.rs": rustSourceWithTest("conventional"),
      "app/main.rs": "fn main() {}\n"
    });

    const audit = auditRustRepo(root);

    assert.equal(audit.profile.testCommand, undefined);
    assert.deepEqual(audit.profile.architectures, ["cargo-package", "library"]);
    assert.deepEqual(audit.profile.detectedConventions, ["inline cfg(test) modules"]);
    assert.ok(audit.profile.blockers.includes("Cargo lib and bin target paths must resolve to static repository-contained Rust files."));
    assert.ok(!audit.recommended.some((target) => target.path === "app/main.rs"));
  });

  it("traverses literal top-level modules from Cargo-owned crate roots", (t) => {
    const root = createRustRepo(t, {
      "Cargo.toml": [
        "[package]",
        "name = \"module-graph\"",
        "version = \"0.1.0\"",
        "",
        "[[bin]]",
        "name = \"module-graph\"",
        "path = \"app/root.rs\"",
        ""
      ].join("\n"),
      "app/root.rs": [
        "mod direct;",
        "mod folder;",
        "mod dual;",
        "mod missing;",
        "#[path = \"../shared/explicit.rs\"]",
        "mod explicit;",
        "#[path = r#\"../shared/raw.rs\"#]",
        "mod raw;",
        "#[path = concat!(\"dynamic\", \".rs\")]",
        "mod dynamic_owned;",
        "#[cfg_attr(feature = \"alternate\", path = \"alternate.rs\")]",
        "mod cfg_attr_owned;",
        "#[path = \"../../outside.rs\"]",
        "mod escaping_owned;",
        "mod nested_package;",
        "const TEXT: &str = \"mod string_owned;\";",
        "macro_rules! hidden { () => { mod macro_owned; } }",
        "mod inline { mod nested_owned; }",
        "fn main() { let _ = TEXT; }",
        ""
      ].join("\n"),
      "app/direct.rs": "mod child;\npub fn direct() -> usize { child::value() }\n",
      "app/direct/child.rs": "pub fn value() -> usize { 1 }\n",
      "app/folder/mod.rs": "mod leaf;\npub fn folder() -> usize { leaf::value() }\n",
      "app/folder/leaf.rs": "pub fn value() -> usize { 1 }\n",
      "shared/explicit.rs": "pub fn explicit() -> usize { 1 }\n",
      "shared/raw.rs": "pub fn raw() -> usize { 1 }\n",
      "app/dual.rs": "pub fn first() -> usize { 1 }\n",
      "app/dual/mod.rs": "pub fn second() -> usize { 2 }\n",
      "app/macro_owned.rs": "pub fn hidden() -> usize { 1 }\n",
      "app/inline/nested_owned.rs": "pub fn nested() -> usize { 1 }\n",
      "app/string_owned.rs": "pub fn string() -> usize { 1 }\n",
      "app/dynamic_owned.rs": "pub fn dynamic() -> usize { 1 }\n",
      "app/cfg_attr_owned.rs": "pub fn configured() -> usize { 1 }\n",
      "app/nested_package/Cargo.toml": "[package]\nname = \"nested\"\nversion = \"0.1.0\"\n",
      "app/nested_package/mod.rs": "pub fn nested_package() -> usize { 1 }\n",
      "tests/suite.rs": "#[test]\nfn runs() { assert_eq!(1, 1); }\n"
    });

    const audit = auditRustRepo(root);
    const ownedPaths = audit.recommended.map((target) => target.path).sort();

    assert.equal(audit.profile.testCommand, "cargo test");
    assert.deepEqual(audit.profile.detectedConventions, [
      "explicit Cargo source target",
      "literal Rust module graph",
      "Cargo integration tests"
    ]);
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(ownedPaths, [
      "app/direct.rs",
      "app/direct/child.rs",
      "app/folder/leaf.rs",
      "app/folder/mod.rs",
      "app/root.rs",
      "shared/explicit.rs",
      "shared/raw.rs"
    ]);
    for (const unownedPath of [
      "app/dual.rs",
      "app/dual/mod.rs",
      "app/cfg_attr_owned.rs",
      "app/dynamic_owned.rs",
      "app/inline/nested_owned.rs",
      "app/macro_owned.rs",
      "app/nested_package/mod.rs",
      "app/string_owned.rs"
    ]) assert.ok(!ownedPaths.includes(unownedPath));
  });

  it("maps exact crate-relative and parent-relative unit-test imports through the logical module graph", (t) => {
    const root = createRustRepo(t, {
      "Cargo.toml": [
        "[package]",
        "name = \"module-evidence\"",
        "version = \"0.1.0\"",
        "",
        "[lib]",
        "path = \"code/root.rs\"",
        ""
      ].join("\n"),
      "code/root.rs": "pub mod helpers;\npub mod nested;\n",
      "code/helpers.rs": [
        "pub fn crate_value() -> usize { 1 }",
        "pub fn integration_value() -> usize { 2 }",
        "pub fn unused_value() -> usize { 3 }",
        "pub struct Factory;",
        ""
      ].join("\n"),
      "code/nested/mod.rs": "pub mod sibling;\npub mod worker;\n",
      "code/nested/sibling.rs": "pub fn sibling_value() -> usize { 4 }\n",
      "code/nested/worker.rs": [
        "pub fn local_value() -> usize { 5 }",
        "#[cfg(test)]",
        "mod tests {",
        "    use crate::helpers::{Factory, crate_value as imported_value, integration_value as shadowed_value, unused_value};",
        "    use super::local_value;",
        "    use super::super::sibling::sibling_value;",
        "    use self::test_only;",
        "    use crate::helpers::*;",
        "    fn helper_only() { unused_value(); }",
        "    fn test_only() -> usize { 0 }",
        "    #[test]",
        "    fn checks_exact_modules() {",
        "        use self::test_only as shadowed_value;",
        "        let _factory = Factory;",
        "        local_value();",
        "        assert_eq!(imported_value(), 1);",
        "        assert_eq!(sibling_value(), 4);",
        "        shadowed_value();",
        "    }",
        "}",
        ""
      ].join("\n"),
      "tests/module_test.rs": [
        "use module_evidence::helpers::integration_value;",
        "#[test]",
        "fn checks_custom_root_module() { assert_eq!(integration_value(), 2); }",
        ""
      ].join("\n")
    });

    const audit = auditRustRepo(root);
    const evidenceByPath = Object.fromEntries(audit.coveredButRisky.map((target) => [
      target.path,
      target.existingTestEvidence
    ]));

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), [
      "code/helpers.rs",
      "code/nested/sibling.rs",
      "code/nested/worker.rs"
    ]);
    assert.deepEqual(evidenceByPath["code/helpers.rs"], [
      {
        testPath: "code/nested/worker.rs",
        kind: "rust-symbol-reference",
        strength: "direct",
        usage: "asserted"
      },
      {
        testPath: "tests/module_test.rs",
        kind: "rust-symbol-reference",
        strength: "direct",
        usage: "asserted"
      }
    ]);
    assert.deepEqual(evidenceByPath["code/nested/sibling.rs"], [{
      testPath: "code/nested/worker.rs",
      kind: "rust-symbol-reference",
      strength: "direct",
      usage: "asserted"
    }]);
    assert.deepEqual(evidenceByPath["code/nested/worker.rs"], [{
      testPath: "code/nested/worker.rs",
      kind: "rust-symbol-reference",
      strength: "direct",
      usage: "called"
    }]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), []);
  });

  it("keeps exact crate imports and direct call usage bounded", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-rust-evidence-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "Cargo.toml"), '[package]\nname = "price-tools"\nversion = "0.1.0"\nedition = "2024"\n');
    fs.writeFileSync(
      path.join(root, "src", "parser.rs"),
      "pub fn parse(value: &str) -> usize { value.len() }\npub fn valid(value: &str) -> bool { !value.is_empty() }\n"
    );
    fs.writeFileSync(path.join(root, "src", "unused.rs"), "pub fn unused(value: &str) -> usize { value.len() }\n");
    fs.writeFileSync(path.join(root, "src", "wrong.rs"), "pub fn wrong(value: &str) -> usize { value.len() }\n");
    fs.writeFileSync(
      path.join(root, "tests", "parser_test.rs"),
      [
        "use price_tools::parser::{parse as parse_value, valid};",
        "use price_tools::unused::unused;",
        "use other_crate::wrong::wrong;",
        "fn helper_only() { unused(\"value\"); }",
        "#[test]",
        "fn parses() {",
        "    let _length = parse_value(\"value\");",
        "    assert!(valid(\"value\"));",
        "    let _fake = \"unused() wrong() #[test]\";",
        "    let _raw = r#\"unused() wrong() #[test]\"#;",
        "    let _brace = '\\u{7d}';",
        "    // unused();",
        "    /* wrong(); /* unused(); */ */",
        "}",
        ""
      ].join("\n")
    );

    const audit = auditRustRepo(root);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/parser.rs"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "tests/parser_test.rs",
      kind: "rust-symbol-reference",
      strength: "direct",
      usage: "asserted"
    }]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/unused.rs", "src/wrong.rs"]);
  });

  it("blocks custom harnesses and packages without built-in tests", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-rust-blocked-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "Cargo.toml"),
      '[package]\nname = "blocked"\nversion = "0.1.0"\n[[test]]\nname = "custom"\nharness = false\n'
    );
    fs.writeFileSync(path.join(root, "src", "lib.rs"), "pub fn value() -> usize { 1 }\n");

    const audit = auditRustRepo(root);
    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "medium");
    assert.deepEqual(audit.profile.testFrameworks, []);
    assert.ok(audit.profile.blockers.includes("Custom Rust test harnesses are outside the bounded built-in test support matrix."));
    assert.ok(audit.profile.blockers.includes("No runnable built-in Rust #[test] detected."));
  });

  it("classifies external boundaries and generated Rust without inflating tests", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-rust-classification-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "Cargo.toml"), '[package]\nname = "classify"\nversion = "0.1.0"\n');
    fs.writeFileSync(path.join(root, "src", "client.rs"), "pub async fn fetch() -> usize { 1 }\n");
    fs.writeFileSync(path.join(root, "src", "formatter.rs"), "pub fn format_value(value: usize) -> String { value.to_string() }\n");
    fs.writeFileSync(path.join(root, "src", "calculator.rs"), "pub fn total(value: usize) -> usize { value + 1 }\n");
    fs.writeFileSync(path.join(root, "src", "generated.rs"), "// @generated\npub fn generated() -> usize { 1 }\n");
    fs.writeFileSync(
      path.join(root, "src", "inline.rs"),
      "pub fn exercised() -> usize { 1 }\n#[cfg(test)]\nmod tests { use super::exercised; #[test] pub(crate) fn checks() { let _ = exercised(); } }\n"
    );

    const audit = auditRustRepo(root);
    const kinds = Object.fromEntries(audit.untestedCandidates.map((target) => [target.path, target.kind]));
    assert.equal(kinds["src/client.rs"], "client");
    assert.equal(kinds["src/formatter.rs"], "transformation");
    assert.equal(kinds["src/calculator.rs"], "calculator");
    assert.ok(audit.untestedCandidates.find((target) => target.path === "src/client.rs").signals.includes("async-or-concurrency"));
    assert.deepEqual(audit.skipped.map((target) => target.path), ["src/generated.rs"]);
    assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].usage, "called");
  });

  it("reports low confidence when neither a Cargo manifest nor built-in tests exist", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-rust-empty-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const audit = auditRustRepo(root);
    assert.equal(audit.profile.confidence, "low");
    assert.deepEqual(audit.profile.packageManagers, []);
    assert.ok(audit.profile.blockers.includes("No root Cargo.toml detected for the bounded Rust package adapter."));
  });
});

function createRustRepo(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-rust-workspace-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  }
  return root;
}

function cargoPackage(name) {
  return `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2024"\n`;
}

function rustSourceWithTest(name) {
  return `pub fn ${name}() -> usize { 1 }\n#[cfg(test)] mod tests { use super::${name}; #[test] fn checks() { assert_eq!(${name}(), 1); } }\n`;
}
