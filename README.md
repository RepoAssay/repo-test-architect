# Repo Test Architect

Audit-first test strategy tooling for codebases.

Repo Test Architect builds a deterministic audit graph before asking any model or agent to reason about tests. The goal is to identify repo-native, high-value test work from facts the tool can inspect locally: project roots, framework signals, existing tests, source classifications, blockers, and remaining risk.

The current implementation can:

- audit JavaScript and TypeScript projects through the supported adapter
- audit experimental Kotlin/JVM, Swift, and Python fixtures through the same shared artifact model
- detect polyglot project roots and report unsupported ecosystems without hiding them
- classify source files by likely test value and defer low-value direct tests
- rank candidates and generate test plans from the audit graph
- analyze conservative test placement findings across project boundaries
- collect project-level stats for coverage, candidate counts, frameworks, commands, and adapter usage
- expose the same deterministic behavior through CLI commands, a local invoke harness, and a stdio MCP SDK server
- lock behavior with golden snapshots, model-consistency scenarios, package checks, and cross-OS CI

Native test generation is intentionally deferred. `generate_selected_test` returns a structured deferred artifact until adapter-specific generation policy and repair-loop fixtures exist.

## Current Scope

Supported proof point:

- `javascript`: JavaScript/TypeScript repositories with Node's test runner (including TypeScript execution scripts), Bun test, AVA, Mocha/CommonJS, Vitest, Jest, Playwright, Cypress, Express/Supertest, and React Testing Library detection; see the [alpha support matrix](docs/javascript-typescript-alpha-support.md) for evidence boundaries and known gaps

Experimental adapter spikes:

- `kotlin`: Gradle/Maven JVM projects with JUnit and Kotlin test signals
- `swift`: Swift Package Manager, Xcode-style and Bazel/rules_swift layouts, Swift Testing, XCTest, Quick/Nimble, SnapshotTesting, XCTVapor, Vapor, and MongoDB boundary signals; see the [Swift alpha hardening boundary](docs/swift-alpha-support.md)
- `python`: pytest, unittest, requirements, setuptools, uv, Poetry, Hatch command markers, and no-tests-yet blocker behavior

Project detection also reports unsupported Ruby, PHP, Elixir, Go, Rust, and .NET roots so clients can distinguish "not audited yet" from "not present."

The package remains private while public repository metadata and publish targets are finalized.

## Working CLI

List registered adapters:

```powershell
npm run adapters
npm run adapters:json
```

Inspect project detection marker rules:

```powershell
npm run detect-rules
npm run detect-rules:json
```

Detect project roots and adapter matches:

```powershell
npm run detect:example
npm run detect:example:json
npm run detect:kotlin-fixture
npm run detect:kotlin-fixture:json
npm run detect:apple-fixture
npm run detect:apple-fixture:json
npm run audit-projects:example
npm run audit-projects:example:json
npm run audit-projects:changed-since
npm run summarize-projects:example
npm run summarize-projects:example:json
npm run rank-projects:example
npm run rank-projects:example:json
npm run plan-projects:example
npm run plan-projects:example:json
npm run findings-projects:example
npm run findings-projects:example:json
npm run placement-projects:example
npm run placement-projects:example:json
npm run placement-projects:split-example:json
npm run stats-projects:example
npm run stats-projects:example:json
```

For project-aware self-audits, exclude checked-in fixture or sample roots with a quoted subtree pattern:

```powershell
node ./src/cli/index.js findings-projects . --exclude-project "examples/**"
```

Reuse a saved project audit artifact:

```powershell
node ./src/cli/index.js audit-projects ./examples/polyglot-workspace --format json
node ./src/cli/index.js summarize-projects --from-project-audits ./project-audits.json --format json
node ./src/cli/index.js rank-projects --from-project-audits ./project-audits.json --format json
node ./src/cli/index.js plan-projects --from-project-audits ./project-audits.json --format json
node ./src/cli/index.js findings-projects --from-project-audits ./project-audits.json --format json
node ./src/cli/index.js placement-projects --from-project-audits ./project-audits.json --format json
node ./src/cli/index.js stats-projects --from-project-audits ./project-audits.json --format json
```

```powershell
npm run audit:example
npm run audit:kotlin-fixture
```

Output the structured audit graph:

```powershell
npm run audit:example:json
npm run audit:kotlin-fixture:json
```

Generate an actionable test plan from the audit graph:

```powershell
npm run plan:example
npm run plan:example:json
npm run plan:kotlin-fixture
npm run plan:kotlin-fixture:json
npm run plan:item:example
npm run plan:changed
npm run plan:changed-since
```

Explain one audited target by stable target ID:

```powershell
npm run explain:example
```

Rank test candidates without generating tests:

```powershell
npm run rank:example
```

Analyze existing test placement from audit evidence:

```powershell
npm run placement:example
npm run placement:example:json
npm run placement:from-audit:example
```

Exercise the MCP-style tool surface:

