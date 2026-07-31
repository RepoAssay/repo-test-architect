# Artifact Contract

Repo Test Architect produces deterministic JSON artifacts that other tools, future MCP endpoints, and model-assisted layers can consume.

JSON artifacts always preserve complete `existingTestPaths` evidence. Markdown output displays at most five paths per item and reports how many additional paths remain available in JSON, keeping human review concise without weakening the machine-readable audit trail.
When provenance is available, Markdown also summarizes evidence counts by strength (`direct`, `referenced`, `indirect`, and `naming`) without expanding the complete per-path evidence objects.

## Repository Analysis Artifact

Schema:

- `schemas/repository-analysis-v1.schema.json`
- `schemaVersion: "repository-analysis/v1"`

Commands:

```powershell
node ./src/cli/index.js analyze . --format json
node ./src/cli/index.js analyze --from-project-audits ./project-audits.json --format json
```

MCP tool:

- `analyze_repository`

This is the canonical complete review artifact. One project-audit pass supplies all deterministic inputs; the remaining views are derived without rescanning.

It contains:

- the source `project-audits/v1` artifact
- compact audit coverage and blocker counts
- concise project findings
- project-aware candidate ranking and test plan
- provider-neutral plan execution hints
- repository statistics and detected verification commands

Human-readable CLI output selects the most useful overview, findings, plan items, and commands. JSON preserves every child artifact for agents, automation, saved review evidence, and later focused transformations.

## Audit Artifact

Schema:

- `schemas/audit-v1.schema.json`
- `schemaVersion: "audit/v1"`

Command:

```powershell
node ./src/cli/index.js audit ./examples/node-vitest-basic --format json
```

The audit artifact is the source of truth for repository facts and classification.

It contains:

- repository profile
- detected package/test framework conventions
- untested candidates
- covered-but-risky targets
- skipped targets
- remaining risks
- structured `signals`
- optional `existingTestEvidence` entries for adapters that can explain each matched test path, including a deterministic evidence `kind` and `strength`
- optional evidence `usage` when the adapter can prove more than a structural relationship; JavaScript/TypeScript emits `called` for named bindings invoked through direct imports, one-hop relative barrels, `tsconfig` aliases, or declared package entry/subpath imports and `asserted` when the call or its assigned result is passed to Jest/Vitest `expect`, an AVA execution-context assertion, or a Node/Chai-style `assert` method
- C# emits `csharp-symbol-reference` with `direct` strength for a uniquely owned class, record, or struct used through an exact static member call, constructor, stable concrete local receiver, or exact `private readonly` concrete test-class field in a runnable attributed test. Supported fields use exact inline construction or one assignment in the class's sole parameterless constructor. Direct receiver calls, one stable assigned local result, or one top-level inline `out var` consumed by `Assert.*` or `.Should(...)` use `asserted`; other exact calls use `called`. Reassignment, mutable/static/interface/property/inherited/helper field identity, predeclared or multiple `out` outputs, `ref`/`out` forwarding, and deeper flow are rejected. A unique source/test basename match may fall back to the shared `filename-convention` naming evidence.
- Swift emits `swift-symbol-reference` with `referenced` strength when an owner-qualified test references a uniquely declared top-level type or function from a source file; constructor/function calls use `called`, while references inside Swift Testing, XCTest, or Nimble assertion expressions use `asserted`
- Python emits `python-module-import` with `direct` strength when a recognized test imports the exact package-qualified source module; imported bindings or namespace members use `called` or `asserted` when that usage is statically visible
- Kotlin/JVM emits `jvm-symbol-reference` for exact package/import ownership, same-package references, Java static-member imports, and Kotlin top-level functions found inside runnable JUnit tests; exact imports are `direct`, while same-package, wildcard, and fully qualified references are `referenced`; constructor/function use emits `called`, and bounded receiver/result aliases consumed by assertion APIs emit `asserted`
- Go emits `go-symbol-reference` with `direct` strength and `called` usage for unique top-level functions and receiver-type/method pairs called through an exact parser-owned concrete local binding; the receiver type can be explicit or come from an exact, simple, non-generic source-constructor or statically typed test-helper result position. Usage upgrades to `asserted` when that exact call is inside a bounded standard-library failure condition or an exact Testify assertion, or when one unique `:=` result binding is consumed there. Exact default, named, or dot imports can qualify exported external-package symbols, with parser-backed function/block scopes preventing a binding in one function from shadowing unrelated call sites. Exact type construction is `referenced`, and `go-source-dependency` remains one bounded function hop with `indirect` strength while preserving the entrypoint's `viaUsage`. Same-package and cross-package hops must occur inside the directly evidenced callable body; cross-package hops additionally require an exact module-local import and exported unique function
- Rust emits `rust-symbol-reference` with `direct` strength for a unique source function called from the same file's runnable inline `#[cfg(test)]` module or through an exact package-name and module-qualified `use` binding in a runnable `tests/` integration test. One exact unconditional library-root `pub use crate::<module>::<symbol>` declaration may preserve that identity for a crate-root import. Calls use `called`; calls inside built-in assertion macros use `asserted`. Unused imports, other crate names, ambiguous modules, wildcard or conditional re-exports, comments, strings, workspaces, and custom harnesses do not contribute evidence.
- Ruby initially emits only shared `filename-convention` evidence with `naming` strength when one runnable conventional Minitest or RSpec filename resolves to exactly one `lib/` source basename. It does not claim calls or assertions from naming alone.
- Python emits `python-package-reexport` with `referenced` strength when a package initializer explicitly re-exports a binding from the source module and a recognized test imports or uses that exported binding through the package
- Python emits `python-pytest-fixture` with `indirect` strength when an exact source import is used inside a declared pytest fixture and a recognized test consumes that fixture; optional `viaUsage` describes only visible test use of the fixture value
- Python emits `python-test-client-route` with `indirect` strength only when a supported framework client boots an exact owned application, its static router/blueprint/URLconf wiring reaches one route source, and a test issues a matching HTTP method and path; optional `viaUsage` records whether the request result is visibly called or asserted
- JavaScript/TypeScript usage detection covers named, aliased, default, and namespace-member ES module imports
- JavaScript/TypeScript CommonJS usage detection covers destructured and namespace-member bindings plus callable default exports assigned from `require(...)`
- optional `viaUsage` for bounded-indirect evidence records whether the test called or asserted the imported entrypoint that reaches the dependency; it does not claim that the indirect dependency itself was called or asserted

