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

1. Add a shared validation corpus, scorecard, adapter-conformance helper, and instrumented implementation coverage floors. Complete; all 30 supported-adapter pins have passing standardized stability and performance measurements, and the corpus can stage a complete registered experimental cohort with pending reviews.
2. Harden JavaScript/TypeScript workspace ownership, command selection, configuration boundaries, evidence, and performance. Complete for the bounded matrix: static workspace package-manager ownership, runner-config/custom-location discovery, ESM/CommonJS/export/barrel/alias evidence, a generated large-suite performance gate, and exact literal Playwright/Cypress request-to-route evidence.
3. Harden Python package ownership, imports, pytest discovery, framework boundaries, and command selection. Literal setuptools/Poetry multi-package ownership, bounded namespace find roots, root and repository-owned ancestor pytest discovery, exact package-local relative imports, one-hop same-owner source dependencies, and static FastAPI/Starlette, Flask, and Django client-to-route evidence are complete. Cross-owner inherited `testpaths` and competing proven tox/nox entrypoints now block command selection; plugin-mutated discovery and dynamic runner orchestration remain bounded follow-up candidates.
4. Harden bounded Kotlin/JVM Gradle/Maven ownership, dependency visibility, supported test-framework evidence, and unsupported-graph blockers. Competing root commands now block selection; unsafe, unresolved, remapped, or incomplete nested aggregates cannot produce partial ownership or a guessed command; and complete recursively literal Maven reactors are supported. Deeper dependency-syntax pressure remains active.
5. Harden SwiftPM, Xcode, and Bazel ownership plus conservative Swift symbol evidence. Complete for the bounded static matrix: Xcode ambiguity blocks command selection; external SwiftPM products cannot claim same-named local targets; test-local shadows and same-named member calls do not inflate source evidence; and source-file-unique extension functions support explicit static receivers or direct-constructor instance receivers. Stored and inferred receivers remain outside the supported boundary.
6. Re-run live-repository reports across all four adapters after the Swift slices, compare blocker/confidence/evidence/report behavior, and convert concrete drift into regression-backed fixes. Complete: all 12 exact-commit cases were rerun; nine stayed semantically exact, Maven Surefire drove complete recursively literal reactor ownership, and the two remaining Swift deltas were verified as intentional precision improvements and recorded.
7. Improve the human-facing validation scorecard while keeping review completeness separate from reviewed pass rate. Complete: the Markdown matrix and `validation-scorecard/v1` derived artifact expose exact ratios and explicit per-area states; the richer audit-card or assay-seal visualization can build on that contract later.
8. Complete the broader cross-adapter trust pass and cut the next public alpha after the Swift, live-repository, scorecard, and exact-commit release gates pass. Complete for public alpha `0.2.0`: shared conformance covers every project-aware downstream artifact and blocked JSON round trip for all four adapters, canonical project-summary ranking and absent verification-command serialization are corrected, and the aligned release metadata passed the exact-commit release gate.
9. Start the fifth adapter after the four supported adapters meet the hardening definition of done. Complete; bounded Go is supported for conventional modules, literal repository-contained `go.work` members, explicit static build targets, generic top-level functions, parser-owned concrete receiver-method evidence through explicit bindings, exact simple constructor result positions, or exact statically typed test-helper results, bounded standard-library/Testify assertion usage, parser-scoped local shadow checks, callable-body-owned same-package and module-local source hops, and exact default/named/dot external-package provenance with module-local or target-qualified commands. Its standard-library tests, three pinned corpus roles, post-promotion Zap and Resty pressure, generated performance/evidence regression, shared corpus, conformance, golden artifacts, model-consistency locking, and implementation coverage pass the checked-in [Go support matrix](go-alpha-support.md).
10. Start the sixth adapter as a bounded Rust spike. Complete for the bounded supported matrix: conventional Cargo packages and literal repository-contained workspace members receive package-exact commands, built-in inline and integration test ownership, exact external `#[cfg(test)]` module exclusion, direct logical-module and unconditional crate-root re-export evidence, useful candidate classification, and explicit data/module deferral. serde_json, Starship, and ripgrep fill all three live roles with 21/21 scorecard areas passing; native fixtures, shared artifact gates, and the generated 400-source/200-test semantic/performance gate are green. Broader workspace syntax, doctests, custom/async/property test ecosystems, and receiver/trait inference remain later slices in the [Rust alpha support matrix](rust-alpha-support.md).
11. Start C#/.NET after the bounded Rust spike reaches its intended comparison point. Complete for the bounded supported matrix: nine pinned probes cover deterministic pair selection, xUnit/NUnit/MSTest, central and inherited metadata, literal multi-target and target-conditioned package ownership, native MTP hosts, assertion/evidence pressure, one-hop target aliases, and linked compile ownership. TDD, usbipd-win, and Sharp Cast fill the three shared corpus roles with all 21 C# areas passing; the generated 400-source/200-test gate, shared conformance, implementation coverage, golden artifacts, model consistency, and cross-platform alpha checks are green. Solution ownership, multiple valid edges, transitive project edges, arbitrary evaluated MSBuild ownership, framework compatibility inference, conditional/overridden central versions, deeper helper reachability, and deeper result flow remain outside the [C# alpha support matrix](csharp-alpha-support.md). Rust promotion is complete; the provisional new-adapter sequence is Ruby, PHP, then Elixir, subject to representative repositories and concrete adapter-request demand.
12. Start Ruby as the next bounded adapter. Complete for the bounded supported matrix: the Bundler foundation owns `lib/`, one root gemspec or a complete exact named root-gemspec set, runnable Minitest/RSpec conventions, exact bounded commands, literal root `.rspec` and exact per-file `spec_helper` edges within three-edge require/unique-constant evidence, unique-basename fallback, exact source-owned singleton calls, nearest exact constant-owned RSpec `described_class`, direct immutable constructor-local, exact one-line RSpec `let`/`subject`, exact source-factory, same-group RSpec helper-return instance calls, exact same-file literal shared-example inclusion, and bounded assertion usage. rubyzip, Faraday, and Diplomat fill the conventional, framework-heavy, and difficult-ownership promotion roles with all 21 Ruby scorecard areas passing; the native fixture, generated 400-source/200-test gate, shared conformance, implementation coverage, golden artifacts, model consistency, and package checks are green. Partial/path gemspec ownership, Rails ownership, and broader dynamic Ruby semantics remain outside the [Ruby alpha support matrix](ruby-alpha-support.md).
13. Start PHP as a bounded Composer/PSR-4 and PHPUnit adapter. Complete for the bounded supported matrix: brick/math, Guzzle, and Ramsey UUID fill the conventional, framework-heavy, and difficult-ownership roles with all 21 PHP scorecard areas passing, including reviewed safe command withholding for bootstrap and Make orchestration. The native fixture, generated 400-source/200-test gate, shared conformance, implementation coverage, golden artifacts, model consistency, packaging, and cross-platform checks are green. After Elixir reaches its intended comparison point, stop adding adapters long enough to complete a portfolio-wide evidence analysis and publish a ranked plan for adapter promotion, shared infrastructure, framework widening, further ecosystems, or a first bounded executor slice.
14. Start Elixir as a bounded Mix/ExUnit adapter. Complete at the intended experimental comparison point: conventional-library Jason, framework-heavy Plug, and difficult-ownership Absinthe prove exact MixProject/Mixfile ownership, conventional/app-prefixed modules and protocols, exact Mix tasks, bounded acronym/terminal-plural/repeated-declaration ownership, literal compiled-support ExUnit wrapper chains, static startup options, grouped aliases, test-body-scoped direct evidence, and safe `mix test`. Their native suites pass 445, 688, and 1,501 checks respectively; repeated audits are stable, and the native fixture, shared conformance, implementation coverage, golden artifacts, packaging, and generated 400-source/200-test pressure remain wired. Dependency/build trees, arbitrary Mix evaluation, framework reachability, and ambiguous ownership remain excluded. Begin the portfolio-wide evidence analysis before selecting another adapter or promotion slice.
15. Complete the post-Elixir portfolio review. The [August 2026 analysis](adapter-portfolio-analysis-2026-08.md) measures ten adapters, 27 supported corpus cases, 189 reviewed passes, 28,777 primary runtime adapter/audit-test lines, generated 400/200 timings, large-repository latency, maintenance signals, and current ecosystem demand. The ranked next work is Elixir corpus promotion, then a small byte-preserving shared audit kernel and Swift/Python latency profiling, then a bounded non-shipping executor evaluation. Another adapter remains demand-gated; C++/CMake and Dart/Flutter are discovery candidates rather than commitments.
16. Stage Elixir promotion in the shared corpus. Complete for the structural slice: Jason, Plug, and Absinthe provide exact conventional, framework-heavy, and difficult-ownership pins with report links, bounded support statements, and current semantic observations. All 21 cells remain pending until clean standardized measurements and review; Elixir remains experimental and adapter semantics are unchanged.
17. Complete the Elixir corpus review. Five clean standardized audits per exact pin retain the prior semantic counts and canonical digests with 10 ms Jason, 181 ms Plug, and 865 ms Absinthe medians. Dependency setup leaves tracked files clean, post-native audits remain digest-identical, and unchanged `mix test` commands pass 445, 688, and 1,501 checks respectively. All 21 Elixir scorecard areas pass; registry promotion remains a separate slice.
18. Promote Elixir to supported maturity without widening semantics. Complete: the registry, CLI/MCP support claims, shared conformance, corpus counts, support matrix, readiness/status documents, and portfolio sequence now describe ten supported adapters and 30 supported corpus cases with 210 of 210 scorecard areas passing. The corpus validator retains a staged-registry regression for future complete experimental cohorts, and the Mix/ExUnit exclusions remain unchanged.
19. Inventory the first shared audit kernel before refactoring. Complete: all ten primary adapter entrypoints repeat repository reading, portable path normalization, changed-path normalization, risk ordering, and regex escaping, but only portable paths and policy-driven deterministic text traversal are authorized initially. PHP and Elixir are the first migration pair; lexical masking, balanced parsing, build ownership, test discovery, commands, classification, and evidence remain adapter-owned. Exact Swift Package Index Server and Django pins define the next five-phase profiling targets. See the [Shared Audit Kernel Inventory](shared-audit-kernel-inventory.md).
20. Instrument the Swift and Python latency outliers before optimizing. Complete: each direct adapter audit can emit five ordered development-only phase events for traversal/text reads, project/build ownership, source discovery/indexing, test parsing/indexing, and evidence/classification/artifact assembly. Exact-pin corpus measurement enables the callbacks only with `--profile-phases`, defaults to five runs, reports samples and medians, and still rejects canonical audit drift. Registry-driven product calls do not supply the callback, and timing data never enters public artifacts or diagnostics.

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

- Cargo package/workspace member + built-in Rust tests
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
