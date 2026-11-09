# MCP Tool Surface

The MCP server exposes a thin wrapper around `src/mcp/tool-definitions.js`.

The tool definitions remain dependency-free so the deterministic contract can be tested separately from the MCP SDK transport.

Deployment direction:

- `docs/mcp-deployment.md`

Descriptor schema:

- `schemas/mcp-tool-v1.schema.json`

## Tools

- `review_repository` — recommended start for an unfamiliar repository or general review; bounded result
- `analyze_repository` — complete bundle with per-target evidence; grows with repository size
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
- `audit_repo`
- `get_audit_graph`
- `generate_test_plan`
- `get_plan_execution_hints`
- `explain_target`
- `rank_test_candidates`
- `analyze_test_placement`
- `generate_selected_test`

## Contract

Each tool returns one of the stable artifacts documented in `docs/artifact-contract.md`. Descriptors expose a compact `outputSchema`: the artifact's top-level properties, required fields and `schemaVersion` constant. Its `description` names the complete published schema file (for example `schemas/audit-v1.schema.json`); the same path is also in the non-standard `outputArtifact.schemaPath` field, which some MCP SDK clients strip when parsing `tools/list`. Nested contracts are kept out of `tools/list` so the 20 descriptors stay small in a model's context; validate nested structure against the published schema files. Successful calls return the same artifact in `structuredContent` and as compact single-line JSON text for clients that rely on the earlier response shape; the text is not indented, so the two copies together stay close to twice the artifact size rather than three times.

### Result Size Budget

One oversized stdio message can exhaust or crash an MCP client, so the server refuses to emit a tool result whose serialized form exceeds a character budget. The budget is measured on the complete serialized result, which carries the artifact twice (text and `structuredContent`) plus JSON escaping, because that is what crosses the transport; it is roughly twice the compact artifact. The default budget is 1,000,000 characters. Set `REPO_TEST_ARCHITECT_MAX_RESULT_CHARS` to a non-negative decimal integer to change it; `0` disables the guard, and malformed or unsafe values fall back to the default. When a result exceeds the budget the call fails with `kind: "result-too-large"`, the `toolName`, the measured `resultChars`, and the `maxResultChars` in force. The error never echoes arguments or artifact content. Reduce the result by narrowing the scan with `excludeProjectRoots` or `changedPaths`, by requesting a smaller artifact, or by saving the complete artifact with the CLI (`repo-test-architect analyze <repo> --format json > analysis.json`) and reading it from disk.

Every descriptor also declares a human-readable `title` and explicit MCP safety hints. The current surface is read-only, non-destructive, repeatable for the same repository state and arguments, and closed-world: tools inspect local repository inputs and compute artifacts without contacting external services. These annotations are client-facing hints; deterministic local controls remain the security boundary.

The model should consume these artifacts directly:

- the bounded repository review (summary, blockers, top findings, top candidates and plan items with hints, verification commands, and stats) comes from `review_repository`
- the complete repository audit, findings, ranking, plan, execution hints, stats, and verification commands come from `analyze_repository`
- available language adapters come from `list_adapters`
- project marker rules and ignored directories come from `list_project_detection_rules`
- project roots and adapter matches come from `detect_projects`
- project-level audits for supported roots come from `audit_projects`
- compact repo-level audit coverage, unsupported reasons, and project audit counts come from `summarize_project_audits`
- project-aware candidate ordering comes from `rank_project_candidates`
- project-aware test planning comes from `generate_project_test_plan`
- concise top test architecture findings come from `collect_project_findings`
- project-aware test placement findings come from `analyze_project_test_placement`
- local deterministic project stats come from `collect_project_stats`
- audit facts come from `audit_repo` or `get_audit_graph`
- target-level explanation comes from `explain_target`
- candidate ordering comes from `rank_test_candidates`
- advisory test placement findings come from `analyze_test_placement`
- actionable plan items come from `generate_test_plan`
- provider-neutral complexity, context, parallel-safety, role, and repository-reasoning guidance comes from `get_plan_execution_hints`
- selected test generation currently returns `generation-deferred/v1`

