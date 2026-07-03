# Second Adapter Spike

This checklist defines the first non-JavaScript adapter spike. The goal is to prove the adapter contract transfers to another ecosystem without expanding scope into native test generation.

## Candidate Order

Completed spike:

- Kotlin/JVM with Gradle/Maven and JUnit

Follow-up spikes now underway:

- Swift Package Manager with XCTest or Swift Testing
- Python package roots with pytest or unittest

Choose the ecosystem with the lowest local setup cost and the clearest fixture coverage. The spike should validate adapter shape, not solve every framework variant.

## Required Fixture Shape

Add one minimal fixture with:

- one package or build-root marker
- at least one test framework signal
- one meaningful unit-test candidate, such as parser, mapper, validator, service, repository, or calculator logic
- one low-value skipped target, such as DTO, constants, generated code, or type-only model
- one existing test that lets the audit distinguish covered-but-risky from untested code
- one realistic test command candidate

Avoid app-level UI, screenshots, device simulators, databases, and remote services in the first spike.

## Adapter Acceptance Gate

The adapter must:

- register in the adapter registry with ecosystem, language, maturity, supported test frameworks, project types, and emitted artifacts
- reuse the shared audit model
- preserve project identity in project-audits flows
- classify meaningful targets without direct DTO or constants test recommendations
- report blockers honestly when a runnable test command is missing
- produce golden audit and plan snapshots
- add at least one model-consistency scenario for a locked plan, ranking, or explanation field
- keep `npm run release:check` passing

Current Kotlin/JVM status:

- registered as experimental `kotlin`
- audits the `kotlin-junit-basic` fixture through the shared audit model
- preserves mixed Java/Kotlin source ownership inside one JVM project root
- classifies calculator/formatter logic as useful and DTO-style data classes as deferred
- has golden audit and plan snapshots
- has a Kotlin-specific model-consistency plan scenario
- native generation remains deferred

Current Python status:

- registered as experimental `python`
- audits pytest, unittest, requirements.txt, setuptools, package-local tests, and no-tests-yet fixtures through the shared audit model
- classifies parser/service logic as useful and dataclass DTOs as deferred
- reports no-framework and no-command blockers honestly
- has golden audit and plan snapshots
- native generation remains deferred

## Out Of Scope

- native test generation
- repair-loop execution
- broad framework coverage
- remote MCP hosting
- cross-project dependency ranking beyond existing project-audits merge behavior

## Done Signal

The spike is complete when the second adapter can audit its fixture through CLI and MCP-shaped project flows, appears in adapter registry output, has stable snapshots and schemas, and does not require special-case report formats.
