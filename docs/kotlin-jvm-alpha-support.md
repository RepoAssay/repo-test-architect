# Kotlin/JVM Alpha Support

This matrix defines the bounded public-alpha support claim for the Kotlin/JVM adapter. The supported unit is a conventional Gradle or Maven JVM module root, a complete literal root-declared Gradle aggregate, a root-declared Maven reactor whose directly owned modules have standard JVM source sets, one conventional Kotlin Multiplatform Gradle module, or a settings-owned all-KMP aggregate whose source modules each have exactly one literal default or named JVM target—not every project that happens to contain Kotlin or Java.

## Current Common-Pattern Coverage

| Area | Current support | Evidence used |
| --- | --- | --- |
| Project shapes | Single-module or directly audited Gradle/Maven JVM modules; complete literal root-declared Gradle aggregates; complete root-declared Maven reactors; one KMP module or a settings-owned all-KMP aggregate whose source modules each declare exactly one literal `jvm()` or `jvm("name")` target | root/module build files, literal repository-contained settings `include(...)` declarations, complete conventional child build ownership with no remaps or unowned nested settings expansion, literal repository-contained root POM `<modules>` whose direct child POMs have static Maven coordinates and no unowned nested expansion, standard JVM source sets, and conventional `commonMain`/`commonTest` plus target-derived `<name>Main`/`<name>Test` source sets |
| Languages | Kotlin, Java, and mixed Kotlin/Java production modules, plus Groovy only for bounded Spock test evidence | `.kt` and `.java` files under standard JVM roots; KMP Kotlin under `commonMain`/`commonTest` and Kotlin or Java under the literal JVM target's derived main/test roots; `.groovy` only under standard `src/test/groovy` for supported Spock specifications |
| Test frameworks | JUnit 4, JUnit 5/Jupiter, `kotlin.test`, and Kotest `FunSpec`, `StringSpec`, or `ShouldSpec` in conventional Gradle JVM modules using JUnit Platform; conventional Spock feature methods in direct `Specification` subclasses with a direct `spock-core` dependency and JUnit Platform; method-level TestNG with a direct Maven dependency or Gradle `useTestNG()`; KMP `kotlin.test` plus bounded JUnit annotations in the target-derived JVM test source set | build dependencies/tasks, test imports and annotations, supported Kotest base classes and runnable cases, direct Spock specification inheritance plus feature/condition blocks, and exact TestNG method annotations |
| Commands | local wrappers, conventionally owned parent Gradle/Maven wrappers with module-qualified tasks/selectors, system Gradle/Maven test commands, or every supported KMP module's `<targetName>Test` task; competing root commands and incomplete Gradle aggregate or Maven reactor ownership block selection | local and nearest parent `gradlew`/`mvnw`, root build entrypoints, complete literal Gradle settings includes, complete Maven reactor modules, module build files, and literal default or named KMP JVM targets; aggregate KMP tasks are module-qualified and nested auxiliary build markers do not compete with the audited root |
| Test provenance | exact imported types/functions, Java static-member imports, Kotlin top-level functions, same-package symbol references, wildcard package imports, fully qualified references, bounded receiver/result aliases consumed by supported conditions/assertions, dependency-qualified cross-module test reachability, and KMP source-set reachability where `commonTest` can cover only `commonMain` while `<targetName>Test` can cover common and JVM-target production | parsed package/import declarations, exact source-symbol references, calls, assignments, assertion bodies including `shouldBe`/`shouldThrow`, Spock `then:`/`expect:` conditions, TestNG `assert*`, and `expectThrows` forms, owning modules/source sets, direct source-set-local KMP project dependencies plus cycle-safe literal `api(project(...))` chains from the owning main/test visibility boundary, direct Gradle project dependencies plus exported `api(...)` chains, and direct Maven compile/provided/test dependencies plus non-optional compile chains |
| Test execution boundary | conventional test source files containing JUnit test, parameterized-test, factory/template, repeated-test, or runner annotations; JUnit 3 `TestCase` subclasses; runnable cases in the three supported Kotest spec styles; direct Spock specifications with quoted feature methods and `then:` or `expect:` conditions; method-level TestNG tests without advanced annotations/attributes | supported framework markers plus a runnable case, feature, or method; a filename, empty spec, advanced Spock/TestNG file, class-level TestNG annotation, or helper under `src/test` is not sufficient |
| Candidate boundaries | parsers, mappers, validators, formatters, converters, calculators, services, clients, repositories, gateways, and branching utilities | path, branching, and external-I/O signals |
| Low-value boundaries | Kotlin data classes, Java records, declaration-only interfaces/enums, and files without detected runtime behavior | declarations, path, and source content |
| Changed-file audits | repository-relative, current-directory-relative, absolute, and Windows-style paths | normalized paths passed through the shared audit API |

Existing coverage emits `jvm-symbol-reference` provenance with direct or referenced strength and optional called/asserted usage. An empty `InvoiceValidatorTest` class, an unrelated same-basename test, or a `TestFixtures.kt` helper does not move a source target into `coveredButRisky`.

## Explicit Exclusions

The current support claim does not include:

- Android application/library unit-test semantics, Robolectric, or `src/androidTest` instrumentation tests
- mixed KMP/conventional-JVM aggregates, incomplete or remapped KMP child graphs, transitive KMP `implementation`/`compileOnly` edges, dependency exclusions, computed or type-safe project accessors, top-level experimental dependency inference, computed JVM target names, multiple JVM targets in one module, custom/intermediate source-set ownership, nonconventional source directories, target hierarchy inference, and ownership or commands for non-JVM targets
- Kotest, Spock, TestNG, Groovy tests, or custom test execution inside Kotlin Multiplatform builds
- Maven profile-activated modules, property-expanded or escaping module paths, nested reactor expansion, inherited dependencies, non-compile/optional/exclusion-bearing transitive edges, dynamic coordinates, and nonstandard module layouts
- Gradle composite builds, computed or interpolated `include` declarations, custom `projectDir` remaps, unowned nested settings expansion, non-`api` transitive project dependencies, modules containing explicit dependency exclusions, and modules without conventional build files/source sets
- automatic selection between competing root Gradle and Maven verification entrypoints; the adapter reports both proven commands as an ambiguity blocker
- Groovy production sources, non-Spock Groovy tests, Maven Spock execution, Gradle `useSpock()` test-suite inference, inherited/dynamic Spock dependencies, and custom Groovy source sets
- Spock fixture methods, annotations/extensions, `where:`/`filter:` data-driven features, helper assertions such as `with`/`verifyAll`, mocks/stubs/spies and interaction expressions, configuration files, and custom JUnit Platform engine/tag/test filters
- Kotest on Maven or without a directly visible Gradle `useJUnitPlatform()` task; Kotest styles other than `FunSpec`, `StringSpec`, and `ShouldSpec`; Kotest lifecycle hooks, listeners/extensions, isolation/project configuration, data-driven tests, and property tests
- TestNG class-level tests, lifecycle hooks, data providers, factories, parameters, listeners, dependency/group attributes, disabled/generated tests, suite XML, group filters, parallel configuration, or other custom execution selection
- Spek, Cucumber, or other unsupported execution models
- custom Gradle source sets, Gradle TestKit reachability, generated sources, annotation-processor/KSP output, or build-logic projects
- Spring, Ktor, Micronaut, Quarkus, persistence, HTTP-client, coroutine, or dependency-injection lifecycle semantics beyond direct JVM symbol evidence
- reflection, service loaders, runtime classpath scanning, test inheritance across modules, fixtures/extensions that create source objects indirectly, or dynamically generated tests
- branch or assertion completeness; a direct test reference is evidence of a relationship, not proof that important behavior is asserted

Unsupported test frameworks or Kotest/Spock/TestNG variants, Android markers, out-of-bound Kotlin Multiplatform shapes, missing owned source sets, competing root build commands, and unresolvable aggregate shapes are emitted as blockers instead of silently upgraded to supported coverage.

For Maven reactors, any property-expanded, absolute, escaping, missing, dynamically coordinated, or unowned nested module declaration makes aggregate ownership incomplete. The audit keeps only conventional root-owned sources, suppresses the aggregate test command, and reports the exact ownership boundary. Project detection leaves nested child reactors visible as separate projects instead of recursively collapsing them into a root audit that cannot own them. Profile-activated and plugin-configuration module lists remain separate projects and do not invalidate a complete root `<modules>` list.

For Gradle aggregates, every root `include` must be a literal repository-contained project path with a conventional child build file. Computed or unsafe includes, `projectDir` remaps, missing child builds, and nested settings that expand paths not also declared by the root block aggregate ownership and command selection. The root audit retains only its conventional source set, while project detection keeps the separately auditable child boundary visible. Explicit root declarations such as `:platform` and `:platform:core` remain supported even when `platform/settings.gradle(.kts)` also includes `:core`.

## Promotion Gates

The bounded adapter is promoted only when all of these remain true:

1. Gradle Kotlin DSL, Gradle Groovy DSL, Maven, Gradle wrapper, Maven wrapper, and conventional Gradle/Maven aggregate behavior is fixture-locked.
2. Mixed Kotlin/Java ownership and exact JVM symbol evidence are deterministic.
3. Duplicate basenames, empty test shells, and `src/test` helper files cannot create false coverage.
4. Conventional Gradle and Maven module graphs are dependency-qualified through direct or explicitly exported edges with cycle protection; supported Kotest and Spock specs require directly visible Gradle/JUnit Platform execution and supported TestNG files require direct conventional execution; single-module and settings-owned all-KMP JVM ownership preserves common-versus-target source-set reachability, follows direct visibility and cycle-safe literal `api(project(...))` exports without leaking `implementation` edges, and derives module-qualified `<targetName>Test` tasks; custom mappings, computed/nested reactors, non-exported dependencies, Android, broader KMP shapes, and unsupported framework/spec shapes remain visibly blocked or excluded.
5. Representative public Kotlin and Java repositories produce explainable results without executing repository code.
6. Golden artifacts, model-consistency locks, the generated 400-source/200-test semantic and timing regression gate, schema validation, and the full local release gate pass.

## Promotion Verdict

The gates are met for the common patterns above. The adapter is registered as `supported` within this matrix, not as universal Kotlin, Java, Gradle, Maven, or Android support. Live evidence and remaining gaps are recorded in [Kotlin/JVM Validation Hunt Report](kotlin-jvm-validation-hunt-report.md).

## Post-Promotion Pressure

1. Pressure additional statically provable Gradle and Maven dependency/module syntax without weakening the explicit blockers for computed, incomplete, remapped, or nested aggregates.
2. Pressure mixed KMP module graphs, type-safe project accessors, multiple or computed JVM targets, custom source-set hierarchies, and additional JVM test frameworks as separate slices without widening the literal-target contract implicitly.
3. Evaluate additional Kotest, Spock, and TestNG semantics as separate execution/evidence variants without inferring their semantics from a generic test marker.
4. Add framework-specific HTTP, persistence, coroutine, and DI semantics only from representative repository evidence.
