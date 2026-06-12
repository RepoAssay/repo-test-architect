# Repo Test Architect

Audit-first test strategy tooling for codebases.

The first milestone is intentionally narrow:

- detect JavaScript and TypeScript repository conventions
- identify existing test framework signals
- classify source files by likely test value
- recommend useful tests before generating any code
- report skipped areas and remaining risk honestly

## Working CLI

```powershell
npm run audit:example
```

Output the structured audit graph:

```powershell
npm run audit:example:json
```

Generate an actionable test plan from the audit graph:

```powershell
npm run plan:example
npm run plan:example:json
npm run plan:item:example
npm run plan:changed
npm run plan:changed-since
```

Explain one audited target by stable target ID:

```powershell
npm run explain:example
```

Rank test candidates without generating tests:

```powershell
npm run rank:example
```

Generate a plan from an existing audit JSON file:

```powershell
npm run plan:from-audit:example
```

Run the auditor regression tests:

```powershell
npm test
```

The tests include golden audit and plan snapshots under `evals/expected`, driven by `evals/fixtures.json`.
JSON schemas and the signal registry for versioned artifacts live under `schemas/`.

Refresh snapshots after intentional audit behavior changes:

```powershell
npm run eval:check
npm run eval:summary
npm run eval:update
```

Node is required for the CLI. If Node is not available yet, the repository still includes a PowerShell smoke check:

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/smoke.ps1
```

## Shape

```txt
src/
  core/
    audit-model.ts
    report.ts
  adapters/
    javascript/
      audit.js
      audit.ts
  cli/
    index.js
examples/
  node-vitest-basic/
```

The JavaScript adapter is the first proof point. Later adapters should emit the same core audit model instead of inventing language-specific report formats.

## Docs

- [Project plan](docs/project-plan.md)
- [Adapter contract](docs/adapter-contract.md)
- [Artifact contract](docs/artifact-contract.md)
