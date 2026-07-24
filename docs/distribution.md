# Distribution

Repo Test Architect is prepared as a local stdio MCP server distributed through npm. Public publication is a separate, explicitly approved step.

## Distribution Targets

The first public release targets:

- a public GitHub repository
- one public npm package containing the CLI and stdio MCP server
- the official MCP Registry, which records metadata for the npm package
- downstream MCP catalogs only after the official registry entry is verified

Remote hosting and an MCPB bundle are not part of the first release.

## Locked Identity

- npm package: `repo-test-architect`
- MCP Registry server: `io.github.repoassay/repo-test-architect`
- GitHub repository: `https://github.com/repoassay/repo-test-architect`

The repository and package remain private/unpublished until the separate public-release approval.

## Repository Protection

The private GitHub repository uses `master` as its protected default branch. Changes, including administrator changes, must arrive through pull requests. Linear history and resolved review conversations are required, while force pushes and branch deletion are disabled.

The stable Linux `pr-gate` is required before merge. It promotes release-sensitive changes from `npm run alpha:check` to `npm run release:check`; Windows portability and macOS Swift jobs run only for matching paths. Every merge to `master` receives a full Linux release check, and a manual dispatch provides the complete three-OS release matrix.

## Local Gates

Run the reversible preparation gate during normal development:

```powershell
npm run distribution:check
```

This validates public policy files, stable binaries, package verification commands, license alignment, and MCP tool titles and safety annotations. It is part of `npm run release:check`.

Run the stricter local publication gate only when preparing an actual public version:

```powershell
npm run distribution:check:publish
```

That command additionally requires:

- `private: false`
- final repository, homepage, and issue metadata
- an MCP-focused package keyword and a GitHub-owned `mcpName`
- a `server.json` pinned to the supported MCP Registry schema
- matching npm package, server name, version, repository, and stdio transport metadata

The identity and manifest are now aligned. The strict gate intentionally remains blocked by `private: true` until public publication is explicitly approved.

## Human Checkpoints

Local automation cannot authorize or safely infer these decisions:

1. Approve changing the GitHub repository from private to public.
2. Authenticate npm and re-check package-name availability.
3. Verify the copyright owner in `LICENSE`.
4. Approve changing `private` to `false` and running `npm publish --access public`.
5. Authenticate `mcp-publisher` with the intended GitHub identity.
6. Approve publication to the official MCP Registry.

Treat npm and MCP Registry publication as irreversible release events. Always run `npm run release:check` and `npm run distribution:check:publish` against the exact commit and version first.

## Publication Order

After all checkpoints are approved:

1. make the intended GitHub repository public
2. run the complete local release and strict distribution gates
3. publish the npm package
4. verify a clean install from the public npm registry
5. validate and publish `server.json` with the official `mcp-publisher` (the preparation manifest validates with v1.8.0)
6. query the official registry for the exact server name and version
7. consider downstream marketplace submissions

The official MCP Registry hosts metadata rather than the npm artifact, so npm publication and verification come first.