```powershell
npm run mcp:tools
npm run mcp:adapters
npm run mcp:detect-rules
npm run mcp:detect:example
npm run mcp:audit-projects:example
npm run mcp:summarize-projects:example
npm run mcp:rank-projects:example
npm run mcp:plan-projects:example
npm run mcp:findings-projects:example
npm run mcp:placement-projects:example
npm run mcp:placement-split:example
npm run mcp:stats-projects:example
npm run mcp:audit:example
npm run mcp:audit:kotlin-fixture
npm run mcp:placement:example
npm run mcp:audit:envelope
npm run mcp:stdio
npm run mcp:smoke
```

Generate a plan from an existing audit JSON file:

```powershell
npm run plan:from-audit:example
```

Run the auditor regression tests:

```powershell
npm test
npm run alpha:check
npm run release:check
```

Find and rank active public repositories for real-world adapter validation:

```powershell
npm run validation:repos -- --profile react
npm run validation:repos -- --profile workspace --limit 10
npm run validation:repos -- --profile swift,gradle,maven --format json
```

The finder uses authenticated GitHub repository search, verifies exact ecosystem markers in root manifests, and ranks candidates using maintenance recency, stars, repository size, lockfiles, CI, and license metadata. Run `npm run validation:repos -- --list-profiles` for the available profiles and `--help` for quality-filter options.

Use `alpha:check` for the private audit milestone. `release:check` additionally covers packaging and installed-binary readiness.

The CI workflow runs `npm run release:check` on Ubuntu, macOS, and Windows for pushes to `master` and `main`, and on pull requests.

The tests include golden audit and plan snapshots under `evals/expected`, driven by `evals/fixtures.json`.
JSON schemas and the signal registry for versioned artifacts live under `schemas/`.

Refresh snapshots after intentional audit behavior changes:

```powershell
npm run eval:check
npm run eval:summary
npm run eval:test
npm run eval:update
```

Check model-consistency scenario locked fields against deterministic tool results:

```powershell
npm run model-consistency:check
npm run model-consistency:json
npm run model-consistency:json -- --profile local-small
npm run model-consistency:compare -- baseline-summary.json candidate-summary.json
npm run model-consistency:stats
```

Node 20 or newer is required for the CLI. The default smoke check is portable across platforms:

```powershell
npm run smoke
```

If Node is not available yet, the repository still includes a PowerShell smoke check:

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/smoke.ps1
```

Check package contents before publishing:

```powershell
npm run pack:check
npm run bin:check
npm run installed-package:check
npm run release:check
```

## Shape

```txt
src/
  core/
    audit-model.ts
    report.js
    report.ts
  adapters/
    javascript/
      audit.js
      audit.ts
    kotlin/
      audit.js
    python/
      audit.js
    swift/
      audit.js
  cli/
    index.js
examples/
  node-vitest-basic/
  express-supertest/
  react-testing-library/
  kotlin-junit-basic/
  kotlin-gradle-groovy-junit/
  kotlin-maven-junit/
  python-pytest-service/
  python-uv-pytest/
  python-poetry-pytest/
  swift-spm-xctest/
  swift-spm-swift-testing/
  swift-spm-quick-nimble/
  swift-spm-custom-paths/
  swift-spm-alternate-roots/
  swift-bazel-xctest/
  swift-xcode-test-plans/
  vapor-service-tests/
  vapor-mongodb-boundaries/
evals/
  expected/
  model-consistency/
schemas/
```

The JavaScript adapter is the supported proof point. The Kotlin/JVM, Swift, and Python adapters are experimental and exist to prove that later adapters can emit the same core audit model instead of inventing language-specific report formats.

Important runtime surfaces:

- CLI: `src/cli/index.js`
- MCP tool definitions: `src/mcp/tool-definitions.js`
- stdio MCP SDK server: `src/mcp/stdio.js`
- local invoke harness: `src/mcp/invoke.js`
- release gate: `scripts/check-release-readiness.js`

## Docs

- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)
- [Security policy](SECURITY.md)
- [Project plan](docs/project-plan.md)
- [Project status](docs/status.md)
- [Public readiness](docs/public-readiness.md)
- [Alpha readiness](docs/alpha-readiness.md)
- [Real repository audit reports](docs/real-repo-audit-reports.md)
- [Product positioning](docs/product-positioning.md)
- [Near-term roadmap](docs/near-term-roadmap.md)
- [Demo script](docs/demo-script.md)
- [Decision log](docs/decision-log.md)
- [Second adapter spike](docs/second-adapter-spike.md)
- [Adapter contract](docs/adapter-contract.md)
- [Artifact contract](docs/artifact-contract.md)
- [Project detection](docs/project-detection.md)
- [Polyglot workflow](docs/polyglot-workflow.md)
- [MCP tool surface](docs/mcp-tools.md)
- [MCP client config](docs/mcp-client-config.md)
- [MCP deployment](docs/mcp-deployment.md)
- [Agent install paths](docs/agent-install-paths.md)
- [Release checklist](docs/release-checklist.md)
