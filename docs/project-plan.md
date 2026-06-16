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

1. Strengthen JavaScript/TypeScript repo profiling.
2. Add fixtures for common repository shapes.
3. Lock behavior with regression tests.
4. Add JSON audit output.
5. Improve scoring and skip rationale.
6. Add selected test-plan generation from the audit graph.
7. Add native test generation only after audit behavior is trustworthy.
8. Prepare public MCP distribution: GitHub repo, npm package, install snippets, fixture demos, and directory submissions.

## Fixture Roadmap

Initial JS/TS fixtures:

- `node-vitest-basic`
- `node-no-tests-yet`
- `node-jest-service`
- `express-supertest`
- `react-testing-library`

Later adapter fixtures:

- `kotlin-junit-basic`
- `apple-xcode-mixed`
- Kotlin/JVM + JUnit
- Swift Package Manager + XCTest
- Swift Package Manager + Swift Testing
- Vapor service tests
- React component tests

## MCP Direction

The MCP server should expose stable tools around the deterministic audit graph:

- `list_adapters`
- `detect_projects`
- `audit_projects`
- `summarize_project_audits`
- `rank_project_candidates`
- `generate_project_test_plan`
- `analyze_project_test_placement`
- `audit_repo`
- `get_audit_graph`
- `explain_target`
- `rank_test_candidates`
- `generate_test_plan`
- `analyze_test_placement`
- `generate_selected_test`

The model should call tools and act on structured evidence. It should not own repository fact discovery.

The internal tool API now mirrors the first five MCP-shaped operations:

- `detectRepoProjects`
- `auditRepoProjects`
- `summarizeRepoProjectAudits`
- `rankRepoProjectCandidates`
- `generateRepoProjectTestPlan`
- `analyzeRepoProjectTestPlacement`
- `auditRepo`
- `getAuditGraph`
- `explainAuditTarget`
- `rankAuditTestCandidates`
- `generateTestPlan`
- `analyzeRepoTestPlacement`

The later MCP server should wrap that API rather than duplicate audit, ranking, or planning logic.

`generate_selected_test` exists in the MCP tool surface but returns a structured deferred artifact until native generation has adapter-specific fixtures and repair-loop coverage.

The dependency-free MCP tool surface lives in `src/mcp/tool-definitions.js` and is documented in `docs/mcp-tools.md`.
It defines tool names, input schemas, and dispatch behavior without committing to a specific transport package yet.

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

Current deterministic scenarios lock selected fields for single-project planning, ranking, target explanation, no-framework blocker handling, route/component/service fixtures, and polyglot project-summary/ranking coverage.

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

Useful deterministic stats should be derived from existing artifacts:

- project count, audited project count, unsupported project count, and audit coverage
- candidate, skipped target, blocker, and risk counts
- confidence distribution and test framework detection results
- model-consistency scenario count, locked-field count, drift count, and failure count
- later generation and repair-loop counts, including files touched, test command results, and repair iterations
- trend comparisons between saved audit artifacts over time

Repository telemetry should be opt-in only. Hosted or product analytics must avoid source content and should default to aggregate metadata only.
