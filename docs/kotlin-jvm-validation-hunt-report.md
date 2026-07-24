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
| [libcs1](https://github.com/cs124-illinois/libcs1) root | `428d499bc0c78cd90cdbde3783a3ea983ac66eb6` | Gradle Kotlin/JVM, Kotest `StringSpec`, multiline spec declaration | high; `./gradlew test`; no blockers | 1 | 3 | 0 | about 62 ms |
| [service-apply](https://github.com/woowacourse/service-apply) root | `19c9327266c7c8ddb3f858425057ddd2c5a1370e` | Gradle Kotlin/JVM, Spring, mixed Kotest spec styles/configuration | medium; `./gradlew test`; unsupported-style, lifecycle, and data/property blockers | 56 | 47 | 104 | about 211 ms |
| [Datadog Synthetic Test Support](https://github.com/personio/datadog-synthetic-test-support) root | `73c2f5c74058f75ba9928e055e272e3955e0418d` | Gradle Kotlin/JVM, JUnit suite with Kotest runtime configured | high; `./gradlew test`; no blockers | 8 | 17 | 38 | about 118 ms |
| [OpenTest4K](https://github.com/willowtreeapps/opentest4k) root | `5b9854f9bfa13d9dda4d73d0984a9b8871986cb9` | single-module Kotlin Multiplatform, default JVM target, `kotlin.test`, common and JVM tests | high; `./gradlew jvmTest`; no blockers | 1 | 1 | 0 | about 50 ms |
| [kmp-base](https://github.com/codinux-gmbh/kmp-base) root | `52fa023ddece81f531c0b9b9c4f4acff7732b698` | two-module KMP aggregate, one JVM target per module, `commonTest` project dependency | medium; `./gradlew :kmp-base:jvmTest :kmp-base-text:jvmTest`; Android boundary blocker | 6 | 6 | 12 | about 14 ms |
| [SimpleCpfValidator](https://github.com/LeoColman/SimpleCpfValidator) root | `5fb0d88620cc3129bab0c254b19d3047ab6afb09` | single-module Kotlin Multiplatform with a default JVM target and Kotest property tests | medium; `./gradlew jvmTest`; KMP Kotest execution/property blockers | 1 | 0 | 0 | about 40 ms |
| [KVision RealWorld](https://github.com/rjaros/kvision-realworld-example-app-fullstack) root | `c9b1f650fd2204c92715fd36e1ad76bf4209b90e` | single-module Kotlin Multiplatform with literal `jvm("backend")` and JS targets | medium; `./gradlew backendTest`; no blockers | 8 | 0 | 6 | about 50 ms |
| [ktor-io-perf](https://github.com/whyoleg/ktor-io-perf) root | `80a50e25e663a881db145583fba6da6001a6d5f8` | single-module Kotlin Multiplatform with two named JVM targets and native targets | low; `./gradlew test`; multiple-target and owned-source blockers | 0 | 0 | 0 | about 40 ms |
| [OHC](https://github.com/snazy/ohc) root | `7f59c264fe8ae4c859b9662c8cea15620f0f55f8` | Maven reactor, Java, mixed simple and advanced TestNG methods | medium; `mvn test`; advanced TestNG evidence blocker | 36 | 11 | 28 | about 81 ms |
| [FusionAuth java-http](https://github.com/FusionAuth/java-http) root | `70aec888ef179954dad5b5b54e2fbc86a9444f41` | Maven, Java, TestNG listener and excluded-group execution | low; no command; custom execution and advanced evidence blockers | 34 | 0 | 31 | about 70 ms |
| [ReportPortal TestNG agent](https://github.com/reportportal/agent-java-testNG) root | `ae2b0beb07314f2dfb3473b28f481257d0bd175b` | Gradle, Java, JUnit Platform execution plus TestNG integration fixtures | medium; `./gradlew test`; TestNG execution and advanced evidence blockers | 0 | 4 | 3 | about 68 ms |
| [graphql-java](https://github.com/graphql-java/graphql-java) root | `94f398d50cbff7d5810b6ffc5692fa3947482c99` | Gradle, Java, mostly Spock plus JUnit/TestNG | medium; `./gradlew test`; advanced Spock/TestNG evidence blockers | 186 | 164 | 303 | about 968 ms |
| [Micronaut Core](https://github.com/micronaut-projects/micronaut-core) root | `bbfae6eb35121ff5268ee391c0bbedbd4ab9bd97` | large Gradle aggregate, Java/Kotlin, mixed direct and inherited Spock/Kotest configuration | medium; `./gradlew test`; inherited execution and advanced evidence blockers | 1,260 | 59 | 1,318 | about 7.6 s |
| [Ratpack](https://github.com/ratpack/ratpack) root | `cc0e5a87474154cdab9b86397cb72f2ede39757b` | Gradle aggregate with renamed per-project build files and custom source sets | low; no command; framework, command, and owned-source blockers | 0 | 0 | 0 | about 74 ms |
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

libcs1 provided the narrow positive Kotest proof. Its `StringSpec` declaration places the colon and base class on a continuation line, which drove multiline spec recognition. The supported variant recovered three source relationships, all consumed by Kotest `should*` assertions; the pre-variant audit reported four untested targets and the old generic Kotest blocker.

service-apply pressured the negative boundary in a realistic mixed suite. Supported `StringSpec` tests contribute evidence, while `BehaviorSpec`/`ExpectSpec`, lifecycle hooks or extensions, and data/property APIs remain explicit blockers. Relative to the pre-variant audit, supported runnable specs increased covered targets from 24 to 47 and evidence relationships from 25 to 58, including 26 asserted relationships, without claiming the unsupported specs.

Datadog Synthetic Test Support confirmed that a conventional JUnit suite may configure the Kotest runtime without using Kotest spec classes. Its existing JUnit evidence remains stable at 60 relationships while the obsolete blanket Kotest blocker disappears; JUnit `BeforeEach` usage is not misclassified as Kotest lifecycle configuration.

OpenTest4K provided the positive single-module KMP JVM proof. The adapter owns its conventional `commonMain`, `commonTest`, `jvmMain`, and `jvmTest` roots, selects `./gradlew jvmTest`, and emits five relationships from common tests to the common implementation. The JVM implementation remains visibly untested rather than being credited from `commonTest`. Before this slice the same pinned root was low-confidence, selected the generic `./gradlew test` task, reported missing-standard-source-set and blanket multiplatform blockers, and emitted no targets.

kmp-base provided the positive settings-owned KMP aggregate proof. Both declared child modules have one literal JVM target, so the adapter owns their conventional common/JVM roots and selects both module-qualified `jvmTest` tasks. Twelve exact evidence relationships cover six targets, including one called relationship from `kmp-base-text/commonTest` to `kmp-base/commonMain` admitted through that source set's direct `implementation(project(":kmp-base"))` dependency. The Android plugin and custom intermediate source sets remain outside the JVM claim, with Android reported explicitly and non-owned source sets ignored.

SimpleCpfValidator provided the negative framework-pressure proof. Its default JVM target is now owned and the command narrows from `./gradlew test` to `./gradlew jvmTest`, exposing one production candidate. Its KMP Kotest property suite remains outside the evidence boundary, so the adapter reports explicit execution/property blockers and emits no false coverage. Before this slice the root emitted no targets behind blanket source-set and multiplatform blockers.

KVision RealWorld provided the positive literal named-target proof. Its `jvm("backend")` declaration deterministically maps to `backendMain`, `backendTest`, and `./gradlew backendTest`. The repository currently has no backend/common test files, so the profile remains medium-confidence while exposing eight untested candidates and six low-value skips without claiming evidence from the unrelated frontend tests. Before named-target support the same pinned root selected generic `./gradlew test`, emitted no targets, and reported missing-root-source and default-JVM-only blockers.

ktor-io-perf provided the multiple-JVM negative boundary. Its `jvm("jvmOld")` and `jvm("jvmIr")` declarations would require more than one source/task graph, so the adapter retains a precise multiple-target ownership blocker and emits no candidates or evidence.

OHC provided the positive TestNG reactor probe. A direct TestNG dependency in its owned `ohc-core` module recovers `mvn test` and 11 source relationships from simple method-level tests, including four assertion-traced relationships. Files using lifecycle or generated/parameterized semantics are excluded and keep the profile medium-confidence. The pre-variant generic `@Test` heuristic emitted 70 relationships across 21 targets, so the bounded variant deliberately removes 59 relationships that could not be tied to the supported execution/evidence subset.

FusionAuth java-http exercised custom Maven execution. Its Surefire listener and excluded-group selection can change which methods run, so the adapter refuses to infer a conventional TestNG command or coverage. This removes 35 relationships that the previous generic annotation heuristic emitted despite the blanket unsupported-framework blocker.

The ReportPortal TestNG agent confirmed mixed-framework isolation. Its build executes JUnit Platform rather than Gradle `useTestNG()`, so TestNG integration fixtures remain excluded while independently runnable JUnit evidence stays available. The evidence graph narrows from 32 to 29 relationships and keeps precise execution blockers rather than treating every `@Test` annotation alike.

graphql-java provided the strongest positive Spock pressure. Its directly declared `spock-core` dependency and conventional JUnit Platform task admit simple direct `Specification` feature methods while excluding files that use fixtures, data tables, extensions, helper assertions, or interaction mocking. The supported subset produces 701 exact source relationships across 164 covered targets, including 318 assertion-traced relationships; the pre-variant audit reported all 350 actionable targets as untested and no evidence. Advanced Spock and TestNG files keep the profile medium-confidence rather than being silently counted.

Micronaut Core pressured mixed direct and inherited framework configuration across a very large aggregate. The bounded variant adds five Spock relationships and moves four targets into covered evidence where module-local execution is directly visible, while modules relying on inherited Spock setup remain blocked. Existing JUnit/Kotest evidence stays available, and advanced specifications keep a separate evidence blocker.

Ratpack confirmed that Spock recognition does not widen Gradle module ownership. Its settings file renames project build files to `ratpack-*.gradle` and its tests use custom source sets, so the conventional adapter owns no modules, infers no command, and emits no evidence—the same conservative result as before the Spock variant.

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
- replaced blanket Kotlin Multiplatform exclusion with bounded single-module default and literal named-JVM slices and retained a precise blocker for multi-module, computed/multiple-target, and otherwise unowned KMP shapes
- added `commonMain`/`commonTest` and `jvmMain`/`jvmTest` ownership, source-set-qualified evidence reachability, and wrapper-aware `jvmTest` selection
- added OpenTest4K as the positive KMP JVM probe and reused SimpleCpfValidator as the unsupported-Kotest pressure probe
- added literal target-name derivation for `<targetName>Main`, `<targetName>Test`, and the `<targetName>Test` task, validated positively against KVision RealWorld and negatively against ktor-io-perf
- added settings-owned all-KMP aggregate ownership, module-qualified target tasks, and direct source-set-visible project-dependency qualification, validated against kmp-base
- added Fray as a pinned multi-module Kotlin/Java validation probe with eight dependency-qualified cross-module evidence relationships
- added Maven Surefire as a pinned reactor validation probe with 143 dependency-qualified cross-module evidence relationships
- added NightConfig and Maven Resolver as pinned exported-transitive validation probes, recovering nine Gradle and six Maven evidence relationships respectively
- replaced the blanket Kotest blocker with bounded Gradle/JUnit Platform support for runnable `FunSpec`, `StringSpec`, and `ShouldSpec` cases
- added Kotest `should*` and throwable assertion provenance, including receiver/result aliases
- added explicit blockers for unsupported Kotest spec styles, lifecycle/extensions/isolation configuration, and data/property APIs
- added multiline Kotest spec declaration recognition after the libcs1 probe
- replaced the blanket TestNG blocker and framework-agnostic `@Test` evidence with method-level TestNG support for direct Maven dependencies or Gradle `useTestNG()` tasks
- added explicit TestNG blockers for class-level tests, lifecycle hooks, providers/factories/parameters, listeners, dependency/group attributes, suite XML, group filters, and parallel/custom execution
- added OHC, FusionAuth java-http, and the ReportPortal TestNG agent as pinned positive/negative execution-boundary probes
- replaced the blanket Spock blocker with bounded `src/test/groovy` support for direct `Specification` subclasses containing conventional feature methods and `then:`/`expect:` conditions
- added Spock condition provenance through `given`/`when` aliases, plus explicit blockers for fixtures, data tables, extensions, helper assertions, interaction mocking, configuration files, and custom JUnit Platform selection
- added graphql-java, Micronaut Core, and Ratpack as pinned positive, mixed-configuration, and ownership-boundary Spock probes
- retained explicit aggregate-root, missing owned source-set, Android, broader KMP, advanced Spock/TestNG, and unsupported Kotest boundary blockers
- added discovery profiles for Gradle/JUnit, single-module Gradle/KMP JVM, Gradle/Kotest, Gradle/Spock, Gradle/TestNG, Maven/JUnit, and Maven/TestNG validation candidates

## Remaining Gaps

- Maven profile/computed/nested reactor graphs, inherited/dynamic dependencies, Gradle composite builds, custom module mappings, and non-exported transitive project dependencies
- Groovy production and nonstandard test source sets, Maven/inherited/test-suite Spock execution, Spock fixture/data/extension/mock semantics, Android, mixed/incomplete/remapped or source-set-transitive multi-module KMP, computed/multiple-JVM-target or custom-hierarchy KMP, KMP Kotest/Spock/TestNG execution, TestNG class-level/lifecycle/generated/configured execution semantics, Kotest styles beyond `FunSpec`/`StringSpec`/`ShouldSpec`, and Kotest lifecycle/data/property semantics
- parameterized arguments, dynamic tests, extensions, fixtures, and inherited tests as semantic coverage
- framework-aware application boot, HTTP, persistence, coroutine scheduling, and dependency-injection boundaries
- call/assertion depth beyond the currently referenced or direct symbol relationship

## Verdict

The live probes support conventional single-module or directly selected Gradle/Maven JVM roots, settings-owned conventional Gradle aggregates, directly declared Maven reactors, cycle-safe traversal through explicitly exported Gradle/Maven module edges, and single-module or settings-owned all-KMP builds with conventional common/JVM source sets and exactly one literal default or named JVM target per source module. KMP cross-module evidence requires a direct project dependency visible from the test source set. Supported evidence uses JUnit 4, JUnit 5, `kotlin.test`, the documented conventional-Gradle Kotest common-spec and Spock feature variants, or method-level TestNG under direct conventional Maven/Gradle execution. They do not support a broad Kotlin/Java, Kotlin Multiplatform, Kotest, Spock, or TestNG ecosystem claim. The exact boundary is normative in [Kotlin/JVM Alpha Support](kotlin-jvm-alpha-support.md).
