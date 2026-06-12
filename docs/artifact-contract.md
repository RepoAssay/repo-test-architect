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

## Adapter Registry Artifact

Schema:

- `schemas/adapter-registry-v1.schema.json`
- `schemaVersion: "adapter-registry/v1"`

MCP tool:

```txt
list_adapters
```

This artifact lists registered language adapters and their supported language labels.
Clients should use the adapter `id` when passing `adapterId` to `audit_repo`.

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

This artifact lists project roots found inside a repository, their marker files, likely languages, matching adapter IDs, and whether the current runtime can audit them.
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

This artifact runs the matching adapter for each supported detected project root and reports unsupported project roots separately.
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
```

This artifact summarizes a `project-audits/v1` artifact into project-level counts, top candidate IDs, risk counts, and unsupported project roots.
It is intentionally not a merged audit graph and does not perform cross-project ranking.

## Project Candidate Ranking Artifact

Schema:

- `schemas/project-candidate-ranking-v1.schema.json`
- `schemaVersion: "project-candidate-ranking/v1"`

MCP tool:

```txt
rank_project_candidates
```

This artifact ranks candidates from a `project-audits/v1` artifact using the same deterministic per-audit priority calculation, while adding project identity to each candidate.
It preserves unsupported project roots instead of hiding them.

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
- `detectRepoProjects`
- `auditRepoProjects`
- `summarizeRepoProjectAudits`
- `rankRepoProjectCandidates`
- `getAuditGraph`
- `explainAuditTarget`
- `rankAuditTestCandidates`
- `generateTestPlan`

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

Commands:

```powershell
npm run eval:check
npm run eval:summary
npm run eval:test
npm run eval:update
```

Update snapshots only after intentional behavior changes.
