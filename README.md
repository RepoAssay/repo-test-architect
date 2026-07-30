# Repo Test Architect

Audit-first test strategy tooling for codebases.

Repo Test Architect builds a deterministic audit graph before asking any model or agent to reason about tests. The goal is to identify repo-native, high-value test work from facts the tool can inspect locally: project roots, framework signals, existing tests, source classifications, blockers, and remaining risk.

The current implementation can:

- audit JavaScript/TypeScript, Python, and Swift projects through supported adapters
- audit supported, bounded Kotlin/JVM fixtures through the same shared artifact model
- audit conventional Go modules and literal repository-contained `go.work` members through a supported bounded adapter
- audit conventional Cargo packages and literal repository-contained workspace members through an experimental bounded Rust adapter
- audit one conventional SDK-style C# test project or one unique literal production/test project edge, including literal multi-target and finite target-conditioned package shapes, bounded nearest-file build and central-package props, exact immutable test-field receivers, stable direct-call results, inline `out` results, framework exception and collection/string assertions, and one-hop test helpers, through an experimental bounded .NET adapter
- detect polyglot project roots and report unsupported ecosystems without hiding them
- produce a complete repository analysis, findings, ranking, plan, execution hints, and verification commands in one audit pass
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
npx --yes repo-test-architect analyze .
```

Or install the CLI and MCP server binaries:

```sh
npm install --global repo-test-architect
repo-test-architect doctor
repo-test-architect analyze .
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

The client launches the server locally. Repository source stays on the machine unless the client or another configured tool sends it elsewhere. Connected models receive instructions to start with `analyze_repository` for a general repository review. See [MCP client config](docs/mcp-client-config.md) and [agent install paths](docs/agent-install-paths.md) for global-install, local-checkout, and host-specific guidance.

## Quick Start

For a human-readable review of the current repository:

```sh
npx --yes repo-test-architect analyze .
```

`analyze` detects every project root, runs each supported adapter once, and derives the audit summary, top findings, candidate ranking, test plan, execution hints, project stats, and verification commands. Markdown stays compact; JSON preserves the complete evidence bundle:

```sh
npx --yes repo-test-architect analyze . --format json
npx --yes repo-test-architect analyze . --changed
```

Useful focused views:

| Goal | Command |
| --- | --- |
| Complete repository review | `repo-test-architect analyze .` |
| Concise architecture findings | `repo-test-architect findings-projects .` |
| Actionable cross-project plan | `repo-test-architect plan-projects .` |
| Raw reusable project audits | `repo-test-architect audit-projects . --format json` |
| Runtime readiness | `repo-test-architect doctor` |

Run `repo-test-architect --help` for the short command map or `repo-test-architect <command> --help` for options. The [CLI reference](docs/cli-reference.md) documents the full surface.

For an MCP-connected model, the equivalent default is `analyze_repository`. Use narrower tools only when the request asks for one artifact or already supplies an audit artifact.

## Current Scope

Available adapters:

