# Repo Test Architect 1.1.0

Status: **published October 30, 2026** on npm under `latest`, the Official MCP Registry, and [GitHub as a stable release](https://github.com/RepoAssay/repo-test-architect/releases/tag/v1.1.0). Release commit: `6681bcd219c01868233d06acfc1d400b70ca6557` (PR #302). See the [publication ledger](distribution-metrics.md#minor-110-publication--2026-10-30) for verification details.

## Summary

A compatible minor release. Multi-project audits now contain per-project adapter failures. Skipped JavaScript and Python tests no longer count as coverage. Saved artifacts are validated against the published schemas, and output ordering no longer depends on locale or filesystem order. The MCP tool list is about 57% smaller.

The CLI commands, the 19 MCP tool names and input schemas, and configuration are unchanged. Artifact schemas gain optional fields only, so artifacts saved by 1.0.x still validate. A few behavior changes are listed under [Compatibility Notes](#compatibility-notes).

## New

- **Per-project failure containment** (#301). Before 1.1.0, an adapter error in one project aborted the whole multi-project audit. Now the failing project is recorded in a new top-level `failedProjects` array of `project-audits/v1` and counted in `summary.failedProjectCount`, and the remaining projects are still audited.
  - Each entry has the project identity, `adapterId`, a built-in `errorName`, an allowlisted file-system `errorCode` when present, and a fixed `reason` sentence.
  - Exception messages, stacks and other properties of the thrown value are never recorded in failure entries, so secrets or file contents quoted in an error message cannot reach the artifact. Entries still carry repository-derived project identities such as `projectRoot`. To see the full error, run `repo-test-architect audit <repo>/<projectRoot> --adapter <adapterId>`.
  - Derived artifacts treat failed projects as not audited and report `auditCoverage: "partial"`, or `"none"` if no project was audited. Project summaries, findings, rankings, test plans, stats, placement analysis and execution hints carry the failure count and list whenever a failure occurred; complete runs keep the 1.0 shape.
  - Markdown output adds a `Failed to audit` count and a `Failed Projects` section. Project roots controlled by the repository are escaped in Markdown and stderr.
- **Compact MCP output schemas** (#296). Tool descriptors now advertise a compact `outputSchema` that points to the full published schema. `tools/list` shrinks from about 60k to 26k characters, or roughly 15k to 6.4k tokens. Tool names, input schemas and `structuredContent` are unchanged, and the compact schema is strictly looser than the full one.

## Correctness Fixes

- **Skipped tests are no longer counted as coverage** (#299). In 1.0.x, a target covered only by `test.skip(...)`, `describe.skip(...)`, `xit(...)`, `@pytest.mark.skip`, `@unittest.skip` or similar was classified as covered.
  - Skip detection now runs on `@lezer/javascript` and `@lezer/python` syntax trees. Such targets move from `coveredButRisky` to `untestedCandidates`.
  - Detection applies only to skips that are certain to apply. Files with a parse error, framework names that are rebound, and conditional skips with non-literal conditions all keep their evidence.
  - Skipped suites follow the runner: node:test and bun:test do not run the suite callback, while Mocha, Jest and Vitest still collect it.
  - `xfail` is not treated as skipped.
- **Ordering is deterministic across machines** (#297). Sorting no longer uses locale-dependent `localeCompare`. The JavaScript, Python, Kotlin and Swift file walkers now sort their results, so output on filesystems with hash-ordered directories (such as ext4) is now stable. The new comparison reproduces the previous order for every golden snapshot.
- **Saved artifacts are validated** (#298). Artifacts passed through `--from-audit`, `--from-project-audits` or the MCP `audit` and `projectAudits` arguments are checked against `schemas/audit-v1.schema.json` and `schemas/project-audits-v1.schema.json`. Previously, a malformed artifact surfaced as an opaque internal error. Error messages name the first invalid JSON path without echoing values.
- **All adapters share one file reader** (#300). The C#, Go, Kotlin, Ruby, Rust and Swift adapters previously read FIFOs and other special files, which could block an audit. They now skip them, as JavaScript, Python and the shared reader already did. Each adapter keeps its own ignore list, so the set of files read is otherwise unchanged.

## Compatibility Notes

- **New CLI exit status 2.** Project commands exit with status 2 when at least one project failed to audit, including `--from-project-audits` runs on an artifact that records failures. The partial result is still written to stdout, and a warning listing the failed roots goes to stderr. Status 1 still means a usage error or fatal failure. Scripts that treat any non-zero status as fatal will now stop on partial results.
- **Stricter artifact input.** Hand-edited or truncated artifacts that 1.0.x accepted may now be rejected. Over MCP, invalid `audit` and `projectAudits` arguments now return `invalid-arguments` (JSON-RPC `-32000`) with `argument` and `path` details instead of `internal-error` (`-32603`). Plans passed to `get_plan_execution_hints` whose `failedProjects` entries fall outside the fixed failure vocabulary are also rejected as `invalid-arguments`; other malformed plans still return `internal-error`.
- **Go target validated up front.** An invalid `--goos`/`--goarch`/`--go-tag` (MCP `goTarget`) is now rejected in project commands even when the repository has no Go project. The CLI exits 1, and MCP returns `invalid-arguments` with `argument: "goTarget"`.
- **Gradle projects with both settings files.** When a directory contains both `settings.gradle` and `settings.gradle.kts`, 1.0.x collapsed its modules using whichever file the directory walk saw first. 1.1.0 treats the pair as ambiguous and does not collapse, so each module is detected as its own project (#297). Project roots, IDs and derived artifacts change for such repositories.
- **Audit classification changes.** Targets whose only evidence came from skipped tests move to `untestedCandidates`. Expect new candidates in repositories that use skipped tests.
- **Schema additions.** `project-audits/v1` gains optional `failedProjects` and `summary.failedProjectCount`; 1.1.0 always emits them, empty when nothing failed. `project-audits/v1` also declares item types for nested audit arrays. Derived schemas gain optional failure fields. No field was removed or renamed.
- **New dependencies:** `@lezer/javascript` and `@lezer/python`.

## Installation And Upgrade

Node.js 20 or newer is required:

```sh
npx --yes repo-test-architect@1.1.0 doctor
npx --yes repo-test-architect@1.1.0 analyze .
npm install --global repo-test-architect@1.1.0
```

For MCP clients, use `npx --yes repo-test-architect@1.1.0 mcp`. Unversioned installs follow npm `latest`; clients pinned to `1.0.x` must update their package argument. CLI binary names and client configuration structure are unchanged.

## Verification

Each change has regression tests. All six pull requests passed the Linux `pr-gate` and Windows portability checks, plus an independent model review before merge. The skipped-test change went through eight review rounds. Golden snapshots were unchanged except the MCP tool descriptor snapshot, and all model-consistency scenarios pass. The release commit passed the full local release gate (1,698 tests), strict distribution checks and the [manually dispatched Linux, Windows and macOS release matrix](https://github.com/RepoAssay/repo-test-architect/actions/runs/41033826022). A clean install from the public npm registry passed on macOS.
