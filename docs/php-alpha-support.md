# PHP Experimental Support

The PHP adapter begins as an experimental, deliberately bounded Composer/PHPUnit adapter. It uses the same audit, plan, explanation, ranking, project-analysis, CLI, MCP, schema, golden, model-consistency, coverage, and generated-performance contracts as the supported adapters, but it has not yet earned supported-alpha maturity through live repository pressure and the shared three-role corpus.

## Supported in the foundation slice

- one root `composer.json`; nested Composer roots are separate projects and are not traversed
- valid literal JSON metadata
- non-empty, string-valued `autoload.psr-4` source mappings and `autoload-dev.psr-4` test mappings whose directories exist inside the project root
- a literal `phpunit/phpunit` entry in `require-dev`
- runnable `*Test.php` classes that extend `TestCase` and contain a public `test*` method
- exact Composer test scripts of `phpunit`, `vendor/bin/phpunit`, or `@php vendor/bin/phpunit`; otherwise the conventional `vendor/bin/phpunit` fallback
- direct imported PSR-4 class calls, with bounded assertion usage, plus unique `Class.php` to `ClassTest.php` naming fallback
- basic runtime, branching/error, boundary, and constants-only classification
- repository-relative and absolute changed-path scoping

## Explicit exclusions

This slice does not evaluate Composer plugins or scripts, PSR-0, classmap or files autoloading, array-valued mappings, custom PHPUnit suite paths, PHPUnit attributes, Pest, Codeception, framework ownership, inheritance or trait dispatch, container resolution, dynamic class names, aliases beyond direct `use` imports, or multi-hop calls. Unsupported or ambiguous metadata produces blockers instead of guessed ownership or commands.

## Verification

```sh
npm run php:native:check
npm run php:performance:check
node --test test/php-audit.test.js test/adapter-conformance.test.js
```

The native fixture resolves the committed Composer lock and runs PHPUnit. The generated gate audits 400 PSR-4 source classes and 200 tests, requiring exactly 200 covered targets, 200 untested targets, and 200 evidence relationships within five seconds.

Promotion requires representative live repositories, regression-backed widening from observed gaps, all three shared validation-corpus roles, repeated digest stability, native command proof, and the remaining adapter-hardening gates.
