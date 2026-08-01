# PHP Experimental Support

The PHP adapter begins as an experimental, deliberately bounded Composer/PHPUnit adapter. It uses the same audit, plan, explanation, ranking, project-analysis, CLI, MCP, schema, golden, model-consistency, coverage, and generated-performance contracts as the supported adapters, but it has not yet earned supported-alpha maturity through live repository pressure and the shared three-role corpus.

## Supported in the foundation slice

- one root `composer.json`; nested Composer roots are separate projects and are not traversed
- valid literal JSON metadata
- non-empty, string-valued `autoload.psr-4` source mappings and `autoload-dev.psr-4` test mappings whose directories exist inside the project root
- unique literal repository-contained `autoload.files` PHP function files below an owned PSR-4 source root, with one matching namespace and no class-like declarations
- a literal `phpunit/phpunit` entry in `require-dev`
- runnable `*Test.php` classes that extend `TestCase` and contain a public `test*` method
- exact Composer PHPUnit test scripts or one bounded literal quality-script alias graph ending in PHPUnit; otherwise the conventional `vendor/bin/phpunit` fallback
- bounded root PHPUnit bootstrap inspection that withholds the fallback when a literal required environment read can terminate non-zero
- bounded root Makefile inspection that withholds bare PHPUnit when the exact `test` target has literal prerequisite orchestration and an exact PHPUnit recipe
- one-hop PHPUnit test ownership through one uniquely PSR-4-owned local base that directly extends `PHPUnit\Framework\TestCase`
- direct imported PSR-4 class calls, exact same-line `expectException(Class::class)` evidence, and one nearby asserted local result from an owned static call
- unique `Class.php` to `ClassTest.php` naming fallback
- basic runtime, branching/error, boundary, and constants-only classification
- repository-relative and absolute changed-path scoping

## Explicit exclusions

This slice does not evaluate Composer plugins, event scripts, arbitrary commands or shell syntax, arbitrary Make syntax or recipes, PSR-0, classmap, generated or escaping file autoloading, array-valued PSR-4 mappings, custom PHPUnit suite paths, PHPUnit attributes, Pest, Codeception, framework ownership, test-base inheritance beyond one unique local edge, trait dispatch, container resolution, dynamic class names, aliases beyond direct `use` imports, function-call evidence, or multi-hop calls. Dynamic exception-class variables, data-provider flow, reassigned local results, arbitrary helper semantics, and result flow across method boundaries remain excluded. It does not choose bootstrap environment values, emit a Make command, or evaluate arbitrary bootstrap control flow. Unsupported or ambiguous metadata produces blockers instead of guessed ownership or commands.

The live validation against [`brick/math`](php-brick-math-validation-report.md) proved the bootstrap guard, one-hop local `AbstractTestCase`, exact exception expectations, and bounded asserted-result evidence. The service-shaped [`guzzle/guzzle`](php-guzzle-validation-report.md) pass then proved that bare PHPUnit can omit statically declared Make prerequisites: its native `make test` passes 2,928 tests while the bare command produces 50 integration errors. [`ramsey/uuid`](php-ramsey-uuid-validation-report.md) proves a bounded Composer quality-script graph and literal autoloaded function ownership; its final audit is high-confidence and blocker-free with 29 untested, 54 covered, 31 skipped, and 168 relationships, while its native `composer test` workflow passes lint, benchmark, static analysis, and 2,022 PHPUnit tests.

## Verification

```sh
npm run php:native:check
npm run php:performance:check
node --test test/php-audit.test.js test/adapter-conformance.test.js
```

The native fixture resolves the committed Composer lock and runs PHPUnit. The generated gate audits 400 PSR-4 source classes and 200 tests, requiring exactly 200 covered targets, 200 untested targets, and 200 evidence relationships within five seconds.

Promotion requires representative live repositories, regression-backed widening from observed gaps, all three shared validation-corpus roles, repeated digest stability, native command proof, and the remaining adapter-hardening gates.
