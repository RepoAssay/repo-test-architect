# Agent Install Paths

Repo Test Architect should document install paths by agent host because MCP support, plugin support, and instruction-only fallbacks differ by tool.

The package is distributed through npm as a local CLI and stdio MCP server.

## Shared Requirements

- Node.js must be available to the process that starts the MCP server.
- Repository audits should run locally by default.
- MCP clients should start `repo-test-architect-mcp` over stdio when using the published package.
- Local checkout installs should point directly at `src/mcp/stdio.js`.
- Instruction-only fallbacks may explain the workflow, but they should not claim MCP tool execution.

## MCP-Capable Hosts

Use this path when the host can launch a local stdio MCP server.

Published package:

macOS/Linux terminal:

```sh
npm install -g repo-test-architect
```

Windows PowerShell:

```powershell
npm install -g repo-test-architect
```

MCP server command:

```txt
repo-test-architect-mcp
```

Local checkout target:

macOS/Linux terminal:

```sh
node ~/source/repo-test-architect/src/mcp/stdio.js
```

Windows PowerShell:

```txt
node C:/path/to/repo-test-architect/src/mcp/stdio.js
```

Expected tools:

- `analyze_repository`
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

`generate_selected_test` remains a deferred response until native generation has adapter-specific repair-loop evidence.
`get_plan_execution_hints` is advisory: the host may use it for context and routing decisions, but remains responsible for model choice, budgets, permissions, and subagent lifecycle.
For a general repository review, start with `analyze_repository`; use the remaining tools for focused questions or existing artifacts.

## Codex

Preferred path:

- install the package globally
- add a local stdio MCP server config using `repo-test-architect-mcp`
- use the MCP tools for audit, ranking, planning, execution hints, placement, and stats

Development path:

- run from a local checkout
- point the client config at `src/mcp/stdio.js`
- verify with `npm run mcp:tools` and `npm run mcp:detect:example`

## Claude Desktop Or Claude Code

Preferred path:

- add `repo-test-architect-mcp` as a local stdio MCP server
- keep repository access local
- use explicit prompts that ask for audit and strategy before generation

The docs should avoid promising a Claude-specific plugin until one exists.

## VS Code And Editor Agents

If the editor host supports MCP, use the MCP-capable host path.

If it does not support MCP, the fallback should be instruction-only:

- run CLI commands manually
- attach generated JSON artifacts to the chat
- ask the agent to reason from the audit artifacts

Instruction-only mode is useful for planning, but it does not provide live tool calls.

## Generic CLI Agents

Generic agents can use the CLI without MCP:

macOS/Linux terminal:

```sh
repo-test-architect detect . --format json
repo-test-architect analyze . --format json
repo-test-architect audit-projects . --format json
repo-test-architect rank-projects . --format json
repo-test-architect plan-projects . --format json
repo-test-architect placement-projects . --format json
repo-test-architect stats-projects . --format json
```

Windows PowerShell:

```powershell
repo-test-architect detect . --format json
repo-test-architect analyze . --format json
repo-test-architect audit-projects . --format json
repo-test-architect rank-projects . --format json
repo-test-architect plan-projects . --format json
repo-test-architect placement-projects . --format json
repo-test-architect stats-projects . --format json
```

This path is also useful for demos, bug reports, and reproducible eval fixtures.

## Documentation Rules

When adding host-specific setup:

- separate MCP execution from instruction-only guidance
- call out Node.js PATH requirements for non-interactive shells
- keep local-first security language visible
- avoid claiming native test generation is ready
- verify snippets through `npm run release:check` where possible
