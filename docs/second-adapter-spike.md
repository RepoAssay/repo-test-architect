# Second Adapter Spike

This checklist defines the first non-JavaScript adapter spike. The goal is to prove the adapter contract transfers to another ecosystem without expanding scope into native test generation.

## Candidate Order

Prefer one of:

- Kotlin/JVM with Gradle and JUnit
- Swift Package Manager with XCTest or Swift Testing

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

## Out Of Scope

- native test generation
- repair-loop execution
- broad framework coverage
- remote MCP hosting
- cross-project dependency ranking beyond existing project-audits merge behavior

## Done Signal

The spike is complete when the second adapter can audit its fixture through CLI and MCP-shaped project flows, appears in adapter registry output, has stable snapshots and schemas, and does not require special-case report formats.
