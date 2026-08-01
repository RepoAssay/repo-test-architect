# Project Status

## Current State

Repo Test Architect currently has supported deterministic JavaScript/TypeScript, Python, Swift, bounded Kotlin/JVM, bounded Go, bounded C#, bounded Rust, and bounded Ruby audit pipelines. Go support includes conventional modules, literal repository-contained `go.work` ownership, and explicit static build-target selection. C# support covers one conventional SDK-style test project or one unique literal production/test edge, including exact literal multi-target membership, finite project-local target-conditioned package predicates, and a selected pair amid unrelated projects. Rust support covers conventional Cargo packages and literal workspace members with built-in tests, exact commands, literal module ownership, and bounded direct evidence. Ruby support covers one conventional Bundler project with `lib/`, one root gemspec or a complete exact named root-gemspec set, `Minitest::Test` `test_*` or RSpec discovery, bounded commands, root `.rspec` and exact per-file `spec_helper` edges within three-edge require/unique-constant evidence, exact singleton calls, exact constant-owned RSpec `described_class`, direct immutable constructor-local, exact one-line RSpec memoized, exact source-factory, exact same-group RSpec helper-return instance receivers, and exact same-file literal shared-example inclusion, bounded assertion usage, and naming fallback. Minitest spec DSL and setup-partitioned custom commands remain outside that boundary after the blind Licensed pressure pass.

Implemented:

