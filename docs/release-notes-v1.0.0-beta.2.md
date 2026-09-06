# Repo Test Architect 1.0.0-beta.2

Status: **published September 6, 2026** on npm under `beta`, the Official MCP Registry, and [GitHub as a prerelease](https://github.com/RepoAssay/repo-test-architect/releases/tag/v1.0.0-beta.2). Release commit: `75ae521d5d34a80d40d397cdd0a52ba68e7d0646`. This is the second beta, not the formal RC stage; npm `latest` remains `0.3.0`.

## Changes Since Beta.1

- Add experimental Dart and Flutter auditing: `pubspec.yaml` project discovery, package-local ownership, bounded import/export evidence, generated/declaration deferral, and conservative `dart test` / `flutter test` command selection. The registry now has ten supported adapters and one experimental adapter. See [Dart support](dart-support.md).
- Exclude comments, strings, heredocs and nowdocs from the reproduced false test-evidence cases in JavaScript/TypeScript, Kotlin/JVM, Ruby and PHP.
- Ignore external source/test/metadata symlinks in JavaScript and Python, including dangling links; prevent duplicate nested Python and Rust package ownership.
- Require resolved PHPUnit test-base identity and withhold verification commands from inactive Kotlin/JVM and SwiftPM build metadata.
- Update production dependency locks to `fast-uri` 3.1.7 and `qs` 6.16.0 for security fixes, and add the YAML parser used by Dart.
- Refresh the [usage snapshot](distribution-metrics.md#pre-release-snapshot--2026-09-06) and correct the Swift rules documentation URL. Thanks to [Georges Farah](https://github.com/RepoAssay/repo-test-architect/pull/271) for the documentation fix.

## Compatibility And Limitations

CLI names and flags, the 19 MCP tools, configuration contracts, existing versioned artifact schemas, and the ten supported adapter matrices remain the compatibility baseline. Consumers must not assume a fixed ten-entry adapter registry. Corrected audits may contain fewer source owners, different evidence strengths or usage, and additional blockers or withheld commands; these are intentional trust fixes, not schema changes.

Dart remains experimental and structural: imports do not prove calls, assertions, or test execution. Its documented limits include local binding shadowing, conditional registration, parts, arbitrary workspaces, helper execution and device integration tests. No new language is planned before stable release. Native test generation remains deferred, and no remote hosting or source-upload behavior is added.

## Validation Evidence

- The merged implementation passed 1,435 local tests, adapter coverage/performance gates, 115 fixture goldens, 64 model-consistency scenarios, the 33-pin corpus check, executor evaluation, and package/CLI/MCP checks.
- Both feature and hardening PRs passed Linux, Windows and macOS checks on their updated PR heads; the final implementation's post-merge Linux release gate passed. Those runs do not substitute for verification of this newly versioned release commit.
- Dart's earlier native validation passed four upstream suites totaling 2,064 tests and both owned fixtures; these counts are historical executions, not new runs for this version bump. See the [Dart live report](dart-live-validation-report.md).
- Repeated static audits covered twelve lexical-repair pins and eighteen ownership-repair pins. Three lexical baselines changed intentionally; all eighteen ownership reruns retained their canonical artifacts. See the [lexical](lexical-evidence-hardening-2026-09.md) and [ownership](ownership-hardening-2026-09.md) reports.

The final publication commit passed the [manually dispatched Linux, Windows and macOS release matrix](https://github.com/RepoAssay/repo-test-architect/actions/runs/34026826589), including 1,435 tests on each OS. Local full release and strict publication-metadata checks passed. Official `mcp-publisher` 1.8.1 validated `server.json`; after npm publication, the exact Registry version was verified active with matching npm version, stdio transport and positional `mcp` argument.

Clean installation and beta.1-to-beta.2 upgrade from the public npm registry passed on macOS: all three binaries, diagnostics, MCP initialization, all 19 tools, and Dart fixture analysis. Both installations matched the checked tarball integrity. Cross-OS CI exercised locally packed artifacts; public-registry installation and upgrade on Linux/Windows remain part of beta observation. The [publication ledger](distribution-metrics.md#beta2-publication--2026-09-06) separates verified core publication from directory refreshes still pending.

## Beta Validation Window

The fourteen-day clean validation window starts September 6, 2026, at publication (10:20 UTC). Exercise clean installation and beta.1 upgrades, diagnostics, CLI/MCP startup, and real-repository ownership/evidence review across operating systems. Seek external feedback loops; download totals and maintainer-owned native runs do not establish external adoption.

Review RC readiness around September 20–22 only if publication timing permits. The default six-week beta period from beta.1's August 11 publication reaches September 22; later publication or a release-blocking fix moves the review later. Features remain frozen, Dart promotion requires a separate decision, and every blocker fix resets the affected clean period. A formal RC then requires at least seven clean days and explicit stable approval. See the [release lifecycle](release-lifecycle.md) and [decision log](decision-log.md).

## Installation

`@beta` now selects beta.2. To pin this release explicitly:

```sh
npx --yes repo-test-architect@1.0.0-beta.2 doctor
npx --yes repo-test-architect@1.0.0-beta.2 analyze .
npx --yes repo-test-architect@1.0.0-beta.2 mcp
```

For an existing MCP client, change its package argument to `repo-test-architect@1.0.0-beta.2` or follow `@beta`. Publication moved only the npm `beta` tag; `latest` remains `0.3.0`, and no `next` tag was added. The Official MCP Registry now selects beta.2 as its latest server metadata version, independently of npm's default tag.
