# Pre-release Adapter Re-evaluation — September 6, 2026

## Decision

**Hold stable-release approval pending exact-commit cross-platform validation and release-policy review.** A fresh counterexample review reproduced false test evidence and ownership mistakes in previously supported adapters despite a passing local release gate. The subsequent [first repair phase](lexical-evidence-hardening-2026-09.md) fixes the reproduced lexical evidence cases, including Ruby's commented Rake task. The [second repair phase](ownership-hardening-2026-09.md) fixes ownership, PHP test-base identity and Kotlin/Swift inactive metadata, adds regression assertions, and rechecks all eighteen affected corpus pins. Findings below describe the initial review; the repair reports record current results.

Reviewed base: `6fee2bd1bbcc86a5e6d5b648600a29f2bf6687e0`, plus the uncommitted Dart preparation. The ten older adapter implementations were unchanged from that base. Review host: macOS arm64, Node 23.7.0. This is a bounded code and fixture-based review, not an exhaustive semantic audit or a new native run of the 30 older pinned repositories.

## Scope and reproducibility

Run the [manual counterexample harness](../evals/reviews/adapter-trust.mjs):

```sh
node evals/reviews/adapter-trust.mjs
```

It prints 59 observations: 55 across the ten previous adapters and four Dart controls. Each probe modifies a temporary fixture copy; the harness removes its own temporary directory afterward. It does not run repository code, resolve dependencies, or access the network. Windows skips the symlink probes rather than claiming they passed. Exit zero means observations were collected, **not** that trust checks passed. These observations must become positive/negative regression assertions when the fixes are implemented.

All adapters received external source-symlink, external test-symlink, broken source-symlink, and comment-only-test pressure. Additional probes covered nested comments, raw/heredoc/nowdoc strings, foreign test-base identity, commented build metadata, and nested project ownership. Native Ruby and PHP syntax/execution checks confirmed representative comment/string examples were valid non-test code. Node accepted the comment-only JavaScript as syntax. SwiftPM independently rejected the commented manifest. No native Kotlin/Gradle execution was available.

## Prioritized findings

### P1: Non-code text becomes asserted test evidence

