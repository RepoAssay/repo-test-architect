# Kotlin/JVM Validation Hunt Report

This report records static audits of pinned public repositories used to pressure the bounded Kotlin/JVM adapter. Repositories were shallow-cloned locally; no repository build, plugin, test, or application code was executed.

## Pinned Probes

| Repository/root | Commit | Shape | Profile result | Untested | Covered | Skipped | Static audit |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| [JUnit 4](https://github.com/junit-team/junit4) root | `300468b1efd48d76fac2f7bd6d576846dcbbf5ed` | Maven, Java, JUnit 4, Maven wrapper | high; `./mvnw test`; no blockers | 34 | 82 | 103 | about 251 ms |
| [Cash App Barber](https://github.com/cashapp/barber) root | `97b01fc1018a1aa573405f22497480008f767450` | Gradle Kotlin DSL aggregate, Kotlin, JUnit/`kotlin.test` | high; `gradle test`; no blockers | 2 | 14 | 12 | about 29 ms |
| [Mockito-Kotlin](https://github.com/mockito/mockito-kotlin) root | `7a1f513e21b9bc0a65b282c3c065b26a7f900c43` | Gradle aggregate, Kotlin, JUnit | high; `./gradlew test`; no blockers | 10 | 7 | 7 | about 24 ms |
| [Fray](https://github.com/cmu-pasta/fray) root | `b5650548c272749e795ebb27cc7c1f12d6c8ee01` | multi-module Gradle, mixed Kotlin/Java, JUnit/`kotlin.test` | high; `./gradlew test`; no blockers | 176 | 23 | 112 | about 111 ms |
| [NightConfig](https://github.com/TheElectronWill/night-config) root | `9d2c9564518666927f29f3059a8772f006444f1a` | multi-module Gradle, Java, JUnit, exported API chains | high; `./gradlew test`; no blockers | 65 | 26 | 86 | about 120 ms |
| [Apache Maven Surefire](https://github.com/apache/maven-surefire) root | `8dcf263f808c15b00a7064ec6ea3f9268c1d4b51` | multi-module Maven reactor, Java, JUnit 4/5 | high; `mvn test`; no blockers | 24 | 132 | 130 | about 520 ms |
| [Apache Maven Resolver](https://github.com/apache/maven-resolver) root | `651e7b1d1f43035e94001fddf6afb09d5a060705` | multi-module Maven reactor, Java, JUnit, compile-exported chains | high; `mvn test`; no blockers | 151 | 232 | 245 | about 680 ms |
| [graphql-java](https://github.com/graphql-java/graphql-java) root | `94f398d50cbff7d5810b6ffc5692fa3947482c99` | Gradle, Java, mostly Spock plus JUnit/TestNG | medium; `./gradlew test`; Spock/TestNG blocker | 345 | 0 | 300 | about 70 ms |
| [KotlinPoet](https://github.com/square/kotlinpoet) root | `be2de914ce6eb3694092ed4e0f28626cbce1ffe0` | mixed conventional JVM and Kotlin Multiplatform Gradle modules | medium; `./gradlew test`; multiplatform blocker | 20 | 5 | 6 | about 21 ms |

Timing is an observed local static-analysis duration, not a performance guarantee. Counts describe heuristic audit targets, not runtime line or branch coverage.

## What The Probes Established

JUnit 4 exercised a large conventional Maven/Java repository, Maven wrapper selection, JUnit 3/4 execution markers, Java same-package references, exact imports, and static-member imports. Its 706 evidence relationships include 99 asserted, 425 called, and 182 deliberately unqualified references. The 34 untested candidates are conservative: several are reached indirectly through runners/builders rather than referenced from executable tests, and the adapter does not infer that runtime graph.

Barber provided the strongest in-bound Kotlin aggregate sample. Its conventionally included `barber` and `barber-protos` modules are owned by the root audit. Exact Kotlin types and top-level functions produced direct or same-package evidence, including 23 assertion-traced relationships, while `src/test` fixture/support files were excluded unless they contained runnable test markers.

Mockito-Kotlin confirmed that its settings-declared library module can be audited once from the aggregate root with the root wrapper. Candidate counts remain identical to the direct-module probe, while composite `includeBuild` projects remain outside the owned module graph.

Fray provided direct cross-module pressure. Eight evidence relationships cross module boundaries and are admitted only through explicit project dependencies, including integration tests reaching `core` and `core` tests reaching `rmi`; asserted/called usage remains attached to the underlying JVM symbol evidence. Its many untested candidates remain visible because the adapter does not infer non-exported project dependencies or runtime instrumentation reachability.

NightConfig provided exported-transitive Gradle pressure. Compared with direct-only ownership, nine new evidence relationships reach `core` from `test-multiple` through the `toml`/`json` modules' explicit `api(project(":core"))` edges. One source target moves from untested to covered; Gradle `implementation` edges remain non-exported.

Maven Surefire exercised the root-declared reactor boundary at realistic scale. The static audit found 348 evidence relationships across ten owned test locations; 143 relationships crossed module boundaries and were admitted through direct Maven reactor dependencies (24 asserted, 94 called, and 25 referenced). Profile-owned modules, nested reactor expansion, and inherited/dynamic dependency inference remain outside that result. The repository's embedded integration-test sample POMs are separate project-detection candidates, not silently absorbed into the root reactor.

Maven Resolver provided exported-transitive Maven pressure. Six new called relationships reach `maven-resolver-api` sources through intermediate reactor modules' non-optional compile dependencies. Target counts remain stable while the evidence graph grows from 711 to 717 relationships; provided/test/optional or exclusion-bearing edges are usable when directly declared by the test module but are not traversed as exports.

graphql-java demonstrated why framework detection must not equal coverage detection. Its main test suite is Groovy/Spock, with additional TestNG configuration. The adapter reports those unsupported frameworks as blockers and does not interpret Groovy specifications as Java source coverage.

KotlinPoet demonstrated the mixed aggregate boundary. The audit selects only settings-declared modules with conventional JVM source sets, reports their 31 targets, and emits a multiplatform blocker for the larger target-specific graph rather than claiming full support.

## Changes Driven By Live Validation

- replaced same-basename coverage with exact `jvm-symbol-reference` provenance
- added Java static-member and Kotlin top-level-function ownership
- isolated duplicate class basenames by package
- required runnable test markers so empty shells and test helpers do not imply coverage
- added bounded receiver/result tracing so constructor or function calls consumed by JUnit/`kotlin.test` assertions emit asserted rather than merely called evidence
- added Maven wrapper preference alongside Gradle wrapper preference
- recovered nearest parent Gradle/Maven wrappers only for conventionally declared module paths, with qualified Gradle tasks or Maven reactor selectors
- added settings-owned Gradle aggregate graphs, direct `project(":source")` dependency qualification for cross-module test evidence, and project-detection collapse for owned child modules
- added root-declared Maven reactor graphs, static coordinate and direct dependency qualification, and project-detection collapse for conventionally owned child POMs
- added cycle-safe traversal through Gradle `api(...)` and Maven non-optional compile exports while retaining direct test-visible dependency scopes
- added an explicit Kotlin Multiplatform blocker for mixed aggregate roots that also contain auditable conventional JVM modules
- added Fray as a pinned multi-module Kotlin/Java validation probe with eight dependency-qualified cross-module evidence relationships
- added Maven Surefire as a pinned reactor validation probe with 143 dependency-qualified cross-module evidence relationships
- added NightConfig and Maven Resolver as pinned exported-transitive validation probes, recovering nine Gradle and six Maven evidence relationships respectively
- added explicit aggregate-root, missing standard source-set, Android, Spock, TestNG, and Kotest blockers
- added discovery profiles for Gradle/JUnit and Maven/JUnit validation candidates

## Remaining Gaps

- Maven profile/computed/nested reactor graphs, inherited/dynamic dependencies, Gradle composite builds, custom module mappings, and non-exported transitive project dependencies
- Groovy/Spock, Kotest, TestNG, Android, and Kotlin Multiplatform
- parameterized arguments, dynamic tests, extensions, fixtures, and inherited tests as semantic coverage
- framework-aware application boot, HTTP, persistence, coroutine scheduling, and dependency-injection boundaries
- call/assertion depth beyond the currently referenced or direct symbol relationship

## Verdict

The live probes support conventional single-module or directly selected Gradle/Maven JVM roots, settings-owned conventional Gradle aggregates, directly declared Maven reactors, and cycle-safe traversal through explicitly exported Gradle/Maven module edges using JUnit 4, JUnit 5, or `kotlin.test`. They do not support a broad Kotlin/Java ecosystem claim. The exact boundary is normative in [Kotlin/JVM Alpha Support](kotlin-jvm-alpha-support.md).
