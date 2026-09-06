# Lexical Evidence Hardening — September 6, 2026

The first repair phase from the [adapter re-evaluation](adapter-re-evaluation-2026-09.md) fixes the reproduced comment/string false-evidence cases in JavaScript/TypeScript, Kotlin/JVM, Ruby, and PHP. Public schemas and fixture goldens are unchanged. The subsequent [ownership and command repair](ownership-hardening-2026-09.md) addresses external symlinks, duplicate nested ownership, PHP test-base identity and Kotlin/Swift command metadata. Results below record this first phase, not release approval.

## Changes and regression proof

- JavaScript keeps separate, offset-preserving code and literal views. Imports, CommonJS requires, re-exports, and usage must occur in code, not comments, quoted text, or template text. Nested interpolation is conservatively opaque; malformed or excessively nested templates do not leak their contents. Real imports can still produce structural evidence, and filename matches can remain naming-only.
- Kotlin/JVM scans comments and strings in lexical order, handles nested block comments and triple-quoted strings, and preserves line boundaries. Literal URLs, glob patterns, and quote characters cannot terminate a comment or hide later code. Unsupported Spock annotations remain visible to the existing conservative blocker policy.
- Ruby recognizes line-start `=begin` / `=end` comments and literal heredoc terminators, including quoted, indented, and queued heredocs. Non-code cannot establish test registration, module calls, literal requires, or Rake tasks. A commented Rakefile now leaves the bounded direct Minitest command instead of inventing a Rake task.
- PHP masks ordinary strings, heredocs, and nowdocs before test ownership, imports, calls, exception expectations, and asserted-result analysis. Code after a closing delimiter is retained. Lexical facts are computed once per PHP file and reused within the audit; repeated scans initially increased Guzzle latency, and audit-local reuse restored an approximately 85 ms median without changing artifacts.

Fifteen new tests cover negative cases, valid code after comments/literals, mixed real-test/documentation files, malformed delimiters, and downstream plan evidence. The four focused adapter suites pass **199 tests**. The shared negative helper checks that non-code contributes no semantic evidence and no `usage`/`viaUsage` claim reaches a generated project plan. The manual 59-observation review harness confirms the originally reported lexical cases no longer emit semantic evidence.

These remain bounded static readers, not complete language parsers or runtime binding analysis. This phase does not claim complete regular-expression/percent-literal parsing, arbitrary interpolation execution, macro expansion, or all unsupported language forms. Naming-only matches are not execution claims.

## Fresh pinned-repository checks

All twelve existing corpus pins for the four affected adapters were fetched into temporary checkouts and audited five times each. No upstream dependencies were installed and no native upstream test suite was rerun. Every package retained its previous verification command, including intentional withholding. All five-run outputs were internally deterministic. Nine cases retain their exact previous canonical digest.

| Corpus case | Untested / covered / skipped | Relationships | Median ms | Digest |
| --- | --- | ---: | ---: | --- |
| JavaScript Playwright MCP | 1 / 0 / 1 | 0 | 7 | unchanged |
| JavaScript Cypress Terminal Report | 19 / 2 / 11 | 2 | 24 | unchanged |
| JavaScript Hono/Bun | 2 / 99 / 85 | 894 | 516 | unchanged |
| Kotlin JUnit 4 | 34 / 82 / 103 | 706 | 320 | unchanged |
| Kotlin GraphQL Java | 187 / 163 / 303 | 687 | 1,519 | reviewed change |
| Kotlin Maven Surefire | 25 / 141 / 137 | 359 | 752 | reviewed change |
| PHP brick/math | 7 / 14 / 1 | 34 | 29 | unchanged |
| PHP Guzzle | 12 / 39 / 17 | 112 | 85 | reviewed change |
| PHP Ramsey UUID | 29 / 54 / 31 | 168 | 36 | unchanged |
| Ruby rubyzip | 19 / 23 / 6 | 80 | 55 | unchanged |
| Ruby Faraday | 8 / 22 / 3 | 45 | 63 | unchanged |
| Ruby Diplomat | 8 / 21 / 3 | 26 | 58 | unchanged |

The [raw measurements and exact evidence deltas](metrics/lexical-evidence-2026-09-06.json) include every upstream commit, prior measurements, five duration samples, and canonical digests. Timings are observations on macOS arm64 / Node 23.7.0, not an isolated cross-machine performance comparison. The three changed corpus entries now point to this report and lock the reviewed new artifacts; unchanged entries retain their historical measurements.

### Why the three artifacts changed

1. **GraphQL Java:** 14 relationships from `ValuesResolverTestLegacy.groovy` are withheld. An escaped double quote inside a single-quoted string previously confused masking order and hid a later `@Ignore`. The ordered scanner exposes it, triggering the existing whole-file exclusion for unsupported Spock semantics. These are not 14 proven fake calls: the file contains real code, but that execution shape is outside the bounded evidence policy. `ValuesResolverLegacy.java` consequently moves to untested.
2. **Maven Surefire:** three real source/test relationships are recovered (`JarManifestForkConfiguration`, `CancellationTokenAdapter`, and `LauncherSessionAdapter`), three relationships gain asserted usage, and one loses asserted usage. Literal patterns such as `**/*A.java`, URLs, and embedded quotes no longer erase or merge later code. The recovered references are present in the pinned Java files. `ResolvedTest.Type.CLASS` is used in a helper, not an assertion; its relationship correctly becomes reference-only. Existing bounded helper/reference semantics are not widened.
3. **Guzzle:** the relationship from `CookieJarTest.php` to `CookieJar.php` changes from called to asserted. The real `CookieJar::fromArray(...)` result is checked by `assertCount(2, $jar)`. Ordered masking preserves that code after earlier URL strings. Candidate and relationship counts, intentional command withholding, and all other evidence remain unchanged.

The valid quote/glob/URL and unsupported Spock-annotation cases now have focused regressions. Historical native counts in earlier reports have not been presented as new executions.

## Release status

The full local `npm run release:check` passes **1,414 tests**, all adapter coverage floors and generated performance checks, the 33-pin corpus check, 115 golden snapshots, 64 model-consistency scenarios, and package/CLI/MCP checks. Exact-commit Linux/Windows/macOS CI and remaining review findings are still outstanding. No version, maturity, publication, or remote branch was changed.
