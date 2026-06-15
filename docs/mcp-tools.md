# MCP Tool Surface

The MCP server should expose a thin wrapper around `src/mcp/tool-definitions.js`.

The tool definitions are dependency-free so the deterministic contract can be tested before wiring a specific MCP SDK transport.

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
- compact repo-level project audit counts come from `summarize_project_audits`
- project-aware candidate ordering comes from `rank_project_candidates`
- project-aware test planning comes from `generate_project_test_plan`
- project-aware test placement findings come from `analyze_project_test_placement`
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
Use `audit_projects` to audit detected supported project roots while reporting unsupported roots separately.
Use `summarize_project_audits` when a client needs compact counts before asking for detailed per-project audit data.
Use `rank_project_candidates` when a client needs ordered candidates across audited project roots while preserving project identity.
Use `generate_project_test_plan` when a client needs project-aware plan items before selecting future generation targets.
Use `analyze_project_test_placement` when a client needs advisory placement findings derived from audited project roots.
`audit_repo` accepts an optional `adapterId`. The current registered adapter is `javascript`.

## Future Transport

When adding the real MCP server with an SDK:

- keep tool names snake_case
- keep input schemas compatible with `mcpTools`
- call `callTool(name, args)` for execution
- add transport tests separately from deterministic tool tests

## Local JSON-RPC Scaffold

`src/mcp/stdio.js` is a dependency-free JSON-RPC scaffold for local testing.
It handles:

- `initialize`
- `tools/list`
- `tools/call`
- single JSON-RPC request lines
- batch JSON-RPC request lines

It is intentionally small and should be replaced or wrapped by an official MCP SDK transport later.

## Error Data

Tool call failures return JSON-RPC code `-32000` with stable `error.data.kind` values:

- `unknown-tool`
- `invalid-arguments`
- `missing-required-argument`
- `unsupported-argument`

Known tool errors may also include:

- `toolName`
- `argument`

## Local Harness

Until the real transport is added, use the local invoke harness:

```powershell
npm run mcp:tools
npm run mcp:adapters
npm run mcp:detect-rules
npm run mcp:detect:example
npm run mcp:audit-projects:example
npm run mcp:placement-projects:example
npm run mcp:audit:example
npm run mcp:placement:example
npm run mcp:audit:envelope
```

Direct form:

```powershell
node ./src/mcp/invoke.js tools
node ./src/mcp/invoke.js call list_adapters "{}"
node ./src/mcp/invoke.js call list_project_detection_rules "{}"
node ./src/mcp/invoke.js call audit_repo "{\"repoRoot\":\"./examples/node-vitest-basic\"}"
node ./src/mcp/invoke.js call-envelope audit_repo "{\"repoRoot\":\"./examples/node-vitest-basic\"}"
node ./src/mcp/stdio.js
```

This validates the same tool descriptors and dispatcher the future MCP server should mount.
Use `call-envelope` to inspect the MCP-style `content` response shape.
