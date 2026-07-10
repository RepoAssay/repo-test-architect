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

## Polyglot Detection Before Universal Adapters

Decision: detect project roots and assign adapters per project instead of assuming one repository has one language.

Rationale: real repositories commonly mix frontend, backend, mobile, tooling, generated clients, and package-specific test commands. Project detection lets adapters stay isolated while the core layer handles repository-level ranking.

Revisit when: cross-project dependency analysis becomes necessary for recommendations that cannot be made from isolated project audits.

## Local Stdio MCP First

Decision: start with local stdio MCP distribution rather than hosted remote MCP.

Rationale: repository audit needs local source, Git, and test execution context. Keeping repo access local reduces security risk and avoids uploading private source by default.

Revisit when: hosted features are limited to aggregate reporting, evals, policy packs, or model-consistency comparisons with authentication and least-privilege tool access.

## SDK Stdio Wrapper Over Deterministic Tools

Decision: mount the existing dependency-free tool descriptors and dispatcher through `@modelcontextprotocol/sdk` for local stdio transport.

Rationale: the deterministic tool surface should remain testable without transport dependencies, while the shipped MCP binary should use the official SDK protocol implementation.

Revisit when: SDK transport behavior conflicts with required client compatibility or a hosted transport is added.

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
