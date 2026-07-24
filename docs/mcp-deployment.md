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

Current local transport:

- `src/mcp/stdio.js`
- `@modelcontextprotocol/sdk` stdio transport
- `src/mcp/json-rpc.js`
- `src/mcp/tool-definitions.js`

Operational diagnostics remain local and disabled by default. Opt-in MCP events use stderr or an explicitly configured bounded JSONL file so stdout remains reserved for JSON-RPC. See [Local Diagnostics](diagnostics.md).

Client config examples:

- `docs/mcp-client-config.md`

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

## Public Distribution

The first public distribution path should be local-first:

- publish the source on GitHub
- publish an npm package that exposes the stdio MCP binary
- document install snippets for MCP-capable clients
- include short fixture demos and real audit output examples
- submit to relevant MCP server directories or registries where available

Release checklist:

- `docs/release-checklist.md`

Positioning should emphasize the differentiated category:

```txt
Audit-first MCP server for repository test strategy.
```

Avoid positioning it as another generic AI test generator. The useful distinction is repo intelligence, test strategy selection, and avoiding low-value generated tests.

Remote MCP exposure should wait until there is a clear hosted use case and a proper security model:

- authentication
- least-privilege tool access
- no unrestricted test execution
- no raw private repository upload by default
- clear separation between local repo access and remote reporting/eval features

Remote hosting may make sense later for shared evals, model-consistency comparisons, policy packs, and dashboards.

Local diagnostics do not imply remote telemetry. There is currently no analytics SDK, crash-reporting endpoint, or automatic upload path.
