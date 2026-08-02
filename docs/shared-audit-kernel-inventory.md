# Shared Audit Kernel Inventory

This inventory defines the smallest reusable audit infrastructure that can be extracted without weakening adapter-owned proof. It is a refactor plan, not a runtime change: the current adapters, public artifacts, corpus digests, and performance observations remain unchanged in this slice.

## Decision

The first shared kernel should contain portable repository-path normalization and deterministic text-file traversal behind adapter-supplied policies. PHP and Elixir are the first migration pair because their readers already have the same control flow and output shape: recursively visit a root, skip named directories and symbolic links, stop at nested project manifests, read an adapter-owned allowlist of UTF-8 text files, normalize paths, and return path-sorted records.

The kernel must not decide which directories, nested manifests, extensions, build files, sources, or tests an adapter owns. Those policies remain explicit inputs from each adapter. No parser, classifier, framework rule, command selector, blocker, or evidence inference moves into the shared layer.

## Verified Duplication

Each of the ten primary `src/adapters/*/audit.js` implementations currently declares its own versions of these five mechanics:

| Mechanic | Current repetition | Inventory verdict |
| --- | ---: | --- |
| repository text-file reader | 10 adapters | share traversal control flow only; keep inclusion, pruning, and symlink policy adapter-owned |
| portable repository-path normalization | 10 adapters | share now |
| absolute/relative/Windows changed-path normalization | 10 adapters | share now, preserving every existing changed-file regression |
| risk-then-name output ordering | 10 adapters | technically shareable but low leverage; defer until traversal is proven |
| regular-expression literal escaping | 10 adapters | technically shareable but too small to justify an early migration |

Three adapters also expose a local `addEvidence` helper, but their uniqueness and merge behavior is not one contract. That similarity does not authorize shared evidence aggregation.

## Traversal Policy Matrix

The repeated reader skeleton hides important ownership differences. A shared traversal API must expose these differences rather than flattening them:

| Adapter | Nested-owner/pruning rule | File policy that remains adapter-owned |
| --- | --- | --- |
| C# | no reader-level project pruning | C# and project files; build metadata is read separately |
| Elixir | stop below a nested `mix.exs` | Mix, Elixir source, and ExUnit files |
| Go | stop below a nested `go.mod` | Go source plus exact module/workspace build files |
| JavaScript/TypeScript | package scoping occurs after traversal | supported source, package, runner, workspace, and lock files |
| Kotlin/JVM | aggregate/module ownership occurs after traversal | JVM source plus Gradle/Maven build files |
| PHP | stop below a nested `composer.json` | PHP, Composer, PHPUnit, and bounded Make files |
| Python | package-root ownership occurs after traversal | Python source plus supported packaging, runner, and coverage files |
| Ruby | stop below a nested `Gemfile` | Ruby source plus root Bundler, gemspec, Rake, and RSpec files |
| Rust | preserve literal workspace members and prune deeper Cargo owners | Rust source and Cargo manifest files |
| Swift | skip dependency/build roots and Swift-specific ignored directories | Swift/Objective-C source plus supported SwiftPM, Xcode, Bazel, and CocoaPods metadata |

Symbolic-link handling is also observable behavior. The first kernel implementation must reject symbolic-link entries for the PHP/Elixir pair exactly as their current readers do. Broader migrations require adapter-specific symlink regressions before using the same primitive.

## Implemented First Primitive

The private core helper now has this contract:

```text
readRepositoryTextFiles(root, {
  ignoredDirectoryNames,
  shouldPruneDirectory({ absolutePath, relativePath, depth }),
  shouldIncludeFile({ absolutePath, relativePath }),
  symbolicLinks: "skip"
}) -> [{ path, content }]
```

The helper owns only recursive directory iteration, portable relative paths, UTF-8 reads, symbolic-link rejection under the selected policy, and final lexicographic path ordering. PHP supplies its Composer nested-owner callback and PHP/Composer/PHPUnit/Make inclusion policy; Elixir separately supplies its Mix nested-owner callback and Mix/Elixir/ExUnit inclusion policy. The helper does not infer a project type from a filename.

