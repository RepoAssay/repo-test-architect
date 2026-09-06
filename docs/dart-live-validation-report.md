# Dart and Flutter Live Validation — 2026-09-06

Three public repositories were shallow-cloned at exact commits and screened before changing the adapter. Four package suites then ran natively on macOS arm64 with Flutter 3.47.2 and Dart 3.13.2. All 2,064 upstream tests passed. Both checked-in native fixtures also passed in temporary copies. This validates the documented experimental boundary; it is not an automatic maturity promotion.

## Pins and native results

| Repository | Exact commit | Package root | Command | Tests passed |
| --- | --- | --- | --- | ---: |
| [dart-lang/core](https://github.com/dart-lang/core) | `0fbe0cc3f18fe38aebea272f1ae22e5d1649285c` | `pkgs/collection` | `dart test` | 1,784 |
| [flutter/samples](https://github.com/flutter/samples) | `463e365e4842f252ffab9c6198594a504d69469f` | `compass_app/app` | `flutter test` | 67 |
| [felangel/bloc](https://github.com/felangel/bloc) | `8fcf54dfea7ba51ef04c091d1a27e0da498b29f0` | `packages/bloc` | `dart test` | 119 |
| [felangel/bloc](https://github.com/felangel/bloc) | same pin | `packages/flutter_bloc` | `flutter test` | 94 |

The three corpus roles are collection (conventional library), Compass (framework application), and flutter_bloc (difficult ownership graph). The plain bloc package is an additional control. Repository code and test bodies were inspected before native execution: collection and bloc use local unit tests; Compass mocks HTTP and uses fake repositories for its widget suite. Browser/device tests and server-backed integration tests were not run. In particular, Compass documents separate integration entrypoints and warns against running them together; the adapter correctly selects the ordinary package test suite.

The SDK was obtained from the official Flutter stable Git checkout at `d3b14c876900e553bc736ca19295fc09e3853e8e`; it downloaded its matching engine/Dart artifacts. No system installation was needed. `dart pub get` / `flutter pub get` resolved dependencies first, with a temporary package cache. The SDK version comes from actual `flutter --version` output. The four selected test commands were then executed exactly as emitted by the adapter. Flutter's pub setup added analyzer exclusions to two flutter_bloc configuration files; those tool-created edits were removed after testing. All three third-party Git worktrees ended with no tracked changes. No upstream test or production source was edited.

## Findings and fixes

The initial collection audit had 27 untested candidates, 1 covered candidate, and 1 skipped barrel, with only 1 import relationship. Most tests import `collection.dart`, which exports the implementation libraries. The initial bloc and flutter_bloc audits similarly concentrated evidence on named public library files while leaving their implementations uncredited.

The adapter now follows at most three unconditional export edges from a directly imported, repository-owned Dart library. The resulting `bounded-dependency` relationships are **indirect structural reachability**, with no `usage` or `viaUsage`. They do not say that every exported function is called or asserted. Exact direct imports supersede indirect evidence once per test/source pair. Cycles terminate; missing, conditional, external, nested-package, and `part of` destinations are excluded. Named and unnamed `library` declarations no longer make an export-only entrypoint look like runtime behavior.

Compass exposed a second issue: abstract repository declarations with `Future` return types ranked as async test candidates. A bounded class containing only abstract declarations, with no bodies or initializers, now receives `type-only` deferral. Six such interfaces were removed from its candidate list. Abstract classes with concrete method bodies, arrow expressions, or initialized fields remain candidates. Generated Freezed/JSON files remain skipped.

## Repeated audits after fixes

Five audits of each unchanged package produced identical canonical JSON digests. [Machine-readable results](metrics/dart-live-2026-09-06.json) contain all timing samples and SHA-256 digests; the three cohort measurements are also in [the validation corpus](../evals/validation-corpus.json).

| Package | Untested | Covered but risky | Skipped | Relationships | Median audit |
| --- | ---: | ---: | ---: | ---: | ---: |
| collection | 8 | 20 | 1 | 380 | 27 ms |
| Compass | 43 | 40 | 28 | 66 | 22 ms |
| bloc | 0 | 5 | 3 | 30 | 6 ms |
| flutter_bloc | 0 | 9 | 1 | 81 | 6 ms |

Collection has 1 referenced direct-library import and 379 indirect export relationships. Compass has 66 referenced imports. All bloc and flutter_bloc relationships are indirect. These are graph relationships, not runtime coverage percentages. The uncredited collection files include internal helpers reached through ordinary source imports, which this bounded export traversal does not follow. bloc's two part files remain deferred to their owning library.

## Ownership, command and downstream review

- Repository screening detected 18 Dart projects in core, 39 in samples, and 48 in bloc. Dart cache directories and nested pubspec roots are excluded from a parent's source ownership.
- The samples aggregate retains an explicit workspace blocker and no aggregate command. Compass remains an independently selected member with its own `flutter test` command.
- flutter_bloc's public `package:bloc` and `package:provider` exports do not transfer sibling/external source ownership, even though its native dependency override resolves bloc locally. Its example remains a separate detected Dart owner.
- All four audits passed `audit/v1` schema checks. Each package's direct audit matched its own Dart entry in the project audit. Full `repository-analysis/v1` processing completed, direct plan commands agreed, rankings retained every actionable target, and plan evidence exactly matched the audit. Every relationship points to an existing test file, with no claimed executed usage.
- The single-project fixture conformance helper is not a suitable live-repository gate: Compass also contains Apple/JVM project markers, flutter_bloc contains an example, and large finding lists are capped. The live checks therefore select the package's Dart entry and compare downstream artifacts explicitly; unrelated detected projects are not hidden to make fixture assumptions pass.
- Top review targets include collection algorithms and collection wrappers, Compass activity view-model/repository behavior, and flutter_bloc listener/provider behavior. Weak structural evidence stays reviewable rather than being presented as verified coverage.

## Reproduction

Clone the listed repositories, check out the exact commits, and run:

```sh
npm run corpus:measure -- --case dart-core-collection --checkout /path/to/core --runs 5
npm run corpus:measure -- --case dart-flutter-compass --checkout /path/to/samples --runs 5
npm run corpus:measure -- --case dart-flutter-bloc --checkout /path/to/bloc --runs 5
npm run dart:native:check
```

The native fixture command expects `dart` and `flutter` on PATH; `DART_BIN` and `FLUTTER_BIN` can select explicit executables. It copies fixtures to a temporary directory and leaves their source directories untouched. Run the upstream commands from the package roots in the table after dependency resolution. Do not substitute browser, integration, or workspace-wide commands and call the result equivalent.

## Remaining limits

The final `npm run release:check` passed after the live-validation fixes: all 1,394 repository tests, 64 model-consistency scenarios with 560 locked fields, 33 corpus pins with 231 passing review areas, golden snapshots, adapter coverage/performance, packaging, clean packed installation, CLI/MCP startup, and distribution preparation. The production dependency audit reported zero vulnerabilities. Dart coverage was 100% lines, 98.04% branches, and 100% functions; its generated 400-source/200-test gate completed in 40 ms with all expected relationships. `git diff --check` passed, and the documented corpus measurement commands reproduced the pinned counts and digests.

Dart remains experimental. This pass establishes a pinned three-role cohort and native macOS success, but does not prove browser/device behavior, all pub workspace graphs, local binding shadowing, conditional test registration, arbitrary helper execution, part ownership, or semantic call/assertion resolution. Generated DTO wrappers and abstract declarations with more complex signatures may still need classification review. Stable publication still requires the exact-commit operating-system release checks.

The subsequent [pre-release adapter re-evaluation](adapter-re-evaluation-2026-09.md) fixed three additional Dart lexical/filtering defects, preserved all three live-cohort canonical digests in fresh five-run measurements, and passed the full 1,399-test local release gate. Dart now has 21 focused tests with 100% line, 98.26% branch, and 100% function coverage, and its paths/performance checks are wired into both portability PR jobs. Exact-commit CI is still outstanding. The broader review also reproduced release-relevant defects in seven older adapters; historical native success does not clear those findings.
