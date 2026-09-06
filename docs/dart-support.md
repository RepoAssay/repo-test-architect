# Dart and Flutter Support

The `dart` adapter is available with **experimental** maturity. It is the final language addition planned before the stable release. Existing `audit/v1` and `plan/v1` contracts are unchanged. Audits are local, deterministic, and do not execute Dart, Flutter, pub hooks, or repository code.

```sh
node src/cli/index.js analyze examples/dart-test-basic
node src/cli/index.js audit examples/dart-flutter-basic --adapter dart
node src/cli/index.js plan examples/dart-test-basic --adapter dart
```

MCP callers can use `analyze_repository` for automatic package discovery or `audit_repo` with `adapterId: "dart"` for a selected package.

## Implemented boundary

| Area | Behavior |
| --- | --- |
| Discovery | `pubspec.yaml` identifies each Dart or Flutter package. Nested packages remain separate owners; `.dart_tool`, `.pub-cache`, dependency, and build outputs are excluded. |
| Metadata | YAML parsing with duplicate-key rejection and bounded alias expansion; requires a package name and SDK constraint before recommending a command. |
| Sources | Handwritten `lib/**/*.dart` and `bin/**/*.dart`; branching and async signals feed shared ranking. Generated files, `part of` files, empty files, export-only libraries (including named libraries), and bounded bodyless abstract declarations are skipped with reasons. |
| Test setup | Declared `test` or Flutter SDK `flutter_test`, conventional `test/**/*_test.dart`, and a static `main()` body containing a framework registration. Prefixed imports and simple `show`/`hide` combinators are recognized. |
| Commands | `dart test` for plain Dart; `flutter test` for Flutter. Missing setup, invalid metadata, aggregate pub workspaces, or custom `dart_test.yaml` withhold commands and retain blockers downstream. |
| Evidence | Exact relative imports to owned sources use `direct-relative-import`; exact same-package URIs use `package-entry-import`. At most three unconditional owned export edges add indirect `bounded-dependency` relationships, with cycle protection and no cross-package ownership. These describe structural library reachability only. Neither `usage` nor `viaUsage` is emitted. |
| Widgets | Conventional Flutter `StatelessWidget`, `StatefulWidget`, and `State` subclasses receive component-test recommendations when `flutter_test` is declared. |
| Changed scope | Relative, absolute, and portable Windows-style changed paths filter source targets while retaining full-package test evidence. |

Comments, raw strings, escaped strings, and triple-quoted strings do not manufacture imports. Conditional and deferred imports, external packages, escaping paths, symlinks, and URI encodings do not create owned-source evidence. Import aliases or combinators do not prove that an imported symbol is exercised. An import-only match therefore remains a weak coverage finding in the shared report.

The follow-up trust pass also keeps nested interpolation strings opaque, applies successive `show`/`hide` clauses as filters, and only recognizes generated-code markers in leading comment headers. Unterminated or excessively nested interpolation fails closed rather than exposing its contents as code.

## Limits and promotion work

This is a bounded lexical adapter, not Dart analyzer or compiler integration. It does not resolve export chains beyond three unconditional owned edges, library parts, symbol calls, assertions, local binding shadowing, helper execution, conditional test registration, custom runners, or arbitrary pub workspace membership. It does not prove that registered tests execute or pass. Flutter device integration tests under `integration_test/` are outside the initial command and evidence boundary. An aggregate workspace receives a blocker; audit its detected member packages individually.

Checked-in plain-Dart and Flutter fixtures exercise schemas, CLI, project detection, all shared downstream consumers, import false-positive cases, and command withholding. Golden audits and plans lock both fixtures. The release check includes a generated 400-source/200-test latency and relationship-count gate plus adapter coverage minimums.

The [September 6 live validation](dart-live-validation-report.md) now records a pinned three-role cohort across dart-lang/core, flutter/samples, and felangel/bloc. Four upstream package suites passed all 2,064 tests on Flutter 3.47.2 / Dart 3.13.2, and both native fixtures passed in temporary copies. Five repeated audits per package preserved canonical output. Run `npm run dart:native:check` with the SDKs on PATH, or set `DART_BIN` and `FLUTTER_BIN`. Dart remains experimental pending the broader trust review and operating-system validation; this pass does not establish browser/device behavior or semantic call resolution.

The initial implementation passed `npm run release:check` with 1,389 tests before the live-validation fixes. After those fixes, the focused Dart suite records 100% line and function coverage and 98.04% branch coverage. The production dependency audit reported zero vulnerabilities after compatible `fast-uri` and `qs` updates. Final release-gate results for the validated implementation are recorded in the live report; local checks do not replace exact-commit three-OS publication checks.

The subsequent cross-adapter review (repairs tracked in the follow-up PR) records the Dart trust fixes, 21 focused tests, unchanged three-role live digests, and 100% line / 98.26% branch / 100% function coverage. Dart performance now runs in both alpha and release gates, with Dart paths selecting Windows and macOS portability jobs. Those CI jobs still need to run on the exact commit; the broader review also found release blockers in older adapters.

Conventions were checked against the official [pubspec reference](https://dart.dev/tools/pub/pubspec), [dart test command](https://dart.dev/tools/dart-test), and [Flutter testing overview](https://docs.flutter.dev/testing/overview).
