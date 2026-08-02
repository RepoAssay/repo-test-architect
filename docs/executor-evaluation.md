# Bounded Executor Evaluation

Repo Test Architect has one checked-in executor evaluation for studying downstream test implementation without enabling native generation in the CLI or MCP server.

The evaluation consumes one stable JavaScript `plan/v1` item for `src/access-policy.js`, its provider-neutral execution hint, the selected source and repository conventions. It does not let an executor profile re-audit the repository, select a different target, or write directly to the fixture.

## Boundary

- `evaluationMode` is always `non-shipping`.
- Product generation remains `generation-deferred/v1`; `generate_selected_test` is unchanged.
- Each profile receives the same deeply frozen context and stable input digest.
- A proposal must repeat the selected plan identity, action, level, target, and source signals exactly.
- The evaluator accepts exactly one file at `src/access-policy.test.js` and performs the write in a temporary repository copy.
- The exact adapter-owned `npm run test` command verifies every accepted attempt.
- At most one repair is permitted.
- A controlled production fault must make the generated test fail before a profile passes.

Profiles are trusted, checked-in evaluation modules, not a sandbox for arbitrary code. The proposal interface keeps file mutation in the evaluator, and before/after digests verify that the evaluated repository changed only at the allowed test path.

## Profiles And Result

The dependency-free Node `node:test` fixture runs two replaceable profiles against the same audit facts:

| Profile | First verification | Repair | Final verification | Controlled fault |
| --- | --- | ---: | --- | --- |
| `direct-node-test` | passes | 0 | passes | detected |
| `one-repair-node-test` | assertion failure | 1 | passes | detected |

The evaluator records convention checks, unrelated paths, evidence contradictions, changed paths, exact verification commands, failure kinds, durations, repair counts, and fault-injection results in `executor-evaluation/v1`.

This proves the bounded evaluation harness and repair accounting. It does not prove that a model can generate useful tests across adapters, that arbitrary profile code is isolated, or that the full generation-readiness gate has been met.

## Contracts And Commands

- fixture: `evals/executor/node-test-basic.executor-eval.json`
- fixture schema: `schemas/executor-evaluation-fixture-v1.schema.json`
- result schema: `schemas/executor-evaluation-v1.schema.json`

Run the checked acceptance profile:

```powershell
npm run executor:eval:check
```

Inspect the complete artifact:

```powershell
npm run executor:eval:json
```

The acceptance check is part of both `npm run alpha:check` and `npm run release:check` so the non-shipping boundary, bounded repair behavior, and meaningful-failure proof cannot drift unnoticed.
