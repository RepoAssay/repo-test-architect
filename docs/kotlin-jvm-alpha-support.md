# Kotlin/JVM Alpha Support

This matrix defines the bounded private-alpha support claim for the Kotlin/JVM adapter. The supported unit is a conventional Gradle or Maven JVM module root, a conventional Gradle aggregate, or a root-declared Maven reactor whose directly owned modules have standard JVM source sets—not every project that happens to contain Kotlin or Java.

## Current Common-Pattern Coverage

| Area | Current support | Evidence used |
| --- | --- | --- |
| Project shapes | Single-module or directly audited Gradle/Maven JVM modules; conventional Gradle aggregates; root-declared Maven reactors | root/module build files, settings `include(...)` declarations, root POM `<modules>`, static Maven coordinates, and standard JVM source sets |
| Languages | Kotlin, Java, and mixed Kotlin/Java modules | `.kt` and `.java` files under `src/main/kotlin`, `src/main/java`, `src/test/kotlin`, and `src/test/java` |
| Test frameworks | JUnit 4, JUnit 5/Jupiter, `kotlin.test`, and Kotest `FunSpec`, `StringSpec`, or `ShouldSpec` in Gradle JVM modules using JUnit Platform; method-level TestNG with a direct Maven dependency or Gradle `useTestNG()` | build dependencies/tasks, test imports and annotations, supported Kotest base classes and runnable cases, and exact TestNG method annotations |
| Commands | local wrappers, conventionally owned parent Gradle/Maven wrappers with module-qualified tasks/selectors, or system Gradle/Maven test commands | local and nearest parent `gradlew`/`mvnw`, Gradle settings includes, Maven reactor modules, and module build files |
| Test provenance | exact imported types/functions, Java static-member imports, Kotlin top-level functions, same-package symbol references, wildcard package imports, fully qualified references, bounded receiver/result aliases consumed by JUnit, Kotest, or TestNG assertions, and dependency-qualified cross-module test reachability | parsed package/import declarations, exact source-symbol references, calls, assignments, assertion bodies including `shouldBe`/`shouldThrow`, TestNG `assert*`, and `expectThrows` forms, owning modules, direct Gradle project dependencies plus exported `api(...)` chains, and direct Maven compile/provided/test dependencies plus non-optional compile chains |
| Test execution boundary | conventional test source files containing JUnit test, parameterized-test, factory/template, repeated-test, or runner annotations; JUnit 3 `TestCase` subclasses; runnable cases in the three supported Kotest spec styles; method-level TestNG tests without advanced annotations/attributes | supported framework markers plus a runnable case or method; a filename, empty spec, class-level TestNG annotation, advanced TestNG file, or helper under `src/test` is not sufficient |
| Candidate boundaries | parsers, mappers, validators, formatters, converters, calculators, services, clients, repositories, gateways, and branching utilities | path, branching, and external-I/O signals |
| Low-value boundaries | Kotlin data classes, Java records, declaration-only interfaces/enums, and files without detected runtime behavior | declarations, path, and source content |
| Changed-file audits | repository-relative, current-directory-relative, absolute, and Windows-style paths | normalized paths passed through the shared audit API |

Existing coverage emits `jvm-symbol-reference` provenance with direct or referenced strength and optional called/asserted usage. An empty `InvoiceValidatorTest` class, an unrelated same-basename test, or a `TestFixtures.kt` helper does not move a source target into `coveredButRisky`.

## Explicit Exclusions

The current support claim does not include:

- Android application/library unit-test semantics, Robolectric, or `src/androidTest` instrumentation tests
- Kotlin Multiplatform source sets such as `commonMain`, `commonTest`, `jvmMain`, and `jvmTest`
- Maven profile-activated modules, property-expanded or escaping module paths, nested reactor expansion, inherited dependencies, non-compile/optional/exclusion-bearing transitive edges, dynamic coordinates, and nonstandard module layouts
- Gradle composite builds, custom `projectDir` remaps, non-`api` transitive project dependencies, modules containing explicit dependency exclusions, and modules without conventional build files/source sets
- Groovy production/test sources and Spock
- Kotest on Maven or without a directly visible Gradle `useJUnitPlatform()` task; Kotest styles other than `FunSpec`, `StringSpec`, and `ShouldSpec`; Kotest lifecycle hooks, listeners/extensions, isolation/project configuration, data-driven tests, and property tests
- TestNG class-level tests, lifecycle hooks, data providers, factories, parameters, listeners, dependency/group attributes, disabled/generated tests, suite XML, group filters, parallel configuration, or other custom execution selection
- Spek, Cucumber, or other unsupported execution models
- custom Gradle source sets, Gradle TestKit reachability, generated sources, annotation-processor/KSP output, or build-logic projects
- Spring, Ktor, Micronaut, Quarkus, persistence, HTTP-client, coroutine, or dependency-injection lifecycle semantics beyond direct JVM symbol evidence
- reflection, service loaders, runtime classpath scanning, test inheritance across modules, fixtures/extensions that create source objects indirectly, or dynamically generated tests
- branch or assertion completeness; a direct test reference is evidence of a relationship, not proof that important behavior is asserted

Unsupported test frameworks or Kotest variants, Android or multiplatform markers, missing owned standard source sets, and unresolvable aggregate shapes are emitted as blockers instead of silently upgraded to supported coverage.

## Promotion Gates

The bounded adapter is promoted only when all of these remain true:

1. Gradle Kotlin DSL, Gradle Groovy DSL, Maven, Gradle wrapper, Maven wrapper, and conventional Gradle/Maven aggregate behavior is fixture-locked.
2. Mixed Kotlin/Java ownership and exact JVM symbol evidence are deterministic.
3. Duplicate basenames, empty test shells, and `src/test` helper files cannot create false coverage.
4. Conventional Gradle and Maven module graphs are dependency-qualified through direct or explicitly exported edges with cycle protection; supported Kotest specs require Gradle/JUnit Platform execution and supported TestNG files require direct conventional execution; custom mappings, computed/nested reactors, non-exported dependencies, Android, multiplatform, and unsupported framework/spec shapes remain visibly blocked or excluded.
5. Representative public Kotlin and Java repositories produce explainable results without executing repository code.
6. Golden artifacts, model-consistency locks, schema validation, and the full local release gate pass.

## Promotion Verdict

The gates are met for the common patterns above. The adapter is registered as `supported` within this matrix, not as universal Kotlin, Java, Gradle, Maven, or Android support. Live evidence and remaining gaps are recorded in [Kotlin/JVM Validation Hunt Report](kotlin-jvm-validation-hunt-report.md).

## Post-Promotion Pressure

1. Pressure nested/computed Maven reactors and additional statically provable dependency syntax without widening ownership implicitly.
2. Add Kotlin Multiplatform only after source-set ownership and target-specific test commands are deterministic.
3. Evaluate additional Kotest and TestNG semantics plus Spock as separate execution/evidence variants without inferring their semantics from a generic test marker.
4. Add framework-specific HTTP, persistence, coroutine, and DI semantics only from representative repository evidence.
