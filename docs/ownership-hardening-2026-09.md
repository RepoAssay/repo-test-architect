# Ownership and Command Hardening — September 6, 2026

The second repair phase closes the remaining reproduced implementation defects from the [September adapter re-evaluation](adapter-re-evaluation-2026-09.md). It follows the [lexical evidence repair](lexical-evidence-hardening-2026-09.md). This is not stable-release approval: exact-commit Linux/Windows/macOS CI and the existing release-policy review remain outstanding.

## Repairs and regression proof

- **JavaScript and Python:** traversal ignores symbolic links and reads only regular files. External source/test links cannot supply candidates or evidence, and dangling or directory links with source extensions no longer crash audits. JavaScript auxiliary metadata reads and Python inherited pytest configuration also reject linked files.
- **Python:** nested `pyproject.toml` and `requirements.txt` projects are pruned at the same marker boundaries used by project detection. Ordinary source/package directories without those markers retain their existing ownership.
- **Rust:** a regular child `Cargo.toml` establishes a boundary even directly below the audit root. The parent no longer absorbs a package placed at `src/Cargo.toml`; existing Cargo workspace tests remain passing.
- **PHP:** runnable test classes require their resolved parent to be `PHPUnit\Framework\TestCase`, or the existing bounded unique one-hop local base. A foreign, missing, or locally shadowed `TestCase` no longer supplies a command or semantic evidence. Imported aliases and fully qualified bases remain supported. The performance gate caught a compatibility regression for valid same-line imports; import parsing and a positive/negative regression now cover that syntax.
- **Kotlin/JVM:** Gradle build/settings comments and Maven XML comments are removed before build ownership analysis. Framework recognition in test files uses the code view. Empty/comment-only build metadata produces an explicit blocker and no verification command.
- **Swift:** SwiftPM parsing strips comments while preserving literal attribute values. Command and manifest-graph recognition require an active literal `let`/`var package = Package(...)` declaration, optionally type-annotated. Empty, commented, or string-only declarations no longer establish `swift test`; commented target attributes cannot override real paths/dependencies.

Twenty-one additional tests cover these boundaries and positive controls. Direct audit checks are supplemented by project-aware command/plan checks, exact physical-owner assertions in audits, rankings and plans, and validated summary/stat consumers. Symlink tests run on the POSIX host and explicitly skip Windows because creating those links may require privileges. The manual 59-observation harness was rerun with no crashes; the previously reported ownership, foreign-base and inactive-command counterexamples now have the expected results.

These are bounded static analyses, not native execution proofs. A real test body can retain symbol evidence when its build command is blocked; that does not claim the build can run. Arbitrary Gradle evaluation, dynamic SwiftPM package construction, dependency availability, and Python runner installation remain outside this repair. The original Python comment-only dependency probe remains a runner-availability follow-up, not a confirmed release blocker.

## Repeated pinned-repository validation

All **18 affected corpus pins** were audited five times. Nine existing clean checkouts from the lexical repair were reused and nine Python/Rust/Swift pins were fetched into new temporary checkouts. Exact commits were checked before measurement. All eighteen canonical audit digests, candidate/evidence counts and verification commands match the recorded corpus, including intentionally withheld commands. Repeated outputs are deterministic. No upstream dependencies were installed and no native upstream suites were rerun.

Raw commits, samples, counts and digests are in the [measurement record](metrics/ownership-hardening-2026-09-06.json). Median static audit times on macOS arm64 / Node 23.7.0:

| Adapter | Pinned cases and median milliseconds |
| --- | --- |
| JavaScript | Playwright MCP 6; Cypress Terminal Report 25; Hono/Bun 509 |
| Python | Asyncer 11; FastAPI template backend 11; Django 2,288 |
| Rust | serde_json 134; Starship 566; ripgrep 160 |
| PHP | brick/math 30; Guzzle 88; Ramsey UUID 35 |
| Kotlin/JVM | JUnit 4 317; GraphQL Java 1,553; Maven Surefire 782 |
| Swift | ReerCodable 198; Swift Package Index Server 801; rules_swift 59 |

## Release status

The full local `npm run release:check` passes **1,435 tests**, all adapter coverage floors and generated performance checks, the 33-pin corpus check, 115 golden snapshots, 64 model-consistency scenarios, executor evaluation, and package/CLI/MCP checks. Public schemas and fixture goldens are unchanged by this phase. No version, adapter maturity, publication, commit or remote branch was changed. Dart remains experimental; the next release gate is exact-commit three-OS validation and the existing release-policy decision.