The JavaScript/TypeScript adapter currently emits these evidence strengths:

- `naming` for filename conventions
- `direct` for relative or `tsconfig`-aliased module imports
- `referenced` for referenced symbols reached through relative barrels or package entrypoints
- `indirect` for modules reached through the bounded dependency graph and for exact literal Playwright/Cypress request-to-HTTP-route matches

`browser-route-match` is emitted only for the route-registration source file. It does not claim direct usage, assertion usage, or transitive browser reachability.

`python-test-client-route` is likewise route-specific. It does not turn application boot, framework presence, middleware, services, dependency overrides, or deeper runtime dependencies into source coverage.

## Plan Artifact

Schema:

- `schemas/plan-v1.schema.json`
- `schemaVersion: "plan/v1"`

Commands:

```powershell
node ./src/cli/index.js plan ./examples/node-vitest-basic --format json
node ./src/cli/index.js plan --from-audit ./evals/expected/node-vitest-basic.audit.json --format json
```

The plan artifact is derived from an audit artifact.

It contains:

- summary counts
- blockers
- ordered plan items
- stable item IDs
- stable target IDs
- source signals from the audit target
- optional `existingTestEvidence` copied from adapters that emit per-test provenance

## Stable Plan Item IDs

Plan items use deterministic IDs:

```txt
add-test:src/authService.ts
extend-test:src/deckParser.ts
defer:src/userDto.ts
```

Use `--item` to select one plan item:

```powershell
node ./src/cli/index.js plan ./examples/node-vitest-basic --item add-test:src/authService.ts
```

Future generation should target these IDs rather than array positions or display names.

Audit targets also expose a stable `id`, currently the repository-relative source path.
Plan items carry that value as `targetId` so model and MCP layers can link plan actions back to audit evidence.

## Plan Execution Hints Artifact

Schema:

