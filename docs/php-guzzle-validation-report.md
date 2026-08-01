# PHP Guzzle Live Validation Report

## Scope

This report records the service-shaped pressure pass for the experimental PHP adapter. The selected checkout is [`guzzle/guzzle`](https://github.com/guzzle/guzzle) at exact source commit [`9b200fc5805036b331d6031199880dadecae0275`](https://github.com/guzzle/guzzle/commit/9b200fc5805036b331d6031199880dadecae0275).

The pass asks whether a large Composer/PHPUnit library with repository-managed HTTP services can be audited without mistaking the PHPUnit executable for its complete verification workflow. It does not promote PHP or infer a portable replacement command.

## Repository Shape

At the selected pin, Guzzle has:

- one root `composer.json` with literal `GuzzleHttp\` to `src/` and `GuzzleHttp\Tests\` to `tests/` PSR-4 mappings
- a literal PHPUnit development dependency and 54 conventional PHPUnit test files
- 68 owned production sources
- a root `phpunit.xml.dist` and repository-owned `tests/bootstrap.php`
- a root `Makefile` whose `test` target depends on `start-server`
- two native integration services: the bootstrap-managed bundled server and the Make-managed HTTP test server
- no committed Composer lock file at this pin

Dependencies were installed locally with Composer on PHP 8.5.9. Because the repository does not pin a lock file, the exact source checkout is reproducible while this local dependency resolution is not claimed as a permanently pinned dependency graph.

## Blind Audit And Native Validation

Before inspecting the repository workflow, the adapter returned high confidence and selected:

```text
vendor/bin/phpunit
```

That command ran the suite but failed its integration boundary:

```text
Tests: 2928, Assertions: 7599, Errors: 50, Skipped: 13.
```

All 50 errors were connection failures to `127.0.0.1:10000`. The PHPUnit bootstrap starts the bundled Node-backed server used on port 8126, but it does not start the separate HTTP test server required on port 10000. The root Make workflow owns that additional setup through the exact dependency `test: start-server`.

The repository-native workflow passed unchanged:

```text
make test
OK, but incomplete, skipped, or risky tests!
Tests: 2928, Assertions: 8445, Skipped: 13.
```

It completed in 25.892 seconds, returned exit zero, and ran the repository's `stop-server` cleanup recipe. PHP 8.5 deprecation output from a resolved development dependency did not fail the suite.

## Live Finding And Bounded Change

The adapter previously treated the absence of a supported Composer test script as enough proof for bare `vendor/bin/phpunit`. Guzzle proves that the executable can be valid while the full workflow still has statically declared prerequisites.

The adapter now reads only an exact root `Makefile` and withholds bare PHPUnit when all of these conditions hold:

- the target is literally `test:`
- it has one or more simple literal prerequisites
- its tab-indented recipe contains exactly `vendor/bin/phpunit` or `./vendor/bin/phpunit`

The Makefile becomes a setup signal and the prerequisites are named in one blocker. The adapter does not evaluate Make variables, continuations, order-only prerequisites, pattern targets, shell semantics, or arbitrary recipes. It also does not emit `make test`: Make availability and cross-platform portability have not been proven as part of the PHP command contract.

The corrected profile is medium confidence with no `testCommand` and this blocker:

```text
Root Makefile test target requires prerequisite orchestration (start-server); bare PHPUnit is not a safe default.
```

A negative regression keeps bare PHPUnit for a `test:` recipe when an unrelated `start-server` target exists but is not its prerequisite.

## Repeated Audit

Five unchanged audits produced one canonical result:

| Measure | Result |
| --- | --- |
| Test command | withheld |
| Confidence | medium |
| Setup signals | `composer.json`, `phpunit.xml.dist`, `tests/bootstrap.php`, `Makefile` |
| Untested candidates | 12 |
| Covered-but-risky candidates | 39 |
| Skipped targets | 17 |
| Evidence relationships | 112: 33 asserted, 77 called, 2 naming |
| Durations | 102.041 ms, 78.754 ms, 77.933 ms, 76.000 ms, 75.627 ms |
| Median | 77.933 ms |
| Canonical SHA-256 | `811dc21693ec59668391c4590d446ec7ebf13fd4dd08193b4d181c3813abfae1` |

The candidate and evidence counts are unchanged by the command correction. The slice removes an unsafe execution claim rather than inflating static coverage.

## Remaining Uncertainty

The supported-promotion measurement reran the exact checkout five times through `corpus:measure`. It retains the `12 / 39 / 17` candidate split, 112 relationships, intentional command withholding, and canonical digest `811dc21693ec59668391c4590d446ec7ebf13fd4dd08193b4d181c3813abfae1` with samples `150, 83, 84, 80, 78` ms and an 83 ms median.

Arbitrary Make evaluation, selecting or translating repository orchestration commands, Composer script graphs, dependency-lock reconstruction, service readiness, port allocation, teardown guarantees after failures, PHPUnit attributes and custom suites, framework ownership, deeper inheritance, traits, dynamic calls, data-provider flow, and broader helper/result inference remain outside the supported boundary.

The 12 untested candidates are mainly interfaces, traits, and low-level transport or environment helpers. Closing that gap would require a distinct evidence proof; the service-workflow finding does not justify broadening symbol inference.

## Result

The Guzzle live test caught a meaningful false-positive command while preserving all 112 bounded evidence relationships. The adapter now distinguishes a valid PHPUnit executable from a repository workflow that statically declares prerequisite orchestration, records why execution is withheld, and remains deterministic across five runs. Guzzle becomes the service-shaped PHP control; custom Composer command graphs and difficult ownership remain later pressure boundaries.
