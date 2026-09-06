# Beta Contract Freeze

Status: `1.0.0-beta.2` candidate prepared on 2026-09-06; publication is not yet approved. Beta.1 was published on August 11. The original freeze review remains the compatibility baseline below.

Any change to a frozen surface requires an explicit compatibility review and another exact-candidate verification run.

## Beta.2 Compatibility Review

Beta.2 retains the CLI and MCP input surfaces, 19 tools, artifact schema versions, configuration contracts and ten bounded supported adapter promises. Experimental Dart/Flutter support is additive: clients must not assume a ten-entry registry. Trust fixes intentionally change affected source ownership, evidence, counts, blockers and verification-command availability without changing artifact schemas. See the [beta.2 notes](release-notes-v1.0.0-beta.2.md) for the user-visible changes and limitations.

Publication remains gated on exact-commit release verification, aligned Registry metadata, channel confirmation and explicit approval. Active validation of the published package, external feedback and the clean observation period remain required for RC readiness; preparation does not waive them.

## Frozen Candidate Surface

- CLI command names, flags, exit behavior, and JSON output remain as documented in [CLI Reference](cli-reference.md).
- The 19 MCP tool names and their input contracts remain stable. `analyze_repository` remains the recommended general entry point, and `generate_selected_test` remains deferred.
- Existing versioned artifact schema names and semantics remain stable. The exact schemas shipped under `schemas/` are the canonical output contracts.
- MCP tools remain local, read-only, non-destructive, idempotent for the same repository state and arguments, and closed-world.
- Supported adapter claims remain bounded by the existing JavaScript/TypeScript, C#, Elixir, Go, Kotlin/JVM, PHP, Python, Ruby, Rust, and Swift support matrices.
- Native test generation, remote hosting, general build-system evaluation, and behavior outside each adapter's documented boundary remain excluded.

## Additive MCP Contract Change

`1.0.0-beta.1` exposes each shipped artifact schema through the standard MCP `outputSchema` field and returns the artifact through `structuredContent`. The same artifact remains serialized in a text content block for existing clients. No MCP tool was renamed or removed, and no input or artifact schema version was changed.

The descriptions for `detect_projects`, `collect_project_stats`, `explain_target`, `generate_test_plan`, `analyze_test_placement`, and `analyze_project_test_placement` now state their intended routing, artifact provenance, outputs, and lack of execution or filesystem side effects.

## Historical Beta.1 Candidate Evidence

- complete local suite: 1,362 tests across 105 suites, 0 failures
- MCP stdio smoke check passed
- distribution preparation check passed
- package contents check passed with 786 files
- npm pack dry run passed
- exact output schemas and structured/text response compatibility have regression coverage

## Historical Gates At The Beta.1 Preparation Review

The items below record the August 11 preparation snapshot, not current completion claims. Use the [release lifecycle](release-lifecycle.md) and beta.2 notes for the current candidate gates.

- complete the `0.3.0` 14-day release-blocker-free observation period on or after 2026-08-16, or record equivalent evidence for an accelerated decision
- record the external-feedback cohort or explicitly accept comparable public-alpha evidence in the decision log
- run the Linux, Windows, and macOS release matrix on the exact candidate commit
- rerun the complete release checklist after the candidate commit is fixed
- confirm the npm `beta` tag and whether `next` and the Official MCP Registry receive the same version
- explicitly approve npm publication, Registry publication, and the matching GitHub prerelease