The MCP layer should not reclassify code, rerank candidates, or infer repository facts from raw source files.
It should also not generate test code until adapter-specific generation rules and repair loops exist.

## Output Artifacts

Each tool descriptor includes `outputArtifact` metadata:

| Tool | Output |
| --- | --- |
| `review_repository` | `repository-review/v1` |
| `analyze_repository` | `repository-analysis/v1` |
| `list_adapters` | `adapter-registry/v1` |
| `list_project_detection_rules` | `project-detection-rules/v1` |
| `detect_projects` | `project-detection/v1` |
| `audit_projects` | `project-audits/v1` |
| `summarize_project_audits` | `project-audit-summary/v1` |
| `rank_project_candidates` | `project-candidate-ranking/v1` |
| `generate_project_test_plan` | `project-test-plan/v1` |
| `collect_project_findings` | `project-findings/v1` |
| `analyze_project_test_placement` | `test-placement-findings/v1` |
| `collect_project_stats` | `project-stats/v1` |
| `audit_repo` | `audit/v1` |
| `get_audit_graph` | `audit/v1` |
| `generate_test_plan` | `plan/v1` |
| `get_plan_execution_hints` | `plan-execution-hints/v1` |
| `explain_target` | `target-explanation/v1` |
| `rank_test_candidates` | `candidate-ranking/v1` |
| `analyze_test_placement` | `test-placement-findings/v1` |
| `generate_selected_test` | `generation-deferred/v1` |

Use `review_repository` first for a general review. It detects project roots, audits each supported root once, keeps blockers and unsupported roots visible, and returns `repository-review/v1`: summary counts, every blocker, the concise findings, the top-ranked candidates and plan items with their execution hints, verification commands, and stats. `limit` (default 25, at most 500) caps the ranked lists, and per-target `existingTestPaths` and `existingTestEvidence` collapse to `existingTestCount` and `directEvidenceCount`, so the result stays in the tens of kilobytes even when a monorepo has dozens of project roots. The descriptor declares `_meta["anthropic/maxResultSizeChars"]: 200000` so Claude Code keeps the review inline instead of spilling it to a file; other clients ignore the hint.

