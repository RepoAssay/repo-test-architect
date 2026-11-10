# Repo Test Architect 1.2.0

Status: **prepared for publication**. This line, the [publication ledger](distribution-metrics.md), and the [status page](status.md) are updated when the package is published to npm, the Official MCP Registry, and GitHub.

## Summary

A compatible minor release that keeps MCP tool results small on large repositories. A connected model now starts with `review_repository`, a bounded review that stays in the tens of kilobytes even on a monorepo with dozens of project roots, and every specialist tool accepts `repoRoot` instead of a saved artifact, so a model never has to echo a large artifact back as an argument. The server also emits compact result text and refuses results above a serialized-size budget instead of sending a message that can crash the client. The Swift adapter no longer audits nested packages twice.

The 19 existing MCP tool names, the CLI commands, configuration, and artifact schemas are unchanged. One tool, one CLI command, one artifact schema, and optional inputs are added. Behavior changes are listed under [Compatibility Notes](#compatibility-notes).

## Why

Run inside Claude Code against a monorepo with about 18 connected packages, `analyze_repository` returned a 21 MB tool result that crashed the client repeatedly. The model then retried tools in a loop because every specialist tool required the whole `project-audits/v1` artifact as an argument, which would have been well over 100,000 output tokens. Measured on this repository with its 60+ example roots, the complete bundle is 1.6 MB compact and was 4.4 MB on the wire, because derived views copy each target's test evidence and the text copy was indented; the new bounded review of the same repository is about 100 KB (58 KB with the example fixtures excluded), and the example workspace review is 11 KB.

## New

- **`review_repository` and CLI `review`** (#307). Detect and audit all project roots once, then return `repository-review/v1`: summary counts, every blocker, the concise findings, the top-ranked candidates and plan items with their execution hints, verification commands, and stats. `limit` (default 25, at most 500) caps the ranked lists; `summary.candidateCount`, `summary.planItemCount`, and `summary.truncated` keep the totals visible. The raw project audits are omitted, and each candidate and plan item replaces `existingTestPaths` and `existingTestEvidence` with `existingTestCount` and `directEvidenceCount`. The path lists that remain, the findings' existing-tests evidence line and each hint's `contextScope.paths`, keep at most five entries plus an omitted count, the same rule Markdown output applies, so the size depends on `limit` and the number of projects rather than on how many tests reach one target. Every number agrees with `repository-analysis/v1` because both derive from the same audit pass. The descriptor declares `_meta["anthropic/maxResultSizeChars"]: 200000` so Claude Code keeps the review inline; other clients ignore the hint. See [Repository Review Artifact](artifact-contract.md#repository-review-artifact).
- **`repoRoot` on every artifact-consuming tool** (#307). `summarize_project_audits`, `rank_project_candidates`, `generate_project_test_plan`, `collect_project_findings`, `analyze_project_test_placement`, `collect_project_stats`, and `get_plan_execution_hints` accept `repoRoot` with the usual `changedPaths`, `excludeProjectRoots`, and `goTarget` scan controls instead of the artifact. `get_audit_graph`, `generate_test_plan`, `explain_target`, `rank_test_candidates`, and `analyze_test_placement` accept `repoRoot` plus `projectRoot`, the detected root exactly as the review reports it. The server re-audits deterministically, so the typical flow after a review is `explain_target` with `repoRoot`, `projectRoot`, and a `targetId` from the top candidates.
- **Result size budget** (#306). The server refuses to emit a tool result whose complete serialized form exceeds 1,000,000 characters and fails the call with the new stable error kind `result-too-large` (JSON-RPC `-32000`) carrying `toolName`, `resultChars`, and `maxResultChars`. `REPO_TEST_ARCHITECT_MAX_RESULT_CHARS` overrides the budget and `0` disables it. The error never echoes arguments or artifact content. See [Result Size Budget](mcp-tools.md#result-size-budget).

## Correctness Fixes

- **Nested Swift packages are no longer audited twice** (#309). When an Xcode project or workspace at a repository root sits above local Swift packages, the root project previously re-audited every package source, so the same candidates, findings and plan items appeared under both the root and the package. Multi-project audits now tell each adapter which detected projects lie inside the one being audited and which adapter audits them, and the Swift adapter leaves the sources of nested packages that receive their own Swift audit to that audit, as the documented dependency boundary already stated. Nothing is dropped without a replacement audit: a directory the detector skipped, a symlinked or mis-cased manifest, a mixed package that the JavaScript adapter audits first, and fixture packages inside the parent's test targets (declared `path` or conventional test directories) all stay with the parent. Nested Xcode projects stay with the parent because a root workspace may own them. Direct single-project audits (`audit_repo`, CLI `audit`) are unchanged. Repository statistics already excluded nested roots and are unchanged.

## Compatibility Notes

- **Routing guidance changes.** Server instructions and tool descriptions now direct models to `review_repository` first and reserve `analyze_repository` for the complete bundle. `analyze_repository` itself is unchanged. Hosts with hard-coded prompts that call `analyze_repository` keep working, subject to the result size budget.
- **Compact text content.** `content[0].text` is still the serialized artifact, now without indentation. The JSON value is unchanged, and `structuredContent` is unchanged.
- **Oversized results fail instead of streaming.** Repositories whose artifact exceeds the budget now receive `result-too-large` instead of a multi-megabyte message. Narrow the scan with `excludeProjectRoots` or `changedPaths`, use `review_repository`, save the complete artifact with `repo-test-architect analyze <repo> --format json`, or raise the environment variable. The CLI and the plain `invoke.js call` harness are not subject to the budget.
- **Optional inputs on artifact tools.** The twelve tools that previously required `audit`, `projectAudits`, or `plan` now declare `required: []` and enforce in code that exactly one of the artifact or `repoRoot` is supplied. Calls that passed the artifact keep working unchanged. Passing both, passing a scan control next to a saved artifact, or naming a `projectRoot` that was not audited returns `invalid-arguments`; passing neither returns `missing-required-argument`.
- **Larger tool list.** `tools/list` grows from about 26k to about 41k characters (roughly 6.4k to 10k tokens) because the twelve descriptors gain the alternative inputs and one tool is added. This is still well below the 60k of 1.0.x.
- **Swift root audits shrink on package monorepos.** In `analyze_repository`, `review_repository`, `audit_projects` and the project-aware CLI commands, a root Xcode project or package above local Swift packages now reports only its own sources; the packages' candidates, findings and plan items remain under the package projects. Candidate counts and rankings change for such repositories; `project-stats/v1` totals do not.
- **Diagnostics vocabulary.** `result-too-large` joins the allowlisted `errorKind` values in `diagnostic-event/v1`.
- **Descriptor schema.** `mcp-tool-v1.schema.json` allows an optional `_meta` object with `anthropic/maxResultSizeChars`.
- No field was removed or renamed in any artifact. Artifacts saved by 1.1.x still validate.

## Installation And Upgrade

Node.js 20 or newer is required:

```sh
npx --yes repo-test-architect@1.2.0 doctor
npx --yes repo-test-architect@1.2.0 review .
npx --yes repo-test-architect@1.2.0 analyze .
npm install --global repo-test-architect@1.2.0
```

For MCP clients, use `npx --yes repo-test-architect@1.2.0 mcp` or the unversioned package argument, which follows npm `latest`. CLI binary names and client configuration structure are unchanged. Clients that pinned `1.1.0` must update their package argument to receive the bounded review tool.

## Verification

Each change has regression tests, including a size ceiling for the review on this repository's 60+ fixture roots, a fan-out regression that injects 2,000 test paths into one target and keeps the review under 40 KB, equivalence of `repoRoot` and artifact inputs for all twelve tools, every rejection path, and the result budget across the stdio transport, the JSON-RPC harness, and the invoke harness. Both pull requests passed the Linux `pr-gate` and Windows portability checks plus an independent model review before merge. Golden snapshots were unchanged except the MCP tool descriptor snapshot. The full local suite has 1,722 tests, and `npm run alpha:check` and `npm run mcp:smoke` pass. The three-OS release matrix and the clean install check are recorded in the publication ledger after publication.
