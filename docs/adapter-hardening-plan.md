# Adapter Hardening Plan

This is the active plan after the first public alpha release. Repo Test Architect will strengthen its supported JavaScript/TypeScript, Python, Swift, and bounded Kotlin/JVM adapters before adding another ecosystem.

The purpose is not to recognize every framework or build layout. It is to make supported claims more trustworthy, expose uncertainty earlier, and turn failures found in real repositories into permanent regression coverage.

## Outcomes

Hardening should improve:

- project, package, module, source-set, and test ownership
- test framework and verification-command accuracy
- source-to-test evidence without inflating structural matches into behavioral coverage
- conservative blockers for ambiguous or unsupported repository shapes
- candidate classification, ranking, placement, and explanations
- predictable runtime on larger repositories
- consistency across CLI, MCP, Markdown, and JSON output

Native test generation, automatic repository rewrites, automatic external reporting, and broad new adapter work remain deferred.

## Quality Scorecard

Each supported adapter will have a small, pinned validation corpus. The corpus should contain at least:

1. one conventional library or service
2. one framework-heavy application
3. one larger workspace, multi-module repository, or otherwise difficult ownership graph

Validation records should pin the repository and commit, describe the supported boundary being exercised, and review the following:

| Area | Required result |
| --- | --- |
| Detection | The intended project roots and adapter matches are correct and explainable. |
| Ownership | Production, test, generated, vendored, example, and nested-project files do not leak across owners. |
| Command | The selected command agrees with repository scripts, wrappers, configuration, or CI; otherwise the adapter emits a blocker instead of a guessed high-confidence command. |
| Evidence | Reviewed direct, referenced, called, and asserted relationships have no known false upgrades; structural evidence remains visibly weaker. |
| Ranking | Top findings are useful, low-value targets remain deprioritized, and weak existing coverage is not presented as complete coverage. |
| Stability | Repeated audits produce identical canonical JSON for the same repository state and options. |
| Performance | Audit time and candidate/evidence counts are recorded so later changes can detect material regressions. |

The first corpus pass establishes performance baselines rather than inventing one universal time budget for repositories of different sizes.

