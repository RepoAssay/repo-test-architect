# Distribution

Repo Test Architect is distributed as a local CLI and stdio MCP server through npm. The official MCP Registry records the npm launch metadata; it does not host the package itself.

## Distribution Targets

The public distribution consists of:

- a public GitHub repository
- one public npm package containing the CLI and stdio MCP server
- the official MCP Registry, which records metadata for the npm package
- downstream MCP catalogs only after the official registry entry is verified

Remote hosting and an MCPB bundle are not part of the first release.

## Locked Identity

- npm package: `repo-test-architect`
- MCP Registry server: `io.github.RepoAssay/repo-test-architect`
- GitHub repository: `https://github.com/repoassay/repo-test-architect`

The GitHub repository is public. Version `0.3.0` is the current public alpha on npm and in the official MCP Registry under the locked identities above.

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

The first npm and MCP Registry publication is complete. Until the deferred OIDC workflow below is implemented and proven, future npm and `mcp-publisher` authentication still require the release owner. Treat both publications as irreversible release events, and always run `npm run release:check` and `npm run distribution:check:publish` against the exact commit and version first.

## Deferred OIDC Release Automation

A future release-engineering slice may replace repeated local npm and MCP Registry browser authentication with one protected GitHub Actions workflow. This is an optional operational improvement, not a current release requirement.

The intended workflow is `.github/workflows/publish.yml`, started only through `workflow_dispatch` against protected `master`. A release owner supplies the intended version, reviews the exact commit, and approves a protected `release` environment before any credential-bearing job starts. The workflow must then:

1. prove that the requested version matches `package.json`, `package-lock.json`, `server.json`, MCP server info, diagnostics, tests, and public release docs
2. run the complete Linux, Windows, and macOS release matrix without write or OIDC permissions
3. publish npm through an npm trusted publisher bound to `RepoAssay/repo-test-architect`, the exact `publish.yml` filename, and the `release` environment
4. verify a clean install from the public npm registry before continuing
5. publish the matching MCP metadata through `mcp-publisher login github-oidc`
6. create the Git tag and GitHub release only after both registries are verified
7. fail if npm, MCP Registry, Git tag, GitHub release, version, or commit do not agree

No `NPM_TOKEN`, `MCP_GITHUB_TOKEN`, personal access token, deploy key, or other long-lived publishing credential should be stored in the repository, Actions secrets, or workflow source. npm, MCP Registry, and GitHub credentials must be short-lived and generated on demand for the approved job. Human MFA remains appropriate for the one-time npm trusted-publisher configuration, changes to package or organization ownership, and changes to the protected release environment.

Public collaboration changes the workflow threat model even without stored secrets. Before enabling automated publication:

- protect `.github/workflows/publish.yml`, `package.json`, `package-lock.json`, `server.json`, and release scripts through `CODEOWNERS` and required release-owner review
- restrict the `release` environment to protected `master`, require an explicit reviewer, and disallow administrator bypass where practical
- never publish from `pull_request`, `pull_request_target`, fork, issue, comment, or arbitrary tag events
- grant permissions per job: validation jobs receive read-only contents; npm and MCP jobs receive `id-token: write` plus read-only contents; the GitHub release job receives `contents: write` without OIDC
- keep credential-bearing jobs separate, minimal, and free of untrusted dependency or lifecycle execution; publish the current no-build package with scripts disabled
- pin third-party Actions by full commit SHA and pin the official `mcp-publisher` version plus verified digest
- serialize publication with a release concurrency group and reject versions that already exist

The manual process remains the fallback until the automated path has completed a non-public dry run, one owner-approved live release, clean registry verification, and a review confirming that no long-lived publishing secret was introduced. npm staged publishing can remain a later higher-friction option if release owners prefer a separate npm proof-of-presence approval.

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
