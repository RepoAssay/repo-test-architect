# Decision Log

This log records project-level decisions that shape architecture, scope, and public positioning.

## Audit Graph First

Decision: build a deterministic audit graph before asking a model to explain, prioritize, or generate.

Rationale: repository facts, framework signals, test commands, source classifications, blockers, and risk scores should be repeatable. Model output can vary in wording, but core recommendations should not drift without new evidence.

Revisit when: deterministic adapters can no longer express useful repository evidence without excessive complexity.

## JavaScript And TypeScript First

Decision: use JavaScript and TypeScript as the first supported adapter.

Rationale: the PC environment can run Node locally, fixtures are cheap to build, and the same adapter contract can later support Kotlin, Swift, and other ecosystems.

Revisit when: the JS/TS adapter contract is stable enough to make a second supported adapter cheaper than more JS/TS fixture work.

## Swift As The Second Supported Adapter

Decision: promote Swift to supported private-alpha maturity alongside JavaScript/TypeScript, bounded by the checked-in Swift alpha support matrix.

Rationale: Swift now exercises the full shared audit pipeline with deterministic SwiftPM, Xcode, Bazel, Vapor, reactive, and framework fixtures; golden audit and plan artifacts; model-consistency locks; blocker behavior; target-qualified symbol evidence; and pinned maintained-repository validation. RxSwift and SwiftNIO exposed and verified ownership boundaries that synthetic fixtures alone did not cover. This is enough to support popular inspectable patterns without claiming manifest execution, native Objective-C classification, or universal Xcode graph resolution.

Revisit when: common supported Swift shapes produce repeatable false ownership or coverage claims, or compiler/build-tool integration can replace conservative static evidence without weakening deterministic local operation.

## Polyglot Detection Before Universal Adapters

Decision: detect project roots and assign adapters per project instead of assuming one repository has one language.

Rationale: real repositories commonly mix frontend, backend, mobile, tooling, generated clients, and package-specific test commands. Project detection lets adapters stay isolated while the core layer handles repository-level ranking.

Revisit when: cross-project dependency analysis becomes necessary for recommendations that cannot be made from isolated project audits.

## Shared Audit Semantics, Adapter-Owned Proof

Decision: keep evidence collection ecosystem-specific while normalizing proven repository facts into shared audit semantics and shared downstream artifacts.

Rationale: languages differ materially in module resolution, build targets, symbol systems, test frameworks, and available compiler tooling. Reusing JavaScript heuristics would create weak or misleading adapters. The reusable product value lives above that boundary: evidence vocabulary, scoring, explanations, ranking, planning, placement, reporting, stats, model-consistency, CLI/MCP transport, and readiness gates.

Planning assumption: approximately 70-80% of the product architecture should remain shared and approximately 20-30% should be adapter-specific. This is directional and must be validated when another adapter reaches supported maturity.

Revisit when: a supported non-JavaScript adapter demonstrates that shared semantics prevent accurate ecosystem-specific evidence, or measured implementation effort differs materially from the planning assumption.

## Local Stdio MCP First

Decision: start with local stdio MCP distribution rather than hosted remote MCP.

Rationale: repository audit needs local source, Git, and test execution context. Keeping repo access local reduces security risk and avoids uploading private source by default.

Revisit when: hosted features are limited to aggregate reporting, evals, policy packs, or model-consistency comparisons with authentication and least-privilege tool access.

## SDK Stdio Wrapper Over Deterministic Tools

Decision: mount the existing dependency-free tool descriptors and dispatcher through `@modelcontextprotocol/sdk` for local stdio transport.

Rationale: the deterministic tool surface should remain testable without transport dependencies, while the shipped MCP binary should use the official SDK protocol implementation.

Revisit when: SDK transport behavior conflicts with required client compatibility or a hosted transport is added.

## Host-Owned Model And Subagent Orchestration

