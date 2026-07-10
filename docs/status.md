# Project Status

## Current State

Repo Test Architect currently has a deterministic JavaScript/TypeScript audit pipeline plus experimental Kotlin/JVM, Swift, and Python adapter spikes.

Implemented:

- JavaScript/TypeScript repository profiling
- runtime adapter registry with the supported `javascript` adapter and experimental `kotlin`, `swift`, and `python` adapters
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
- unsupported Ruby, PHP, Elixir, Go, Rust, and .NET project reporting with ecosystem and language labels
- documented project detection marker rules
- CLI output for project detection marker rules
- fixture-based regression coverage
- audit, plan, explanation, ranking, and deferred-generation artifacts
- test placement findings artifact with a conservative audit-based `keep` analyzer
- project-audits derived placement analysis that preserves project owner identity and reports conservative cross-owner `move` and `split` findings for test paths that escape the audited project root
- project-level top findings report with category counts for missing coverage, weak existing coverage, misplaced coverage, low-value direct targets, and blocked projects
- auxiliary workspace-aware blocker ranking that keeps missing test setup in docs, examples, and playground projects below actionable product findings
- project-audits derived local stats artifact for audit coverage, audited versus unsupported source file counts by language, target counts, risk and signal distributions, framework distribution, test commands, and adapter usage
- JSDoc contract annotations for core runtime modules, including adapter registry, tool API, project detection, project audit, planning, ranking, explanation, placement, and deferred generation
- project detection and project audit artifacts for polyglot repository groundwork
- documented polyglot artifact workflow from project detection through project test planning
- documented agent install paths that separate MCP-capable hosts from instruction-only fallbacks
- stable JSON schemas for generated artifacts
- golden snapshots for fixture audits, plans, and MCP tool descriptors
- model-consistency scenario artifacts for comparing explanation, ranking, planning, no-framework blocker, Jest service, React component, Express/Supertest route, polyglot project-summary/ranking/plan/stats, and placement output against deterministic locked fields
- deterministic model-consistency scenario runner, summary artifact, comparison artifact, and stats artifact for checking locked fields and drift counts against tool output
- changed-file workflows with `--changed` and `--changed-since`
- MCP tool descriptors, local invoke harness, and stdio MCP SDK server
- MCP stdio smoke check that exercises initialize, notifications, tools/list, project detection, project audit, project planning, structured tool errors, and recovery through one server process
- deterministic JSON-RPC harness tests that keep parser, batch request, and local dispatcher behavior covered separately from the SDK transport
- release-readiness checklist, npm package dry-run script, and package contents allowlist
- public-readiness checklist that separates public repository preparation from npm publishing
- alpha-readiness checklist for the test architecture audit milestone before native generation
- real-repo audit reports for owned JavaScript/TypeScript and Swift repositories, including Collectors Grimoire and `cg-*` sibling packages
- product positioning note for audit-first differentiation, initial audience, business paths, proof points, and anti-positioning
- near-term roadmap for public demo polish, second adapter proof, placement analysis, MCP transport, and generation readiness gates
- demo script for showing audit quality, polyglot detection, MCP tools, and verification without implying native generation is ready
- demo command checker that runs the deterministic public demo path without nesting the full release suite
- decision log for audit-first architecture, the stable audit/executor boundary, adapter scope, local-first MCP, deferred generation, public demo readiness, and stats policy
- adapter spike checklist for adding ecosystems without changing the shared audit model or enabling generation early
- package contents dry-run checker for required runtime files and publish allowlist hygiene
- package binary entrypoint checker for CLI, MCP invoke, and stdio MCP boot paths
- installed-package tarball smoke checker for published CLI and MCP binary boot paths
- release-readiness check runner for tests, evals, model consistency, demo path, smoke, package, bin, and installed-package checks
- GitHub Actions CI workflow that runs the release-readiness check on Ubuntu, macOS, and Windows for pushes and pull requests
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
- `kotlin-junit-basic`
- `kotlin-gradle-groovy-junit`
- `kotlin-maven-junit`
- `swift-spm-xctest`
- `swift-spm-swift-testing`
- `swift-spm-quick-nimble`
- `vapor-service-tests`
- `vapor-mongodb-boundaries`
- `python-pytest-service`
- `python-unittest-service`
- `python-requirements-pytest`
- `python-package-local-tests`
- `python-setuptools-pytest`
- `python-uv-pytest`
- `python-poetry-pytest`
- `python-no-tests-yet`

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
- `collect_project_findings`
- `analyze_project_test_placement`
- `collect_project_stats`
- `get_audit_graph`
- `generate_test_plan`
- `explain_target`
- `rank_test_candidates`
- `analyze_test_placement`
- `generate_selected_test`

`generate_selected_test` intentionally returns `generation-deferred/v1` until native generation has adapter-specific fixtures and repair-loop coverage.
`analyze_test_placement` currently returns conservative advisory `keep` findings from existing audit evidence. `analyze_project_test_placement` can additionally return conservative `move` findings when project-derived test paths escape the audited project root, or `split` findings when the escaped match is integration-level. Package-aware adapters can also emit `package-owned-behavior` and `app-integration-dependency` signals so repo-relative cross-owner test paths become advisory `move` or `split` findings. The project placement analyzer can also infer a package boundary when a package-like project root such as `packages/*`, `libs/*`, or `modules/*` is covered by an app-like test owner such as `apps/*`, `clients/*`, or `services/*`.

## Verification

Primary checks:

```powershell
npm run adapters:json
npm run detect-rules:json
npm run mcp:detect-rules
npm run detect:example:json
npm run audit:kotlin-fixture:json
npm run plan:kotlin-fixture:json
npm run audit-projects:example:json
npm run summarize-projects:example:json
npm run rank-projects:example:json
npm run plan-projects:example:json
npm run findings-projects:example:json
npm run placement:example:json
npm run placement-projects:example:json
npm run placement-projects:split-example:json
npm run stats-projects:example:json
npm run mcp:placement-projects:example
npm run mcp:findings-projects:example
npm run mcp:placement-split:example
npm run mcp:stats-projects:example
npm run mcp:audit:kotlin-fixture
npm run mcp:placement:example
npm run mcp:adapters
npm run mcp:smoke
npm test
npm run eval:check
npm run model-consistency:check
npm run model-consistency:json
npm run model-consistency:json -- --profile local-small
npm run model-consistency:compare:profiles
npm run model-consistency:compare -- baseline-summary.json candidate-summary.json
npm run model-consistency:stats
npm run smoke
npm run pack:dry-run
npm run pack:check
npm run bin:check
npm run installed-package:check
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

1. Consolidate repeated JSDoc artifact shapes into shared TS reference files when the runtime API stabilizes further.
2. Harden experimental adapters with more fixture variants, starting with Python packaging/test-command variants and Swift/Vapor edge cases.
3. Add more model-consistency fixtures and model profile output comparisons.
4. Expand package-aware test placement analysis from package/app root inference into richer adapter-owned package boundary signals.
5. Add local-first stats artifacts for audit coverage, candidate/risk counts, model-consistency drift, and later repair-loop trends.
6. Add native test generation only after adapter-specific generation rules and repair-loop tests exist.
