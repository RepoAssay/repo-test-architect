# Near-Term Roadmap

This roadmap tracks the next practical milestones before Repo Test Architect should claim broader adapter support or native test generation.

## Current Baseline

The repository is public-demo ready, but not package-release ready.

The useful baseline is:

- deterministic JavaScript/TypeScript audit pipeline
- experimental Kotlin/JVM adapter spike
- polyglot project detection with unsupported-project reporting
- project-level ranking, planning, placement, stats, and MCP-shaped tool calls
- model-consistency scenarios for stable audit and plan outputs
- release gate through `npm run release:check`
- native test generation intentionally deferred

## Milestone 1: Public Demo Polish

Goal: make the current audit-first value easy to show without implying generation is complete.

Acceptance:

- demo commands stay covered by `npm run demo:check`
- docs explain that generation is deferred
- README points to the demo path, product positioning, and release gate
- package remains private until license, ownership, and publish targets are confirmed

## Milestone 2: Second Adapter Spike

Goal: prove the adapter contract survives a second ecosystem.

Status: started with an experimental Kotlin/JVM with Gradle/Maven and JUnit adapter.

Preferred candidates:

- Swift Package Manager with XCTest or Swift Testing

Acceptance:

- adapter emits the shared audit model
- unsupported-to-supported transition is visible in project detection
- golden audit and plan snapshots exist
- model-consistency scenario covers adapter-specific recommendations
- release gate still passes through `npm run release:check`
- native generation remains deferred unless adapter-specific repair-loop tests exist

## Milestone 3: Placement And Boundary Analysis

Goal: move beyond candidate ranking into repo-structure advice.

Acceptance:

- placement findings can recommend `keep`, `move`, or `split`
- package ownership is preserved in project-derived artifacts
- app-level tests that belong in package-level test targets are reported conservatively
- findings include reason text and risk notes instead of automatic rewrites

## Milestone 4: Local MCP Transport

Goal: replace the current MCP-shaped local harness with a real local stdio MCP transport wrapper.

Acceptance:

- tool descriptors remain deterministic
- local stdio server exposes the same tool names
- no remote repo upload is required
- client config docs stay aligned with package binaries
- smoke and release checks cover the boot path

## Milestone 5: Generation Readiness Gate

Goal: define the minimum proof needed before native test generation is enabled.

Acceptance:

- adapter-specific generation policy exists
- generated tests reuse discovered conventions
- repair loop only edits generated test files by default
- fixtures cover compile failures, assertion failures, and skipped recommendations
- risk report explains what was generated, skipped, repaired, and still risky

Native generation should remain off until this gate is met.