Decision: keep model routing, token and cost budgets, permissions, context management, and subagent lifecycle in the MCP client or agent host. Repo Test Architect may eventually emit deterministic advisory routing hints, but its MCP tools do not silently invoke paid models or spawn opaque workers.

Rationale: Codex, Claude Code, Cursor, local agents, and future clients already have different orchestration and permission systems. Duplicating that control inside the MCP server would create double orchestration, hidden cost, provider coupling, and harder-to-reproduce behavior. The audit graph can reduce cost more effectively by proving repository facts before any model is selected and by describing task complexity, minimal context, parallel safety, and review needs in a provider-neutral form.

Revisit when: multiple MCP hosts support a stable interoperable routing-hint contract, or a separately authorized executor service is introduced with explicit budgets and observable model calls.

## Kotlin Multiplatform JVM As A Bounded Module-Graph Slice

Decision: own Kotlin Multiplatform when the audited root is one Gradle module, or a settings-owned aggregate whose complete set of conventional child modules are KMP modules, with conventional `commonMain`/`commonTest` and target-derived main/test layouts plus exactly one literal `jvm()` or `jvm("name")` declaration per source module. Aggregate verification uses module-qualified target tasks. Cross-module evidence starts from direct test-source-set dependencies or the test module's explicitly exported main dependencies, then follows cycle-safe literal `api(project(":module"))` edges within the common or JVM visibility graph.

Rationale: a literal JVM target provides a deterministic `<targetName>Test` task and a small source-set graph: `commonTest` reaches only `commonMain`, while the target-derived test source set reaches both common and target-specific production code. Kotlin's documented common-source-set propagation selects the dependency module's JVM variant for target tests, and its source-set DSL defines `api` as exposed while `implementation` remains internal. Complete settings ownership plus literal, source-set-qualified export traversal keeps the graph deterministic without treating mixed, remapped, computed, exclusion-bearing, or custom-hierarchy builds as generic multiplatform support.

Revisit when: representative public repositories justify deterministic support for computed or multiple JVM targets, custom source-set hierarchies, mixed aggregates, type-safe project accessors, or non-literal dependency declarations.

## Native Generation Deferred

Decision: keep `generate_selected_test` as a deferred artifact until adapter-specific generation rules and repair-loop coverage exist.

Rationale: useful test strategy is the differentiator. Generating tests before the audit is trustworthy risks producing meaningless tests, invented infrastructure, or false confidence.

Revisit when: a fixture proves generation, exact test command execution, failure parsing, and repair for one adapter without editing production code.

## Audit Contract Before Executors

Decision: treat the deterministic audit artifacts as the stable product contract and keep every test-writing workflow as a replaceable downstream consumer.

Rationale: humans, coding agents, language models, CI policies, and external test tools should be able to trust the same repository evidence and choose independently how to act on it. Model-specific prompting, implementation style, and repair behavior belong in executor profiles; they must not redefine repository facts, risk classifications, or the selected audit target.

Future generation should be layered:

1. stable audit evidence and findings
2. framework-neutral test behavior and acceptance criteria
3. adapter-owned repository conventions, placement, and verification commands
4. model- or agent-specific executor instructions
5. an evidence-producing verification and repair loop

Revisit when: executor evaluations show that the audit contract lacks information required by multiple independent test-writing consumers. Extend the evidence contract before coupling it to one model's preferred prompt shape.

## Public Demo Before Package Release

Decision: prepare a public demo path before publishing an npm package.

Rationale: the tool can be useful as an audit and planning prototype before package metadata, final repository links, and ownership confirmation are ready.

Revisit when: the public repository URL, package metadata, install docs, and release-readiness checks are all final.

## Local-First Stats Before Telemetry

Decision: derive stats from local artifacts before considering external telemetry.

Rationale: stats are useful for audit coverage, fixture quality, model-consistency drift, and later repair-loop trends, but repository source and proprietary artifacts should not leave the local environment by default.

Revisit when: opt-in telemetry has clear source-content exclusions, aggregate-only defaults, and documented retention boundaries.
