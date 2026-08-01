# PHP brick/math Live Validation Report

## Scope

This report records the first live-repository pressure pass for the experimental PHP adapter. The selected checkout is [`brick/math`](https://github.com/brick/math) at exact commit [`b61d8e66c3ea05fa8784888575b719f48f76f515`](https://github.com/brick/math/commit/b61d8e66c3ea05fa8784888575b719f48f76f515).

The goal is foundation validation, not promotion. The pass asks whether one conventional Composer library with literal PSR-4 source/test ownership and PHPUnit can be audited without inventing a runnable default command or overstating evidence.

## Candidate Screen

Three current public PHP libraries were shallow-cloned and audited blind at exact commits:

| Repository | Commit | Shape | Initial audit |
| --- | --- | --- | --- |
| [`brick/math`](https://github.com/brick/math) | `b61d8e66c3ea05fa8784888575b719f48f76f515` | 22 PSR-4 sources, 7 runnable-test files, PHPUnit 11 | high confidence; guessed `vendor/bin/phpunit`; 19 untested, 2 covered, 1 skipped, 2 relationships |
| [`ramsey/uuid`](https://github.com/ramsey/uuid) | `da5b521600a707d2dd097598464bd3090de850f5` | 114 PSR-4-path sources, 64 test files, composite Composer test graph | medium confidence; custom `@dev:test` and non-class PSR-4 source blockers; 29 untested, 54 covered, 31 skipped, 168 relationships |
| [`guzzle/guzzle`](https://github.com/guzzle/guzzle) | `9b200fc5805036b331d6031199880dadecae0275` | 68 PSR-4 sources, 54 PHPUnit test files | high confidence; 12 untested, 39 covered, 17 skipped, 104 relationships |

brick/math was selected as the conventional-library pin because its Composer ownership is literal and compact while its checked-in PHPUnit bootstrap and local base test class expose two precise questions. Guzzle remains stronger later service-boundary pressure; Ramsey UUID remains useful custom-command and difficult-ownership pressure.

## Repository Shape

At the selected pin, brick/math has:

- one root `composer.json`
- one literal `Brick\Math\` to `src/` PSR-4 production mapping
- one literal `Brick\Math\Tests\` to `tests/` PSR-4 development mapping
- a literal `phpunit/phpunit` development dependency
- 22 PHP source files below `src/`
- 7 concrete `*Test.php` files plus `tests/AbstractTestCase.php`
- a root `phpunit.xml` that selects `phpunit.php` as its bootstrap
- an upstream CI matrix that runs PHPUnit on PHP 8.2 through 8.5 with explicit GMP, BCMath, or Native calculator selection; the exact pin's [CI run passed](https://github.com/brick/math/actions/runs/30585994661)

## Native Validation

The initial adapter-selected command was executed unchanged and failed before running tests:

```text
vendor/bin/phpunit
CALCULATOR environment variable not set!
Example usage: CALCULATOR={calculator} vendor/bin/phpunit
Available calculators: GMP, BCMath, Native
```

The bootstrap reads `CALCULATOR`, selects one of three implementations, and exits non-zero when no valid choice is supplied. A bare command is therefore not a safe repository-native verification command.

The repository's portable explicit choice passed locally on PHP 8.5.9 with PHPUnit 11.5.56:

```text
CALCULATOR=Native vendor/bin/phpunit
OK (22160 tests, 89659 assertions)
```

The unchanged suite completed in 5:00.509 with zero failures or errors.

## Live Finding And Bounded Change

The foundation adapter previously treated an absent Composer test script as sufficient proof for `vendor/bin/phpunit`. brick/math demonstrates that the PHPUnit config and bootstrap can make that default incomplete.

The adapter now prefers root `phpunit.xml` over `phpunit.xml.dist`, reads one literal `bootstrap` attribute, and inspects a repository-owned PHP bootstrap for two bounded terminating environment shapes:

- a literal `getenv("NAME")` assignment followed by a direct `NAME === false` branch that exits or dies non-zero
- a literal `switch ($value = getenv("NAME"))` with a default branch that exits or dies non-zero

When either shape is present, the bootstrap path is retained as a setup signal and the adapter withholds its default command with an explicit blocker. It does not choose an environment value or emit shell-specific environment syntax. Optional reads are not promoted to requirements: brick/math's later `BCMATH_DEFAULT_SCALE` read is guarded by `!== false` and remains correctly excluded.

The corrected profile is medium confidence with no `testCommand` and this blocker:

```text
PHPUnit bootstrap phpunit.php requires explicit environment selection for CALCULATOR; no default test command is safe.
```

## Repeated Audit

Five unchanged clean-checkout audits produced one canonical digest:

| Measure | Result |
| --- | --- |
| Test command | withheld |
| Confidence | medium |
| Untested candidates | 19 |
| Covered-but-risky candidates | 2 |
| Skipped targets | 1 |
| Evidence relationships | 2 |
| Durations | 20.232 ms, 7.609 ms, 6.864 ms, 7.029 ms, 6.515 ms |
| Median | 7.029 ms |
| Canonical SHA-256 | `8d8ccba40691334189dd570b9f82e421cd6fe40ce11e52a9090a0679576d71a3` |

The two relationships are direct asserted imports from the two test classes that directly extend PHPUnit `TestCase`. They remain deliberately sparse rather than being equated with brick/math's native coverage.

## Remaining Uncertainty

The next concrete PHP evidence slice is now visible. Five large concrete test classes extend the repository-owned `AbstractTestCase`, which in turn directly extends PHPUnit `TestCase`. The first adapter slice recognizes only direct `TestCase` inheritance, so those tests do not yet contribute evidence. A bounded one-hop, uniquely owned local base-test edge is the natural follow-up, followed by careful handling of helper assertions and fluent instance calls.

Broader bootstrap evaluation, arbitrary environment expressions, choosing matrix values, shell portability, Composer script graphs, PHPUnit attributes, custom suites, framework ownership, dynamic dispatch, and deeper inheritance remain excluded.

## Result

The first PHP live test prevented a false high-confidence command claim. Project detection, Composer and PSR-4 ownership, PHPUnit recognition, candidate classification, downstream artifacts, repeatability, performance, and native suite viability all hold at the exact pin; command ownership is now conservative when a checked-in bootstrap statically requires an explicit environment choice. brick/math remains the conventional-library pressure repository for the next one-hop test-inheritance slice.
