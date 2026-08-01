# PHP Alpha Support

The PHP adapter is supported at a deliberately bounded Composer/PHPUnit boundary. It uses the same audit, plan, explanation, ranking, project-analysis, CLI, MCP, schema, golden, model-consistency, coverage, and generated-performance contracts as the other supported adapters without claiming general PHP framework coverage.

## Supported baseline

- one root `composer.json`; nested Composer roots are separate projects and are not traversed
- valid literal JSON metadata
- non-empty, string-valued `autoload.psr-4` source mappings and `autoload-dev.psr-4` test mappings whose directories exist inside the project root
- unique literal repository-contained `autoload.files` PHP function files below an owned PSR-4 source root, with one matching namespace and no class-like declarations
- a literal `phpunit/phpunit` entry in `require-dev`
- runnable `*Test.php` classes that extend `TestCase` and contain a public `test*` method
- exact Composer PHPUnit test scripts or one bounded literal quality-script alias graph ending in PHPUnit; otherwise the conventional `vendor/bin/phpunit` fallback
- bounded root PHPUnit bootstrap inspection that withholds the fallback when a literal required environment read can terminate non-zero
- bounded root Makefile inspection that withholds bare PHPUnit when the exact `test` target has literal prerequisite orchestration and an exact PHPUnit recipe
- one-hop PHPUnit test ownership through one uniquely PSR-4-owned local base below either the test or source mappings that directly extends `PHPUnit\Framework\TestCase`
- direct imported or exact same-namespace PSR-4 class calls, with explicit import aliases taking precedence, plus exact same-line `expectException(Class::class)` evidence and one nearby asserted local result from an owned static call
- unique `Class.php` to `ClassTest.php` naming fallback
- basic runtime, branching/error, boundary, and constants-only classification
- repository-relative and absolute changed-path scoping

## Explicit exclusions

The supported boundary does not evaluate Composer plugins, event scripts, arbitrary commands or shell syntax, arbitrary Make syntax or recipes, PSR-0, classmap, generated or escaping file autoloading, array-valued PSR-4 mappings, custom PHPUnit suite paths, PHPUnit attributes, Pest, Codeception, framework ownership, test-base inheritance beyond one unique local edge, trait dispatch, container resolution, dynamic class names, aliases beyond direct `use` imports, function-call evidence, or multi-hop calls. Dynamic exception-class variables, data-provider flow, reassigned local results, arbitrary helper semantics, and result flow across method boundaries remain excluded. It does not choose bootstrap environment values, emit a Make command, or evaluate arbitrary bootstrap control flow. Unsupported or ambiguous metadata produces blockers instead of guessed ownership or commands.

The live validation against [`brick/math`](php-brick-math-validation-report.md) proved the bootstrap guard, one-hop local `AbstractTestCase`, exact exception expectations, and bounded asserted-result evidence. The service-shaped [`guzzle/guzzle`](php-guzzle-validation-report.md) pass then proved that bare PHPUnit can omit statically declared Make prerequisites: its native `make test` passes 2,928 tests while the bare command produces 50 integration errors. [`ramsey/uuid`](php-ramsey-uuid-validation-report.md) proves a bounded Composer quality-script graph and literal autoloaded function ownership; its final audit is high-confidence and blocker-free with 29 untested, 54 covered, 31 skipped, and 168 relationships, while its native `composer test` workflow passes lint, benchmark, static analysis, and 2,022 PHPUnit tests. The blind post-promotion [`Seldaek/monolog`](php-monolog-post-promotion-validation-report.md) pass extends the same one-hop proof to a uniquely source-owned PHPUnit base and resolves exact same-namespace references while preserving alias-shadow and ambiguity controls.

## Promotion result

PHP fills the shared promotion corpus with three exact public-repository pins:

- brick/math is the conventional-library/service role at `b61d8e66c3ea05fa8784888575b719f48f76f515`
- Guzzle is the framework-heavy role at `9b200fc5805036b331d6031199880dadecae0275`
- Ramsey UUID is the difficult-ownership role at `da5b521600a707d2dd097598464bd3090de850f5`

All 21 PHP detection, ownership, command, evidence, ranking, stability, and performance areas pass. The command review explicitly passes safe withholding: brick/math records `testCommand: null` because its bootstrap requires a calculator choice, and Guzzle records `testCommand: null` because bare PHPUnit omits required service orchestration. Ramsey UUID records the proven `composer test` workflow.

Fresh five-run measurements are canonical-digest stable. brick/math reports 7 untested, 14 covered, 1 skipped, 34 relationships, and a 32 ms median; Guzzle reports 12 untested, 39 covered, 17 skipped, 112 relationships, and an 83 ms median; Ramsey UUID reports 29 untested, 54 covered, 31 skipped, 168 relationships, and a 32 ms median. Their repository-native workflows pass 22,160 brick/math tests with 89,659 assertions, 2,928 Guzzle tests with 8,445 assertions and 13 skips, and 2,022 Ramsey UUID tests with 88,398 assertions and 7 skips after lint, benchmark, and static analysis.

The native fixture, shared conformance, implementation coverage, generated performance, golden/model-consistency, packaging, and cross-platform gates provide the same promotion infrastructure as the other supported adapters. Supported maturity remains limited to this matrix; general Composer evaluation, framework semantics, arbitrary setup orchestration, and the exclusions above are not implied.

## Verification

```sh
npm run php:native:check
npm run php:performance:check
node --test test/php-audit.test.js test/adapter-conformance.test.js
```

The native fixture resolves the committed Composer lock and runs PHPUnit. The generated gate audits 400 PSR-4 source classes and 200 tests, requiring exactly 200 covered targets, 200 untested targets, and 200 evidence relationships within five seconds.
