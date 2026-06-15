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

Detection finds project roots from marker files such as `package.json`, `pyproject.toml`, `Gemfile`, `composer.json`, `mix.exs`, `go.mod`, `Cargo.toml`, `.csproj`, `pom.xml`, or `build.gradle.kts`, records likely ecosystems and languages, and lists matching adapter IDs.

Unsupported projects stay visible. They are part of the audit result because hiding them would make the final risk report misleading.

## 2. Audit Supported Projects

```powershell
node ./src/cli/index.js audit-projects ./examples/polyglot-workspace --format json
```

This emits `project-audits/v1`.

For every supported project root, the matching adapter produces a normal audit artifact. Unsupported project roots are reported separately with their ecosystem and language labels.

The current runtime audits JavaScript and TypeScript project roots through the `javascript` adapter.
JavaScript and TypeScript already share one adapter domain. Future JVM and Apple adapters should follow the same rule for Java/Kotlin and Swift/Objective-C projects.

## 3. Reuse Saved Project Audits

Project-derived commands can read a saved `project-audits/v1` file:

```powershell
node ./src/cli/index.js summarize-projects --from-project-audits ./project-audits.json --format json
node ./src/cli/index.js rank-projects --from-project-audits ./project-audits.json --format json
node ./src/cli/index.js plan-projects --from-project-audits ./project-audits.json --format json
```

This keeps the deterministic audit boundary clear:

- scanning and classification happen once
- summaries, rankings, and plans are derived from the saved artifact
- model-assisted layers can consume the same artifact without inventing repo facts

## 4. Summarize

```powershell
node ./src/cli/index.js summarize-projects ./examples/polyglot-workspace --format json
```

This emits `project-audit-summary/v1`.

The summary is intentionally compact. It answers which projects were audited, how many candidates and risks were found, and which unsupported projects remain.

## 5. Rank

```powershell
node ./src/cli/index.js rank-projects ./examples/polyglot-workspace --format json
```

This emits `project-candidate-ranking/v1`.

Ranking flattens per-project candidates while preserving project identity. The result is useful for deciding where the next test should be added across the whole repository.

## 6. Plan

```powershell
node ./src/cli/index.js plan-projects ./examples/polyglot-workspace --format json
```

This emits `project-test-plan/v1`.

The project test plan keeps each underlying `plan/v1` artifact available, but also exposes flattened plan items with project identity attached. Future generation should target stable plan item IDs from this artifact.

## Adapter Execution Model

The deterministic API currently executes adapters locally and serially. The artifact model is designed so future runtime layers can run independent project audits in parallel when that is worth it.

Parallel execution should not change artifact shape. Whether three adapters run one after another or at the same time, the output should remain a `project-audits/v1` artifact with the same supported and unsupported project lists.

## Current Fixture

`examples/polyglot-workspace` contains:

- `apps/android`: Kotlin/JVM project, currently detected but unsupported
- `apps/web`: JavaScript/TypeScript project, currently supported
- `services/api`: Python project, currently detected but unsupported

That fixture exists to keep unsupported language reporting visible while the first adapter remains JavaScript/TypeScript.
