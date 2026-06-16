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
- project audit summaries with complete, partial, or none audit coverage status
- project ranking and plan artifacts that preserve audit coverage status before clients act on recommendations
- shared project-audits validation for saved artifact reuse across CLI and MCP-style flows
- file-backed MCP invoke arguments for local calls that reuse saved artifacts
- checked-in MCP args fixture for project-audits derived local examples
- unsupported Python, Ruby, PHP, Elixir, Go, Rust, Swift, .NET, and Kotlin/JVM project reporting with ecosystem and language labels
- documented project detection marker rules
- CLI output for project detection marker rules
- fixture-based regression coverage
- audit, plan, explanation, ranking, and deferred-generation artifacts
- test placement findings artifact with a conservative audit-based `keep` analyzer
- project-audits derived placement analysis that preserves project owner identity and reports conservative cross-owner `move` findings for test paths that escape the audited project root
- project-audits derived local stats artifact for audit coverage, target counts, framework distribution, test commands, and adapter usage
- JSDoc contract annotations for core runtime modules, including adapter registry, tool API, project detection, project audit, planning, ranking, explanation, placement, and deferred generation
- project detection and project audit artifacts for polyglot repository groundwork
- documented polyglot artifact workflow from project detection through project test planning
- documented agent install paths that separate MCP-capable hosts from instruction-only fallbacks
- stable JSON schemas for generated artifacts
- golden snapshots for fixture audits, plans, and MCP tool descriptors
- model-consistency scenario artifacts for comparing explanation, ranking, planning, no-framework blocker, Jest service, React component, Express/Supertest route, and polyglot project-summary/ranking/plan/stats output against deterministic locked fields
- deterministic model-consistency scenario runner, summary artifact, comparison artifact, and stats artifact for checking locked fields and drift counts against tool output
- changed-file workflows with `--changed` and `--changed-since`
- MCP-shaped tool descriptors, local invoke harness, and dependency-free stdio JSON-RPC scaffold
- MCP stdio smoke check that exercises initialize, tools/list, project detection, project audit, and project planning through one server process
- release-readiness checklist, npm package dry-run script, and package contents allowlist
- public-readiness checklist that separates public repository preparation from npm publishing
- product positioning note for audit-first differentiation, initial audience, business paths, proof points, and anti-positioning
- near-term roadmap for public demo polish, second adapter proof, placement analysis, MCP transport, and generation readiness gates
- demo script for showing audit quality, polyglot detection, MCP-shaped tools, and verification without implying native generation is ready
- demo command checker that runs the deterministic public demo path without nesting the full release suite
- decision log for audit-first architecture, adapter scope, local-first MCP, deferred generation, public demo readiness, and stats policy
- second-adapter spike checklist for adding Kotlin/JVM or Swift without changing the shared audit model or enabling generation early
- package contents dry-run checker for required runtime files and publish allowlist hygiene
- package binary entrypoint checker for CLI, MCP invoke, and stdio JSON-RPC boot paths
- release-readiness check runner for tests, evals, model consistency, demo path, smoke, package, and bin checks
- GitHub Actions CI workflow that runs the release-readiness check on pushes and pull requests
- GitHub pull request template that calls out audit impact, release verification, and risk notes
- GitHub bug report issue form for audit, planning, MCP, and release-check defects
- GitHub feature request issue form for audit-first adapter, MCP, evaluation, and reporting proposals
- GitHub issue template config that disables blank issues so public reports use structured forms
- contributor guide for traceable workflow, audit changes, adapter boundaries, generation deferral, and release checks
- support policy for questions, bugs, feature requests, security boundaries, and regression verification
- security policy for local-first repo access, vulnerability reports, and sensitive artifact handling
- repository ignore rules for generated dependency, package, coverage, and local comparison artifacts

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
- `collect_project_stats`
- `get_audit_graph`
- `generate_test_plan`
- `explain_target`
- `rank_test_candidates`
- `analyze_test_placement`
- `generate_selected_test`

`generate_selected_test` intentionally returns `generation-deferred/v1` until native generation has adapter-specific fixtures and repair-loop coverage.
`analyze_test_placement` currently returns conservative advisory `keep` findings from existing audit evidence. `analyze_project_test_placement` can additionally return conservative `move` findings when project-derived test paths escape the audited project root.

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
npm run stats-projects:example:json
npm run mcp:placement-projects:example
npm run mcp:stats-projects:example
npm run mcp:placement:example
npm run mcp:adapters
npm run mcp:smoke
npm test
npm run eval:check
npm run model-consistency:check
npm run model-consistency:json
npm run model-consistency:json -- --profile local-small
npm run model-consistency:compare -- baseline-summary.json candidate-summary.json
npm run model-consistency:stats
powershell -ExecutionPolicy Bypass -File ./scripts/smoke.ps1
npm run pack:dry-run
npm run pack:check
npm run bin:check
npm run release:check
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
5. Expand package-aware test placement analysis from explicit path escapes into adapter-owned package boundary signals and future `split` findings.
6. Add local-first stats artifacts for audit coverage, candidate/risk counts, model-consistency drift, and later repair-loop trends.
7. Add native test generation only after adapter-specific generation rules and repair-loop tests exist.
