# Cross-Adapter Trust Report

This report records the broader shared-contract review completed after the JavaScript/TypeScript, Python, Kotlin/JVM, and Swift hardening passes, the 12-repository exact-commit refresh, and the human-facing validation scorecard.

## Scope

The reusable adapter-conformance matrix now runs one representative supported fixture through both the direct audit path and the complete project-aware pipeline for every adapter:

| Adapter | Fixture | Direct command | Project shape |
| --- | --- | --- | --- |
| JavaScript/TypeScript | `examples/node-vitest-basic` | `npm run test` | one root package |
| Kotlin/JVM | `examples/kotlin-junit-basic` | `gradle test` | one JVM module |
| Python | `examples/python-pytest-service` | `pytest` | one service package |
| Swift | `examples/swift-spm-xctest` | `swift test` | one SwiftPM package |

For each fixture, the matrix compares the direct `audit/v1` artifact with project detection and `project-audits/v1`, then derives the project summary, candidate ranking, test plan, execution hints, findings, placement, stats, and one-shot repository analysis. It checks:

- deterministic JSON round trips without values disappearing during serialization
- portable project, target, test, finding, and execution-context paths
- identical direct and project audit facts
- matching candidate identities and canonical ranking order across summaries, rankings, and actionable plan items
- unchanged evidence paths and provenance in rankings and plans
- blocker, confidence, verification-command, finding, placement, and stats agreement
- repository-analysis counts and nested artifacts derived from the same project audit pass

Each adapter also receives a blocked-pipeline pressure case. The check removes the verification command, lowers confidence, and adds a blocker, then verifies that every downstream artifact preserves the blocker, omits the command, reports zero verification commands, and survives an exact JSON round trip.

The existing `examples/polyglot-workspace` suite remains the multi-adapter ownership pressure test. Its Kotlin, JavaScript, and Python roots stay independently owned, project-qualified target and plan IDs remain unique, the blocked Python setup does not suppress the two runnable commands, and stats preserve one adapter count per owned root. Swift is covered by the same full pipeline through its single-project conformance fixture.

## Problems Found And Fixed

The review found two shared-contract inconsistencies:

1. `project-audit-summary/v1` called its first three IDs `topCandidateIds` but took raw adapter recommendation order instead of the canonical candidate ranking. The JavaScript fixture therefore listed `authService` before the higher-priority `deckParser`, while ranking and planning correctly used the opposite order. Project summaries now derive their top IDs from `candidate-ranking/v1` semantics.
2. A blocked `plan/v1` object always contained an own `verificationCommand` property whose value was `undefined`. JSON serialization removed that property, so an in-process plan and its serialized form were structurally different even though the checked-in JSON looked correct. Plans now include `verificationCommand` only when a command exists, matching rankings, project summaries, stats, and repository analysis.

Both fixes are shared rather than adapter-specific. Focused regression tests lock the exact behaviors, while the expanded four-adapter conformance helper prevents either inconsistency from returning through a single ecosystem.

## Outcome

The cross-adapter trust pass is complete for the current bounded alpha contract. The adapters agree on target categories, evidence provenance, blockers, ranking, planning, placement, stats, and repository-level composition without an unexplained adapter-specific exception.

This does not broaden the supported static-analysis boundaries documented by each adapter. Dynamic build graphs, runtime reachability, and unproven test assertions remain explicit limitations. The next public-alpha release remains a separate exact-commit packaging and publication decision after the release gates pass.
