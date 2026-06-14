# Project Status

## Current State

Repo Test Architect currently has a deterministic JavaScript/TypeScript audit pipeline.

Implemented:

- JavaScript/TypeScript repository profiling
- runtime adapter registry with the initial `javascript` adapter
- deterministic project detection for polyglot repository roots
- fixture-based regression coverage
- audit, plan, explanation, ranking, and deferred-generation artifacts
- project detection and project audit artifacts for polyglot repository groundwork
- documented polyglot artifact workflow from project detection through project test planning
- stable JSON schemas for generated artifacts
- golden snapshots for fixture audits, plans, and MCP tool descriptors
- changed-file workflows with `--changed` and `--changed-since`
- MCP-shaped tool descriptors, local invoke harness, and dependency-free stdio JSON-RPC scaffold

## Supported Fixtures

- `node-vitest-basic`
- `node-no-tests-yet`
- `node-jest-service`
- `express-supertest`
- `react-testing-library`

## MCP Surface

Current tool names:

- `audit_repo`
- `list_adapters`
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
npm run detect:example:json
npm run audit-projects:example:json
npm run summarize-projects:example:json
npm run rank-projects:example:json
npm run plan-projects:example:json
npm test
npm run eval:check
powershell -ExecutionPolicy Bypass -File ./scripts/smoke.ps1
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
3. Add Kotlin/JUnit or Swift adapter discovery as the next language spike.
4. Add model-consistency eval fixtures that compare generated explanations against the same deterministic audit graph.
5. Add native test generation only after adapter-specific generation rules and repair-loop tests exist.