- canonical `analyze` CLI and `analyze_repository` MCP entrypoints that audit detected projects once and return `repository-analysis/v1` with the summary, findings, ranking, plan, execution hints, stats, and verification commands
- compact global and command-specific CLI help plus MCP initialization guidance that directs humans and connected models toward the appropriate general or focused workflow
- JavaScript/TypeScript repository profiling
- JavaScript/TypeScript React hook classification ahead of generic component and HTTP controller heuristics
- cached JavaScript/TypeScript module-import analysis for real repositories with large test suites
- indexed JavaScript/TypeScript module paths plus audit-local relative-resolution, barrel-export, and declared-symbol caches, with a deterministic 400-source/200-test performance and evidence-count regression gate
- skipped-target short-circuiting before JavaScript/TypeScript test-evidence analysis
- JavaScript/TypeScript package-boundary scoping that excludes nested packages from parent profiles and candidate graphs
- JavaScript/TypeScript workspace package-script ownership across npm, pnpm, Yarn, and Bun for statically declared child packages, with local-manager precedence, unrelated-sibling isolation, and an explicit ambiguity blocker for unresolved multiple lockfiles
- JavaScript/TypeScript bounded static runner-config discovery for Vitest, Jest, Playwright, Cypress, AVA, and Mocha custom test locations, with explicit owning-workspace inheritance and ambient/fixture config isolation
- Node test runner detection from `node:test` imports, alongside AVA, Mocha, Vitest, Jest, React Testing Library, and Supertest dependency/config signals
- JavaScript/TypeScript `src/`, `source/`, and `lib/` roots plus conventional `test/`, `tests/`, and `__tests__/` test locations
- JavaScript/TypeScript existing-test matching from filename conventions, literal relative imports with two bounded source-dependency hops, referenced-import-symbol-aware barrel re-exports, exact self-package entry imports, and declared exact or single-wildcard package subpaths
- JavaScript/TypeScript module-boundary evidence that separates conditional `import`/`require` package exports and explicit `.mjs`/`.mts` from `.cjs`/`.cts`, rejects type-only/test re-export evidence and ambiguous/default star-barrel leakage, and preserves ordered `tsconfig` wildcard fallbacks
- conservative Playwright/Cypress `browser-route-match` evidence with `indirect` strength for exact literal HTTP method/path matches between browser requests and auditable static route registrations, without dynamic-route, generic-client, or downstream reachability claims
- conservative Python `python-test-client-route` evidence with `indirect` strength for uniquely matched FastAPI/Starlette, Flask, and Django client requests through literal owned application wiring, without boot-only or downstream runtime reachability claims
- JavaScript/TypeScript `tsconfig.json` path-alias evidence for exact and single-wildcard mappings, including local inherited configs, `baseUrl` relative to the declaring config, JSON comments/trailing commas, symbol-aware aliased barrels, and bounded aliased dependencies
- optional JavaScript/TypeScript per-test provenance with deterministic naming, direct, referenced-symbol, and bounded-indirect evidence strengths
- call-aware JavaScript/TypeScript provenance for directly imported named ES module and destructured CommonJS bindings
- assertion-aware JavaScript/TypeScript provenance for inline `expect` calls and asserted variables assigned from directly imported named bindings
- call- and assertion-aware provenance propagated through one-hop relative barrel exports
- call- and assertion-aware provenance propagated through `tsconfig` aliases and declared package entry/subpath imports
- conservative bounded-indirect `viaUsage` provenance that records called/asserted entrypoints without upgrading dependency usage claims
- default-import and namespace-member call/assertion evidence for JavaScript/TypeScript ES modules
- constructor call/assertion evidence and namespace-member usage for CommonJS module bindings
- assertion evidence traced through one-hop result and destructured-result assignments
- inline and one-hop assertion evidence for Jest/Vitest `expect` and Node/Chai-style `assert` APIs
- optional test-evidence provenance propagated from audits into direct and project-level explanations, candidate rankings, test plans, and repository-wide project stats distributions
- concise Markdown evidence-strength counts for audits, explanations, direct and project rankings, and direct and project plans
- Markdown and project-stats evidence-usage counts that distinguish called from asserted direct imports
- directory-qualified filename evidence for generic JavaScript/TypeScript basenames such as `index`, `utils`, `handler`, and `types`
- bounded Markdown display of existing-test evidence with complete path lists preserved in JSON artifacts
- shared runtime Markdown audit renderer with a TypeScript reference mirror, used directly by the CLI
- behavioral HTTP framework classifications for routers, routes, handlers, security and general middleware, request access and validation, request bodies, queries, cookies, caching, response construction, request events, proxies, sessions, WebSockets, streaming, client response parsing, and runtime adapters, including flat utility layouts identified through HTTP boundary types
- runtime adapter registry with supported bounded `csharp`, `javascript`, `go`, `kotlin`, `python`, `rust`, and `swift` adapters
- supported bounded C# SDK project audits with one static root test `.csproj` or one unique literal production/test edge selected without absorbing unrelated projects, exact literal or one-hop root-aliased target membership, one contained direct compile glob, finite project-local target-conditioned package predicates, bounded nearest-file `Directory.Build.props` metadata and static `Directory.Packages.props` versions, xUnit/NUnit/MSTest attributed-test discovery, exact test-project `dotnet test` commands, project-qualified source ownership, runnable-body-owned direct unique-type calls with qualified/aliased well-known `System` collision guards plus stable concrete-local and exact `private readonly` concrete test-field receiver evidence with bounded result, exception, selected NUnit/MSTest collection/string assertions, and provenance-backed NUnit Legacy `ClassicAssert` plus one same-class private-static test-helper hop across the verified edge, naming fallback evidence, generated/wiring/model/contract deferral, shared conformance, golden artifacts, model locking, a generated 400-source/200-test gate, and three passing promoted corpus roles backed by nine pinned live probes
- supported bounded Rust Cargo package audits with literal workspace-member ownership, static package-local `[lib].path` and `[[bin]].path` source ownership, recursive literal `mod` and static `#[path]` logical module graphs, exact test-only external-module exclusion, exact `cargo test -p <package>` commands, aggregate-only virtual roots, built-in `#[test]`, static explicit built-in test targets, inline `#[cfg(test)]`, exact crate-relative and parent-relative unit-test function imports, logical-module-qualified integration imports including custom roots, exact named inherent `Type::method(...)` and unconditional crate-root symbol re-export evidence, golden artifacts, model-consistency locking, shared downstream conformance, a generated 400-source/200-test performance/evidence gate, and passing serde_json, Starship, and ripgrep corpus roles
- supported `go` registry entry with conventional `go.mod` ownership, literal repository-contained `go.work` membership, module-local command selection, explicit `GOOS`/`GOARCH`/custom-tag evaluation for boolean and filename build constraints, runnable standard-library test detection, Go-aware lexical masking, lazy parser-scoped local shadow checks, generic top-level function declarations and calls, parser-owned concrete value/pointer receiver-method calls through explicit bindings, exact simple constructor result positions, or exact statically typed test-helper results, bounded standard-library and exact Testify assertion usage with one-hop result bindings, exact default/named/dot external-package provenance restricted to exported symbols, bounded one-hop same-package and module-local source dependency evidence owned by the directly exercised callable body, conservative source classification, explicit incomplete-workspace/unsupported-constraint/Ginkgo blockers, golden artifacts, model-consistency locking, and shared downstream conformance
- Swift Xcode command selection that preserves sole, direct scheme-owning, container-name-matched, and default-plan choices while retaining nested container paths, blocking ambiguous workspaces/projects/schemes/plans, and lowering unresolved profiles from high confidence
- Swift source-symbol evidence that remains target-qualified and unique while rejecting test-local shadow declarations and same-named receiver member calls as proof of a source type or top-level function
- Swift static extension evidence limited to source-file-unique receiver/member ownership and an explicit qualified call, with cross-file overloads and test-local receiver declarations kept uncredited
- Swift instance extension evidence limited to source-file-unique receiver/member ownership and a direct constructor receiver, with stored or inferred receivers kept uncredited
- SwiftPM dependency ownership that accepts literal local direct-string, `.target`, and resolving `.byName` entries while preventing same-named external `.product` dependencies from claiming local targets
- Python declarative multi-package ownership for literal setuptools and Poetry entries plus bounded setuptools find roots, with import roots kept separate from owned path prefixes so namespace packages and sibling tooling do not leak into one another
- Python root pytest configuration precedence across TOML, INI, `pyproject.toml`, `tox.ini`, and `setup.cfg`, with literal `testpaths`, simple `python_files` globs, configured test-support exclusion, and unsafe discovery-value rejection
- Python runner selection that binds literal nox test commands to their owning session bodies and emits an explicit ambiguity blocker for competing tox/nox or multiple nox test entrypoints
- Python package-local relative-import evidence for direct tests and consumed pytest fixtures, with exact source-layout ownership, implicit-namespace support, duplicate-root isolation, and excess-dot rejection
- Python one-hop source dependency evidence from called/asserted direct, re-exported, or fixture-consumed entrypoints, limited to statically used same-owner imports and excluding type-checking-only, unused, deeper, cross-owner, and duplicate-root edges
- Python static string masking that preserves physical line alignment across backslash-newline continuations before framework route analysis
- bounded Kotlin/JVM Gradle and Maven module audits plus conventional Gradle and recursively literal Maven reactor ownership for standard Kotlin/Java sources; single-module and settings-owned all-KMP ownership for conventional common and target-derived source sets with exactly one literal default or named JVM target per source module; JUnit 4/5, `kotlin.test`, Gradle/JUnit Platform Kotest common specs, conventional Gradle/Spock features under `src/test/groovy`, method-level TestNG, wrapper-aware and module-qualified KMP commands, cycle-safe direct/exported-transitive conventional cross-module evidence, cycle-safe source-set-qualified KMP `api` evidence without `implementation` leakage, and exact JVM symbol provenance
- Kotlin/JVM command selection that preserves root ownership, isolates nested auxiliary build markers, and emits an explicit ambiguity blocker instead of preferring Gradle when both root Gradle and Maven verification entrypoints are runnable
- Maven reactor completeness checks that recursively own literal contained child POMs with static coordinates while blocking aggregate commands and partial ownership for unsafe paths or missing/dynamic descendants, with project detection retaining incomplete nested children as separate projects
- Gradle aggregate completeness checks that block aggregate commands and partial child ownership for computed or unsafe includes, missing child builds, custom `projectDir` remaps, and unowned nested settings expansion, while complete literal and explicitly root-declared nested graphs keep their existing behavior
- explicit Kotlin/JVM blockers or exclusions for unresolvable aggregate roots, missing standard source sets, Android, advanced Spock/TestNG execution or evidence semantics, unsupported Kotest styles/configuration, computed Maven modules, and custom Gradle boundaries
- adapter registry capability metadata for maturity, framework signals, project types, and emitted artifacts
- CLI adapter registry output
- deterministic project detection for polyglot repository roots
- project-detection traversal boundaries for nested `fixtures`, `__fixtures__`, and Go `testdata` dependency manifests while preserving direct fixture-root audits
- project detection adapter match evidence and support status reasons
- project audit artifacts that preserve adapter match evidence and support status reasons for unsupported projects
- project audit summaries with complete, partial, or none audit coverage status
- project ranking and plan artifacts that preserve audit coverage status before clients act on recommendations
- shared project-audits validation for saved artifact reuse across CLI and MCP-style flows
- file-backed MCP invoke arguments for local calls that reuse saved artifacts
- checked-in MCP args fixture for project-audits derived local examples
- experimental bounded PHP auditing plus unsupported Elixir project reporting with ecosystem and language labels
- documented project detection marker rules
- CLI output for project detection marker rules
- fixture-based regression coverage
- audit, plan, explanation, ranking, and deferred-generation artifacts
- provider-neutral `plan-execution-hints/v1` companion artifacts for `plan/v1` and `project-test-plan/v1`, with deterministic complexity, known context, conservative parallel safety, agent-role, and repository-reasoning guidance while model and subagent orchestration remains host-owned
- disabled-by-default local MCP diagnostics with strict `diagnostic-event/v1` metadata, stderr or bounded JSONL sinks, safe internal-error report IDs, `doctor-report/v1`, and sanitized `diagnostic-bundle/v1` output without network reporting
- test placement findings artifact with a conservative audit-based `keep` analyzer
- project-audits derived placement analysis that preserves project owner identity and reports conservative cross-owner `move` and `split` findings for test paths that escape the audited project root
- project-level top findings report with category counts for missing coverage, weak existing coverage, misplaced coverage, low-value direct targets, and blocked projects
- weak-existing-coverage review ranking that discounts direct asserted/called evidence ahead of structural and bounded-indirect matches
- auxiliary workspace-aware blocker ranking that keeps missing test setup in docs, examples, playground, and benchmark projects below actionable product findings
- project-audits derived local stats artifact for audit coverage, audited versus unsupported source file counts by language, target counts, risk and signal distributions, framework distribution, test commands, and adapter usage
- workspace source-file stats that count nested project ownership once and exclude dependency fixtures
- JSDoc contract annotations for core runtime modules, including adapter registry, tool API, project detection, project audit, planning, ranking, explanation, placement, and deferred generation
- project detection and project audit artifacts for polyglot repository groundwork
- documented polyglot artifact workflow from project detection through project test planning
- documented agent install paths that separate MCP-capable hosts from instruction-only fallbacks
- stable JSON schemas for generated artifacts
- golden snapshots for fixture audits, plans, and MCP tool descriptors
- model-consistency scenario artifacts for comparing explanation, ranking, planning, no-framework blocker, Jest service, React component, Express/Supertest route, FastAPI client-route, polyglot project-summary/ranking/plan/stats, and placement output against deterministic locked fields, including assertion-aware evidence locks
- deterministic model-consistency scenario runner, summary artifact, comparison artifact, and stats artifact for checking locked fields and drift counts against tool output
- changed-file workflows with `--changed` and `--changed-since`
- MCP tool descriptors, local invoke harness, and stdio MCP SDK server
- MCP tool titles and explicit read-only, non-destructive, idempotent, closed-world annotations
- MCP stdio smoke check that exercises initialize, notifications, tools/list, project detection, project audit, project planning, structured tool errors, and recovery through one server process
- deterministic JSON-RPC harness tests that keep parser, batch request, and local dispatcher behavior covered separately from the SDK transport
- release-readiness checklist, npm package dry-run script, and package contents allowlist
- public-readiness record covering the completed npm and official MCP Registry launch
- adapter-hardening plan that prioritizes shared conformance and deeper JavaScript/TypeScript, Python, Swift, and bounded Kotlin/JVM validation before adding ecosystems
- exact-pin validation-corpus measurement command with repeated canonical audit digests, raw and median durations, and evidence-link counts
- Node 20-compatible instrumented line, branch, and function coverage floors for every registered adapter implementation
- deterministic generated 400-source/200-test performance and evidence-count gates for all eight supported adapters and experimental PHP
- supported Ruby registry/detection, conventional Bundler/Minitest/RSpec ownership including complete exact named root-gemspec sets, native fixture verification, shared downstream conformance, a generated 400-source/200-test performance/evidence gate, and three pinned corpus roles with 21/21 reviewed areas passing
- bounded Ruby `ruby-constant-reference` evidence through exact literal repository-owned load graphs, including uniquely owned root `.rspec` and exact per-file `spec_helper` edges, direct/referenced strength, reachable-owner ambiguity rejection, and pinned rubyzip/Faraday/Factory Bot/Diplomat pressure
- runnable-body-owned Ruby singleton/constructor calls, nearest exact constant-owned RSpec `described_class`, and direct immutable constructor-local, exact one-line RSpec `let`/`subject`, exact source-factory, exact same-group RSpec helper-return instance calls, or exact same-file literal shared-example binding with selected Minitest/RSpec inline and one-stable-result assertion usage
- alpha-readiness checklist for the test architecture audit milestone before native generation
- deterministic `npm run alpha:check` gate for tests, adapter implementation coverage, adapter corpus validation, all-adapter performance/evidence regression, golden audits, model consistency, demo behavior, and local MCP transport without npm packaging requirements
- real-repo audit reports for owned JavaScript/TypeScript and Swift repositories, including Collectors Grimoire and `cg-*` sibling packages
- first pinned Go live-library validation against `BurntSushi/toml`, including native tests, stable measurements, source-dependency evidence, and complete project ownership after excluding nested `testdata`
- second pinned Go HTTP/service validation against `go-chi/chi`, including explicit target selection, nested example-module ownership, native coverage comparison, stable measurements, and lexical evidence recovery around wildcard route strings
- third pinned Go difficult-ownership validation against `riverqueue/river`, including nine literal workspace members, module-local commands, native prerequisite review, stable repository measurements, and generic entrypoint evidence recovery
- post-promotion Go pressure against `uber-go/zap`, including native ordinary/race/coverage review, stable repeated audits, exact external-package dot-import evidence recovery, and retained interface-dispatch and release-tag boundaries
- post-promotion Go constructor pressure against `go-resty/resty`, including native ordinary/race/format review, exact concrete constructor-result receiver evidence, tuple reassignment hardening, and stable candidate classifications
- initial bounded Go cross-package source pressure against `riverqueue/river` and `uber-go/zap`, including exact module-local imports, single-callable caller files, exported unique dependency functions, stable candidate classifications, and rejected deeper propagation
- bounded Go assertion-usage and parser-scope pressure across TOML, Chi, River, Zap, and Resty, including exact standard-library failure conditions, exact Testify imports, one-hop result bindings, call-site shadow checks, and a measured River parser baseline
- parser-owned Go receiver and callable-body pressure across the same five exact pins, including declaration-to-call receiver identity, exact assertion occurrences, multi-callable function/method body ownership, removal of file-wide indirect leakage, five reviewed candidate transitions, and refreshed corpus digests
- statically typed Go test-helper receiver pressure across the same exact pins, retaining four canonical graphs while adding five reviewed direct Resty client relationships without upgrading custom helper assertions
- authenticated public-repository discovery and ranking profiles for React, JavaScript/TypeScript workspaces, conventional Go modules, Go HTTP services, Go workspaces, SwiftPM, SwiftUI/Xcode, Vapor, Swift Bazel, Swift macros/plugins, CocoaPods-era Apple projects, Gradle JVM, Maven JVM, Python, and conventional Bundler-managed Ruby validation targets
- product positioning note for audit-first differentiation, initial audience, business paths, proof points, and anti-positioning
- near-term roadmap for public demo polish, second adapter proof, placement analysis, MCP transport, and generation readiness gates
- adapter reuse roadmap defining shared audit semantics, adapter-owned proof, and compiler/parser-backed ecosystem analysis
- demo script for showing audit quality, polyglot detection, MCP tools, and verification without implying native generation is ready
- demo command checker that runs the deterministic public demo path without nesting the full release suite
- decision log for audit-first architecture, the stable audit/executor boundary, adapter scope, local-first MCP, deferred generation, public demo readiness, and stats policy
- adapter spike checklist for adding ecosystems without changing the shared audit model or enabling generation early
- package contents dry-run checker for required runtime files and publish allowlist hygiene
- package binary entrypoint checker for CLI, MCP invoke, and stdio MCP boot paths
- installed-package tarball smoke checker for published CLI and MCP binary boot paths
- distribution preparation reporting with a strict local publication gate for the published public npm and MCP Registry identities
- release-readiness check runner for tests, evals, model consistency, demo path, smoke, package, bin, installed-package, and distribution preparation checks
- required Linux pull-request gate with path-selected release, Windows portability, and macOS Swift validation, plus post-merge and manually dispatched release checks
- GitHub pull request template that calls out audit impact, release verification, and risk notes
- GitHub bug report issue form for audit, planning, MCP, and release-check defects
- GitHub feature request issue form for audit-first adapter, MCP, evaluation, and reporting proposals
- GitHub issue template config that disables blank issues, adds structured support questions, and routes security reports privately
- monthly grouped Dependabot version updates, with GitHub security updates enabled separately for vulnerable dependencies
- readiness-gated release lifecycle with flexible alpha, beta, release-candidate, and `1.0` planning windows, formal prerelease tags, promotion gates, and post-`1.0` cadence
- contributor guide for traceable workflow, audit changes, adapter boundaries, generation deferral, and release checks
- support policy for questions, bugs, feature requests, security boundaries, and regression verification
- security policy for local-first repo access, vulnerability reports, and sensitive artifact handling
- repository ignore rules for generated dependency, package, coverage, and local comparison artifacts

