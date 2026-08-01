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

## One-Hop Test-Base Follow-Up

The next slice resolved the precise evidence gap exposed by the first pass. A conventional `*Test.php` class is now runnable when its declared parent resolves by direct import or its namespace to exactly one PSR-4-owned repository test class, and that local class directly resolves to `PHPUnit\Framework\TestCase`. The lookup stops after this single repository edge.

This recognizes all five brick/math subclasses of `AbstractTestCase`: four in the base class's namespace and `tests/Internal/SafeTest.php` through an explicit import. Regression controls prove that a duplicated local base FQN and a second repository-owned inheritance edge remain non-runnable.

Five unchanged audits after the follow-up produced one new canonical result:

| Measure | Result |
| --- | --- |
| Test command | withheld |
| Confidence | medium |
| Untested candidates | 14 |
| Covered-but-risky candidates | 7 |
| Skipped targets | 1 |
| Evidence relationships | 13 |
| Durations | 33.826 ms, 19.895 ms, 17.192 ms, 17.198 ms, 17.612 ms |
| Median | 17.612 ms |
| Canonical SHA-256 | `328ef22668ea44f5e81e5e7f13b1c7080c3b5dad0808ba821b48593cace5954b` |

The command blocker is unchanged. The adapter gains only test ownership and evidence from the one-hop classes; it still does not claim that the complete native suite can be represented by these static relationships.

The unchanged native command was rerun after the adapter change and again passed all 22,160 tests and 89,659 assertions in 5:03.795 on PHP 8.5.9.

## Assertion-Evidence Follow-Up

The next slice adds two bounded asserted-evidence forms:

- an imported owned class passed literally to same-line PHPUnit `expectException(Class::class)`
- one local variable assigned from an imported owned class's static call, then used unchanged in a nearby `assert*` helper or asserted fluent call before another method boundary

The local-result edge stops at reassignment, a 1,500-character assignment statement, a 4,000-character search window, or the next method. Exception matching masks strings and comments one line at a time. A regression proves that expectation-shaped string content is not evidence.

brick/math contains 21 direct expectation relationships across seven owned exception sources: `DivisionByZeroException`, `IntegerOverflowException`, `InvalidArgumentException`, `NegativeNumberException`, `NumberFormatException`, `RandomSourceException`, and `RoundingNecessaryException`. `NoInverseException` remains excluded because its class literal flows through a data provider and variable; `UnsupportedPlatformException` has no direct runnable-test expectation at the pin.

Five unchanged audits after this follow-up produced one canonical result:

| Measure | Result |
| --- | --- |
| Test command | withheld |
| Confidence | medium |
| Untested candidates | 7 |
| Covered-but-risky candidates | 14 |
| Skipped targets | 1 |
| Evidence relationships | 34: 27 asserted, 7 called |
| Durations | 44.665 ms, 28.310 ms, 27.297 ms, 27.064 ms, 30.279 ms |
| Median | 28.310 ms |
| Canonical SHA-256 | `7d727cc56a76e362e0571db263175395fcd0033564e7e9fde757c4eff2005756` |

The required-`CALCULATOR` blocker remains the profile's only blocker. No command, environment value, dynamic exception ownership, or data-provider flow is inferred.

The unchanged Native calculator suite was rerun after this evidence change and again passed all 22,160 tests and 89,659 assertions in 5:04.668 on PHP 8.5.9.

## Remaining Uncertainty

The supported-promotion measurement reran the exact checkout five times through `corpus:measure`. It retains the `7 / 14 / 1` candidate split, 34 relationships, and intentional command withholding with samples `73, 32, 29, 32, 30` ms, a 32 ms median, and canonical digest `8e34141cb8ddbd4a8f6fd3858528b344adb8a39e17f13b65a36f620a6c6ed8ee`.

The remaining brick/math candidates are internal calculator implementations and helpers, dynamic data-provider exception evidence for `NoInverseException`, and `UnsupportedPlatformException`. Reaching them would require a different ownership proof rather than widening the two bounded assertion forms.

Broader bootstrap evaluation, arbitrary environment expressions, choosing matrix values, shell portability, Composer script graphs, PHPUnit attributes, custom suites, framework ownership, ambiguous or deeper inheritance, dynamic data-provider flow, reassigned or cross-method results, and broader instance-call inference remain excluded. The next useful live pressure is a service-shaped repository such as Guzzle rather than another brick/math-specific expansion.

## Result

The first PHP live test prevented a false high-confidence command claim; its follow-ups safely recovered five concrete tests behind one local base and 21 exact exception-expectation relationships. Project detection, Composer and PSR-4 ownership, PHPUnit recognition, bounded test inheritance, assertion evidence, candidate classification, downstream artifacts, repeatability, performance, and native suite viability all hold at the exact pin. brick/math remains the conventional-library control while PHP moves to a service-shaped pressure repository.
