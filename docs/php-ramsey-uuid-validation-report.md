# PHP Ramsey UUID Live Validation Report

## Scope

This report records the custom Composer command-graph pressure pass for the experimental PHP adapter. The selected checkout is [`ramsey/uuid`](https://github.com/ramsey/uuid) at exact commit [`da5b521600a707d2dd097598464bd3090de850f5`](https://github.com/ramsey/uuid/commit/da5b521600a707d2dd097598464bd3090de850f5).

The pass asks whether a repository-owned Composer test alias can be recognized without evaluating arbitrary shell scripts. Source-file ownership is deliberately separate: Ramsey UUID's autoloaded `src/functions.php` remains outside the class-only PSR-4 boundary after this slice.

## Repository Shape

At the selected pin, Ramsey UUID has:

- one committed root `composer.json` and `composer.lock`
- literal `Ramsey\Uuid\` to `src/` production ownership
- three literal development mappings below `tests/`
- a literal PHPUnit development dependency and 64 conventional test files
- 114 PSR-4-path production PHP files, including the autoloaded function file `src/functions.php`
- a root `phpunit.xml.dist` and repository-owned `tests/bootstrap.php`
- a root Composer `test` alias that expands through lint, benchmark, static-analysis, and PHPUnit scripts

## Blind Audit

The initial audit returned medium confidence with no command and two blockers:

```text
Each owned source file must contain one declared PSR-4 class matching its literal namespace and path.
The Composer test script must be exactly phpunit, vendor/bin/phpunit, or @php vendor/bin/phpunit in this slice.
```

It reported 29 untested candidates, 54 covered-but-risky candidates, 31 skipped targets, and 168 evidence relationships. The command and source blockers are independent; this pass addresses only the former.

## Native Validation

Dependencies were installed from the committed lock file on PHP 8.5.9. The documented repository command passed unchanged:

```text
composer test
```

The literal script graph performed:

- syntax linting across 190 files with no errors
- style linting across 190 files with no errors
- 46 PHPBench subjects with no failures or errors
- PHPStan analysis across 188 files with no errors
- 2,022 PHPUnit tests with 88,398 assertions and 7 environment-dependent skips

The complete workflow returned exit zero in approximately 24 seconds. PHP 8.5 emitted non-failing integer-cast warnings from a resolved PHPUnit dependency during a few assertion renderings.

## Bounded Change

The adapter now recognizes `composer test` when the root script is one exact Composer alias and its reachable graph satisfies all of these constraints:

- every intermediate script is a literal alias or a non-empty array containing only literal aliases
- every alias resolves inside the same root `scripts` object
- traversal is cycle-free, limited to eight edges and at most 24 scripts
- every terminal is one shell-metacharacter-free command for PHPUnit, PHP Parallel Lint, PHP_CodeSniffer, PHPStan, or PHPBench
- at least one terminal is PHPUnit

Direct exact PHPUnit scripts remain supported. Unknown commands, direct commands mixed into arrays, malformed script metadata, missing aliases, cycles, PHPUnit-free graphs, deeper graphs, and larger graphs remain blocked. The adapter does not execute or generally interpret Composer scripts during an audit.

Ramsey UUID's graph is now recorded as `bounded Composer quality-script graph`. Its only remaining blocker is the separately scoped `src/functions.php` ownership question, so the profile correctly continues to withhold `testCommand` until source ownership is internally consistent.

## Repeated Audit

Five unchanged audits after the command change produced one canonical result:

| Measure | Result |
| --- | --- |
| Test command | withheld by the remaining source-ownership blocker |
| Confidence | medium |
| Untested candidates | 29 |
| Covered-but-risky candidates | 54 |
| Skipped targets | 31 |
| Evidence relationships | 168: 10 asserted, 155 called, 3 naming |
| Durations | 67.687 ms, 32.157 ms, 29.008 ms, 28.177 ms, 28.808 ms |
| Median | 29.008 ms |
| Canonical SHA-256 | `0f21c9269c520156a1673b76ac87f91f667ff1764e687cfee52fee7db534a5ee` |

Candidate and evidence counts are unchanged. The slice removes only the unsupported-command blocker and records the proven command convention.

## Remaining Uncertainty

Composer event scripts, environment mutation, plugin behavior, shell evaluation, arbitrary executables, arguments containing shell metacharacters, aliases with forwarded arguments, platform portability beyond the selected command, and multiple command owners remain excluded.

Ramsey UUID's immediate remaining gap is literal Composer `autoload.files` ownership for `src/functions.php`. That file declares namespaced functions rather than one path-matching class, so the current all-source consistency guard blocks the otherwise proven command. Any follow-up must model function-file ownership explicitly rather than weakening class ownership for ordinary PSR-4 files.

## Result

The Ramsey UUID pressure pass proves a useful repository-owned Composer command graph without treating arbitrary scripts as safe verification commands. Its full native workflow passes, the custom graph is deterministically recognized, and the remaining source blocker stays visible. This clean separation makes autoloaded function files the next bounded PHP slice.
