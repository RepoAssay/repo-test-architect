# Contributing

Repo Test Architect is audit-first. Contributions should preserve deterministic repository understanding before adding generation or model behavior.

## Workflow

- Keep changes small and traceable.
- Prefer focused commits that explain one product or engineering step.
- Start each independent workstream from the current default branch.
- Create a focused branch before editing, for example `git switch -c swift-vapor-xcode-validation`.
- Keep unrelated local files out of commits. Prefer explicit `git add <path>` over `git add -A` when the working tree is mixed.
- Run the relevant focused checks while iterating, then run `npm run release:check` before opening or updating a pull request.
- Commit with a terse imperative message that names the product or engineering step.
- Push with upstream tracking, for example `git push -u origin <branch>`.
- Open a draft pull request for review and CI unless the change is explicitly ready for final review.
- Use the pull request template to call out audit impact, verification, and remaining risk.

Typical branch flow:

```bash
git switch master
git pull --ff-only
git switch -c <focused-branch>

# edit and verify
git status --short
git add <intended files>
git commit -m "<terse change summary>"
git push -u origin <focused-branch>
gh pr create --draft --fill
```

If `npm test` or package checks fail because the user-level npm cache contains files owned by another user, rerun with a temporary cache:

```bash
NPM_CONFIG_CACHE=/private/tmp/repo-test-architect-npm-cache npm test
```

## Audit Changes

Audit behavior changes need explicit fixtures and regression coverage.

- Add or update fixtures under `examples/` when changing detection, classification, ranking, planning, placement, or stats behavior.
- Update golden snapshots only when the behavior change is intentional.
- Add or update model-consistency scenarios when a stable recommendation, ranking, or explanation field should not drift.
- Keep skipped targets meaningful. Do not add direct-test recommendations for DTOs, constants, generated files, or UI components without a repository convention that makes them valuable.

## Adapter Changes

Adapters should emit the shared audit model and stay scoped to their project root.

- Mixed-language projects inside one build root belong to one adapter audit.
- Multiple independent project roots should be detected first, then audited through matching adapters.
- Unsupported projects should report ecosystem, language, marker evidence, and support-status reasons.
- Do not let one adapter infer facts for another ecosystem.

## Generation Changes

Native test generation is intentionally deferred until adapter-specific rules and repair-loop coverage exist.

Generation work should include:

- a deterministic plan item source
- adapter-specific conventions
- fixture coverage
- command verification behavior
- risk reporting for skipped or deferred work

## Release Readiness

Before publishing or tagging:

```powershell
npm run release:check
```

That command runs tests, golden snapshot checks, model-consistency checks, smoke checks, package contents checks, and binary entrypoint checks.
