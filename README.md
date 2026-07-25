# Repo Test Architect

Audit-first test strategy tooling for codebases.

Repo Test Architect builds a deterministic audit graph before asking any model or agent to reason about tests. The goal is to identify repo-native, high-value test work from facts the tool can inspect locally: project roots, framework signals, existing tests, source classifications, blockers, and remaining risk.

The current implementation can:

- audit JavaScript/TypeScript, Python, and Swift projects through supported adapters
- audit supported, bounded Kotlin/JVM fixtures through the same shared artifact model
- detect polyglot project roots and report unsupported ecosystems without hiding them
- classify source files by likely test value and defer low-value direct tests
- rank candidates and generate test plans from the audit graph
- derive provider-neutral execution, context, parallel-safety, and repository-reasoning hints without selecting models or spawning subagents
- analyze conservative test placement findings across project boundaries
- collect project-level stats for coverage, candidate counts, frameworks, commands, and adapter usage
- provide disabled-by-default local MCP diagnostics, safe internal-error report IDs, runtime checks, and inspectable sanitized bundles without external reporting
- expose the same deterministic behavior through CLI commands, a local invoke harness, and a stdio MCP SDK server
- lock behavior with golden snapshots, model-consistency scenarios, package checks, and cross-OS CI

Native test generation is intentionally deferred. `generate_selected_test` returns a structured deferred artifact until adapter-specific generation policy and repair-loop fixtures exist.

Repo Test Architect is an early public alpha. Treat its findings as evidence-backed review input rather than an automatic instruction to change a repository.

## Install

Node.js 20 or newer is required.

Run the CLI without a global install:

```sh
npx --yes repo-test-architect doctor
npx --yes repo-test-architect audit .
```

Or install the CLI and MCP server binaries:

```sh
npm install --global repo-test-architect
repo-test-architect doctor
repo-test-architect audit .
```

Add the local stdio MCP server to an MCP-capable client:

```json
{
  "mcpServers": {
    "repo-test-architect": {
      "command": "npx",
      "args": [
        "--yes",
        "repo-test-architect",
        "mcp"
      ]
    }
  }
}
```

The client launches the server locally. Repository source stays on the machine unless the client or another configured tool sends it elsewhere. See [MCP client config](docs/mcp-client-config.md) and [agent install paths](docs/agent-install-paths.md) for global-install, local-checkout, and host-specific guidance.

## Current Scope

Supported adapters:

- `javascript`: JavaScript/TypeScript repositories with Node's test runner (including TypeScript execution scripts), Bun test, AVA, Mocha/CommonJS, Vitest, Jest, Playwright, Cypress, Express/Supertest, React Testing Library detection, and bounded literal browser request-to-route evidence; see the [alpha support matrix](docs/javascript-typescript-alpha-support.md) for evidence boundaries and known gaps
- `kotlin`: conventional Gradle/Maven JVM module roots, settings-owned Gradle aggregates, and root-declared Maven reactors with Kotlin and/or Java standard source sets, dependency-qualified direct/exported-transitive module evidence, JUnit 4/5, `kotlin.test`, bounded Gradle/JUnit Platform Kotest common specs, conventional Gradle/Spock features, and method-level TestNG through direct Maven dependencies or Gradle `useTestNG()`; see the [Kotlin/JVM alpha support matrix](docs/kotlin-jvm-alpha-support.md)
- `python`: bounded Python package, FastAPI, Django, and Flask layouts with declarative multi-package/namespace ownership, configured pytest discovery, exact absolute/relative imports, one-hop source dependency evidence, static framework test-client route evidence, pytest/unittest, async and property-based extensions, fixture reachability, pip/setuptools, uv, Poetry, Hatch, tox, nox, and coverage configuration; see the [Python alpha support matrix](docs/python-alpha-support.md)
- `swift`: Swift Package Manager, Xcode-style and Bazel/rules_swift layouts, Swift Testing, XCTest, Quick/Nimble, SnapshotTesting, VaporTesting/XCTVapor, reactive frameworks, and generic Fluent database boundaries with driver-specific qualifiers; see the [Swift alpha support matrix](docs/swift-alpha-support.md)

Project detection also reports unsupported Ruby, PHP, Elixir, Go, Rust, and .NET roots so clients can distinguish "not audited yet" from "not present."

The public package exposes the audit CLI, the stdio MCP server, and a deterministic MCP invoke harness under the stable binary names documented below.

## Working CLI

Check runtime and diagnostics readiness:

```powershell
npm run doctor
npm run doctor:json
```

