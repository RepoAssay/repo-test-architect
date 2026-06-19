# Repo Test Architect

Audit-first test strategy tooling for codebases.

The first milestone is intentionally narrow:

- detect JavaScript and TypeScript repository conventions
- include an experimental Kotlin/JVM adapter spike
- identify existing test framework signals
- classify source files by likely test value
- recommend useful tests before generating any code
- report skipped areas and remaining risk honestly

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
npm run summarize-projects:example
npm run summarize-projects:example:json
npm run rank-projects:example
npm run rank-projects:example:json
npm run plan-projects:example
npm run plan-projects:example:json
npm run placement-projects:example
npm run placement-projects:example:json
npm run placement-projects:split-example:json
npm run stats-projects:example
npm run stats-projects:example:json
```

Reuse a saved project audit artifact:

```powershell
node ./src/cli/index.js audit-projects ./examples/polyglot-workspace --format json
node ./src/cli/index.js summarize-projects --from-project-audits ./project-audits.json --format json
node ./src/cli/index.js rank-projects --from-project-audits ./project-audits.json --format json
node ./src/cli/index.js plan-projects --from-project-audits ./project-audits.json --format json
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
npm run mcp:placement-projects:example
npm run mcp:placement-split:example
npm run mcp:stats-projects:example
npm run mcp:audit:example
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
npm run release:check
```

The CI workflow runs `npm run release:check` on pushes to `master` and `main`, and on pull requests.

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

Node 20 or newer is required for the CLI. If Node is not available yet, the repository still includes a PowerShell smoke check:

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/smoke.ps1
```

Check package contents before publishing:

```powershell
npm run pack:check
npm run bin:check
npm run release:check
```

## Shape

```txt
src/
  core/
    audit-model.ts
    report.ts
  adapters/
    javascript/
      audit.js
      audit.ts
    kotlin/
      audit.js
  cli/
    index.js
examples/
  node-vitest-basic/
  kotlin-junit-basic/
```

The JavaScript adapter is the supported proof point. The Kotlin/JVM adapter is experimental and exists to prove that later adapters can emit the same core audit model instead of inventing language-specific report formats.

## Docs

- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)
- [Security policy](SECURITY.md)
- [Project plan](docs/project-plan.md)
- [Project status](docs/status.md)
- [Public readiness](docs/public-readiness.md)
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
