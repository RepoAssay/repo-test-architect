# Release Checklist

Use this checklist for every public package or MCP Registry version. The [Release Lifecycle](release-lifecycle.md) defines when alpha, beta, release-candidate, and stable versions should be published; this checklist defines how an approved version is verified.

## Package Readiness

- keep the approved unscoped npm identity `repo-test-architect`
- keep the approved MCP Registry identity `io.github.RepoAssay/repo-test-architect`
- require `private: false` only on commits explicitly approved for public publication
- re-confirm the npm package name or intended version is available immediately before publishing
- keep these binary names stable:
  - `repo-test-architect`
  - `repo-test-architect-mcp`
  - `repo-test-architect-mcp-invoke`
- review the existing `files` allowlist before publishing
- keep the intended npm package name and `mcp` launch command in MCP client config examples
- verify `npm run pack:dry-run` includes only intended files
- keep `npm run pack:check` passing so package contents stay inside the intended allowlist
- keep `npm run mcp:smoke` passing so the stdio MCP flow keeps booting
- keep `npm run bin:check` passing so packaged CLI and MCP entry points keep booting
- keep `npm run installed-package:check` passing so the packed tarball installs and exposes working binaries
- keep `npm run audit:prod` passing so known production dependency advisories block release readiness
- keep `npm run distribution:check` passing during private preparation
- require `npm run distribution:check:publish` to pass before any public publication
- keep `npm run release:check` passing before tagging or publishing
- keep the required Linux `pr-gate` green and preserve path-selected Windows portability and macOS Swift coverage
- keep repository, homepage, bugs, MCP identity, and keywords aligned with `server.json`
- keep `master` protected with pull requests, administrator enforcement, linear history, resolved conversations, and no force pushes or deletion
- run the manually dispatched three-OS release matrix before public publication
- validate `server.json` with the official `mcp-publisher`
- keep the package manifest license aligned with `LICENSE` and verify the copyright owner before publishing
- verify the public npm package from a clean temporary install before publishing the matching MCP Registry entry
- query the official MCP Registry for the exact server name and version after publication

## Future Release Automation Gate

The deferred [OIDC release automation design](distribution.md#deferred-oidc-release-automation) may replace repeated local authentication only after its protected environment, trusted-publisher identity, exact-commit guards, least-privilege jobs, `CODEOWNERS`, pinned dependencies, registry verification, and manual fallback are implemented and reviewed. Until then, use the manual publication steps in this checklist.

Automation must not introduce a long-lived npm token, MCP Registry token, GitHub personal access token, or deploy key. A public pull request, fork, issue, comment, arbitrary tag, or unapproved collaborator action must never be able to reach a publishing job or request its OIDC identity.

## Public Docs

- include local MCP install snippets
- include CLI quickstart examples
- include one realistic audit output example
- include one project-detection example for a polyglot repo
- explain that native test generation is intentionally deferred
- explain local-first security posture
- avoid machine-local paths in docs

## Verification Before Publish

Run:

```powershell
npm run eval:check
npm test
npm run smoke
npm run mcp:smoke
npm run pack:dry-run
npm run pack:check
npm run bin:check
npm run installed-package:check
npm run audit:prod
npm run distribution:check
npm run distribution:check:publish
npm run release:check
```

The repository also keeps `scripts/smoke.ps1` as a manual PowerShell fallback for environments that need it.

Also verify the installed package entry points from a packed tarball with `npm run installed-package:check`.

After npm publication, repeat the install and MCP smoke path against the registry package rather than the local tarball.

## Distribution

The public distribution remains:

- public GitHub repository
- public npm package exposing the CLI and stdio MCP binaries
- official MCP Registry metadata for the npm stdio launch
- local stdio MCP install docs
- fixture-based examples

Remote MCP hosting remains out of scope unless a later product decision explicitly adds it.