- `schemas/plan-execution-hints-v1.schema.json`
- `schemaVersion: "plan-execution-hints/v1"`

Commands:

```powershell
node ./src/cli/index.js hints ./examples/node-vitest-basic --format json
node ./src/cli/index.js hints-projects ./examples/polyglot-workspace --format json
```

MCP tool:

- `get_plan_execution_hints`

The companion artifact accepts `plan/v1` or `project-test-plan/v1` without modifying either source plan. Each hint remains keyed by the stable plan item or project item ID and contains:

- bounded `low`, `medium`, or `high` complexity
- a context mode, known source/test paths, and booleans for build configuration and repository instructions
- conservative parallel safety
- a provider-neutral implementation, repository-reasoning, or review role
- whether broader repository reasoning is required
- deterministic reasons derived from plan action, test level, maintenance cost, signals, and existing-test paths

Hints are advisory. They do not select a vendor, model, price tier, token budget, permission mode, or subagent implementation. A host that ignores them receives identical audit and plan semantics, and Repo Test Architect performs no hidden model or subagent calls.

## Target Explanation Artifact

Target explanations preserve optional `existingTestEvidence` from the selected audit target so a consumer can assess evidence quality without reopening the complete audit.

Schema:

- `schemas/target-explanation-v1.schema.json`
- `schemaVersion: "target-explanation/v1"`

Commands:

```powershell
node ./src/cli/index.js explain ./examples/node-vitest-basic --target src/authService.ts --format json
node ./src/cli/index.js explain --from-audit ./evals/expected/node-vitest-basic.audit.json --target src/authService.ts --format json
```

The target explanation artifact is the MCP-shaped view for one audit target.

It contains:

- stable target ID
- classification category
- recommendation and test level
- risk and maintenance scores
- source signals
- rationale and existing test paths

## Candidate Ranking Artifact

Ranked candidates preserve optional `existingTestEvidence`; project candidate rankings and project test plans retain the same provenance when composing supported project artifacts.

Schema:

- `schemas/candidate-ranking-v1.schema.json`
- `schemaVersion: "candidate-ranking/v1"`

Commands:

```powershell
node ./src/cli/index.js rank ./examples/node-vitest-basic --format json
node ./src/cli/index.js rank --from-audit ./evals/expected/node-vitest-basic.audit.json --format json
```

The candidate ranking artifact is the MCP-shaped view for ordered testable targets.

It contains:

- summary counts and blockers
- ordered candidates
- stable target IDs
- priority, risk reduction, and maintenance scores
- source signals and rationale

## Generation Deferred Artifact

Schema:

- `schemas/generation-deferred-v1.schema.json`
- `schemaVersion: "generation-deferred/v1"`

MCP tool:

```txt
generate_selected_test
```

This artifact is returned while native test generation remains intentionally disabled.
It tells clients that the plan item was understood, but no test code should be produced yet.

## Model Consistency Scenario Artifact

Schema:

- `schemas/model-consistency-scenario-v1.schema.json`
- `schemaVersion: "model-consistency-scenario/v1"`

Scenario fixtures:

- `evals/model-consistency/*.scenario.json`

This artifact defines a deterministic model-consistency check without invoking a model.
It points at a source artifact, names the intended tool call, and lists fields that must remain stable across model profiles.

It contains:

- source artifact path and schema version
- optional source argument name when the path points at an MCP-style args wrapper
- tool name and arguments
- locked fields with expected deterministic values
- allowed variation, such as wording or explanation depth
- unexpected variation, such as changed target, recommendation, test level, score, framework, or test command

## Model Consistency Summary Artifact

Schema:

- `schemas/model-consistency-summary-v1.schema.json`
- `schemaVersion: "model-consistency-summary/v1"`

Command:

```powershell
npm run model-consistency:json
npm run model-consistency:json -- --profile local-small
```

This artifact summarizes checked model-consistency scenarios for one profile.
The first profile is the deterministic baseline; later profiles can represent specific model/provider settings.

It contains:

- profile name
- scenario pass/fail counts
- total checked locked fields
- per-scenario status
- allowed variation themes
- unexpected variation themes

## Model Consistency Comparison Artifact

