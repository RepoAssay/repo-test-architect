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

  it("withholds bare PHPUnit when the exact Make test target requires prerequisite orchestration", () => {
    const root = createRepo({ script: undefined });
    fs.writeFileSync(path.join(root, "Makefile"), `start-server:
\tnode test-server.js &

test: start-server
\tvendor/bin/phpunit
`);

    const audit = auditPhpRepo(root);
    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "medium");
    assert.ok(audit.profile.setupSignals.includes("Makefile"));
    assert.deepEqual(audit.profile.blockers, [
      "Root Makefile test target requires prerequisite orchestration (start-server); bare PHPUnit is not a safe default."
    ]);
  });

  it("does not infer Make orchestration from an unrelated prerequisite target", () => {
    const root = createRepo({ script: undefined });
    fs.writeFileSync(path.join(root, "Makefile"), `start-server:
\tnode test-server.js &

test:
\tvendor/bin/phpunit
`);

    const audit = auditPhpRepo(root);
    assert.equal(audit.profile.testCommand, "vendor/bin/phpunit");
    assert.deepEqual(audit.profile.blockers, []);
  });

  it("keeps an exact Composer command independent from Make prerequisites", () => {
    const root = createRepo({ script: "phpunit" });
    fs.writeFileSync(path.join(root, "Makefile"), `test: start-server
\tvendor/bin/phpunit
`);

    const audit = auditPhpRepo(root);
    assert.equal(audit.profile.testCommand, "composer test");
    assert.deepEqual(audit.profile.blockers, []);
  });

  it("selects a bounded literal Composer quality-script graph ending in PHPUnit", () => {
    const root = createRepo({
      scripts: {
        test: "@dev:test",
        "dev:test": ["@dev:lint", "@dev:analyze", "@dev:test:unit"],
        "dev:lint": ["@dev:lint:syntax", "@dev:lint:style"],
        "dev:lint:syntax": "parallel-lint --colors src/ tests/",
        "dev:lint:style": "phpcs --colors",
        "dev:analyze": "phpstan analyse --ansi",
        "dev:test:unit": "phpunit --colors=always"
      }
    });

    const audit = auditPhpRepo(root);
    assert.equal(audit.profile.testCommand, "composer test");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.detectedConventions.includes("bounded Composer quality-script graph"));
  });

  it("blocks unsafe, unresolved, cyclic, and PHPUnit-free Composer script graphs", () => {
    const graphs = [
      [],
      { test: "@dev:test", "dev:test": ["@dev:test:unit", "rm -rf build"], "dev:test:unit": "phpunit" },
      { test: "@dev:test", "dev:test": "@missing" },
      { test: "@dev:test", "dev:test": "@dev:unit", "dev:unit": "@dev:test" },
      { test: "@dev:test", "dev:test": ["@dev:lint"], "dev:lint": "phpcs --colors" }
    ];

    for (const scripts of graphs) {
      const audit = auditPhpRepo(createRepo({ scripts }));
      assert.equal(audit.profile.testCommand, undefined);
      assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("Composer test script")));
    }
  });

  it("recognizes a test through one uniquely owned local PHPUnit base", () => {
    const root = createRepo();
    fs.writeFileSync(
      path.join(root, "tests", "AbstractTestCase.php"),
      "<?php\nnamespace Example\\Tests;\nuse PHPUnit\\Framework\\TestCase;\nabstract class AbstractTestCase extends TestCase {}\n"
    );
    fs.writeFileSync(
      path.join(root, "tests", "ParserTest.php"),
      "<?php\nnamespace Example\\Tests;\nuse Example\\Parser;\nfinal class ParserTest extends AbstractTestCase { public function testParse(): void { self::assertSame('x', Parser::parse(' x ')); } }\n"
    );
    fs.mkdirSync(path.join(root, "tests", "Internal"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "tests", "Internal", "ParserTest.php"),
      "<?php\nnamespace Example\\Tests\\Internal;\nuse Example\\Parser;\nuse Example\\Tests\\AbstractTestCase;\nfinal class ParserTest extends AbstractTestCase { public function testParseAgain(): void { self::assertSame('y', Parser::parse(' y ')); } }\n"
    );

    const audit = auditPhpRepo(root);
    assert.deepEqual(audit.profile.blockers, []);
    assert.equal(audit.profile.testCommand, "composer test");
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [
      {
        testPath: "tests/Internal/ParserTest.php",
        kind: "php-symbol-reference",
        strength: "direct",
        usage: "asserted"
      },
      {
        testPath: "tests/ParserTest.php",
        kind: "php-symbol-reference",
        strength: "direct",
        usage: "asserted"
      }
    ]);
  });

  it("records a direct PHPUnit exception expectation as asserted evidence", () => {
    const root = createRepo();
    fs.writeFileSync(
      path.join(root, "src", "ParseException.php"),
      "<?php\nnamespace Example;\nfinal class ParseException extends \\RuntimeException { public static function invalid(): self { return new self('invalid'); } }\n"
    );
    fs.writeFileSync(
      path.join(root, "tests", "ParserTest.php"),
      "<?php\nnamespace Example\\Tests;\nuse Example\\ParseException;\nuse Example\\Parser;\nuse PHPUnit\\Framework\\TestCase;\nfinal class ParserTest extends TestCase { public function testParse(): void { $this->expectException(ParseException::class); Parser::parse(''); } }\n"
    );

    const audit = auditPhpRepo(root);
    const exception = audit.coveredButRisky.find((target) => target.path === "src/ParseException.php");
    assert.deepEqual(exception?.existingTestEvidence, [{
      testPath: "tests/ParserTest.php",
      kind: "php-exception-expectation",
      strength: "direct",
      usage: "asserted"
    }]);
  });

  it("ignores exception-expectation syntax inside a string literal", () => {
    const root = createRepo();
    fs.writeFileSync(
      path.join(root, "src", "ParseException.php"),
      "<?php\nnamespace Example;\nfinal class ParseException extends \\RuntimeException { public static function invalid(): self { return new self('invalid'); } }\n"
    );
    fs.writeFileSync(
      path.join(root, "tests", "ParserTest.php"),
      "<?php\nnamespace Example\\Tests;\nuse Example\\ParseException;\nuse PHPUnit\\Framework\\TestCase;\nfinal class ParserTest extends TestCase { public function testMessage(): void { self::assertSame('expectException(ParseException::class)', 'expectException(ParseException::class)'); } }\n"
    );

    const audit = auditPhpRepo(root);
    assert.ok(audit.untestedCandidates.some((target) => target.path === "src/ParseException.php"));
  });

  it("carries asserted evidence through one nearby local factory result", () => {
    const root = createRepo();
    fs.writeFileSync(
      path.join(root, "src", "Parser.php"),
      "<?php\nnamespace Example;\nfinal class Parser { private function __construct(private string $value) {} public static function from(string $value): self { return new self(trim($value)); } public function value(): string { return $this->value; } }\n"
    );
    fs.writeFileSync(
      path.join(root, "tests", "ParserTest.php"),
      "<?php\nnamespace Example\\Tests;\nuse Example\\Parser;\nuse PHPUnit\\Framework\\TestCase;\nfinal class ParserTest extends TestCase { public function testParse(): void { $result = Parser::from(' x '); self::assertParserValue('x', $result->value()); } private static function assertParserValue(string $expected, string $actual): void { self::assertSame($expected, $actual); } }\n"
    );

    const audit = auditPhpRepo(root);
    assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].usage, "asserted");
  });

  it("does not carry local-result evidence through reassignment", () => {
    const root = createRepo();
    fs.writeFileSync(
      path.join(root, "src", "Parser.php"),
      "<?php\nnamespace Example;\nfinal class Parser { private function __construct(private string $value) {} public static function from(string $value): self { return new self(trim($value)); } public function value(): string { return $this->value; } }\n"
    );
    fs.writeFileSync(
      path.join(root, "tests", "ParserTest.php"),
      "<?php\nnamespace Example\\Tests;\nuse Example\\Parser;\nuse PHPUnit\\Framework\\TestCase;\nfinal class ParserTest extends TestCase { public function testParse(): void { $result = Parser::from(' x '); $result = replacement(); self::assertSame('x', $result->value()); } }\n"
    );

    const audit = auditPhpRepo(root);
    assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].usage, "called");
  });

  it("does not carry local-result evidence across a method boundary", () => {
    const root = createRepo();
    fs.writeFileSync(
      path.join(root, "src", "Parser.php"),
      "<?php\nnamespace Example;\nfinal class Parser { private function __construct(private string $value) {} public static function from(string $value): self { return new self(trim($value)); } public function value(): string { return $this->value; } }\n"
    );
    fs.writeFileSync(
      path.join(root, "tests", "ParserTest.php"),
      "<?php\nnamespace Example\\Tests;\nuse Example\\Parser;\nuse PHPUnit\\Framework\\TestCase;\nfinal class ParserTest extends TestCase { private function prepare(): void { $result = Parser::from(' x '); } public function testParse(Parser $result): void { self::assertSame('x', $result->value()); } }\n"
    );

    const audit = auditPhpRepo(root);
    assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].usage, "called");
  });

  it("does not follow more than one repository-owned test-base edge", () => {
    const root = createRepo();
    fs.mkdirSync(path.join(root, "tests", "Support"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "tests", "Support", "PhpUnitTestCase.php"),
      "<?php\nnamespace Example\\Tests\\Support;\nuse PHPUnit\\Framework\\TestCase;\nabstract class PhpUnitTestCase extends TestCase {}\n"
    );
    fs.writeFileSync(
      path.join(root, "tests", "Support", "AbstractTestCase.php"),
      "<?php\nnamespace Example\\Tests\\Support;\nabstract class AbstractTestCase extends PhpUnitTestCase {}\n"
    );
    fs.writeFileSync(
      path.join(root, "tests", "ParserTest.php"),
      "<?php\nnamespace Example\\Tests;\nuse Example\\Parser;\nuse Example\\Tests\\Support\\AbstractTestCase;\nfinal class ParserTest extends AbstractTestCase { public function testParse(): void { self::assertSame('x', Parser::parse(' x ')); } }\n"
    );

    const audit = auditPhpRepo(root);
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("No runnable conventional PHPUnit")));
    assert.deepEqual(audit.coveredButRisky, []);
  });

  it("withholds one-hop test ownership when the local base class is ambiguous", () => {
    const root = createRepo({
      autoloadDev: {
        "psr-4": {
          "Example\\Tests\\": "tests/",
          "Example\\": "shadow/"
        }
      }
    });
    fs.mkdirSync(path.join(root, "tests", "Support"), { recursive: true });
    fs.mkdirSync(path.join(root, "shadow", "Tests", "Support"), { recursive: true });
    const localBase = "<?php\nnamespace Example\\Tests\\Support;\nuse PHPUnit\\Framework\\TestCase;\nabstract class AbstractTestCase extends TestCase {}\n";
    fs.writeFileSync(path.join(root, "tests", "Support", "AbstractTestCase.php"), localBase);
    fs.writeFileSync(path.join(root, "shadow", "Tests", "Support", "AbstractTestCase.php"), localBase);
    fs.writeFileSync(
      path.join(root, "tests", "ParserTest.php"),
      "<?php\nnamespace Example\\Tests;\nuse Example\\Parser;\nuse Example\\Tests\\Support\\AbstractTestCase;\nfinal class ParserTest extends AbstractTestCase { public function testParse(): void { self::assertSame('x', Parser::parse(' x ')); } }\n"
    );

    const audit = auditPhpRepo(root);
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("No runnable conventional PHPUnit")));
    assert.deepEqual(audit.coveredButRisky, []);
  });

  it("withholds a default command when the PHPUnit bootstrap requires an environment choice", () => {
    const root = createRepo({ script: undefined });
    fs.writeFileSync(
      path.join(root, "phpunit.xml"),
      '<?xml version="1.0"?><phpunit bootstrap="phpunit.php"><testsuites><testsuite name="unit"><directory>tests</directory></testsuite></testsuites></phpunit>\n'
    );
    fs.writeFileSync(
      path.join(root, "phpunit.php"),
      "<?php\n$calculator = getenv('CALCULATOR');\nif ($calculator === false) { exit(1); }\n$scale = getenv('OPTIONAL_SCALE');\nif ($scale !== false) { configure($scale); }\n"
    );

    const audit = auditPhpRepo(root);
    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "medium");
    assert.ok(audit.profile.setupSignals.includes("phpunit.php"));
    assert.ok(audit.profile.blockers.includes(
      "PHPUnit bootstrap phpunit.php requires explicit environment selection for CALCULATOR; no default test command is safe."
    ));
  });

  it("recognizes a literal bootstrap switch default without treating optional environment reads as required", () => {
    const root = createRepo({ script: undefined });
    fs.writeFileSync(path.join(root, "phpunit.xml"), '<phpunit bootstrap="phpunit.php"/>\n');
    fs.writeFileSync(path.join(root, "phpunit.php"), `<?php
switch ($calculator = getenv('CALCULATOR')) {
    case 'Native': configureNative(); break;
    default: exit(1);
}
$scale = getenv('OPTIONAL_SCALE');
if ($scale !== false) { configureScale($scale); }
`);

    const audit = auditPhpRepo(root);
    assert.deepEqual(audit.profile.blockers, [
      "PHPUnit bootstrap phpunit.php requires explicit environment selection for CALCULATOR; no default test command is safe."
    ]);
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
  const scripts = Object.hasOwn(options, "scripts")
    ? options.scripts
    : (script === undefined ? undefined : { test: script });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-php-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  const composer = {
    require: { php: ">=8.2" },
    "require-dev": requireDev,
    autoload,
    "autoload-dev": autoloadDev,
    ...(scripts === undefined ? {} : { scripts })
  };
  fs.writeFileSync(path.join(root, "composer.json"), `${JSON.stringify(composer, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "src", "Parser.php"), "<?php\nnamespace Example;\nfinal class Parser { public static function parse(string $value): string { return trim($value); } }\n");
  fs.writeFileSync(path.join(root, "tests", "ParserTest.php"), "<?php\nnamespace Example\\Tests;\nuse Example\\Parser;\nuse PHPUnit\\Framework\\TestCase;\nfinal class ParserTest extends TestCase { public function testParse(): void { self::assertSame('x', Parser::parse(' x ')); } }\n");
  return root;
}
