# Kotlin/JVM Product-Monorepo Validation Hunt: Now in Android

This report records the product-monorepo hunt pass (#325) for the Kotlin/JVM adapter against Google's [`android/nowinandroid`](https://github.com/android/nowinandroid), shallow-cloned at commit `2982e63cb691ad49cd009aab43dc206fee6699c2` (upstream commit of October 20, 2026) and audited from the repository checkout at `1ee4659` (master after #333 and #334, which carries the 1.3.0 Kotlin changes from #320 and #324; #335, #338 and #339 change only the Swift adapter). The auditor's `review --format json --limit 50` and `analyze --format json` commands were run from the repository root; no Gradle invocation, build, test or application code of Now in Android was executed.

## Shape

A multi-module Android application: a root `settings.gradle.kts` with 35 literal `include` declarations (`:app`, `:app-nia-catalog`, `:benchmarks`, `:core:*`, `:feature:*:api`, `:feature:*:impl`, `:sync:*`, `:lint`, `:ui-test-hilt-manifest`), convention plugins in an included build (`build-logic`, `pluginManagement { includeBuild("build-logic") }`), product flavors `demo` and `prod` declared in the convention plugins, Kotlin DSL build files everywhere, a Gradle wrapper, JUnit 4 and `kotlin.test`. Test code lives in 25 `src/test` files, 12 `src/androidTest` files and one flavor-specific `src/testDemo` file; six modules exist only to support tests (`core/testing`, `core/data-test`, `core/datastore-test`, `core/screenshot-testing`, `sync/sync-test`, `ui-test-hilt-manifest`) and one holds Macrobenchmarks.

## Results

| Measure | Value |
| --- | ---: |
| Detected project roots | 2 (the aggregate root `.` and the included build `build-logic`), both audited |
| Root profile | `./gradlew test`, frameworks `junit` + `kotlin-test`, confidence `medium`, one `audit` diagnostic (`android-jvm-conventions`) |
| Root candidates | 48 untested, 34 covered-but-risky, 131 skipped (109 "no meaningful runtime behavior", 22 DTO-only) |
| Evidence | 48 relationships: 38 `jvm-symbol-reference`, 10 `android-instrumented-symbol-reference`; usage 13 asserted, 21 called, 12 direct, 2 referenced |
| Findings | 114: 57 missing coverage, 34 weak existing coverage, 22 low-value direct tests, 1 blocked project (medium); 1 high severity |
| `build-logic` | 8 untested convention-plugin sources, `missing-test-target`, no command |
| `review --format json --limit 50` | 0.45 s, 0.45 s, 0.47 s (three runs); 169 KB |
| `analyze --format json` | 1 s; 817 KB |
| Stability | three `audit-projects` runs produced the same canonical digest |

Counts describe heuristic audit targets, not runtime line or branch coverage. The timings are local observations of the whole repository, not the per-adapter-root measurement the corpus manifest records.

## Findings

1. **Flavor-specific test source sets are not audited (should-fix; #336).** The `app` module keeps `src/demo`, `src/prod` and `src/testDemo`; `app/src/testDemo/kotlin/.../NiaAppStateTest.kt` exercises `NiaAppState.kt`, which the audit reports as `missing-coverage` together with `NiaApp.kt`. The Android boundary diagnostic says variants and flavors are not modeled, so the bound is documented, but the main application module of the reference Android app hits it. Proposal: treat `src/test<Flavor>/` and `src/androidTest<Flavor>/` as the module's unit and instrumented sets when a sibling `src/<flavor>/` exists, and `src/<flavor>/kotlin|java` as production sources.
2. **Test-support modules are audited as production code (should-fix; #337).** `core/testing` (6 untested), `core/data-test` (5), `benchmarks` (4), `core/screenshot-testing` (1) and the other `*-test` modules contribute test doubles, fakes, test rules and benchmark definitions as candidates with add-test plan items. Proposal: recognise test-support and benchmark modules by name, by `src/main` imports of test frameworks, or by the `java-test-fixtures` plugin, and skip their sources with a reason while keeping them in the module graph.
3. **Included build audited as a project (observation).** `build-logic` is detected as its own Gradle project; its convention plugins have no tests, so it gets the `missing-test-target` coverage gap at medium severity. That is accurate, and the auxiliary-root rule in findings does not cover it. No change proposed now.

## What Held

The settings-owned aggregate was audited once from the root with the wrapper command, every included module was owned (per-module counts span `app`, `core/*`, `feature/*`, `sync/*`, `lint`), cross-module evidence followed the literal `project(":core:...")` edges (for example `core/data` 6 untested and 6 covered with 11 relationships), `src/androidTest` instrumented tests produced `android-instrumented-symbol-reference` evidence on `app`, `core/ui`, `feature/*/impl` and `sync/work` (#316), the Android boundary surfaced as one medium `audit` diagnostic instead of a high-severity blocker (#312), no candidate was double counted, and three runs gave one digest in under half a second each.

## Scorecard

Not pinned yet. Detection: pass. Ownership: fail (#337, test-support modules owned as production). Command: pass (`./gradlew test` is the wrapper command the repository documents; device execution stays out of scope and the diagnostic says so). Evidence: pending until #336 is fixed and the flavor test set is re-measured. Ranking: pass under the current severity model. Stability: pass (three identical digests). Performance: pending until the corpus measurement command records the per-root samples. The case is pinned as the adapter's `product-monorepo` corpus role once ownership and evidence pass.
