# Polyglot Workflow

Repo Test Architect treats a multi-language repository as a set of auditable project roots, not as one blended source tree.

There are two different cases:

- multiple build roots in one repository, such as a JavaScript frontend plus a Python API
- multiple languages under one build root, such as Java plus Kotlin in one Gradle module or Swift plus Objective-C in one Apple target

Project detection splits by build/test root. It should not split Java and Kotlin source folders into separate projects when they share the same Gradle or Maven root. The future ecosystem adapter is responsible for understanding mixed-language source sets inside that root.

The core flow is:

```txt
repo root
  -> project detection
  -> per-project adapter audits
  -> project summary
  -> cross-project ranking
  -> project test plan
```

Each step emits a stable artifact so later steps can reuse saved facts instead of rescanning the repository.

## 1. Detect Projects

```powershell
node ./src/cli/index.js detect ./examples/polyglot-workspace --format json
```

This emits `project-detection/v1`.

Detection finds project roots from marker files and directories such as `package.json`, `pyproject.toml`, `Gemfile`, `composer.json`, `mix.exs`, `go.mod`, `Cargo.toml`, `Package.swift`, `.xcodeproj`, `.csproj`, `pom.xml`, or `build.gradle.kts`, records likely ecosystems and languages, lists matching adapter IDs, and explains the adapter match or unsupported status.

Unsupported projects stay visible. They are part of the audit result because hiding them would make the final risk report misleading.

## 2. Audit Supported Projects

```powershell
node ./src/cli/index.js audit-projects ./examples/polyglot-workspace --format json
```

This emits `project-audits/v1`.

For every supported project root, the matching adapter produces a normal audit artifact. Unsupported project roots are reported separately with their ecosystem and language labels, adapter match evidence, and support status reason.

The current runtime audits JavaScript and TypeScript project roots through the supported `javascript` adapter, and Kotlin/JVM Gradle roots through the experimental `kotlin` adapter.
JavaScript and TypeScript share one adapter domain. Java and Kotlin share one experimental JVM adapter domain. Future Apple adapters should follow the same rule for Swift/Objective-C projects.

## 3. Reuse Saved Project Audits

Project-derived commands can read a saved `project-audits/v1` file:

```powershell
node ./src/cli/index.js summarize-projects --from-project-audits ./project-audits.json --format json
node ./src/cli/index.js rank-projects --from-project-audits ./project-audits.json --format json
node ./src/cli/index.js plan-projects --from-project-audits ./project-audits.json --format json
node ./src/cli/index.js placement-projects --from-project-audits ./project-audits.json --format json
node ./src/cli/index.js stats-projects --from-project-audits ./project-audits.json --format json
```

This keeps the deterministic audit boundary clear:

- scanning and classification happen once
- summaries, rankings, plans, and placement findings are derived from the saved artifact
- stats and future trend comparisons can be derived from the saved artifact
- model-assisted layers can consume the same artifact without inventing repo facts

## 4. Summarize

```powershell
node ./src/cli/index.js summarize-projects ./examples/polyglot-workspace --format json
```

This emits `project-audit-summary/v1`.

The summary is intentionally compact. It answers whether audit coverage is complete, partial, or absent; which projects were audited; how many candidates and risks were found; and which unsupported projects remain.

## 5. Rank

```powershell
node ./src/cli/index.js rank-projects ./examples/polyglot-workspace --format json
```

This emits `project-candidate-ranking/v1`.

Ranking flattens per-project candidates while preserving project identity and audit coverage status. The result is useful for deciding where the next test should be added across the audited portion of the repository.

## 6. Plan

```powershell
node ./src/cli/index.js plan-projects ./examples/polyglot-workspace --format json
```

This emits `project-test-plan/v1`.

The project test plan keeps each underlying `plan/v1` artifact available, but also exposes flattened plan items with project identity and audit coverage status attached. Future generation should target stable plan item IDs from this artifact.

## 7. Analyze Test Placement

```powershell
node ./src/cli/index.js placement-projects ./examples/node-vitest-basic --format json
```

This emits `test-placement-findings/v1`.

Project placement analysis derives advisory findings from `project-audits/v1` while preserving project owner identity. It emits conservative `keep` findings for tests already matched to audited targets in the same project. It can also emit `move` findings when a matched test path explicitly escapes the audited project root and resolves into another detected project owner. If that escaped match is integration-level, it emits `split` instead, because the test likely mixes package-owned behavior with app or integration wiring.

## 8. Collect Project Stats

```powershell
node ./src/cli/index.js stats-projects ./examples/polyglot-workspace --format json
```

This emits `project-stats/v1`.

Project stats are derived from `project-audits/v1` and contain local counts and distributions for reporting: audit coverage, candidate counts, skipped targets, risks, blockers, confidence levels, detected test frameworks, test commands, and adapter usage.

## Adapter Execution Model

The deterministic API currently executes adapters locally and serially. The artifact model is designed so future runtime layers can run independent project audits in parallel when that is worth it.

Parallel execution should not change artifact shape. Whether three adapters run one after another or at the same time, the output should remain a `project-audits/v1` artifact with the same supported and unsupported project lists, including their adapter match evidence.

## Current Fixture

`examples/polyglot-workspace` contains:

- `apps/android`: Kotlin/JVM project audited by the experimental `kotlin` adapter
- `apps/web`: JavaScript/TypeScript project, currently supported
- `services/api`: Python project, currently detected but unsupported

That fixture keeps mixed supported and unsupported project reporting visible while additional adapters mature.
