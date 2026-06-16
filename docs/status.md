# Project Status

## Current State

Repo Test Architect currently has a deterministic JavaScript/TypeScript audit pipeline.

Implemented:

- JavaScript/TypeScript repository profiling
- runtime adapter registry with the initial `javascript` adapter
- adapter registry capability metadata for maturity, framework signals, project types, and emitted artifacts
- CLI adapter registry output
- deterministic project detection for polyglot repository roots
- project detection adapter match evidence and support status reasons
- project audit artifacts that preserve adapter match evidence and support status reasons for unsupported projects
- unsupported Python, Ruby, PHP, Elixir, Go, Rust, Swift, .NET, and Kotlin/JVM project reporting with ecosystem and language labels
- documented project detection marker rules
- CLI output for project detection marker rules
- fixture-based regression coverage
- audit, plan, explanation, ranking, and deferred-generation artifacts
- test placement findings artifact with a conservative audit-based `keep` analyzer
- project-audits derived placement analysis that preserves project owner identity
- JSDoc contract annotations for core runtime modules, including adapter registry, tool API, project detection, project audit, planning, ranking, explanation, placement, and deferred generation
- project detection and project audit artifacts for polyglot repository groundwork
- documented polyglot artifact workflow from project detection through project test planning
- stable JSON schemas for generated artifacts
- golden snapshots for fixture audits, plans, and MCP tool descriptors
- model-consistency scenario artifacts for comparing explanation, ranking, planning, no-framework blocker, Jest service, React component, and Express/Supertest route output against deterministic locked fields
- deterministic model-consistency scenario runner, summary artifact, and comparison artifact for checking locked fields against tool output
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
- `analyze_project_test_placement`
- `get_audit_graph`
- `generate_test_plan`
- `explain_target`
- `rank_test_candidates`
- `analyze_test_placement`
- `generate_selected_test`

`generate_selected_test` intentionally returns `generation-deferred/v1` until native generation has adapter-specific fixtures and repair-loop coverage.
`analyze_test_placement` currently returns conservative advisory `keep` findings from existing audit evidence.

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
npm run placement:example:json
npm run placement-projects:example:json
npm run mcp:placement-projects:example
npm run mcp:placement:example
npm run mcp:adapters
npm test
npm run eval:check
npm run model-consistency:check
npm run model-consistency:json
npm run model-consistency:json -- --profile local-small
npm run model-consistency:compare -- baseline-summary.json candidate-summary.json
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
2. Consolidate repeated JSDoc artifact shapes into shared TS reference files when the runtime API stabilizes further.
3. Add Kotlin/JUnit or Swift adapter discovery as the next supported-language spike.
4. Add more model-consistency fixtures and model profile output comparisons.
5. Add package-aware test placement analysis that can recommend `move` and `split` findings across app/package boundaries.
6. Add native test generation only after adapter-specific generation rules and repair-loop tests exist.
