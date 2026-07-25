# Project Plan

## Product Thesis

Repo Test Architect is an audit-first test strategy tool.

The goal is not to maximize generated tests or chase arbitrary coverage. The goal is to reduce real codebase risk with fewer, better, repo-native tests.

The tool should answer:

- what kind of repository this is
- what testing conventions already exist
- which code paths are risky and testable
- which code should be covered indirectly
- which files should not get direct tests
- what command verifies the result
- what risk remains after the recommended work

## Core Principle

Do not ask a model to guess the repository from scratch.

Build a deterministic audit graph first:

- repo facts
- package and framework signals
- source classifications
- existing test locations
- test command candidates
- risk and maintenance scoring
- blockers and confidence

Models can explain, prioritize, or generate from this graph, but the graph is the source of truth.

## Near-Term Milestones

The first public npm and MCP Registry distribution is complete. The active milestone is [adapter hardening](adapter-hardening-plan.md):

Release progression is governed by the flexible, readiness-based [Release Lifecycle](release-lifecycle.md). Its target windows guide planning without forcing promotion before the adapter and distribution gates pass.

1. Add a shared validation corpus, scorecard, adapter-conformance helper, and instrumented implementation coverage floors. Complete; all 12 pinned cases now have passing standardized stability and performance measurements.
2. Harden JavaScript/TypeScript workspace ownership, command selection, configuration boundaries, evidence, and performance. Complete for the bounded matrix: static workspace package-manager ownership, runner-config/custom-location discovery, ESM/CommonJS/export/barrel/alias evidence, a generated large-suite performance gate, and exact literal Playwright/Cypress request-to-route evidence.
3. Harden Python package ownership, imports, pytest discovery, framework boundaries, and command selection. Literal setuptools/Poetry multi-package ownership, bounded namespace find roots, root and repository-owned ancestor pytest discovery, exact package-local relative imports, one-hop same-owner source dependencies, and static FastAPI/Starlette, Flask, and Django client-to-route evidence are complete. Cross-owner inherited `testpaths` and competing proven tox/nox entrypoints now block command selection; plugin-mutated discovery and dynamic runner orchestration remain bounded follow-up candidates.
4. Harden bounded Kotlin/JVM Gradle/Maven ownership, dependency visibility, supported test-framework evidence, and unsupported-graph blockers. Competing root Gradle/Maven commands now block selection; unsafe, unresolved, and unowned nested Maven reactors cannot produce partial child ownership or a guessed aggregate command; deeper dependency and Gradle ownership pressure remains active.
5. Harden SwiftPM, Xcode, and Bazel ownership plus conservative Swift symbol evidence.
6. Run a cross-adapter trust pass across polyglot ownership, artifact semantics, model consistency, placement, and measured performance. Deterministic 400-source/200-test gates are complete for all four adapters, and all pinned real-repository distributions are recorded.
7. Reconsider another adapter or native generation only after the four supported adapters meet the hardening definition of done.

## General Backlog

These are useful foundation items, but they should not block adapter work:

- richer project boundary ownership for package, module, and app test-placement findings
- better report formatting for human audit review
- an accessible HTML audit-card or assay-seal visualization for validation scorecards, with review completeness kept separate from reviewed pass rate
- local stats and history tracking from saved audit artifacts
- keep the real MCP SDK transport wrapper aligned with the dependency-free tool surface
- installed-package tarball smoke checks before every public npm release
- keep required Linux PR validation fast, select Windows and macOS coverage by portability risk, and run the full three-OS matrix before releases

## Fixture Roadmap

Initial JS/TS fixtures:

- `node-vitest-basic`
- `node-no-tests-yet`
- `node-jest-service`
- `express-supertest`
- `react-testing-library`

Early non-JavaScript adapter fixtures:

- `kotlin-junit-basic`
- `kotlin-multiplatform-exported-module-graph`
- `kotlin-multiplatform-jvm`
- `kotlin-multiplatform-module-graph`
- `kotlin-multiplatform-named-jvm`

Later adapter fixtures:

- `apple-xcode-mixed`
- Swift Package Manager + XCTest
- Swift Package Manager + Swift Testing
- Swift Package Manager + Quick/Nimble or SnapshotTesting
- Vapor service tests
- React component tests

Live validation candidates:

- `https://github.com/m-stenbe/cg-bff` for a real Vapor project with XCTVapor setup, many route/middleware candidates, and stale service dependencies
- sibling `cg-*` SwiftPM packages for small Swift Testing/XCTest packages with placeholder tests and useful service/utility candidates
- `https://github.com/m-stenbe/Collectors-Grimoire` for the main Xcode/SwiftUI app that consumes the `cg-*` packages and validates non-`Sources/` app-folder auditing