| Adapter | Reproduction | Incorrect observation | Code to repair |
| --- | --- | --- | --- |
| JavaScript/TypeScript | Wrap `node-vitest-basic/src/deckParser.test.ts` in `/* ... */` | `src/deckParser.ts` retains `direct-relative-import`, `direct`, `usage: asserted` | [Module import analysis](../src/adapters/javascript/audit.js#L1914) matches imports and usage against unmasked text. |
| Ruby | Wrap `ruby-minitest-basic/test/parser_test.rb` in `=begin` / `=end`, or place it in a quoted heredoc | Parser retains `ruby-constant-reference`, `direct`, `usage: asserted`; command remains `bundle exec rake test` | [Ruby masking](../src/adapters/ruby/audit.js#L1378) handles hash comments and ordinary quotes but not these lexical forms. |
| Kotlin | Wrap `CheckoutCalculatorTest.kt` in `/* outer /* inner */ ... */` | Calculator retains `jvm-symbol-reference`, `referenced`, `usage: asserted` | [JVM masking](../src/adapters/kotlin/audit.js#L1444) removes only through the first block-comment terminator. |
| PHP | Place `php-phpunit-basic/tests/ParserTest.php` inside a nowdoc assignment | Parser retains `php-symbol-reference`, `direct`, `usage: asserted`; command remains `composer test` | [PHP masking](../src/adapters/php/audit.js#L624) does not consume nowdocs. |

These are false assertion claims, not merely permitted filename matches. Kotlin's nested-comment example is valid according to the [official language documentation](https://kotlinlang.org/docs/basic-syntax.html#comments). Do not fix these by weakening every evidence strength: exclude non-code before imports, test discovery, calls, and assertion classification while preserving real positive cases.

### P1: JavaScript and Python follow external file symlinks

Moving an owned source or test file outside its temporary package and replacing it with a symlink preserves the source candidate or asserted test evidence. A broken source symlink crashes the entire audit with `ENOENT`. The [JavaScript reader](../src/adapters/javascript/audit.js#L142) and [Python reader](../src/adapters/python/audit.js#L160) call `readFileSync` without rejecting symbolic-link file entries. The other nine adapters passed these particular skip/crash controls.

Repair both file readers, then test source, test, metadata, broken-link, and directory-link cases through direct and project-aware audit paths. This finding establishes false ownership and audit failure; it is not evidence of remote execution or exfiltration.

### P1: PHP accepts an unrelated `TestCase` as PHPUnit

Change only `use PHPUnit\Framework\TestCase;` to `use Acme\Support\TestCase;` in the PHPUnit fixture. The adapter still emits `composer test`, high confidence, no blockers, and asserted parser evidence. The [direct-base shortcut](../src/adapters/php/audit.js#L513) accepts the short spelling `TestCase` before consulting the resolved parent identity. A foreign base is not proven to inherit PHPUnit. Require the exact resolved PHPUnit identity or the already bounded unique local-base proof; preserve alias-shadow negatives.

### P1: Python and Rust duplicate nested-package ownership

- Python: add `app/child/pyproject.toml` and `app/child/app/foreign.py`. The parent recommends that file while project-aware discovery also audits it as `app/foreign.py` under `app/child`. The [recursive reader](../src/adapters/python/audit.js#L153) does not prune nested project roots, and source-prefix matching absorbs the file.
- Rust: add a child package at `src/Cargo.toml` with `src/src/lib.rs`. The parent recommends `src/src/lib.rs`, while the child audit recommends the same physical file as `src/lib.rs`. The [directory guard](../src/adapters/rust/audit.js#L143) checks the parent traversal depth and misses an immediate-child Cargo package.

Lock nearest-owner uniqueness in the project pipeline, not just relative path spelling. Retain explicit workspace/member behavior and legitimate package-local source layouts.

### P2: Commented metadata still establishes commands

- Kotlin: commenting out the entire fixture `build.gradle.kts` preserves `gradle test`, high confidence, and no blockers. [Build text](../src/adapters/kotlin/audit.js#L565) is consumed as raw declarations even though the plugin/dependency/task configuration is inactive.
- Swift: commenting out the entire `Package.swift` preserves `swift test`, high confidence, and source/test target evidence. [Manifest extraction](../src/adapters/swift/audit.js#L1072) consumes the raw text. Native `swift package dump-package` rejects this manifest with missing/empty manifest output.
- Ruby: a `Rakefile` containing only an `=begin` comment still selects `bundle exec rake test`. This shares the Ruby lexical root cause above.

The Python comment-only dependency probe also retained `pytest`; treat that as a follow-up runner-selection question, not a separate confirmed blocker, because runnable pytest-shaped functions remain in that fixture. Recognition, dependency availability, and native command validity must not be conflated.

## Coverage by adapter

| Previous adapter | New probes | Result in this review |
| --- | ---: | --- |
| JavaScript/TypeScript | 4 | False asserted comment evidence; external symlinks and broken-link crash |
| Python | 6 | External symlinks and crash; duplicate nested ownership; runner-selection follow-up |
| Kotlin/JVM | 6 | False asserted nested-comment evidence; inactive build configuration accepted |
| Swift | 6 | Commented manifest accepted; nested-comment evidence correctly falls back to naming only |
| Go | 5 | No new defect reproduced in these probes |
| C# | 5 | No new defect reproduced in these probes |
| Rust | 6 | Immediate-child package ownership duplicated; nested-comment test evidence correctly withheld |
| Ruby | 6 | Comment/heredoc evidence and commented Rake task accepted |
| PHP | 6 | Nowdoc evidence and foreign test-base identity accepted |
| Elixir | 5 | No new defect reproduced in these probes |

“No new defect reproduced” is deliberately narrower than “release-ready.” The probes do not exhaust framework variants, runtime binding, build conditions, malformed input, or adversarial resource consumption. This review does not update any historical native test counts or silently turn a recorded corpus scorecard into fresh execution evidence.

## Dart and gate status

The parallel Dart trust pass fixed nested-interpolation token leakage, successive `show`/`hide` filtering, and false generated-source skipping caused by text inside strings. Its focused suite now has 21 passing tests with 100% line, 98.26% branch, and 100% function coverage. Five-run reruns of all three pinned Dart corpus roles preserve their previous commands, counts, and canonical digests after these fixes. The fixture goldens and model-consistency contract remain unchanged.

Dart-only implementation, fixture, golden, scenario, and regression paths now select both portability jobs. Its generated performance check is included in `alpha:check` as well as `release:check`, so Windows/macOS PR jobs exercise it. Exact-commit Linux/Windows/macOS CI has **not** run on these uncommitted changes; Dart remains experimental. The local Docker daemon was unavailable, so no Linux container result is claimed.

The final full local `npm run release:check` passed **1,399 tests**, all adapter coverage/performance gates, corpus checks, goldens, model-consistency locks, executor evaluation, CLI/MCP smoke checks, package installation, and distribution preparation. Passing existing tests does not override the open findings above; the manual counterexamples are not yet regression assertions in that gate.

## Repair order before release approval

1. Add failing regressions for the lexical false-assertion cases, fix each language's masking, and preserve valid import/call/assertion controls. Recheck framework discovery and commands using the same masked representation.
2. Fix external symlink and nearest-project ownership, then assert unique physical ownership through summaries, rankings, plans, findings, and stats.
3. Resolve exact PHP test-base identity and withhold commands for inactive/unproven build metadata.
4. Rerun affected pinned repositories and review changed evidence counts, not just stable digests. Repeat the full local release gate and the exact-commit three-OS matrix.
5. Only then decide Dart promotion and release-candidate readiness under the existing release policy. No version bump, npm publication, GitHub push, or maturity promotion was performed in this review.
