# Artifact Contract

Repo Test Architect produces deterministic JSON artifacts that other tools, future MCP endpoints, and model-assisted layers can consume.

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

## Target Explanation Artifact

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
npm run model-consistency:compare -- baseline-summary.json candidate-summary.json
```

This artifact compares two `model-consistency-summary/v1` artifacts.
It is intended for future model profile runs where the deterministic baseline is compared against a named model/provider configuration.

It contains:

- baseline and candidate profile names
- aligned, drifted, missing, and unexpected scenario counts
- checked-field and failure deltas
- per-scenario alignment status

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

This advisory artifact reports test placement recommendations. The first deterministic analyzer only emits conservative `keep` findings for tests already matched to audited targets in the same project. Future package-aware analyzers can add `move` and `split` findings once ownership signals and repair loops can safely move files and verify affected test commands.

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

This artifact summarizes a `project-audits/v1` artifact into project-level counts, top candidate IDs, risk counts, and unsupported project roots with ecosystem labels, language labels, adapter match evidence, and support status reasons.
It is intentionally not a merged audit graph and does not perform cross-project ranking.

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

This artifact ranks candidates from a `project-audits/v1` artifact using the same deterministic per-audit priority calculation, while adding project identity to each candidate.
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

This artifact generates per-project plan items from a `project-audits/v1` artifact and flattens them with project identity attached.
It preserves the underlying `plan/v1` artifacts per project for detailed inspection.
It also preserves unsupported project roots with ecosystem labels, language labels, adapter match evidence, and support status reasons.

`project-audits/v1` can also be used by the internal `analyzeRepoProjectTestPlacement` API to produce repository-relative `test-placement-findings/v1` findings while preserving project owner identity.

## Changed-Only Flow

For PR-style workflows, use `--changed`:

```powershell
node ./src/cli/index.js audit . --changed --format json
node ./src/cli/index.js plan . --changed --format json
node ./src/cli/index.js plan . --changed-since main --format json
```

The repository profile still uses the full repo. Candidate targets are limited to changed source files reported by Git.

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
```

Update snapshots only after intentional behavior changes.