The same module exposes `normalizeRepositoryPath` and `normalizeChangedPath`, replacing the byte-identical local implementations in only those two adapters. A normalized file index remains deferred because neither migration needed one; any later index must be a derived view over the unchanged ordered records and must not change record order or make a previously ambiguous lookup unique.

## Explicitly Adapter-Owned

The following stay outside the shared kernel even where names or delimiter loops look similar:

- lexical masking of comments, strings, heredocs, raw strings, interpolation, and language-specific literals
- balanced-region and callable-body parsing, because delimiter meaning and lexical state differ by language
- Gradle, Maven, MSBuild, Cargo, Mix, Composer, Bundler, SwiftPM, Xcode, Bazel, workspace, and package ownership
- source/test discovery, framework activation, runnable-test ownership, and verification-command selection
- symbol, import, alias, receiver, fixture, helper, macro, route, assertion, and dependency evidence
- candidate classification, blockers, confidence, recommendation reasons, and risk wording
- evidence de-duplication and strength upgrades, which must retain adapter-specific provenance rules

A shared function is justified by identical semantics, not by similar syntax or a lower line count.

## Latency Instrumentation Targets

The first optimization work should remain evidence-led. The two exact corpus outliers are:

| Case | Exact pin | Three-run samples | Median | Evidence links | Canonical audit SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| Swift Package Index Server | `26943bfd3e62f29348e6a06722ba5fcd9dc11d58` | 14,568 / 14,484 / 14,370 ms | 14,484 ms | 265 | `73578ce9b98f0e1f3d688c0159bc7969d235cb27f73a8bc2be0f4bdccb7b5db8` |
| Django | `dca76b15c62a1118325b71678ce3235e2231198d` | 3,900 / 3,741 / 3,786 ms | 3,786 ms | 4,935 | `541ccfb9779cdd34a9d9d2c338d97117770160f2ff456646b6b625d5d496e222` |

Python's existing test/import/fixture indexes already reduced the Django audit from more than two minutes to the recorded median. That history is a reason to measure residual phases, not a reason to assume traversal is still the hotspot. Swift's much larger remaining median likewise does not prove which scan or join dominates.

The development instrumentation slice now records five-run phase timings for:

1. repository traversal and text reads
2. project/build ownership parsing
3. source classification and source-index construction
4. runnable-test parsing and test-index construction
5. evidence joining and artifact assembly

Timing data stays outside `audit/v1`, canonical normalization, CLI/MCP output, and package-user diagnostics. Swift and Python accept an optional internal `onPhaseTiming` callback, which the adapter registry forwards only when a development caller supplies it. The exact-pin corpus measurement script owns sample collection:

```powershell
npm run corpus:measure -- --case python-django --checkout /path/to/pinned/django --profile-phases
npm run corpus:measure -- --case swift-package-index-server --checkout /path/to/pinned/swift-package-index-server --profile-phases
```

`--profile-phases` defaults to five runs, requires at least five when `--runs` is explicit, verifies one callback for each ordered phase, preserves the canonical audit digest check, and reports per-phase samples plus medians. Ordinary audits do not construct timing events or attach timing data to their artifacts.

## Extraction Acceptance Gates

Every refactor or optimization slice must prove:

- byte-identical fixture and golden artifacts
- unchanged canonical SHA-256 digests for all 30 pinned corpus cases
- no supported corpus median regression greater than 10% in a same-machine five-run comparison
- unchanged nested-project, ignored-directory, symbolic-link, and portable changed-path behavior for migrated adapters
- unchanged generated 400-source/200-test candidate and evidence counts
- focused adapter tests, shared conformance, implementation coverage, package checks, cross-platform CI, alpha, and exact-commit release gates all pass

The first extraction is complete for PHP and Elixir only. Focused nested-project, ignored-directory, symbolic-link, changed-path, UTF-8, and deterministic-order regressions preserve the intended API boundary, while fixture, golden, corpus, generated-scale, conformance, packaging, cross-platform, alpha, and release gates enforce artifact stability. Wider adoption requires a separate adapter-specific proof slice. Swift and Python optimization follows phase evidence rather than being bundled into this traversal refactor.
