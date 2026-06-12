# MCP Tool Surface

The MCP server should expose a thin wrapper around `src/mcp/tool-definitions.js`.

The tool definitions are dependency-free so the deterministic contract can be tested before wiring a specific MCP SDK transport.

## Tools

- `audit_repo`
- `get_audit_graph`
- `generate_test_plan`
- `explain_target`
- `rank_test_candidates`
- `generate_selected_test`

## Contract

Each tool returns one of the stable artifacts documented in `docs/artifact-contract.md`.

The model should consume these artifacts directly:

- audit facts come from `audit_repo` or `get_audit_graph`
- target-level explanation comes from `explain_target`
- candidate ordering comes from `rank_test_candidates`
- actionable plan items come from `generate_test_plan`
- selected test generation currently returns `generation-deferred/v1`

The MCP layer should not reclassify code, rerank candidates, or infer repository facts from raw source files.
It should also not generate test code until adapter-specific generation rules and repair loops exist.

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
npm run mcp:audit:example
npm run mcp:audit:envelope
```

Direct form:

```powershell
node ./src/mcp/invoke.js tools
node ./src/mcp/invoke.js call audit_repo "{\"repoRoot\":\"./examples/node-vitest-basic\"}"
node ./src/mcp/invoke.js call-envelope audit_repo "{\"repoRoot\":\"./examples/node-vitest-basic\"}"
node ./src/mcp/stdio.js
```

This validates the same tool descriptors and dispatcher the future MCP server should mount.
Use `call-envelope` to inspect the MCP-style `content` response shape.
