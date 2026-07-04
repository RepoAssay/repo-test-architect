# MCP Tool Surface

The MCP server exposes a thin wrapper around `src/mcp/tool-definitions.js`.

The tool definitions remain dependency-free so the deterministic contract can be tested separately from the MCP SDK transport.

Deployment direction:

- `docs/mcp-deployment.md`

Descriptor schema:

- `schemas/mcp-tool-v1.schema.json`

## Tools

- `list_adapters`
- `list_project_detection_rules`
- `detect_projects`
- `audit_projects`
- `summarize_project_audits`
- `rank_project_candidates`
- `generate_project_test_plan`
- `analyze_project_test_placement`
- `collect_project_stats`
- `audit_repo`
- `get_audit_graph`
- `generate_test_plan`
- `explain_target`
- `rank_test_candidates`
- `analyze_test_placement`
- `generate_selected_test`

## Contract

Each tool returns one of the stable artifacts documented in `docs/artifact-contract.md`.

The model should consume these artifacts directly:

- available language adapters come from `list_adapters`
- project marker rules and ignored directories come from `list_project_detection_rules`
- project roots and adapter matches come from `detect_projects`
- project-level audits for supported roots come from `audit_projects`
- compact repo-level audit coverage, unsupported reasons, and project audit counts come from `summarize_project_audits`
- project-aware candidate ordering comes from `rank_project_candidates`
- project-aware test planning comes from `generate_project_test_plan`
- project-aware test placement findings come from `analyze_project_test_placement`
- local deterministic project stats come from `collect_project_stats`
- audit facts come from `audit_repo` or `get_audit_graph`
- target-level explanation comes from `explain_target`
- candidate ordering comes from `rank_test_candidates`
- advisory test placement findings come from `analyze_test_placement`
- actionable plan items come from `generate_test_plan`
- selected test generation currently returns `generation-deferred/v1`

The MCP layer should not reclassify code, rerank candidates, or infer repository facts from raw source files.
It should also not generate test code until adapter-specific generation rules and repair loops exist.

## Output Artifacts

Each tool descriptor includes `outputArtifact` metadata:

| Tool | Output |
| --- | --- |
| `list_adapters` | `adapter-registry/v1` |
| `list_project_detection_rules` | `project-detection-rules/v1` |
| `detect_projects` | `project-detection/v1` |
| `audit_projects` | `project-audits/v1` |
| `summarize_project_audits` | `project-audit-summary/v1` |
| `rank_project_candidates` | `project-candidate-ranking/v1` |
| `generate_project_test_plan` | `project-test-plan/v1` |
| `analyze_project_test_placement` | `test-placement-findings/v1` |
| `collect_project_stats` | `project-stats/v1` |
| `audit_repo` | `audit/v1` |
| `get_audit_graph` | `audit/v1` |
| `generate_test_plan` | `plan/v1` |
| `explain_target` | `target-explanation/v1` |
| `rank_test_candidates` | `candidate-ranking/v1` |
| `analyze_test_placement` | `test-placement-findings/v1` |
| `generate_selected_test` | `generation-deferred/v1` |

Use `list_adapters` before `audit_repo` when a client needs to discover supported adapter IDs.
Use `list_project_detection_rules` when a client needs to explain what project markers the deterministic detector recognizes.
Use `detect_projects` when a repository may contain multiple language or package roots.
Use `audit_projects` to audit detected supported project roots while reporting unsupported roots separately. It accepts optional repository-relative `changedPaths` and passes matching project-relative paths into each selected adapter.
Use `summarize_project_audits` when a client needs compact audit coverage status, unsupported reasons, and counts before asking for detailed per-project audit data.
Use `rank_project_candidates` when a client needs ordered candidates across audited project roots while preserving project identity.
Use `generate_project_test_plan` when a client needs project-aware plan items before selecting future generation targets.
Use `analyze_project_test_placement` when a client needs advisory placement findings derived from audited project roots.
Use `collect_project_stats` when a client needs local artifact-derived counts and distributions for reporting or model-profile comparisons.
`audit_repo` accepts an optional `adapterId` and optional repository-relative `changedPaths`. The current registered adapters are `javascript` plus experimental `kotlin`, `python`, and `swift`.

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

Known tool errors may also include:

- `toolName`
- `argument`

`toolName` identifies the tool that failed. `argument` identifies the missing, unsupported, or invalid argument when the failure is argument-specific.
For example, `changedPaths: [""]` on `audit_repo` returns `kind: "invalid-arguments"`, `toolName: "audit_repo"`, and `argument: "changedPaths"`.

## Local Harness

Use the local invoke harness for deterministic descriptor and dispatcher checks without starting the stdio transport:

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
npm run mcp:stats-projects:example
npm run mcp:audit:example
npm run mcp:audit:kotlin-fixture
npm run mcp:placement:example
npm run mcp:audit:envelope
```

Direct form:

```powershell
node ./src/mcp/invoke.js tools
node ./src/mcp/invoke.js call list_adapters "{}"
node ./src/mcp/invoke.js call list_project_detection_rules "{}"
node ./src/mcp/invoke.js call audit_repo "{\"repoRoot\":\"./examples/node-vitest-basic\"}"
node ./src/mcp/invoke.js call audit_repo "@./examples/mcp/kotlin-audit.args.json"
node ./src/mcp/invoke.js call audit_repo "@./args.json"
node ./src/mcp/invoke.js call summarize_project_audits "@./examples/mcp/polyglot-project-audits.args.json"
node ./src/mcp/invoke.js call collect_project_stats "@./examples/mcp/polyglot-project-audits.args.json"
node ./src/mcp/invoke.js call-envelope audit_repo "{\"repoRoot\":\"./examples/node-vitest-basic\"}"
```

This validates the same tool descriptors and dispatcher the MCP server mounts.
Use `call-envelope` to inspect the MCP-style `content` response shape.
Use `@./args.json` when a tool call needs a saved artifact, such as wrapping a `project-audits/v1` artifact as `{ "projectAudits": ... }` for project summary, ranking, planning, placement, or stats calls.
