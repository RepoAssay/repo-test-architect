# Repo Test Architect 1.0.1

Status: **published October 29, 2026** on npm under `latest`, the Official MCP Registry, and [GitHub as a stable release](https://github.com/RepoAssay/repo-test-architect/releases/tag/v1.0.1). Release commit: `0848a9b43b311ab21ecadc752fa522699f3ea9e3` (PR #294). See the [publication ledger](distribution-metrics.md#patch-101-publication--2026-10-29) for verification details.

## Summary

A compatible patch release with security and correctness fixes. The CLI commands, 19 MCP tools, configuration behavior and versioned artifact schemas are unchanged. Upgrading from 1.0.0 is recommended for everyone, and especially for users of `--changed-since`.

## Security Fixes

- `--changed-since` no longer passes option-shaped values to Git. A value such as `--changed-since=--output=<file>` previously reached `git diff` as an option and could create or overwrite a file. Option-shaped refs are now rejected (#291).
- Repository scanning reads only regular files. A FIFO with a source-file name could previously block the synchronous MCP server indefinitely, both in the shared text-file reader and in the Swift Bazel rule scan. Symlinked manifests and Bazel `BUILD` files that could point outside the repository are now ignored (#293).
- `collect_project_stats` no longer counts source files outside a saved artifact's root, including through `..` segments or symlinked project roots (#293).
- Update production dependencies to resolve published advisories, including proxy-addr 2.0.7 to 2.0.8 (critical), zod 4.4.3 to 4.6.7 (high), qs 6.16.0 to 6.16.1 and ip-address 10.7.2 to 10.7.5, plus the MCP SDK 1.30.1 to 1.32.0, Hono 4.13.7 to 4.13.13 and body-parser 2.3.0 to 2.4.0 (#292).

## Correctness Fixes

These change which files `--changed` and `--changed-since` select, so changed-only audits can now report findings that 1.0.0 silently dropped (#291):

- `--changed` no longer drops unstaged edits. Parsing `git status --short` removed the first character of every unstaged path.
- Both options report paths relative to the audited root when it is a subdirectory of the Git work tree, and ignore changes outside it.
- Filenames with spaces, renames, untracked directories and very large untracked trees are handled.
- `--changed-since`, `--from-audit` and `--from-project-audits` without a value now fail with an error instead of silently running a full scan.

## Installation And Upgrade

Node.js 20 or newer is required:

```sh
npx --yes repo-test-architect@1.0.1 doctor
npx --yes repo-test-architect@1.0.1 analyze .
npm install --global repo-test-architect@1.0.1
```

For MCP clients, use `npx --yes repo-test-architect@1.0.1 mcp`. Unversioned installs follow npm `latest`; clients pinned to `1.0.0` must update their package argument. CLI binary names and client configuration structure are unchanged.

## Verification

Each fix has regression tests that were confirmed to fail without it. All three pull requests passed the Linux `pr-gate` and Windows portability checks, and an independent model review before merge. The release commit passed the full local release gate (1,467 tests), strict distribution checks and the [manually dispatched Linux, Windows and macOS release matrix](https://github.com/RepoAssay/repo-test-architect/actions/runs/40889128118). A clean install from the public npm registry passed on macOS.