The deferred HTML presentation may render these facts as an audit card or assay seal, following the [future scorecard visualization](near-term-roadmap.md#future-scorecard-visualization). Review completeness and reviewed pass rate must remain separate so the renderer does not turn unfinished review coverage into a misleading quality score.

Repository code remains unexecuted during ordinary static validation. Comparing a proposed verification command with checked-in scripts, wrappers, documentation, and CI is sufficient unless a repository has been explicitly reviewed for safe local execution.

## Workstream 1: Shared Conformance

Before ecosystem-specific expansion, lock the behavior every supported adapter must share:

- instrumented line, branch, and function coverage floors for each adapter-owned audit implementation
- deterministic project identity, paths, ordering, artifact versions, and Markdown/JSON agreement
- explicit capability and maturity metadata
- positive and negative fixtures for no-tests-yet, duplicate basenames, nested projects, unsupported frameworks, changed-file filtering, and ambiguous commands
- evidence-strength and evidence-usage invariants across audit, explanation, ranking, plan, findings, placement, and stats artifacts
- stable blocker semantics that distinguish unsupported, ambiguous, and missing setup
- bounded file traversal, symlink handling, generated/vendor exclusions, and path portability
- corpus result recording that can be reviewed without checking third-party source into this repository

This workstream should produce a reusable adapter-conformance test helper rather than four copies of the same assertions.

## Workstream 2: Adapter-Specific Slices

### JavaScript And TypeScript

Prioritize the most common public-alpha path:

- workspace and nested-package command ownership across npm, pnpm, Yarn, and Bun
- inherited runner configuration and custom test locations where they can be resolved statically
- ESM, CommonJS, package exports, barrels, and path aliases without cross-package false coverage
- Playwright and Cypress evidence that remains conservative when tests reach behavior through navigation or network calls
- large-suite performance around import, call, and assertion analysis

Do not treat arbitrary runtime loaders, browser requests, or opaque monorepo orchestration as proven source coverage.

Progress: the first bounded workspace-command slice preserves npm, pnpm, Yarn, or Bun package-script ownership for child packages only when a nearest ancestor statically declares them. The second bounded configuration slice recognizes static custom test discovery for Vitest, Jest, Playwright, Cypress, AVA, and Mocha. An ancestor config is inherited only when the child package script explicitly selects a file inside its owning workspace; ambient root configs, fixture configs, and unowned siblings do not leak into the audit. Computed/imported config remains unsupported. The third ESM/CommonJS module-boundary slice keeps conditional `import` and `require` exports, explicit CJS/ESM extensions, one-hop barrel symbols, type-only imports, and ordered `tsconfig` alias fallbacks from leaking false coverage. The fourth slice replaces repeated full module scans and barrel parsing with audit-local indexes and caches, then locks a generated 400-source/200-test audit plus evidence counts behind a cross-platform 5,000 ms regression ceiling. The fifth slice adds `indirect` `browser-route-match` provenance only when literal Playwright/Cypress navigation or request methods exactly match literal HTTP method/path registrations in auditable route files. Dynamic paths, route parameters, prefix composition, generic client calls, and downstream runtime reachability remain uncredited. Standardized reruns now record passing stability and performance distributions for all three pinned JavaScript/TypeScript cases. Package `imports`, custom conditions, CommonJS re-export barrels, dynamic loading, full resolver emulation, and broader browser runtime reachability remain explicitly unsupported. The bounded JavaScript/TypeScript priority list is complete; the next adapter-specific work starts with Python ownership and pytest discovery.

### Python

Prioritize ownership and import accuracy:

- multiple owned packages, namespace-package layouts, editable-install metadata, and package-local tests
- relative test imports and bounded source dependencies where resolution is statically provable
- pytest `testpaths`, `python_files`, configuration inheritance, and fixture visibility
- Django/Flask application factories, framework test clients, and dependency overrides without claiming runtime reachability
- uv, Poetry, Hatch, tox, and nox command selection from explicit repository evidence

Do not execute dynamic package metadata or plugin code to discover the graph.

Progress: the first Python slice separates import roots from owned path prefixes, honors literal multi-package declarations from setuptools and Poetry, supports bounded setuptools find roots including implicit namespaces, and makes root pytest `testpaths`/`python_files` authoritative according to configuration precedence. The second slice resolves exact package-local relative imports in tests and consumed fixture support, binds duplicate module names to the originating layout entry, and rejects excess-dot escapes. The third slice adds one-hop same-owner source dependency evidence from called/asserted direct, re-exported, or fixture-consumed entrypoints while excluding unused, type-checking-only, deeper, cross-owner, and duplicate-root edges. The fourth slice separates application boot from generic dependency propagation and adds route-specific evidence for exact FastAPI/Starlette, Flask, and Django client requests through literal same-owner wiring, including visible pytest client fixtures. The checked-in FastAPI client-route golden and model-consistency scenario now lock the externally visible audit and planning behavior. The fifth slice inherits the nearest repository-owned pytest configuration for nested Python projects, maps literal ancestor `testpaths` into the child owner, and blocks command selection when those paths would execute tests owned by another project. The sixth slice binds nox commands to their literal session bodies and blocks competing tox/nox or multiple nox test entrypoints instead of choosing by file or declaration order. Computed metadata, editable-install remapping, deeper source graphs, plugin-provided discovery, async clients, nested URLconfs, dynamic factories, middleware, persistence, and dependency overrides remain pending.

### Kotlin And JVM

Prioritize build-graph correctness inside the documented bounded support:

- Gradle and Maven wrapper, module, reactor, and verification-command ownership
- direct and exported dependency visibility without leaking implementation-only edges
- negative coverage for computed, remapped, inherited, exclusion-bearing, or otherwise unsupported graphs
- the supported JUnit, Kotest, Spock, TestNG, and `kotlin.test` execution/evidence variants
- framework semantics for common server boundaries only when representative repositories justify a bounded rule

Android, broad Kotlin Multiplatform expansion, and arbitrary Gradle execution remain separate product decisions rather than incidental hardening.

Progress: the first Kotlin/JVM hardening slice resolves Gradle and Maven verification commands independently, blocks selection when both are runnable at the audited root, and keeps nested auxiliary build markers from creating false command ambiguity. Local and conventionally inherited single-runner commands remain unchanged. The second slice requires Maven reactor declarations to be literal, repository-contained, directly resolvable to static child POM coordinates, and complete at the audited root. Unsafe, unresolved, or unowned nested declarations block the aggregate command and child ownership, while nested child projects remain visible to project detection. The third slice applies the same complete-ownership rule to Gradle settings: computed or unsafe includes, custom `projectDir` remaps, missing child builds, and unowned nested settings expansion block aggregate commands and partial child ownership. Project detection retains those child builds separately, while complete conventional and explicitly root-declared nested aggregates remain unchanged.

### Swift

Prioritize build ownership and stronger evidence without executing manifests:

- SwiftPM target ownership, alternate paths, simple helpers, versioned manifests, macros, and plugins
- Xcode workspace, shared-scheme, test-plan, test-target, and ambiguous-selection behavior
- Bazel target ownership and conservative boundaries around custom Starlark
- symbol evidence across extensions and common member-access shapes only where it can remain deterministic
- UI, snapshot, Vapor, and reactive tests without converting framework presence into false source reachability

Objective-C classification, arbitrary manifest logic, and runtime coverage proof remain outside the current supported promise.

Progress: the first Swift hardening slice suppresses `xcodebuild` commands when multiple checked-in shared schemes lack a unique workspace/project-name match or multiple test plans lack a unique default or sole scheme reference. It preserves the detected Xcode setup signals, reports a precise ambiguity blocker instead of the generic missing-command blocker, and prevents an unresolved command from retaining high profile confidence. Existing sole, name-matched, and default-plan selections remain unchanged.

Progress: Xcode container ownership now preserves relative project/workspace paths and selects a sole container, a unique direct owner of the shared scheme, or a unique scheme-name match. Multiple unresolved workspaces block before project fallback, and unresolved multiple projects also block, while positive direct-owner and matched-container cases remain runnable.

## Workstream 3: Cross-Adapter Trust

After each adapter has a refreshed corpus:

- compare blocker, confidence, evidence, ranking, placement, and stats semantics across all four adapters
- add model-consistency locks for recommendations changed by hardening
- pressure polyglot repositories where multiple supported adapters coexist
- verify that one adapter cannot claim files owned by another project
- review top findings in both single-project and merged project plans
- record performance distributions and set adapter-specific regression budgets from measured results

Progress: all four adapters now have deterministic 400-source/200-test semantic and performance regression gates with adapter-specific audit timing, covered/untested counts, and evidence-relationship counts. These synthetic ceilings protect local and CI performance, while all 12 pinned real-repository cases now have recorded three-run distributions and stable canonical audit digests.

## Slice And Pull-Request Routine

Hardening work should stay small and traceable:

1. Start with one observed repository shape, false claim, or clearly bounded convention.
2. Record the expected support boundary before widening detection.
3. Add a positive fixture and a negative or near-miss fixture.
4. Implement the smallest adapter-owned evidence change.
5. Update golden artifacts when public output changes.
6. Add a model-consistency lock when recommendation semantics change.
7. Update the relevant support matrix and validation report.
8. Run focused tests, `npm run alpha:check`, and the path-appropriate CI checks.
9. Commit, open a pull request, review the artifact diff, and merge only with the required gate green.

A framework name or dependency marker alone is not enough reason to widen support. Each slice needs evidence that the repository shape is common enough or the current behavior is misleading enough to justify permanent maintenance.

## Execution Order

The initial queue is:

1. Add the shared corpus manifest, scorecard format, and adapter-conformance helper. Complete: `evals/validation-corpus.json` now carries three full-SHA cases per supported adapter, `schemas/validation-corpus-v1.schema.json` defines the scorecard, and `test/support/adapter-conformance.js` locks the shared local invariants.
2. Refresh JavaScript/TypeScript validation, starting with workspace command ownership and configuration boundaries.
3. Refresh Python validation, starting with multi-package ownership, relative imports, and pytest discovery configuration.
4. Refresh Kotlin/JVM validation, starting with Gradle/Maven ownership and conservative unsupported-graph behavior.
5. Refresh Swift validation, starting with SwiftPM/Xcode ownership ambiguity and symbol-evidence pressure.
6. Run the cross-adapter trust pass and set measured performance regression budgets.

Run `npm run corpus:check` to validate corpus completeness, pins, report links, and scorecard states. Use `npm run corpus:measure -- --case <case-id> --checkout <path>` against an exact pinned Git checkout to record at least three canonical audits, raw durations, their median, the evidence count, and normalized SHA-256 digest. All 12 current cases pass every scorecard area after standardized measurements. New or repinned cases remain `pending` until their own measurements pass; historical timings alone never silently pass the gate.

User reports or a demonstrated false high-confidence claim can move a slice earlier. Within an adapter, correctness and false-confidence fixes take priority over recognizing another framework variant.

## Definition Of Done

An adapter hardening pass is complete when:

- its validation corpus meets the scorecard
- its adapter-owned implementation remains above the checked-in line, branch, and function coverage floors
- every accepted behavior change has positive and negative regression coverage
- known limitations are current and visible in the adapter support matrix
- golden artifacts and model-consistency locks cover externally meaningful changes
- no shared artifact or MCP behavior diverges by adapter without an explicit contract reason
- `npm run alpha:check` and the relevant release checks pass
- the remaining gaps are explicitly prioritized, deferred, or blocked rather than silently implied as supported

Only after all four passes and the cross-adapter review should another language adapter or native generation become the default next milestone.
