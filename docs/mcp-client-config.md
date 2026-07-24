# MCP Client Config

Repo Test Architect should be used as a local stdio MCP server for repository audits.

The MCP client starts the server process, then calls tools such as `list_project_detection_rules`, `detect_projects`, and `audit_projects`.

## Local Checkout

Use this while developing the repository locally.

Replace the path with the absolute path to this checkout:

```json
{
  "mcpServers": {
    "repo-test-architect": {
      "command": "node",
      "args": [
        "/absolute/path/to/repo-test-architect/src/mcp/stdio.js"
      ]
    }
  }
}
```

On Windows, prefer forward slashes in JSON paths or escape backslashes:

```json
{
  "mcpServers": {
    "repo-test-architect": {
      "command": "node",
      "args": [
        "C:/path/to/repo-test-architect/src/mcp/stdio.js"
      ]
    }
  }
}
```

## NPM Package Identity

After publishing, the intended install flow is:

```powershell
npm install -g repo-test-architect
```

Then MCP clients can start the installed stdio binary:

```json
{
  "mcpServers": {
    "repo-test-architect": {
      "command": "repo-test-architect-mcp",
      "args": []
    }
  }
}
```

The package should keep this binary stable because client configs will depend on it.

Clients that launch directly through npm can use the registry-aligned package command:

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

The fixed `mcp` argument selects the stdio server instead of the package's audit CLI. `server.json` declares the same package argument for registry clients.

## Smoke Test

Before adding it to a client, verify the server can start:

macOS/Linux terminal:

```sh
npm run mcp:smoke
```

Windows PowerShell:

```powershell
npm run mcp:smoke
```

For deterministic tool checks without an MCP client, use the local invoke harness:

```powershell
npm run mcp:tools
npm run mcp:detect-rules
npm run mcp:detect:example
```

## Security Notes

Keep repo auditing local by default. This server is intended to read repository files and eventually run local test commands, so public remote deployment needs authentication, least-privilege tool access, and clear boundaries around source access and command execution.