## MCP Direction

The MCP server should expose stable tools around the deterministic audit graph:

- `list_adapters`
- `detect_projects`
- `audit_projects`
- `summarize_project_audits`
- `rank_project_candidates`
- `generate_project_test_plan`
- `get_plan_execution_hints`
- `analyze_project_test_placement`
- `collect_project_stats`
- `audit_repo`
- `get_audit_graph`
- `explain_target`
- `rank_test_candidates`
- `generate_test_plan`
- `analyze_test_placement`
- `generate_selected_test`

The model should call tools and act on structured evidence. It should not own repository fact discovery.

The internal tool API mirrors the deterministic MCP-shaped operations:

- `detectRepoProjects`
- `auditRepoProjects`
- `summarizeRepoProjectAudits`
- `rankRepoProjectCandidates`
- `generateRepoProjectTestPlan`
- `analyzeRepoProjectTestPlacement`
- `collectRepoProjectStats`
- `auditRepo`
- `getAuditGraph`
- `explainAuditTarget`
- `rankAuditTestCandidates`
- `generateTestPlan`
- `getPlanExecutionHints`
- `analyzeRepoTestPlacement`

The MCP server wraps that API rather than duplicating audit, ranking, planning, or execution-hint logic.

`generate_selected_test` exists in the MCP tool surface but returns a structured deferred artifact until native generation has adapter-specific fixtures and repair-loop coverage.

The dependency-free MCP tool surface lives in `src/mcp/tool-definitions.js`, is mounted by `src/mcp/stdio.js`, and is documented in `docs/mcp-tools.md`.
It defines tool names, input schemas, and dispatch behavior independently of the SDK transport wrapper.

The default deployment target is local stdio MCP because repository audits need local source, Git, and test execution context.
Remote hosting is a later option for shared evals, policy packs, team reporting, or model-consistency runs, not the first path for raw repo access.

Public exposure should start as local stdio MCP distributed through GitHub and npm. Remote MCP should come later only with authentication, least-privilege tool access, and a clear split between local repo access and hosted reporting or eval features.

## Polyglot Repository Direction

Real repositories often contain more than one language or project shape.

Examples:

- React frontend plus Python or Node backend
- Go worker plus React frontend
- Rust service plus JavaScript tooling
- Ruby service plus JavaScript tooling
- PHP service plus JavaScript tooling
- Elixir service plus JavaScript tooling
- Kotlin Android app plus JavaScript tooling
- Java or Kotlin Maven service plus JavaScript tooling
- .NET service plus JavaScript tooling
- Swift app plus generated TypeScript clients
- backend service plus OpenAPI/protobuf/schema packages
- monorepos with multiple package managers and test commands

The long-term architecture should not assume one repository equals one adapter.

Target flow:

1. Detect projects/workspaces inside the repository.
2. Match each project root to one or more applicable adapters.
3. Run independent adapter audits in parallel where there are no dependency constraints.
4. Merge adapter outputs into one repository-level audit graph.
5. Rank risk across projects after merging, not inside one adapter only.

Sequential responsibilities:

- project/workspace detection
- adapter selection
- cross-project dependency/boundary detection
- merged risk ranking and final reporting

Parallel responsibilities:

- independent adapter audits
- independent test convention discovery
- independent static classification for separate project roots

Adapters should remain isolated. A JavaScript adapter should not need to understand Kotlin files elsewhere in the repository. It should audit its assigned project root and emit the shared audit model with project identity attached.

Mixed-language projects inside one build/test root should stay inside one adapter audit. Examples include Java plus Kotlin in one Gradle or Maven module, Swift plus Objective-C in one Apple target, and JavaScript plus TypeScript in one package.

The core merge layer should handle cross-project recommendations. For example, generated frontend API clients may be skipped directly while backend API contract or route behavior receives the higher-value test recommendation.

## Test Placement Direction

The audit should eventually report tests that exist but appear to live in the wrong owner.

Example:

- a main app test target contains parser tests
- the parser source belongs to a domain-specific Swift Package Manager package
- the test imports or exercises that package without app-only integration dependencies

That should become a placement finding, not a missing-test finding. The recommendation should be to move or split the test into the package test target when the coverage is package-owned behavior.

The audit should avoid recommending moves when the test is genuinely app-level integration coverage, such as app lifecycle, dependency injection wiring, navigation, persistence setup, or cross-package behavior. Mixed tests should be reported as split candidates.

Future placement findings should capture:

- test file
- current owner
- suggested owner
- move, split, or keep action
- rationale based on imports, source ownership, and integration dependencies

## Model Consistency Goal

When this runs through MCP, different users or companies may choose different models.

