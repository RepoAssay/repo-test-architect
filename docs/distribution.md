# Distribution

Repo Test Architect is distributed as a local CLI and stdio MCP server through npm. The official MCP Registry records the npm launch metadata; it does not host the package itself.

## Distribution Targets

The first public release targets:

- a public GitHub repository
- one public npm package containing the CLI and stdio MCP server
- the official MCP Registry, which records metadata for the npm package
- downstream MCP catalogs only after the official registry entry is verified

Remote hosting and an MCPB bundle are not part of the first release.

## Locked Identity

- npm package: `repo-test-architect`
- MCP Registry server: `io.github.RepoAssay/repo-test-architect`
- GitHub repository: `https://github.com/repoassay/repo-test-architect`

The GitHub repository is public. Version `0.1.1` is published to npm and active in the official MCP Registry under the locked identities above.

## Repository Protection

The public GitHub repository uses `master` as its protected default branch. Changes, including administrator changes, must arrive through pull requests. Linear history and resolved review conversations are required, while force pushes and branch deletion are disabled.

The stable Linux `pr-gate` is required before merge. It promotes release-sensitive changes from `npm run alpha:check` to `npm run release:check`; Windows portability and macOS Swift jobs run only for matching paths. Every merge to `master` receives a full Linux release check, and a manual dispatch provides the complete three-OS release matrix.

## Local Gates

Run the preparation gate during normal development:

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

The public identity and manifest are aligned. The strict gate must pass against the exact release commit and version before npm or MCP Registry publication.

## Human Checkpoints

Local automation cannot perform account authentication or replace release-owner review:

1. Confirm the GitHub repository is public.
2. Authenticate npm and re-check package-name availability.
3. Verify the copyright owner in `LICENSE`.
4. Approve and run `npm publish --access public`.
5. Authenticate `mcp-publisher` with the intended GitHub identity.
6. Approve and publish to the official MCP Registry.

The first npm and MCP Registry publication is complete. Future npm and `mcp-publisher` authentication still require the release owner. Treat both publications as irreversible release events, and always run `npm run release:check` and `npm run distribution:check:publish` against the exact commit and version first.

## Publication Order

For each public version:

1. confirm the intended GitHub repository and release commit are public
2. run the complete local release and strict distribution gates
3. run the manually dispatched three-OS release matrix
4. publish the npm package
5. verify a clean install from the public npm registry
6. validate and publish `server.json` with the official `mcp-publisher`
7. query the official registry for the exact server name and version
8. consider downstream marketplace submissions

The official MCP Registry hosts metadata rather than the npm artifact, so npm publication and verification come first.