Schema:

- `schemas/model-consistency-comparison-v1.schema.json`
- `schemaVersion: "model-consistency-comparison/v1"`

Command:

```powershell
npm run model-consistency:compare:profiles
npm run model-consistency:compare -- --baseline-profile deterministic-baseline --candidate-profile local-small
npm run model-consistency:compare -- baseline-summary.json candidate-summary.json
```

This artifact compares two `model-consistency-summary/v1` artifacts. The profile comparison command generates summaries from the checked-in scenarios for two named profiles before comparing them. The file comparison command compares previously saved summaries.
It is intended for model profile runs where the deterministic baseline is compared against a named model/provider configuration.

It contains:

- baseline and candidate profile names
- aligned, drifted, missing, and unexpected scenario counts
- checked-field and failure deltas
- per-scenario alignment status

## Model Consistency Stats Artifact

Schema:

- `schemas/model-consistency-stats-v1.schema.json`
- `schemaVersion: "model-consistency-stats/v1"`

Command:

```powershell
npm run model-consistency:stats
node ./scripts/collect-model-consistency-stats.js --summary baseline-summary.json
node ./scripts/collect-model-consistency-stats.js --summary baseline-summary.json --candidate-summary candidate-summary.json
node ./scripts/collect-model-consistency-stats.js --summary baseline-summary.json --comparison comparison.json
```

This artifact derives local deterministic stats from a `model-consistency-summary/v1` artifact and, optionally, a `model-consistency-comparison/v1` artifact.
It is intended for model profile reporting without depending on any hosted analytics.

It contains:

- scenario, checked-field, and failure counts
- drifted, missing, and unexpected scenario counts when comparison data exists
- scenario status distribution
- tool distribution
- comparison alignment distribution

## Test Placement Findings Artifact

Schema:

- `schemas/test-placement-findings-v1.schema.json`
- `schemaVersion: "test-placement-findings/v1"`

Commands:

```powershell
node ./src/cli/index.js placement ./examples/node-vitest-basic --owner node-vitest-basic --format json
node ./src/cli/index.js placement --from-audit ./evals/expected/node-vitest-basic.audit.json --format json
node ./src/cli/index.js placement-projects ./examples/node-vitest-basic --format json
node ./src/cli/index.js placement-projects --from-project-audits ./project-audits.json --format json
```

MCP tools:

```txt
analyze_test_placement
analyze_project_test_placement
```

This advisory artifact reports test placement recommendations. The single-project analyzer emits conservative `keep` findings for tests already matched to audited targets in the same project. The project-audits analyzer can also emit conservative `move` findings when an existing test path explicitly escapes the audited project root and points at another detected project owner. It emits `split` instead when the escaped match is integration-level, because that usually means the test should be separated rather than blindly moved. Package-aware adapters can also emit `package-owned-behavior` on covered targets with repo-relative test paths; the project analyzer treats those as cross-owner placement findings when the test path belongs to another detected project, and uses `app-integration-dependency` to prefer `split` over `move`. If adapter signals are absent, the analyzer can infer a conservative package boundary from common monorepo owner roots, such as `packages/*` or `libs/*` covered by tests under `apps/*`, `clients/*`, or `services/*`.

It contains:

- test file
- current owner
- suggested owner
- placement action: `move`, `split`, or `keep`
- human-readable reason
- evidence strings such as imports, tested symbols, package ownership, or integration dependencies

## Adapter Registry Artifact

Schema:

- `schemas/adapter-registry-v1.schema.json`
- `schemaVersion: "adapter-registry/v1"`

MCP tool:

```txt
list_adapters
```

Commands:

```powershell
node ./src/cli/index.js adapters
node ./src/cli/index.js adapters --format json
```

This artifact lists registered language adapters, their maturity, ecosystem labels, supported language labels, recognized test frameworks, supported project types, and emitted artifact schemas.
Clients should use the adapter `id` when passing `adapterId` to `audit_repo`.

## Project Detection Rules Artifact

Schema:

- `schemas/project-detection-rules-v1.schema.json`
- `schemaVersion: "project-detection-rules/v1"`

MCP tool:

```txt
list_project_detection_rules
```

Commands:

```powershell
node ./src/cli/index.js detect-rules
node ./src/cli/index.js detect-rules --format json
```

This artifact lists deterministic marker rules and ignored directories used by project detection.
Clients can use it to explain detector behavior before scanning a repository.

## Project Detection Artifact

Schema:

- `schemas/project-detection-v1.schema.json`
- `schemaVersion: "project-detection/v1"`

MCP tool:

```txt
detect_projects
```

Commands:

```powershell
node ./src/cli/index.js detect ./examples/polyglot-workspace
node ./src/cli/index.js detect ./examples/polyglot-workspace --format json
```

This artifact lists project roots found inside a repository, their marker files, likely ecosystems and languages, matching adapter IDs, structured adapter match evidence, and whether the current runtime can audit them.
It is the first deterministic step toward polyglot repo support and future parallel adapter execution.

## Project Audits Artifact

Schema:

- `schemas/project-audits-v1.schema.json`
- `schemaVersion: "project-audits/v1"`

MCP tool:

```txt
audit_projects
```

Commands:

```powershell
node ./src/cli/index.js audit-projects ./examples/polyglot-workspace
node ./src/cli/index.js audit-projects ./examples/polyglot-workspace --format json
```

This artifact runs the matching adapter for each supported detected project root and reports unsupported project roots separately with their ecosystems, languages, adapter match evidence, and support status reason.
It does not yet merge or rank findings across projects; that belongs in a later core merge layer.

## Project Audit Summary Artifact

Schema:

- `schemas/project-audit-summary-v1.schema.json`
- `schemaVersion: "project-audit-summary/v1"`

MCP tool:

```txt
summarize_project_audits
```

Commands:

```powershell
node ./src/cli/index.js summarize-projects ./examples/polyglot-workspace
node ./src/cli/index.js summarize-projects ./examples/polyglot-workspace --format json
node ./src/cli/index.js summarize-projects --from-project-audits ./project-audits.json --format json
```

This artifact summarizes a `project-audits/v1` artifact into project-level counts, audit coverage status, unsupported status reasons, top candidate IDs, risk counts, and unsupported project roots with ecosystem labels, language labels, adapter match evidence, and support status reasons.
It is intentionally not a merged audit graph and does not perform cross-project ranking.

## Project Findings Artifact

Schema:

- `schemas/project-findings-v1.schema.json`
- `schemaVersion: "project-findings/v1"`

MCP tool:

```txt
collect_project_findings
```

The findings artifact turns project audits into a bounded review queue for missing, weak, misplaced, low-value, and blocked coverage. Weak-existing-coverage priority uses the strongest normalized provenance available: direct asserted usage receives the largest review discount, followed by called usage and structural direct/referenced reachability. Naming-only, bounded-indirect, and legacy evidence remain at the target's base review priority. This changes review ordering only; it does not reclassify audit targets or claim branch completeness.

## Project Candidate Ranking Artifact

Schema:

- `schemas/project-candidate-ranking-v1.schema.json`
- `schemaVersion: "project-candidate-ranking/v1"`

MCP tool:

```txt
rank_project_candidates
```

Commands:

```powershell
node ./src/cli/index.js rank-projects ./examples/polyglot-workspace
node ./src/cli/index.js rank-projects ./examples/polyglot-workspace --format json
node ./src/cli/index.js rank-projects --from-project-audits ./project-audits.json --format json
```

This artifact ranks candidates from a `project-audits/v1` artifact using the same deterministic per-audit priority calculation, while adding project identity and audit coverage status to each candidate view.
It preserves unsupported project roots, including ecosystem labels, language labels, adapter match evidence, and support status reasons, instead of hiding them.

## Project Test Plan Artifact

Schema:

- `schemas/project-test-plan-v1.schema.json`
- `schemaVersion: "project-test-plan/v1"`

MCP tool:

```txt
generate_project_test_plan
```

Commands:

```powershell
node ./src/cli/index.js plan-projects ./examples/polyglot-workspace
node ./src/cli/index.js plan-projects ./examples/polyglot-workspace --format json
node ./src/cli/index.js plan-projects --from-project-audits ./project-audits.json --format json
```

