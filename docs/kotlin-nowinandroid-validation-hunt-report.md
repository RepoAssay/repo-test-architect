# Kotlin/JVM Product-Monorepo Validation Hunt: Now in Android

This report records the product-monorepo hunt pass (#325) for the Kotlin/JVM adapter against Google's [`android/nowinandroid`](https://github.com/android/nowinandroid), shallow-cloned at commit `2982e63cb691ad49cd009aab43dc206fee6699c2` (upstream commit of October 20, 2026) and audited from the repository checkout at `1ee4659` (master after #333 and #334, which carries the 1.3.0 Kotlin changes from #320 and #324; #335, #338 and #339 leave the Kotlin/JVM results unchanged because only the Swift adapter implements the cross-project hook). The auditor's `review --format json --limit 50` and `analyze --format json` commands were run from the repository root; no Gradle invocation, build, test or application code of Now in Android was executed.

## Shape

A multi-module Android application: a root `settings.gradle.kts` with 35 literal `include` declarations (`:app`, `:app-nia-catalog`, `:benchmarks`, `:core:*`, `:feature:*:api`, `:feature:*:impl`, `:sync:*`, `:lint`, `:ui-test-hilt-manifest`), convention plugins in an included build (`build-logic`, `pluginManagement { includeBuild("build-logic") }`), product flavors `demo` and `prod` declared in the convention plugins, Kotlin DSL build files everywhere, a Gradle wrapper, JUnit 4 and `kotlin.test`. Test code lives in 39 Kotlin files under `src/test` (ten of them Roborazzi `*ScreenshotTests.kt`), 13 under `src/androidTest` (12 tests and one helper) and five under the flavor-specific `app/src/testDemo` (`NiaAppStateTest.kt`, three screenshot tests and one helper); six modules exist only to support tests (`core/testing`, `core/data-test`, `core/datastore-test`, `core/screenshot-testing`, `sync/sync-test`, `ui-test-hilt-manifest`) and one holds Macrobenchmarks.

## Results

| Measure | Value |
| --- | ---: |
| Detected project roots | 2 (the aggregate root `.` and the included build `build-logic`), both audited |
| Root profile | `./gradlew test`, frameworks `junit` + `kotlin-test`, confidence `medium`, one `audit` diagnostic (`android-jvm-conventions`) |
| Root candidates | 48 untested, 34 covered-but-risky, 131 skipped (109 "no meaningful runtime behavior", 22 DTO-only) |
| Evidence | 48 relationships: 38 `jvm-symbol-reference`, 10 `android-instrumented-symbol-reference`; usage `called` 21, `asserted` 13, none 14; strength `direct` 22, `referenced` 26 |
| Findings | 114: 57 missing coverage, 34 weak existing coverage, 22 low-value direct tests, 1 blocked project (medium); 1 high severity |
| `build-logic` | 8 untested convention-plugin sources, `missing-test-target`, no command |
| `review --format json --limit 50` | 0.45 s, 0.45 s, 0.47 s (three runs); 169 KB |
| `analyze --format json` | 1 s; 817 KB |
| Stability | three `audit-projects` runs produced the same canonical digest |

Counts describe heuristic audit targets, not runtime line or branch coverage. The timings are local observations of the whole repository, not the per-adapter-root measurement the corpus manifest records.

## Findings

1. **Flavor-specific test source sets are not audited (should-fix; #336).** The `app` module keeps `src/demo`, `src/prod` and `src/testDemo`; `app/src/testDemo/kotlin/.../NiaAppStateTest.kt` exercises `NiaAppState.kt`, which the audit reports as `missing-coverage` together with `NiaApp.kt`. The Android boundary diagnostic says variants and flavors are not modeled, so the bound is documented, but the main application module of the reference Android app hits it. Proposal: treat `src/test<Flavor>/` and `src/androidTest<Flavor>/` as the module's unit and instrumented sets when a sibling `src/<flavor>/` exists, and `src/<flavor>/kotlin|java` as production sources.
2. **Test-support modules are audited as production code (should-fix; #337).** `core/testing` (6 untested), `core/data-test` (5), `benchmarks` (4), `core/screenshot-testing` (1) and the other `*-test` modules contribute test doubles, fakes, test rules and benchmark definitions as candidates with add-test plan items. Proposal: recognise test-support and benchmark modules by name, by `src/main` imports of test frameworks, or by the `java-test-fixtures` plugin, and skip their sources with a reason while keeping them in the module graph.
3. **The suggested command is one the repository says not to run (should-fix; #341).** The root profile suggests `./gradlew test` at confidence `medium`. nowinandroid's README documents `testDemoDebug` and `connectedDemoDebugAndroidTest` and says that `./gradlew test` runs the tests against every build variant and fails because only `demoDebug` has tests; CI runs `testDemoDebug`. The Android boundary diagnostic says variants and flavors are not modeled but not that the aggregate `test` task fans out over them. Found by the independent review of this report. Proposal: when the module graph declares product flavors, suggest `test<Flavor><BuildType>` when exactly one flavor has test sources, otherwise withhold the command with a `command` diagnostic that lists the variant tasks.
4. **Instrumented DAO tests produce no evidence (observation).** `core/database` keeps three `src/androidTest` DAO tests, and the module contributes no instrumented evidence because its sources are skipped as interfaces and data classes (16 skipped, 1 untested). That is consistent with the skip rule; it is noted for the re-measure after #336.
5. **Included build audited as a project (observation).** `build-logic` is detected as its own Gradle project; its convention plugins have no tests, so it gets the `missing-test-target` coverage gap at medium severity. That is accurate, and the auxiliary-root rule in findings does not cover it. No change proposed now.

## What Held

The settings-owned aggregate was audited once from the root with one wrapper command (the wrong task for this repository, finding 3), every included module was owned (per-module counts span `app`, `core/*`, `feature/*`, `sync/*`, `lint`), cross-module evidence followed the literal `project(":core:...")` edges (for example `core/data` 6 untested and 6 covered with 11 relationships), `src/androidTest` instrumented tests produced `android-instrumented-symbol-reference` evidence on `app`, `core/ui`, `feature/*/impl` and `sync/work` (#316), the Android boundary surfaced as one medium `audit` diagnostic instead of a high-severity blocker (#312), no candidate was double counted, and three runs gave one digest in under half a second each.

## Scorecard

Re-run on November 18, 2026 against master after #346 (#336, #341), #347 (#337) and #353. Two roots; `./gradlew testDemoDebugUnitTest` with the signals `android product flavors (demo)` and `android flavor unit tests (demo)`; `app/src/testDemo` is a test location and covers `NiaAppState.kt` and `NiaApp.kt`; four `src/demo` sources are audited; the six test-support and benchmark modules contribute 48 skipped `test-support` sources instead of candidates. 38 untested, 36 covered-but-risky and 171 skipped targets (was 48 / 34 / 131), 55 evidence relationships, 98 findings (was 114), 1 high severity, confidence medium (the Android boundary). The DAO observation and the `build-logic` observation stand: `build-logic` again carries only `missing-test-target`; the single medium blocked-project finding is the root's Android boundary. An intermediate master had flagged it as an Android module because it applies `alias(libs.plugins.android.lint)`, which the independent review of this pin caught; #353 counts only Android module-kind plugins.

Pinned as `kotlin-nowinandroid`, the Kotlin/JVM adapter's `product-monorepo` corpus case, with a repository-scan measurement: 2 projects, the counts above, `./gradlew testDemoDebugUnitTest`, 279 ms median over five scans (369, 286, 276, 279, 277 ms) and one canonical digest. Detection: pass. Ownership: pass (#337 fixed). Command: pass (#341 fixed; the task the repository's CI runs). Evidence: pass (#336 fixed). Ranking: pass. Stability: pass. Performance: pass. The role is enforced for the adapter from this pin on.