## Supported Fixtures

- `node-vitest-basic`
- `node-no-tests-yet`
- `node-jest-service`
- `node-mocha-commonjs`
- `node-ava-basic`
- `node-test-typescript`
- `express-supertest`
- `react-testing-library`
- `go-testing-basic`
- `go-build-target-basic`
- `go-workspace-checkout`
- `rust-cargo-basic`
- `rust-cargo-workspace-checkout`
- `csharp-sdk-xunit-basic`
- `csharp-sdk-project-pair`
- `csharp-sdk-unique-pair`
- `kotlin-junit-basic`
- `kotlin-gradle-groovy-junit`
- `kotlin-gradle-module-graph-junit`
- `kotlin-maven-junit`
- `kotlin-maven-reactor-junit`
- `kotlin-maven-wrapper-junit4`
- `kotlin-multiplatform-exported-module-graph`
- `kotlin-multiplatform-jvm`
- `kotlin-multiplatform-module-graph`
- `kotlin-multiplatform-named-jvm`
- `kotlin-gradle-aggregate-kotest`
- `kotlin-gradle-spock`
- `kotlin-maven-testng`
- `swift-spm-xctest`
- `swift-spm-swift-testing`
- `swift-spm-quick-nimble`
- `vapor-service-tests`
- `vapor-mongodb-boundaries`
- `python-pytest-service`
- `python-fastapi-client-route`
- `python-unittest-service`
- `python-requirements-pytest`
- `python-package-local-tests`
- `python-setuptools-pytest`
- `python-uv-pytest`
- `python-poetry-pytest`
- `python-no-tests-yet`
- `python-pytest-advanced`
- `python-django-tox`
- `python-flask-nox-coverage`

