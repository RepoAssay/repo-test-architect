# Release Checklist

This project is not ready to publish yet. Keep `private: true` in `package.json` until the checklist below is complete.

## Package Readiness

- choose the final package name and confirm it is available on npm
- decide package scope, for example unscoped `repo-test-architect` or scoped `@owner/repo-test-architect`
- keep these binary names stable:
  - `repo-test-architect`
  - `repo-test-architect-mcp`
  - `repo-test-architect-mcp-invoke`
- review the existing `files` allowlist before publishing
- add the intended npm package name to MCP client config examples
- verify `npm run pack:dry-run` includes only intended files
- keep `npm run pack:check` passing so package contents stay inside the intended allowlist
- add package metadata before publishing:
  - `repository`
  - `homepage`
  - `bugs`
  - final `license`
  - final `keywords`

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
powershell -ExecutionPolicy Bypass -File ./scripts/smoke.ps1
npm run pack:dry-run
npm run pack:check
```

Also verify the installed package entry points from a packed tarball before first public release.

## Distribution

First public release should be:

- GitHub repository
- npm package exposing the CLI and stdio MCP binaries
- local stdio MCP install docs
- fixture-based examples

Remote MCP hosting should remain out of scope for the first public release.
