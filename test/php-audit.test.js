import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditPhpRepo } from "../src/adapters/php/audit.js";

describe("PHP adapter", () => {
  it("audits the bounded Composer and PHPUnit fixture", () => {
    const root = path.resolve("examples/php-phpunit-basic");
    const audit = auditPhpRepo(root);

    assert.deepEqual(audit.profile.languages, ["php"]);
    assert.deepEqual(audit.profile.packageManagers, ["composer"]);
    assert.deepEqual(audit.profile.testFrameworks, ["phpunit"]);
    assert.deepEqual(audit.profile.architectures, ["composer-psr4"]);
    assert.equal(audit.profile.testCommand, "composer test");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/Parser.php"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/Service.php"]);
    assert.deepEqual(audit.skipped.map((target) => target.path), ["src/Defaults.php"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "tests/ParserTest.php",
      kind: "php-symbol-reference",
      strength: "direct",
      usage: "asserted"
    }]);
  });

  it("uses vendor/bin/phpunit when no exact Composer test script is present", () => {
    const root = createRepo({ script: undefined });
    const audit = auditPhpRepo(root);
    assert.equal(audit.profile.testCommand, "vendor/bin/phpunit");
    assert.deepEqual(audit.profile.blockers, []);
  });

  it("blocks unsupported metadata instead of guessing ownership or commands", () => {
    const root = createRepo({
      autoload: { "psr-0": { "Example\\": "lib/" } },
      autoloadDev: { "psr-4": { "Example\\Tests\\": ["tests/", "spec/"] } },
      requireDev: {},
      script: "vendor/bin/phpunit --testsuite unit"
    });
    const audit = auditPhpRepo(root);

    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "low");
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("autoload.psr-4")));
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("string-valued")));
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("phpunit/phpunit")));
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("Composer test script")));
  });

  it("ignores nested Composer roots and non-PSR-4 PHP files", () => {
    const root = createRepo();
    fs.mkdirSync(path.join(root, "packages", "nested", "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "packages", "nested", "composer.json"), "{}\n");
    fs.writeFileSync(path.join(root, "packages", "nested", "src", "Nested.php"), "<?php class Nested {}\n");
    fs.writeFileSync(path.join(root, "bootstrap.php"), "<?php function boot() {}\n");

    const audit = auditPhpRepo(root);
    assert.deepEqual(audit.recommended.map((target) => target.path), ["src/Parser.php"]);
  });

  it("withholds evidence when the declared class does not match its PSR-4 path", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "src", "Parser.php"), "<?php\nnamespace Other;\nfinal class Parser { public static function parse(string $value): string { return trim($value); } }\n");

    const audit = auditPhpRepo(root);
    assert.equal(audit.profile.testCommand, undefined);
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("declared PSR-4 class")));
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/Parser.php"]);
  });

  it("normalizes changed paths and scopes actionable source targets", () => {
    const root = path.resolve("examples/php-phpunit-basic");
    const audit = auditPhpRepo(root, {
      changedPaths: [path.join(root, "src", "Service.php"), "src\\Defaults.php"]
    });

    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/Service.php"]);
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped.map((target) => target.path), ["src/Defaults.php"]);
  });

  it("reports malformed Composer metadata without throwing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-php-invalid-"));
    fs.writeFileSync(path.join(root, "composer.json"), "{ invalid\n");
    const audit = auditPhpRepo(root);
    assert.equal(audit.profile.confidence, "low");
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("valid JSON")));
  });
});

function createRepo(options = {}) {
  const {
    autoload = { "psr-4": { "Example\\": "src/" } },
    autoloadDev = { "psr-4": { "Example\\Tests\\": "tests/" } },
    requireDev = { "phpunit/phpunit": "^12.0" }
  } = options;
  const script = Object.hasOwn(options, "script") ? options.script : "phpunit";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-php-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  const composer = {
    require: { php: ">=8.2" },
    "require-dev": requireDev,
    autoload,
    "autoload-dev": autoloadDev,
    ...(script === undefined ? {} : { scripts: { test: script } })
  };
  fs.writeFileSync(path.join(root, "composer.json"), `${JSON.stringify(composer, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "src", "Parser.php"), "<?php\nnamespace Example;\nfinal class Parser { public static function parse(string $value): string { return trim($value); } }\n");
  fs.writeFileSync(path.join(root, "tests", "ParserTest.php"), "<?php\nnamespace Example\\Tests;\nuse Example\\Parser;\nuse PHPUnit\\Framework\\TestCase;\nfinal class ParserTest extends TestCase { public function testParse(): void { self::assertSame('x', Parser::parse(' x ')); } }\n");
  return root;
}