- `csharp` (experimental): one static SDK-style test project or one unique literal production/test project edge, including exact literal multi-target membership, finite project-local target-conditioned package predicates, and a pair selected amid unrelated projects, with bounded nearest-file `Directory.Build.props` metadata and static `Directory.Packages.props` versions, xUnit, NUnit, or MSTest attributed tests, exact project-file commands, runnable-body-owned direct type calls, bounded concrete-local or immutable test-field receivers, one-hop stable direct-call, receiver-call, or inline `out var` result assertions, bounded exception assertions, and one same-class private-static test-helper hop; see the [C# experimental support matrix](docs/csharp-alpha-support.md)
- `javascript`: JavaScript/TypeScript repositories with Node's test runner (including TypeScript execution scripts), Bun test, AVA, Mocha/CommonJS, Vitest, Jest, Playwright, Cypress, Express/Supertest, React Testing Library detection, and bounded literal browser request-to-route evidence; see the [alpha support matrix](docs/javascript-typescript-alpha-support.md) for evidence boundaries and known gaps
- `go`: conventional `go.mod` projects and literal repository-contained `go.work` members using runnable standard-library `TestXxx`, `FuzzXxx`, or `ExampleXxx` tests, package-local filename, unique top-level and parser-owned concrete receiver-method symbols through explicit types, exact simple constructor results, or exact statically typed test-helper results, bounded standard-library and Testify assertion usage, parser-scoped local shadow checks, same-package or exact external-package imports (including dot imports), generic top-level functions, and bounded callable-body-owned same-package or module-local source hops, module-local commands, and optional explicit `GOOS`/`GOARCH`/custom-tag selection; see the [alpha support matrix](docs/go-alpha-support.md) for the supported boundary and blockers
- `kotlin`: conventional Gradle/Maven JVM module roots, settings-owned Gradle aggregates, and root-declared Maven reactors with Kotlin and/or Java standard source sets, dependency-qualified direct/exported-transitive module evidence, JUnit 4/5, `kotlin.test`, bounded Gradle/JUnit Platform Kotest common specs, conventional Gradle/Spock features, and method-level TestNG through direct Maven dependencies or Gradle `useTestNG()`; see the [Kotlin/JVM alpha support matrix](docs/kotlin-jvm-alpha-support.md)
- `python`: bounded Python package, FastAPI, Django, and Flask layouts with declarative multi-package/namespace ownership, configured pytest discovery, exact absolute/relative imports, one-hop source dependency evidence, static framework test-client route evidence, pytest/unittest, async and property-based extensions, fixture reachability, pip/setuptools, uv, Poetry, Hatch, tox, nox, and coverage configuration; see the [Python alpha support matrix](docs/python-alpha-support.md)
- `rust` (experimental): conventional Cargo packages and literal repository-contained workspace members using the built-in `#[test]` harness, inline `#[cfg(test)]` modules, and exact crate-module imports from `tests/`; see the [Rust experimental support matrix](docs/rust-alpha-support.md)
- `swift`: Swift Package Manager, Xcode-style and Bazel/rules_swift layouts, Swift Testing, XCTest, Quick/Nimble, SnapshotTesting, VaporTesting/XCTVapor, reactive frameworks, and generic Fluent database boundaries with driver-specific qualifiers; see the [Swift alpha support matrix](docs/swift-alpha-support.md)

Project detection also reports unsupported Ruby, PHP, and Elixir roots so clients can distinguish "not audited yet" from "not present."

Don't see your stack? [Open an adapter request](https://github.com/RepoAssay/repo-test-architect/issues/new?template=feature_request.yml&title=%5BFeature%5D%3A%20Adapter%20request%20for%20) with the language or ecosystem, build system, test frameworks, and—when possible—a representative public repository. Requests help prioritize adapters against real repository shapes and user demand.

The public package exposes the audit CLI, the stdio MCP server, and a deterministic MCP invoke harness under the stable binary names documented below.

## Advanced CLI and Contributor Reference

The commands below expose focused artifacts, fixtures, evals, diagnostics, and release checks for advanced use and repository development.

<details>
<summary>Show the complete command and development reference</summary>

Run the complete analysis directly or against the polyglot example:

```powershell
npm run analyze
npm run analyze:json
npm run analyze:example
npm run analyze:example:json
```

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
npm run mcp:analyze:example
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
npm run corpus:scorecard
npm run corpus:measure -- --case python-asyncer --checkout /path/to/pinned/asyncer
npm run javascript:performance:check
npm run python:performance:check
npm run kotlin:performance:check
npm run swift:performance:check
npm run go:performance:check
```

The versioned `evals/validation-corpus.json` manifest records one conventional library or service, one framework-heavy application, and one difficult ownership graph per adapter. Each record carries the shared detection, ownership, command, evidence, ranking, stability, and performance scorecard. All 15 current pinned cases pass every scorecard area; a new or repinned case stays `pending` until it has been rerun under the standardized hardening review. Cases may carry bounded adapter audit options, such as an explicit Go build target, so repeated measurements remain host-independent.

`corpus:scorecard` renders the review contract for humans. It reports review completeness separately from the pass rate among reviewed checks and keeps `PASS`, `FAIL`, and `PENDING` visible for every area. Use `npm run corpus:scorecard -- --format json` for the deterministic `validation-scorecard/v1` view. These are validation-review results, not a repository-quality rating.

`corpus:measure` verifies the checkout's exact pinned Git SHA, runs the selected adapter at least three times, rejects canonical audit drift, and reports the raw durations, median duration, evidence-link count, and normalized audit digest used to update the scorecard.

Each adapter performance check separately runs a generated 400-source/200-test project, verifies its candidate and evidence counts, and enforces a broad cross-platform regression ceiling. These synthetic gates complement the recorded per-repository corpus distributions.

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

</details>

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
    csharp/
      audit.js
    javascript/
      audit.js
      audit.ts
    kotlin/
      audit.js
    python/
      audit.js
    rust/
      audit.js
    swift/
      audit.js
  cli/
    index.js
examples/
  csharp-sdk-project-pair/
  csharp-sdk-unique-pair/
  csharp-sdk-xunit-basic/
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
  rust-cargo-basic/
  rust-cargo-workspace-basic/
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

JavaScript/TypeScript, Python, Swift, bounded Kotlin/JVM modules, and bounded Go modules are supported adapter proof points. The experimental Rust adapter adds conventional Cargo package audits, including literal repository-contained workspace members with exact package commands, while its evidence boundary is hardened. The experimental C# adapter covers one conventional SDK-style test project or one unique literal production/test project edge, including exact literal multi-target membership, finite target-conditioned package predicates, and a pair amid unrelated projects, with bounded nearest-file build metadata and static central package versions, exact test-project commands, runnable-body-owned direct type calls, bounded concrete-local or immutable test-field receivers, one-hop stable direct-call, receiver-call, or inline `out var` result assertions, bounded exception assertions, and one same-class private-static test-helper hop while solution ownership remains excluded. Go support includes literal repository-contained `go.work` members, explicit static build-target selection, bounded standard-library/Testify assertion usage, parser-scoped receiver identity through concrete local and test-helper bindings, and callable-body-owned source evidence as defined in [Go Alpha Support](docs/go-alpha-support.md). Kotlin/JVM support is limited to conventional Gradle/Maven modules and directly declared aggregate graphs, JUnit, the documented Kotest common-spec and Spock feature variants, or method-level TestNG, and standard source sets as defined in [Kotlin/JVM Alpha Support](docs/kotlin-jvm-alpha-support.md).

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
- [Go alpha support](docs/go-alpha-support.md)
- [Go validation hunt report](docs/go-validation-hunt-report.md)
- [Go HTTP validation report](docs/go-http-validation-report.md)
- [Go workspace ownership validation report](docs/go-ownership-validation-report.md)
- [Go dot-import validation report](docs/go-dot-import-validation-report.md)
- [Go constructor-result validation report](docs/go-constructor-validation-report.md)
- [Go cross-package source validation report](docs/go-cross-package-validation-report.md)
- [Go assertion-usage validation report](docs/go-assertion-validation-report.md)
- [Go parser-scoped binding validation report](docs/go-parser-scope-validation-report.md)
- [Go receiver and callable ownership validation report](docs/go-callable-ownership-validation-report.md)
- [Go test-helper receiver validation report](docs/go-helper-return-validation-report.md)
- [Rust experimental support](docs/rust-alpha-support.md)
- [C# experimental support](docs/csharp-alpha-support.md)
- [C# TDD live validation report](docs/csharp-tdd-validation-report.md)
- [C# Sharp Cast live validation report](docs/csharp-sharp-cast-validation-report.md)
- [C# Glob live validation report](docs/csharp-glob-validation-report.md)
- [C# central packages live validation report](docs/csharp-central-packages-validation-report.md)
- [C# multi-target live validation report](docs/csharp-multi-target-validation-report.md)
- [C# target-conditioned packages live validation report](docs/csharp-package-conditions-validation-report.md)
- [Kotlin/JVM validation hunt report](docs/kotlin-jvm-validation-hunt-report.md)
- [Adapter contract](docs/adapter-contract.md)
- [Artifact contract](docs/artifact-contract.md)
- [CLI reference](docs/cli-reference.md)
- [Project detection](docs/project-detection.md)
- [Polyglot workflow](docs/polyglot-workflow.md)
- [MCP tool surface](docs/mcp-tools.md)
- [MCP client config](docs/mcp-client-config.md)
- [MCP deployment](docs/mcp-deployment.md)
- [Local diagnostics](docs/diagnostics.md)
- [Agent install paths](docs/agent-install-paths.md)
- [Release lifecycle](docs/release-lifecycle.md)
- [Release checklist](docs/release-checklist.md)