The core audit should remain aligned across:

- expensive reasoning models
- fast inexpensive models
- local models
- enterprise-hosted models

Expected variation:

- wording
- summary style
- optional explanation depth

Unexpected variation:

- detected framework
- test command
- source classification
- skip/recommend decision without new evidence
- core risk ranking

Longer term, add model-consistency evaluations that run the same audit graph through multiple model profiles and compare whether recommendations stay aligned.

Current deterministic scenarios lock selected fields for single-project planning, provider-neutral execution hints across JavaScript, Python, Swift, and Kotlin, ranking, target explanation, no-framework blocker handling, route/component/service fixtures, the Kotlin/JVM adapter spike, and polyglot project-summary/ranking/plan/stats coverage.

## Optional Executor Direction

Test implementation should remain downstream from the audit graph. A future executor should consume a selected stable plan item rather than rediscovering the repository or changing the audit decision.

Executor behavior should be split into reusable layers:

- audit artifact: deterministic repository facts, provenance, confidence, risk, and target identity
- test specification: framework-neutral behavior, edge cases, and acceptance criteria
- adapter guidance: repository-native framework, file placement, style, and verification command
- executor profile: model- or agent-specific instructions, context limits, and task decomposition
- verification result: files changed, commands run, failures, repairs, and remaining risk

Different models may need different executor profiles. Those profiles should be evaluated against the same audit item and adapter guidance rather than being allowed to reinterpret the underlying facts.

The installing CLI or agent host owns model choice and subagent orchestration. The companion `plan-execution-hints/v1` artifact provides provider-neutral complexity, minimal-context, parallel-safety, agent-role, and repository-reasoning hints, but the MCP server does not turn those hints into hidden model calls. This lets inexpensive models handle routine work while stronger models remain available for ambiguity, repair, and review without changing the deterministic audit or plan.

Generation evaluation should record at least:

- whether the selected audit item was implemented
- whether repository conventions and ownership boundaries were followed
- whether tests assert behavior instead of implementation details
- whether unrelated production or test files were changed
- whether the discovered verification command passed
- whether mutation or deliberate fault injection proves the test can fail meaningfully
- repair attempt count and final unresolved failures
- whether the executor ignored or contradicted audit evidence

This keeps model comparison focused on execution quality while model-consistency checks protect the stable audit decisions.

## Evaluation Metrics

Detection:

- language
- package manager
- test framework
- test command
- test layout

Classification:

- parser/mapper/validator -> unit candidate
- service/client/repository -> unit or integration candidate
- route/controller -> integration candidate
- DTO/type-only model -> skip direct test
- constants/config -> cover through consuming behavior
- UI component -> test only when convention exists

Quality:

- avoids meaningless tests
- explains skipped targets
- reports blockers honestly
- respects existing conventions
- avoids inventing infrastructure
- ranks by risk reduction, not test count

## Tracking And Stats Direction

Add local-first stats before considering any external telemetry.

The first `project-stats/v1` artifact is now derived from `project-audits/v1` and covers audit coverage, audited versus unsupported source file counts by language, candidate/risk/blocker counts, confidence distribution, test framework detection, test commands, and adapter usage.
The first `model-consistency-stats/v1` artifact is derived from model-consistency summaries and optional comparisons, covering scenario counts, locked-field counts, failures, drift, missing scenarios, unexpected scenarios, status distribution, and tool distribution.

Useful deterministic stats should be derived from existing artifacts:

- project count, audited project count, unsupported project count, and audit coverage
- source file counts by detected language and audited versus unsupported language coverage
- supported file ratio, reported as audit coverage rather than correctness confidence
- candidate, skipped target, blocker, and risk counts
- confidence distribution and test framework detection results
- model-consistency scenario count, locked-field count, drift count, and failure count
- later generation and repair-loop counts, including files touched, test command results, and repair iterations
- trend comparisons between saved audit artifacts over time

Coverage reporting should avoid claims like "X% correct." A safer first report is:

- detected source files by language
- audited source files by adapter/language
- unsupported source files by language
- qualitative audit coverage: complete, partial, or none
- qualitative confidence distribution from adapter evidence

Repository telemetry should be opt-in only. Hosted or product analytics must avoid source content and should default to aggregate metadata only.

The first operational diagnostics slice is local-only and disabled by default. It adds allowlisted `diagnostic-event/v1` MCP call metadata, bounded file storage, `doctor-report/v1`, sanitized `diagnostic-bundle/v1`, and report IDs for unexpected internal errors. It does not add product analytics or any network reporter.

Any future external reporting must remain independently opt-in, show the exact outgoing payload before transmission, and document endpoint, retention, deletion, and ownership.
