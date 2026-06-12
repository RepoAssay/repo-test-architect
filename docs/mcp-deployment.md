# MCP Deployment

Repo Test Architect should start as a local MCP server.

The tool needs repository-local context: source files, test files, package metadata, Git status, and eventually test execution. Local stdio keeps that path simple and avoids requiring users to upload private code to a remote service.

## Phase 1: Local Stdio

Default target:

```txt
AI client -> starts repo-test-architect-mcp -> stdin/stdout JSON-RPC
```

Use this for:

- local repository audits
- project detection
- local test planning
- future local test execution and repair loops

Benefits:

- no public network exposure
- direct access to the checked-out repo
- simple install story
- works with private code by default

Current scaffold:

- `src/mcp/stdio.js`
- `src/mcp/json-rpc.js`
- `src/mcp/tool-definitions.js`

## Phase 2: Local HTTP

Optional later target:

```txt
AI client -> localhost HTTP/SSE -> repo-test-architect service
```

Use this only if stdio becomes awkward for debugging, long-lived state, or multiple clients.

The HTTP transport should still mount the same tool definitions and dispatcher. It should not duplicate audit logic.

## Phase 3: Remote or Hybrid

Remote hosting is useful for shared organization-level behavior, but it is not the default shape for repo-local audits.

Good remote candidates:

- benchmark and evaluation runs
- model-consistency comparisons
- shared policy packs
- team dashboards and aggregate metrics

Risky remote candidates:

- raw repository upload
- unrestricted test execution
- direct write access to source branches

Likely product shape:

```txt
AI client
  -> local MCP for repo/filesystem/test execution
  -> optional remote service for evals, policy, and reporting
```

The local MCP should remain useful on its own.
