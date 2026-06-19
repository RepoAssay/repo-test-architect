# Adapter Contract

Adapters translate ecosystem-specific repository signals into the shared audit model.

An adapter should:

- detect package managers, test frameworks, and architecture signals
- classify source files by test value
- identify test placement findings when tests appear to cover code owned by another package or target
- recommend a test level only when the repository has enough convention signal
- skip low-value targets with an explicit reason
- return structured audit data before generating any code

An adapter should not:

- invent a new report shape for one language
- generate tests during audit
- recommend UI/component tests without an existing convention signal
- treat coverage growth as the main success metric
- blindly move tests that depend on app-level integration wiring

The core model lives in `src/core/audit-model.ts`.

Runtime adapter registration lives in `src/core/adapter-registry.js`.

Currently registered adapters are:

- `javascript` for the JavaScript ecosystem, covering JavaScript and TypeScript repositories
- `kotlin` for the JVM ecosystem, covering Kotlin and Java Gradle or Maven roots, currently experimental

Non-JavaScript adapters should follow the focused [Second Adapter Spike](second-adapter-spike.md) checklist before expanding framework coverage or native generation.

Adapter registry entries expose:

- `id`: stable adapter ID used by CLI and MCP calls
- `ecosystems`: package/build ecosystem labels the adapter understands
- `languages`: source language labels the adapter can classify
- `maturity`: whether the adapter is supported, experimental, or planned
- `supportedTestFrameworks`: test framework signals the adapter can detect and plan around
- `supportedProjectTypes`: project shapes the adapter is designed to classify
- `emittedArtifacts`: artifact schema versions produced by the adapter-backed flow

## Polyglot Repositories

Adapters are project-level units, not necessarily repository-level units.

The repository detector finds multiple project roots in one checkout and matches adapters independently. For example:

- `apps/web` -> `javascript`
- `services/api` -> `python`
- `apps/android` -> `kotlin`

Independent adapter audits are isolated by project root today. They can run in parallel later once project roots and adapter matches are known and the runner has concurrency controls.

The core layer should merge project audit results into one repo-level graph and perform cross-project ranking there. Adapters should not reach across unrelated language roots unless the core passes them explicit boundary information.

## Test Placement Findings

Adapters should distinguish between missing coverage and misplaced coverage.

For package-oriented ecosystems, such as Swift Package Manager, Gradle modules, Maven modules, or workspace packages, tests may exist in a higher-level app or integration target while exercising lower-level package behavior. When the tested source clearly belongs to another package or target and the test has no app-only dependency, the adapter should report a placement finding.

Placement actions:

- `move`: coverage belongs in the package or module test target
- `split`: one test mixes package-owned behavior with app integration behavior
- `keep`: the test belongs where it is because it validates integration wiring or cross-package behavior

This should be advisory until a generation or repair loop can safely move files and verify both old and new test commands.