## MCP Surface

Current tool names:

- `audit_repo`
- `list_adapters`
- `list_project_detection_rules`
- `detect_projects`
- `audit_projects`
- `summarize_project_audits`
- `rank_project_candidates`
- `generate_project_test_plan`
- `collect_project_findings`
- `analyze_project_test_placement`
- `collect_project_stats`
- `get_audit_graph`
- `generate_test_plan`
- `get_plan_execution_hints`
- `explain_target`
- `rank_test_candidates`
- `analyze_test_placement`
- `generate_selected_test`

`generate_selected_test` intentionally returns `generation-deferred/v1` until native generation has adapter-specific fixtures and repair-loop coverage.
`analyze_test_placement` currently returns conservative advisory `keep` findings from existing audit evidence. `analyze_project_test_placement` can additionally return conservative `move` findings when project-derived test paths escape the audited project root, or `split` findings when the escaped match is integration-level. Package-aware adapters can also emit `package-owned-behavior` and `app-integration-dependency` signals so repo-relative cross-owner test paths become advisory `move` or `split` findings. The project placement analyzer can also infer a package boundary when a package-like project root such as `packages/*`, `libs/*`, or `modules/*` is covered by an app-like test owner such as `apps/*`, `clients/*`, or `services/*`.

## Verification

