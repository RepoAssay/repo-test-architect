# PHP Experimental Support

The PHP adapter begins as an experimental, deliberately bounded Composer/PHPUnit adapter. It uses the same audit, plan, explanation, ranking, project-analysis, CLI, MCP, schema, golden, model-consistency, coverage, and generated-performance contracts as the supported adapters, but it has not yet earned supported-alpha maturity through live repository pressure and the shared three-role corpus.

## Supported in the foundation slice

- one root `composer.json`; nested Composer roots are separate projects and are not traversed
- valid literal JSON metadata
- non-empty, string-valued `autoload.psr-4` source mappings and `autoload-dev.psr-4` test mappings whose directories exist inside the project root
- a literal `phpunit/phpunit` entry in `require-dev`
- runnable `*Test.php` classes that extend `TestCase` and contain a public `test*` method
- exact Composer test scripts of `phpunit`, `vendor/bin/phpunit`, or `@php vendor/bin/phpunit`; otherwise the conventional `vendor/bin/phpunit` fallback
- bounded root PHPUnit bootstrap inspection that withholds the fallback when a literal required environment read can terminate non-zero
- one-hop PHPUnit test ownership through one uniquely PSR-4-owned local base that directly extends `PHPUnit\Framework\TestCase`
- direct imported PSR-4 class calls, with bounded assertion usage, plus unique `Class.php` to `ClassTest.php` naming fallback
- basic runtime, branching/error, boundary, and constants-only classification
- repository-relative and absolute changed-path scoping

## Explicit exclusions

This slice does not evaluate Composer plugins or scripts, PSR-0, classmap or files autoloading, array-valued mappings, custom PHPUnit suite paths, PHPUnit attributes, Pest, Codeception, framework ownership, test-base inheritance beyond one unique local edge, trait dispatch, container resolution, dynamic class names, aliases beyond direct `use` imports, or multi-hop calls. It does not choose bootstrap environment values or evaluate arbitrary bootstrap control flow. Unsupported or ambiguous metadata produces blockers instead of guessed ownership or commands.

The first live validation against [`brick/math`](php-brick-math-validation-report.md) proved that an otherwise conventional PHPUnit command can require an explicit bootstrap environment choice. The adapter now withholds that unsafe default and recognizes all five concrete tests behind brick/math's one-hop local `AbstractTestCase`. Helper-mediated assertions and fluent instance-call evidence remain the next concrete gap.

## Verification

```sh
npm run php:native:check
npm run php:performance:check
node --test test/php-audit.test.js test/adapter-conformance.test.js
```

The native fixture resolves the committed Composer lock and runs PHPUnit. The generated gate audits 400 PSR-4 source classes and 200 tests, requiring exactly 200 covered targets, 200 untested targets, and 200 evidence relationships within five seconds.

Promotion requires representative live repositories, regression-backed widening from observed gaps, all three shared validation-corpus roles, repeated digest stability, native command proof, and the remaining adapter-hardening gates.