This artifact generates per-project plan items from a `project-audits/v1` artifact and flattens them with project identity and audit coverage status attached.
It preserves the underlying `plan/v1` artifacts per project for detailed inspection.
It also preserves unsupported project roots with ecosystem labels, language labels, adapter match evidence, and support status reasons.

`project-audits/v1` can also be used by the internal `analyzeRepoProjectTestPlacement` API to produce repository-relative `test-placement-findings/v1` findings while preserving project owner identity. When a matched test path uses `..` to escape the audited project root, the analyzer resolves the repository-relative test path and reports a `move` finding instead of silently treating the test as colocated. Escaped integration-level matches are reported as `split` findings.

## Project Stats Artifact

Schema:

- `schemas/project-stats-v1.schema.json`
- `schemaVersion: "project-stats/v1"`

MCP tool:

```txt
collect_project_stats
```

Commands:

```powershell
node ./src/cli/index.js stats-projects ./examples/polyglot-workspace
node ./src/cli/index.js stats-projects ./examples/polyglot-workspace --format json
node ./src/cli/index.js stats-projects --from-project-audits ./project-audits.json --format json
```

This artifact derives local deterministic stats from a `project-audits/v1` artifact.
It is intended for reporting, trend comparisons, and later model-profile comparisons without collecting source content or external telemetry.

It contains:

- project audit coverage counts
- source file counts by detected language, split into audited and unsupported project coverage
- candidate, skipped target, risk, and blocker counts
- confidence distribution
- detected test framework distribution
- detected test command distribution
- target kind distribution
- risk level distribution
- emitted signal distribution
- existing-test evidence strength, evidence kind, direct call/assertion usage, and bounded-indirect entrypoint usage distributions
- audited adapter usage counts

## Local Diagnostic Artifacts

Schemas:

- `schemas/diagnostic-event-v1.schema.json`
- `schemas/doctor-report-v1.schema.json`
- `schemas/diagnostic-bundle-v1.schema.json`

Schema versions:

- `diagnostic-event/v1`
- `doctor-report/v1`
- `diagnostic-bundle/v1`

Commands:

```powershell
npm run doctor
npm run doctor:json
node ./src/cli/index.js diagnostic-bundle --diagnostics-file ./.repo-test-architect/diagnostics.jsonl
node ./src/cli/index.js diagnostic-bundle --diagnostics-file ./.repo-test-architect/diagnostics.jsonl --format json
```

`diagnostic-event/v1` is an opt-in local MCP operational event. It contains fixed transport metadata: timestamp, event ID, event type, server version, allowlisted tool name, success/error status, rounded duration, optional stable error kind, and optional report ID plus one-way grouping fingerprint for internal errors.

It does not contain tool arguments, prompts, environment values, repository paths, source content, stack traces, model usage, or subagent activity.

`doctor-report/v1` reports local Node, repository-readability, Git-worktree, diagnostics-configuration, and configured file-destination writability checks. It does not echo the repository path, diagnostics file path, or environment values.

`diagnostic-bundle/v1` rebuilds up to 200 local JSONL events from the strict event allowlist, counts invalid lines, and declares its privacy properties. Unknown fields are discarded. The bundle is inspectable output only; it does not transmit itself and external reporting remains disabled.

See [Local Diagnostics](diagnostics.md) for configuration, privacy, and error-handling behavior.

## Changed-Only Flow

For PR-style workflows, use `--changed`:

```powershell
node ./src/cli/index.js audit . --changed --format json
node ./src/cli/index.js plan . --changed --format json
node ./src/cli/index.js audit-projects . --changed --format json
node ./src/cli/index.js plan . --changed-since main --format json
node ./src/cli/index.js audit-projects . --changed-since main --format json
```

The repository profile still uses the full repo. Candidate targets are limited to changed source files reported by Git.
For project-aware commands, repository-level changed paths are partitioned by detected project root before each adapter runs, so JavaScript, Kotlin/JVM, and later adapters receive project-relative changed paths.
Project-aware CLI commands also accept `--exclude-project <root-or-pattern>` to filter exact project roots or quoted subtree patterns such as `"examples/**"` before auditing. MCP `detect_projects` and `audit_projects` accept the equivalent `excludeProjectRoots` array.