Primary checks:

```powershell
npm run adapters:json
npm run detect-rules:json
npm run mcp:detect-rules
npm run detect:example:json
npm run audit:kotlin-fixture:json
npm run plan:kotlin-fixture:json
npm run audit-projects:example:json
npm run summarize-projects:example:json
npm run rank-projects:example:json
npm run plan-projects:example:json
npm run findings-projects:example:json
npm run placement:example:json
npm run placement-projects:example:json
npm run placement-projects:split-example:json
npm run stats-projects:example:json
npm run mcp:placement-projects:example
npm run mcp:findings-projects:example
npm run mcp:placement-split:example
npm run mcp:stats-projects:example
npm run mcp:audit:kotlin-fixture
npm run mcp:placement:example
npm run mcp:adapters
npm run mcp:smoke
npm test
npm run eval:check
npm run model-consistency:check
npm run model-consistency:json
npm run model-consistency:json -- --profile local-small
npm run model-consistency:compare:profiles
npm run model-consistency:compare -- baseline-summary.json candidate-summary.json
npm run model-consistency:stats
npm run smoke
npm run audit:prod
npm run pack:dry-run
npm run pack:check
npm run bin:check
npm run installed-package:check
npm run distribution:check
npm run alpha:check
npm run release:check
```

The project-derived CLI commands also accept `--from-project-audits` for reusing a saved `project-audits/v1` artifact.

