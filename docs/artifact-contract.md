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
npm run eval:update
```

Update snapshots only after intentional behavior changes.
