# Local Diagnostics

Repo Test Architect keeps MCP diagnostics local, disabled by default, and separate from product analytics.

The MCP protocol does not require a server to collect usage tracking. An MCP host may already observe which tools it invokes, while Repo Test Architect owns only the operational behavior inside its own process.

## Privacy Contract

`diagnostic-event/v1` contains only:

- timestamp and locally generated event ID
- server version
- allowlisted MCP tool name
- success or error status
- rounded duration in milliseconds
- stable error kind
- report ID for unexpected internal errors
- one-way fingerprint for grouping repeated internal errors

It never contains tool arguments, prompts, environment values, repository paths, source content, stack traces, model names, token usage, or subagent activity.

Diagnostics do not make network requests. External error reporting and product analytics are not implemented.

## Modes

Diagnostics use `REPO_TEST_ARCHITECT_DIAGNOSTICS`:

- `off`: default; no diagnostic events are written
- `stderr`: emit one JSON event per MCP tool call to stderr
- `file`: write a bounded local JSONL file

File mode also requires `REPO_TEST_ARCHITECT_DIAGNOSTICS_FILE`. The file retains at most 200 valid events and is rewritten with owner-only permissions where the platform supports them.

Examples:

```powershell
$env:REPO_TEST_ARCHITECT_DIAGNOSTICS = "stderr"
npm run mcp:stdio
```

```powershell
$env:REPO_TEST_ARCHITECT_DIAGNOSTICS = "file"
$env:REPO_TEST_ARCHITECT_DIAGNOSTICS_FILE = ".repo-test-architect/diagnostics.jsonl"
npm run mcp:stdio
```

MCP stdout remains reserved for JSON-RPC. Diagnostic events always use stderr or the explicitly configured file.

## Doctor

Inspect local runtime readiness without enabling diagnostics:

```powershell
npm run doctor
npm run doctor:json
```

`doctor-report/v1` checks the Node version, repository readability, Git worktree detection, diagnostics configuration, and the nearest existing parent for a configured file destination. It reports whether a diagnostics file is configured and writable without echoing its path or any environment value.

## Inspectable Bundle

Build a sanitized bundle locally before sharing it:

```powershell
node ./src/cli/index.js diagnostic-bundle --diagnostics-file ./.repo-test-architect/diagnostics.jsonl
node ./src/cli/index.js diagnostic-bundle --diagnostics-file ./.repo-test-architect/diagnostics.jsonl --format json
```

`diagnostic-bundle/v1` reparses each JSONL line into the strict event allowlist. Unknown fields are discarded, invalid lines are counted and omitted, and only the newest 200 valid events are returned. The bundle does not upload or transmit itself.

Users should still inspect the generated bundle before attaching it to a support report.

## Error Behavior

Expected tool failures retain JSON-RPC code `-32000` and their stable argument-related error kind.

Unexpected failures return standard JSON-RPC internal-error code `-32603`, a generic message, and:

```json
{
  "kind": "internal-error",
  "reportId": "report-..."
}
```

The report ID correlates the client-visible failure with an opt-in local diagnostic event. A truncated SHA-256 fingerprint groups repeated internal errors without exposing the hashed exception text. Raw exception messages and stack traces are not returned over MCP or placed in diagnostic events.

## External Reporting

There is no automatic error reporter, hosted analytics SDK, or telemetry endpoint.

Any future external reporting must be a separate, explicit opt-in feature with:

- a preview of the exact payload
- aggregate or allowlisted metadata only
- documented endpoint, retention, deletion, and ownership
- no repository source, paths, prompts, credentials, or full tool arguments
- independent disablement from local diagnostics