## Signals

Signal registry:

- `schemas/signal-registry.json`

Signals are stable machine-readable evidence keys. Examples:

- `pure-logic`
- `edge-case-surface`
- `auth-branch`
- `external-boundary`
- `matching-test`
- `dto-only`
- `presentational-component`

Use signals for model prompts, MCP tool results, evaluation, and consistency checks. Use `reasons` for human-readable reporting.

## Deterministic Boundary

The deterministic layer owns:

- repo scanning
- convention detection
- target classification
- risk and maintenance scoring
- audit graph creation
- plan creation
- target explanation
- candidate ranking

Internal tool API:

- `auditRepo`
- `getAdapterRegistry`
- `getProjectDetectionRules`
- `detectRepoProjects`
- `auditRepoProjects`
- `summarizeRepoProjectAudits`
- `rankRepoProjectCandidates`
- `generateRepoProjectTestPlan`
- `analyzeRepoProjectTestPlacement`
- `collectRepoProjectStats`
- `getAuditGraph`
- `explainAuditTarget`
- `rankAuditTestCandidates`
- `generateTestPlan`
- `createRepoTestPlacementFindings`
- `analyzeRepoTestPlacement`

Future model-assisted layers may:

- explain a plan
- suggest concrete test cases
- generate selected tests
- summarize risk

Models should consume audit/plan artifacts rather than infer repository facts from scratch.

## Validation Corpus Artifact

Schema:

- `schemas/validation-corpus-v1.schema.json`
- `schemaVersion: "validation-corpus/v1"`

Manifest:

- `evals/validation-corpus.json`

Command:

```powershell
npm run corpus:check
npm run corpus:scorecard
npm run corpus:scorecard -- --format json
```

This repository-owned artifact records the pinned public probes used to harden supported adapters. It is a review contract rather than CLI or MCP audit output. Every supported adapter owns at least one conventional library or service, one framework-heavy application, and one difficult ownership graph.

Each case records:

- a full repository commit and optional project root
- optional bounded adapter audit options, currently an explicit Go target
- the bounded support claim being reviewed
- the checked-in report containing the human analysis
- detection, ownership, command, evidence, ranking, stability, and performance score states
- the command and candidate counts observed in the linked report
- optional audit duration and evidence-relationship counts when those observations exist

`pending` is an intentional score. Stability passes only after repeated audits produce identical canonical JSON for the pinned checkout. Performance passes only after the standardized pass records both duration and evidence-relationship counts; historical timing notes remain observations until then. External repositories are not fetched or executed by `corpus:check`, and deterministic local fixtures remain the release gate.

### Validation Scorecard View

Schema:

- `schemas/validation-scorecard-v1.schema.json`
- `schemaVersion: "validation-scorecard/v1"`

The derived scorecard is a deterministic human and machine-readable view of `validation-corpus/v1`; it does not alter the source manifest or create a repository-quality score. Overall, adapter, and case summaries keep two ratios separate:

- `reviewCompleteness`: reviewed areas (`pass` plus `fail`) divided by all defined areas
- `reviewedPassRate`: passing areas divided only by reviewed areas

The JSON artifact stores the exact numerators and denominators rather than a rounded percentage. The Markdown renderer may show a rounded percentage alongside those ratios for readability. When no areas have been reviewed, the reviewed pass rate is reported as unavailable instead of treating `0/0` as a passing result. Every case retains the ordered detection, ownership, command, evidence, ranking, stability, and performance states with explicit `pass`, `fail`, or `pending` text.

## Eval Artifacts

Fixture manifest:

- `evals/fixtures.json`

Golden snapshots:

- `evals/expected/*.audit.json`
- `evals/expected/*.plan.json`

Model-consistency scenarios:

- `evals/model-consistency/*.scenario.json`

Commands:

```powershell
npm run eval:check
npm run eval:summary
npm run eval:test
npm run eval:update
npm run model-consistency:check
npm run model-consistency:json
npm run model-consistency:compare -- baseline-summary.json candidate-summary.json
npm run model-consistency:stats
npm run corpus:check
```

Update snapshots only after intentional behavior changes.