Use `analyze_repository` only when the complete `repository-analysis/v1` bundle is explicitly needed. It embeds every project audit with per-target evidence plus every derived view, so it grows with repository size: on a monorepo with many packages it reaches megabytes and hits the [result size budget](#result-size-budget). Narrow it with `excludeProjectRoots` or `changedPaths`, or save it with the CLI instead.

Every tool that consumes a saved artifact (`summarize_project_audits`, `rank_project_candidates`, `generate_project_test_plan`, `collect_project_findings`, `analyze_project_test_placement`, `collect_project_stats`, `get_plan_execution_hints`, `generate_test_plan`, `explain_target`, `rank_test_candidates`, and `analyze_test_placement`) also accepts `repoRoot` instead of the artifact. The server then detects and audits the repository again, which is deterministic and fast, so a model never has to echo a large artifact back as an argument. Single-project tools additionally take `projectRoot`, the detected root relative to `repoRoot` exactly as `review_repository` reports it (for example `.` or `packages/api`); the optional `changedPaths`, `excludeProjectRoots`, and `goTarget` scan controls apply only with `repoRoot`. The typical flow after a review is `explain_target` with `repoRoot`, `projectRoot`, and the `targetId` of a top candidate.
Use `list_adapters` before `audit_repo` when a client needs to discover supported adapter IDs.
Use `list_project_detection_rules` when a client needs to explain what project markers the deterministic detector recognizes.
Use `detect_projects` when a repository may contain multiple language or package roots. It accepts optional `excludeProjectRoots` entries for exact roots or subtree patterns such as `"examples/**"`.
Use `audit_projects` to audit detected supported project roots while reporting unsupported roots separately. It accepts optional repository-relative `changedPaths`, optional `excludeProjectRoots`, and an optional Go target object, then passes matching project-relative paths and target context into each selected adapter.
Use `summarize_project_audits` when a client needs compact audit coverage status, unsupported reasons, and counts before asking for detailed per-project audit data.
Use `rank_project_candidates` when a client needs ordered candidates across audited project roots while preserving project identity.
Use `generate_project_test_plan` when a client needs project-aware plan items before selecting future generation targets.
Use `get_plan_execution_hints` with a `plan/v1` or `project-test-plan/v1` artifact when a host wants deterministic advisory routing metadata. The MCP server does not select a model, budget, provider, permission mode, or subagent lifecycle.
Use `collect_project_findings` when a client needs a concise top-findings test architecture audit across projects.
Use `analyze_project_test_placement` when a client needs advisory placement findings derived from audited project roots.
Use `collect_project_stats` when a client needs local artifact-derived counts and distributions for reporting or model-profile comparisons.
`audit_repo` is for an explicitly selected single project root and adapter. It accepts an optional `adapterId`, optional repository-relative `changedPaths`, and optional `goTarget: { goos, goarch, tags }`, and defaults to `javascript` for compatibility. `analyze_repository` and `audit_projects` accept the same Go target object for project-aware scans. The current supported adapters are `csharp`, `elixir`, `javascript`, `go`, `kotlin`, `php`, `python`, `ruby`, `rust`, and `swift`. Bounded Elixir is defined in [Elixir Alpha Support](elixir-alpha-support.md), PHP in [PHP Alpha Support](php-alpha-support.md), Go in [Go Alpha Support](go-alpha-support.md), Kotlin/JVM in [Kotlin/JVM Alpha Support](kotlin-jvm-alpha-support.md), Ruby in [Ruby Alpha Support](ruby-alpha-support.md), Rust in [Rust Alpha Support](rust-alpha-support.md), and C# in [C# Alpha Support](csharp-alpha-support.md).

The server also publishes workflow instructions during MCP initialization. They direct connected models toward `review_repository`, reserve `analyze_repository` for the complete bundle, tell models to pass `repoRoot` instead of echoing artifacts, distinguish repository scanning from existing-artifact transformations, preserve deterministic facts, and state that native generation remains deferred.

## SDK Transport

`src/mcp/stdio.js` starts a local stdio MCP server with `@modelcontextprotocol/sdk`.
It handles:

- `initialize`
- `notifications/initialized`
- `tools/list`
- `tools/call`
- single JSON-RPC request lines

The SDK transport owns protocol parsing. The deterministic JSON-RPC harness in `src/mcp/json-rpc.js` keeps unit coverage for local batch and parser behavior, but batch request lines are not part of the stdio server smoke contract.

Transport rules:

- keep tool names snake_case
- keep input schemas compatible with `mcpTools`
- call `callTool(name, args)` for execution
- add transport tests separately from deterministic tool tests

## Error Data

Tool call failures return JSON-RPC code `-32000` with stable `error.data.kind` values:

- `unknown-tool`
- `invalid-arguments`
- `missing-required-argument`
- `unsupported-argument`
- `result-too-large`

Known tool errors may also include:

- `toolName`
- `argument`
- `resultChars` and `maxResultChars` (only with `result-too-large`)

`toolName` identifies the tool that failed. `argument` identifies the missing, unsupported, or invalid argument when the failure is argument-specific. `result-too-large` means the tool computed its artifact but the serialized result exceeded the [result size budget](#result-size-budget).
For example, `changedPaths: [""]` on `audit_repo` returns `kind: "invalid-arguments"`, `toolName: "audit_repo"`, and `argument: "changedPaths"`. A `limit` outside 1 to 500 on `review_repository` returns `kind: "invalid-arguments"` with `argument: "limit"`. For artifact-consuming tools, passing neither the artifact nor `repoRoot` returns `kind: "missing-required-argument"` naming the artifact argument; passing both returns `kind: "invalid-arguments"` with `argument: "repoRoot"`; a scan control such as `excludeProjectRoots` next to a saved artifact names that control; and a `projectRoot` that is not an audited root under `repoRoot` returns `kind: "invalid-arguments"` with `argument: "projectRoot"` without echoing the value.

Saved `audit` and `projectAudits` arguments are validated against `schemas/audit-v1.schema.json` and `schemas/project-audits-v1.schema.json` before use. A mismatch returns `kind: "invalid-arguments"`, the artifact `argument`, and a `path` naming the first invalid JSON location, for example `Invalid audit/v1 artifact at $.untestedCandidates[0]: expected object, got null.` Argument values are never echoed back. The CLI `--from-audit` and `--from-project-audits` options apply the same validation.

An adapter failure for one detected project is not a tool error. `analyze_repository` and `audit_projects` still return their artifact, with the failing project listed in `projectAudits.failedProjects` (or `failedProjects` for `audit_projects`) by root, adapter, built-in error class name, an allowlisted file-system error code, and a fixed public reason; error messages are intentionally never returned. Derived artifacts, including `analyze_project_test_placement` and `get_plan_execution_hints` results derived from project artifacts, count it in `failedProjectCount`, list it in `failedProjects`, and report `auditCoverage: "partial"` (or `"none"`). An invalid `goTarget`, such as an unsupported GOOS/GOARCH pair or a reserved build tag, is still a usage error that returns `kind: "invalid-arguments"` with `argument: "goTarget"`. Report the failed roots to the user rather than presenting the result as complete. See [Failed Projects](artifact-contract.md#failed-projects).

Unexpected exceptions return JSON-RPC code `-32603`, the generic message `Internal server error.`, `kind: "internal-error"`, and a locally generated `reportId`. Raw exception messages and stack traces are not returned to the client.

Optional MCP call diagnostics are disabled by default and documented in [Local Diagnostics](diagnostics.md). Events never contain tool arguments, repository paths, source content, prompts, environment values, or stack traces. MCP stdout remains JSON-RPC-only.

## Local Harness

Use the local invoke harness for deterministic descriptor and dispatcher checks without starting the stdio transport:

```powershell
npm run mcp:tools
npm run mcp:review:example
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
npm run mcp:stats-projects:example
npm run mcp:audit:example
npm run mcp:audit:kotlin-fixture
npm run mcp:placement:example
npm run mcp:audit:envelope
```

Direct form:

```powershell
node ./src/mcp/invoke.js tools
node ./src/mcp/invoke.js call review_repository "{\"repoRoot\":\".\",\"excludeProjectRoots\":[\"examples/**\"],\"limit\":10}"
node ./src/mcp/invoke.js call explain_target "{\"repoRoot\":\".\",\"projectRoot\":\".\",\"targetId\":\"src/core/ordering.js\"}"
node ./src/mcp/invoke.js call analyze_repository "{\"repoRoot\":\".\",\"excludeProjectRoots\":[\"examples/**\"]}"
node ./src/mcp/invoke.js call list_adapters "{}"
node ./src/mcp/invoke.js call list_project_detection_rules "{}"
node ./src/mcp/invoke.js call detect_projects "{\"repoRoot\":\".\",\"excludeProjectRoots\":[\"examples/**\"]}"
node ./src/mcp/invoke.js call audit_repo "{\"repoRoot\":\"./examples/node-vitest-basic\"}"
node ./src/mcp/invoke.js call audit_projects "{\"repoRoot\":\".\",\"excludeProjectRoots\":[\"examples/**\"]}"
node ./src/mcp/invoke.js call audit_repo "@./examples/mcp/kotlin-audit.args.json"
node ./src/mcp/invoke.js call audit_repo "@./args.json"
node ./src/mcp/invoke.js call summarize_project_audits "@./examples/mcp/polyglot-project-audits.args.json"
node ./src/mcp/invoke.js call collect_project_stats "@./examples/mcp/polyglot-project-audits.args.json"
node ./src/mcp/invoke.js call-envelope audit_repo "{\"repoRoot\":\"./examples/node-vitest-basic\"}"
```

This validates the same tool descriptors and dispatcher the MCP server mounts.
Use `call-envelope` to inspect the MCP-style `content` response shape. Only `call-envelope` applies the [result size budget](#result-size-budget); it exits with status 1 and prints the `result-too-large` message to stderr, while plain `call` prints the artifact regardless of size because its output goes to a terminal or file rather than an MCP client.
Use `@./args.json` when a tool call needs a saved artifact, such as wrapping a `project-audits/v1` artifact as `{ "projectAudits": ... }` for project summary, ranking, planning, placement, or stats calls. Those calls also accept `{ "repoRoot": "." }` instead of the artifact.
