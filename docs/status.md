# Project Status

## Current State

Repo Test Architect currently has a deterministic JavaScript/TypeScript audit pipeline.

Implemented:

- JavaScript/TypeScript repository profiling
- runtime adapter registry with the initial `javascript` adapter
- CLI adapter registry output
- deterministic project detection for polyglot repository roots
- unsupported Python, Ruby, PHP, Elixir, Go, Rust, Swift, .NET, and Kotlin/JVM project reporting with ecosystem and language labels
- documented project detection marker rules
- CLI output for project detection marker rules
- fixture-based regression coverage
- audit, plan, explanation, ranking, and deferred-generation artifacts
- project detection and project audit artifacts for polyglot repository groundwork
- documented polyglot artifact workflow from project detection through project test planning
- stable JSON schemas for generated artifacts
- golden snapshots for fixture audits, plans, and MCP tool descriptors
- changed-file workflows with `--changed` and `--changed-since`
- MCP-shaped tool descriptors, local invoke harness, and dependency-free stdio JSON-RPC scaffold
- release-readiness checklist, npm package dry-run script, and package contents allowlist

## Supported Fixtures

- `node-vitest-basic`
- `node-no-tests-yet`
- `node-jest-service`
- `express-supertest`
- `react-testing-library`

## Adapter-Ready Fixtures

- `kotlin-junit-basic` contains Java and Kotlin sources and detects as one unsupported JVM project until a Kotlin/JUnit adapter exists.
- `apple-xcode-mixed` contains Swift and Objective-C sources and detects as one unsupported Apple project until an Apple adapter exists.

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
- `get_audit_graph`
- `generate_test_plan`
- `explain_target`
- `rank_test_candidates`
- `generate_selected_test`

`generate_selected_test` intentionally returns `generation-deferred/v1` until native generation has adapter-specific fixtures and repair-loop coverage.

## Verification

Primary checks:

```powershell
npm run adapters:json
npm run detect-rules:json
npm run mcp:detect-rules
npm run detect:example:json
npm run audit-projects:example:json
npm run summarize-projects:example:json
npm run rank-projects:example:json
npm run plan-projects:example:json
npm run mcp:adapters
npm test
npm run eval:check
powershell -ExecutionPolicy Bypass -File ./scripts/smoke.ps1
npm run pack:dry-run
```

The project-derived CLI commands also accept `--from-project-audits` for reusing a saved `project-audits/v1` artifact.

Snapshot maintenance:

```powershell
npm run eval:update
npm run eval:test
```

`eval:check` uses the direct snapshot checker. `eval:test` uses Node's test runner and may need a less restricted process environment.

## Next Useful Milestones

1. Add a real local stdio MCP SDK transport wrapper around `src/mcp/tool-definitions.js`.
2. Add TypeScript/JSDoc typing for the runtime JS modules or consolidate TS reference files.
3. Add Kotlin/JUnit or Swift adapter discovery as the next supported-language spike.
4. Add model-consistency eval fixtures that compare generated explanations against the same deterministic audit graph.
5. Add native test generation only after adapter-specific generation rules and repair-loop tests exist.
