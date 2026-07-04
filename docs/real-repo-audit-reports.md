# Real Repository Audit Reports

This page tracks local audit passes against real repositories that are not checked in as deterministic fixtures.

The purpose is product validation, not regression locking. These reports record what the tool found, what it missed, and which heuristics should be tightened before the private alpha is credible.

## Report Set

| Report | Ecosystem | Source | Command focus | Status |
| --- | --- | --- | --- | --- |
| [Collectors Grimoire Swift packages](cg-swift-audit-report.md) | Swift, Vapor, MongoDB | local sibling `cg-*` repositories | `findings-projects`, Swift adapter audit | current |
| Repo Test Architect self-audit | JavaScript, TypeScript | this repository | direct `javascript` adapter audit, placement audit | summarized below |
| Collectors Grimoire app audit | Swift, Xcode app | `m-stenbe/Collectors-Grimoire` at `a2d4c54` | `findings-projects`, Xcode-style Swift detection | summarized below |

This gives the alpha gate coverage across at least one JavaScript/TypeScript codebase and multiple Swift codebases, including Swift Package Manager, Vapor/MongoDB, and Xcode-style app structure.

## Repo Test Architect Self-Audit

Command focus:

```powershell
node ./src/cli/index.js rank . --adapter javascript
node ./src/cli/index.js placement . --adapter javascript
```

What the tool found:

- high-confidence JavaScript/TypeScript profile with `npm run test`
- Vitest and Jest signals, `test/` conventions, and matching test evidence
- 27 ranked candidates in the direct root audit after filtering sibling TypeScript reference mirrors for runtime JavaScript modules
- 19 conservative `keep` placement findings for tests that match source targets in the same project
- useful distinction between untested files and covered-but-risky files

Representative findings:

| Category | Examples | Why it matters |
| --- | --- | --- |
| Covered but risky | `adapter-registry`, `explain-target`, `project-findings`, `tool-api`, `test-plan` | Existing tests are treated as evidence, not proof of complete edge-case coverage. |
| Untested candidates | adapter audit modules, CLI/MCP entry modules, JSON-RPC handling | These are branch-heavy implementation files where more focused tests may reduce regression risk. |
| Low-value direct targets | DTO/reference files and low-runtime-behavior modules | The adapter avoids treating every source file as a direct test target. |
| Placement | `test/*.test.js` files matching `src/core/*` targets | Existing tests are reported as correctly colocated with the audited project. |

What it missed or over-reported:

- Direct root audit sees broad branching logic but does not yet understand module ownership well enough to rank adapter files by product risk.
- The project-wide audit of this repository is noisy because checked-in examples are intentionally separate fixture projects.
- Standalone TypeScript reference files without a matching runtime JavaScript sibling can still appear as candidates when they contain branching logic.

Heuristic follow-up:

- add ownership or package-role signals for adapter modules, CLI entrypoints, MCP transport, and core scoring modules
- continue tightening TypeScript reference-file detection for standalone reference modules without a runtime JavaScript sibling
- use `--exclude-project "examples/**"` when generating self-audit reports that should ignore checked-in example fixtures

## Collectors Grimoire App Audit

Source:

- repository: `m-stenbe/Collectors-Grimoire`
- audited commit: `a2d4c54` (`2025-01-27`, `Long overdue updates`)

Command focus:

```powershell
node ./src/cli/index.js findings-projects <Collectors-Grimoire checkout>
```

What the tool found:

- one Xcode-style Apple project
- Swift and Objective-C project signals
- Swift Testing and XCTest conventions
- `xcodebuild test -scheme "Collector's Grimoire"` as the detected command
- nine medium-severity missing-coverage findings
- many SwiftUI view and app-wiring files skipped as low-value direct test targets

Representative findings:

| Category | Examples | Why it matters |
| --- | --- | --- |
| Missing coverage | `CameraModel`, `CameraModel2`, `MTGCoreML`, `Theme` | The adapter found branch-heavy app code without matching tests. |
| Skipped low-value direct tests | SwiftUI views, app entry/wiring, environment containers | The audit avoided recommending direct tests for UI/wiring files without a matching UI or snapshot convention. |
| Existing structure | Xcode test folders and shared scheme | Detection can handle an app repo, not only Swift Package Manager fixtures. |

What it missed or over-reported:

- Branching logic is too generic as a rationale for app-specific Swift files.
- Camera and CoreML files need richer domain labels than `utility`.
- Xcode app support is still experimental and should not be described as equivalent to Swift Package Manager support.

Heuristic follow-up:

- split Swift app targets into camera/session, ML/classification, theming, and app-wiring categories
- improve SwiftUI and UIKit wrapper detection so direct test recommendations stay focused on model and state logic
- add app-style fixture coverage only after the Swift Package Manager behavior remains stable

## Current Alpha Gate Read

The real-repo report gate is now partially satisfied:

- at least three real repositories have local audit summaries: Repo Test Architect, `cg-bff`/Swift package family, and Collectors Grimoire
- one JavaScript/TypeScript codebase is covered by the self-audit
- Swift package and Xcode-style app repos are covered
- reports include findings, misses, and follow-up heuristics
- no report requires source upload or remote service execution

Remaining gap:

- add at least one non-owned JavaScript/TypeScript repository report before public alpha messaging
- make local sibling package report generation independent of local checkout names
