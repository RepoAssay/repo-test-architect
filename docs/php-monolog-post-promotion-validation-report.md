# PHP Monolog Post-Promotion Validation Report

## Scope

This report records the blind live-repository acceptance pass run immediately after PHP reached supported maturity. The candidate was chosen before its audit output was inspected: [`Seldaek/monolog`](https://github.com/Seldaek/monolog) at exact commit [`57eb1028342134e701e77c617565d51b6e5a2a53`](https://github.com/Seldaek/monolog/commit/57eb1028342134e701e77c617565d51b6e5a2a53).

The pass used a tarball installation of Repo Test Architect in an isolated consumer directory for the initial audit. Its purpose was to test the published package path and look for supported-boundary ownership or evidence defects without adding another promotion-corpus role.

## Repository Shape

The exact checkout contains:

- one root `composer.json` with no lockfile by explicit Composer configuration
- one literal `Monolog\` to `src/Monolog/` source mapping and the same namespace mapped to `tests/Monolog/` for development
- 121 owned PHP source files and 94 PHP test/support files
- a literal `phpunit/phpunit` development dependency and root `phpunit.xml.dist`
- an exact `composer test` script containing `@php vendor/bin/phpunit`
- 88 conventional test classes that extend repository-owned `Monolog\Test\MonologTestCase`; that source-owned base directly extends `PHPUnit\Framework\TestCase`
- three test classes that directly extend namespaced PHPUnit `TestCase`, plus one unsupported legacy PHPUnit base
- production and test namespaces that deliberately mirror one another, so most tests use exact unqualified references such as `new Logger()` and `new BufferHandler()`

## Packaged Blind Audit

The installed package correctly returned high confidence, no blockers, and `composer test`. Five process-level audits produced one canonical digest, `074536c06592339a427411da3b8d66177567dc355c578fd31a9f626b6f7e9a12`, with wall-clock samples of 91, 90, 90, 89, and 89 ms.

The candidate split exposed a material evidence gap:

| Measure | Packaged result |
| --- | --- |
| Untested candidates | 104 |
| Covered-but-risky candidates | 4 |
| Skipped targets | 13 |
| Evidence relationships | 4 |

Only the directly runnable PHPUnit classes contributed evidence. The adapter already accepted one exact repository-owned PHPUnit base below the test mapping, but did not apply the same one-hop proof to a base below the source mapping. It therefore excluded most Monolog tests before evidence analysis. It also resolved direct imports but not an unaliased class in the runnable test's own namespace.

## Bounded Change

Runnable PHPUnit ownership now permits one uniquely owned local base from either the literal test or source PSR-4 mappings when that base directly resolves to `PHPUnit\Framework\TestCase`. The traversal still stops after one repository edge. Duplicate FQNs across source and test mappings remain ambiguous and do not make a test runnable.

For each runnable test, an unqualified class reference may now resolve to an exact uniquely owned source FQN in the test's declared namespace. A direct `use` import with the same short name takes precedence, so an external alias cannot leak evidence to the same-named local class. Existing lexical masking, constructor/static-call requirements, assertion rules, and naming fallback remain unchanged.

Focused regressions cover the source-owned base, duplicate cross-root FQN rejection, exact same-namespace resolution, and import-alias shadowing.

## Corrected Repeated Audit

Five unchanged audits of the same checkout after the bounded change again produced one canonical result:

| Measure | Corrected result |
| --- | --- |
| Test command | `composer test` |
| Confidence | high |
| Blockers | none |
| Untested candidates | 25 |
| Covered-but-risky candidates | 83 |
| Skipped targets | 13 |
| Evidence relationships | 125: 117 direct symbol references and 8 naming relationships |
| Evidence usage | 3 asserted, 114 called, 8 naming |
| Test files contributing evidence | 81 |
| Process-level durations | 147, 145, 144, 145, 145 ms |
| Canonical SHA-256 | `ad21f9a5825e5bd16a6ec6553f291ae5eca5a9418e1a92f3ef468ba91025b1f9` |

The 79 candidate transitions are backed by exact source ownership and runnable test paths. Representative recovered targets include `Logger`, `LineFormatter`, `BufferHandler`, `TestHandler`, `Level`, and the processor and handler classes instantiated inside their matching namespaces. The remaining 25 candidates are mainly interfaces, traits, utilities, and sources exercised through unsupported inheritance, helper, or dynamic receiver flow.

## Native Command Review

The checkout intentionally disables lockfile creation. A normal `composer install` stopped because the local PHP runtime lacks `ext-mongodb`; a second isolated install used `--ignore-platform-req=ext-mongodb` so the declared command itself could still be exercised without changing repository sources.

The adapter-selected command was then run unchanged:

```text
composer test
```

It executed 1,178 tests and 2,151 assertions in 4.66 seconds, ending with 2 errors, 1 failure, 30 environment-dependent skips, 11 deprecations, and 220 PHPUnit deprecations. The two errors pass arrays to newly typed formatter entrypoints in tests added by the exact pinned commit; the failure is in `ErrorHandlerTest` on the local PHP 8.5 runtime. Missing MongoDB, Redis, AMQP, CouchDB, Elasticsearch, Zend Server, and Mercurial support account for the skips.

This is not an adapter regression or a hidden passing native result. The upstream Continuous Integration workflow for the exact commit also concluded `failure`, while its lint workflow passed. Monolog's CI provisions MongoDB/CouchDB and extensions and runs separate Elasticsearch jobs, so the full command remains repository-owned but is not a portable fresh-checkout suite on this host.

## Remaining Boundary

The adapter does not infer arbitrary PHPUnit suite setup from CI workflows, provision extensions or services, reinterpret upstream failures, follow more than one repository-owned test-base edge, resolve duplicate FQNs, credit inheritance itself as source-call evidence, evaluate `@covers` documentation, or infer dynamic and receiver-based ownership beyond the existing bounded rules.

## Result

The post-promotion audit did what a blind live test should do: it confirmed package installation, project ownership, command selection, deterministic output, and performance while exposing one exact evidence blind spot. The corrected adapter recognizes Monolog's source-owned PHPUnit base and mirrored namespaces without widening to arbitrary inheritance or name resolution. The current upstream/native failure remains visible and separate from the static audit's confidence claim.