Snapshot maintenance:

```powershell
npm run eval:update
npm run eval:test
```

`eval:check` uses the direct snapshot checker. `eval:test` uses Node's test runner and may need a less restricted process environment.

## Next Useful Milestones

Release promotion follows the flexible, evidence-based [Release Lifecycle](release-lifecycle.md): public alpha remains active through at least mid/late September 2026 by default, beta can begin in late September or October when its gates pass, and `1.0.0` is considered in November or December at the earliest. The release owners may document an evidence-backed acceleration or delay any stage while trust work remains.

The active sequence is defined in the [Adapter Hardening Plan](adapter-hardening-plan.md):

1. Shared validation-corpus manifest, scorecard schema, semantic checker, adapter-conformance helper, and per-adapter implementation coverage floors are complete. All 24 pinned cases across eight supported adapters pass standardized stability and performance measurement; corpus cases can preserve bounded adapter options such as an explicit Go target.
2. JavaScript/TypeScript workspace command ownership, bounded runner-config/custom test-location discovery, module-boundary hardening, the generated large-suite regression gate, and conservative literal Playwright/Cypress request-to-route evidence are complete for the static patterns in the support matrix.
3. Python literal multi-package/namespace ownership, bounded root and repository-owned ancestor pytest discovery, exact package-local relative imports, one-hop same-owner source dependencies, static framework test-client route evidence, and deterministic tox/nox ambiguity blockers are complete. Next Python pressure can target plugin-mutated discovery or dynamic runner orchestration.
4. Kotlin/JVM competing root commands and incomplete Gradle aggregate or Maven reactor ownership now block selection; complete recursively literal Maven reactors are owned without partial guessing, and incomplete child builds remain separately detectable. Continue pressure on statically provable dependency and module syntax.
5. Swift hardening is complete for the current bounded static matrix. Xcode ambiguity blocks command selection, external SwiftPM products cannot claim same-named local targets, test-local shadows and same-named member calls do not inflate evidence, and unique extension functions have explicit static-receiver or direct-constructor instance paths. Stored and inferred receivers remain an intentional boundary rather than guessed evidence.
6. The post-Swift live-repository refresh is complete. All 12 exact-commit cases were rerun: nine stayed semantically exact, Maven Surefire drove a regression-backed recursive-reactor fix, and the two remaining Swift deltas were verified as intentional evidence-precision improvements and recorded in the corpus.
7. The human-facing validation scorecard contract and Markdown renderer are complete. `validation-scorecard/v1` keeps review completeness separate from reviewed pass rate, preserves explicit per-area states, and provides the deterministic base for a later HTML assay-seal visualization.
8. The broader cross-adapter trust pass and public alpha `0.2.0` release preparation are complete. All four adapters traverse the complete project-aware artifact pipeline under shared conformance checks, including evidence, blocker, ranking, plan, placement, stats, repository-analysis, portability, and exact JSON-round-trip invariants. The pass fixed project summaries that bypassed canonical ranking and blocked plans whose absent verification command differed between memory and JSON; aligned npm, MCP, runtime, test, and documentation versions passed the exact-commit release gate.

Protected OIDC release automation is documented as a future operational improvement, not an active requirement. The design uses one owner-approved GitHub environment, on-demand npm and MCP identities, least-privilege separated jobs, release-file ownership, exact-commit verification, and no stored publishing keys; the current manual process remains the fallback until that path is implemented and proven.

Another adapter and native test generation remain behind this hardening phase. Placement, model-consistency, diagnostics, and stats work should be included when an adapter slice exposes a concrete cross-cutting need rather than expanding independently.