Local MCP diagnostics are disabled by default. They can be explicitly directed to stderr or a bounded local JSONL file; see [Local diagnostics](docs/diagnostics.md). Build a sanitized, inspectable bundle with:

```powershell
npm run diagnostic-bundle -- --diagnostics-file ./.repo-test-architect/diagnostics.jsonl --format json
node ./src/cli/index.js diagnostic-bundle --diagnostics-file ./.repo-test-architect/diagnostics.jsonl --format json
```

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
npm run hints-projects:example
npm run hints-projects:example:json
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
npm run hints:example
npm run hints:example:json
npm run plan:kotlin-fixture
npm run plan:kotlin-fixture:json
npm run plan:item:example
npm run plan:changed
npm run plan:changed-since
```

Derive advisory execution hints while leaving the plan artifact unchanged:

```powershell
node ./src/cli/index.js hints ./examples/node-vitest-basic --item add-test:src/authService.ts
node ./src/cli/index.js hints-projects ./examples/polyglot-workspace --format json
```

The installing CLI or agent host remains responsible for model choice, budgets, permissions, context loading, and subagent lifecycle.

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

Check that every supported adapter has a complete, pinned hardening corpus:

```powershell
npm run corpus:check
npm run javascript:performance:check
npm run python:performance:check
npm run kotlin:performance:check
npm run swift:performance:check
```

The versioned `evals/validation-corpus.json` manifest records one conventional library or service, one framework-heavy application, and one difficult ownership graph per adapter. Each record carries the shared detection, ownership, command, evidence, ranking, stability, and performance scorecard. A `pending` score stays visible until that area has been rerun under the standardized hardening review.

Each adapter performance check separately runs a generated 400-source/200-test project, verifies its candidate and evidence counts, and enforces a broad cross-platform regression ceiling. These synthetic gates do not replace the pending per-repository corpus measurements.

Use `alpha:check` for the adapter-support milestone. `release:check` additionally covers packaging and installed-binary readiness.

The CI workflow keeps one stable Linux `pr-gate`: documentation-only changes run focused contract tests, normal changes run `npm run alpha:check`, and distribution-sensitive changes run `npm run release:check`. Windows runs only for runtime and portability changes; macOS runs only for Swift-sensitive changes. A merge to `master` runs the complete release gate on Linux, while manual dispatch runs the full release gate on all three operating systems.

The tests include golden audit and plan snapshots under `evals/expected`, driven by `evals/fixtures.json`, plus shared adapter-conformance checks for deterministic JSON, portable paths, evidence semantics, and downstream artifact agreement.
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
npm run distribution:check
npm run release:check
```

`distribution:check` validates packaging and MCP metadata preparation. The stricter `distribution:check:publish` verifies that the public npm and MCP Registry identities are aligned before a release. See [Distribution](docs/distribution.md).

## Shape

```txt
src/
  core/
    audit-model.ts
    plan-execution-hints.js
    plan-execution-hints.ts
    report.js
    report.ts
  diagnostics/
    diagnostics.js
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
  kotlin-gradle-module-graph-junit/
  kotlin-maven-junit/
  kotlin-maven-reactor-junit/
  kotlin-maven-wrapper-junit4/
  kotlin-gradle-aggregate-kotest/
  kotlin-gradle-spock/
  kotlin-maven-testng/
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

JavaScript/TypeScript, Python, Swift, and bounded Kotlin/JVM modules are supported adapter proof points. Kotlin/JVM support is limited to conventional Gradle/Maven modules and directly declared aggregate graphs, JUnit, the documented Kotest common-spec and Spock feature variants, or method-level TestNG, and standard source sets as defined in [Kotlin/JVM Alpha Support](docs/kotlin-jvm-alpha-support.md).

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
- [Adapter hardening plan](docs/adapter-hardening-plan.md)
- [Demo script](docs/demo-script.md)
- [Decision log](docs/decision-log.md)
- [Second adapter spike](docs/second-adapter-spike.md)
- [Kotlin/JVM alpha support](docs/kotlin-jvm-alpha-support.md)
- [Kotlin/JVM validation hunt report](docs/kotlin-jvm-validation-hunt-report.md)
- [Adapter contract](docs/adapter-contract.md)
- [Artifact contract](docs/artifact-contract.md)
- [Project detection](docs/project-detection.md)
- [Polyglot workflow](docs/polyglot-workflow.md)
- [MCP tool surface](docs/mcp-tools.md)
- [MCP client config](docs/mcp-client-config.md)
- [MCP deployment](docs/mcp-deployment.md)
- [Local diagnostics](docs/diagnostics.md)
- [Agent install paths](docs/agent-install-paths.md)
- [Release checklist](docs/release-checklist.md)
