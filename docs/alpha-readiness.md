# Alpha Readiness

This milestone defines a useful private alpha for Repo Test Architect.

The alpha goal is not native test generation. The alpha goal is a credible local test architecture audit that a technical lead can run on a real repository and trust enough to discuss with a team.

## Product Promise

Repo Test Architect should answer four questions from repository evidence:

- Which important behavior lacks meaningful test coverage?
- Which existing tests are valuable but likely incomplete?
- Which tests appear misplaced for the project or package structure?
- Which files are low-value direct test targets and should be covered indirectly, if at all?

Generated tests can come later. The alpha is successful when the audit tells a user where test investment will reduce risk and where more tests would mostly add churn.

## Alpha User

The first alpha user is a senior engineer, tech lead, or staff engineer who can run a local CLI on a repo and evaluate whether the findings match reality.

The output should be useful even when the user disagrees with a recommendation. Every important finding should expose the evidence and confidence behind it so the user can decide whether the heuristic is wrong, incomplete, or useful.

## Acceptance Gates

Run the deterministic private-alpha gate with:

```powershell
npm run alpha:check
```

This verifies the test suite, golden audit artifacts, model-consistency locks, public demo path, and local MCP transport. Package publishing checks remain part of `release:check`, not the private-alpha gate.

### Current Readiness Verdict

The deterministic gate passes locally. Repo Test Architect is therefore a private-alpha candidate for the explicitly detected patterns in the [JavaScript/TypeScript Alpha Support](javascript-typescript-alpha-support.md) and [Swift Alpha Support](swift-alpha-support.md) matrices, subject to human review of the real-repository reports.

This verdict does not mean:

- npm package or public release readiness
- universal JavaScript test-runner support
- proof that structural test evidence asserts every important branch
- native test generation readiness

While repository GitHub Actions are disabled under the temporary $0-budget policy, alpha changes require a passing local `npm run alpha:check` and a PR that records the local-verification exception.

### Real Repo Audit Reports

- at least three real repositories are audited and summarized in checked-in reports; current progress is tracked in [Real Repository Audit Reports](real-repo-audit-reports.md)
- reports include what the tool found, what it missed, and what heuristics need adjustment
- reports cover at least one JavaScript/TypeScript repo and one Swift or JVM repo
- reports do not require remote services or source upload

### Coverage Value Audit

- audit output separates untested candidates, covered-but-risky candidates, skipped low-value targets, blockers, and risks
- recommendation reasons cite concrete source, framework, and test-location signals
- DTOs, generated-style files, wiring, simple views, and pass-through code are not promoted as direct test targets without repo evidence
- existing matching tests are treated as evidence, not proof that coverage is complete

### Placement And Structure Audit

- project-derived placement findings can explain `keep`, `move`, and `split` decisions
- package or project ownership stays visible in cross-project findings
- app-level integration tests that cover package-owned behavior are reported conservatively
- findings remain advisory and never rewrite test files automatically

### Common Stack Depth

- JavaScript/TypeScript and Swift are supported proof points
- both support promises are bounded by checked-in alpha matrices rather than broad ecosystem claims
- Kotlin/JVM and Python remain experimental but have enough fixture variety to prove the shared audit model
- Swift support is bounded by the checked-in [Swift Alpha Support](swift-alpha-support.md), including explicit Objective-C and computed-build-graph exclusions
- adapter support is described by detected frameworks, commands, source layouts, and blockers instead of broad language claims
- unsupported ecosystems are still reported honestly with detection evidence

### Trust And Review UX

- one command can produce a concise repo-level summary of top findings
- each top finding links back to the source target, matching tests if any, rationale, and recommended test level
- low-confidence or blocked projects are clearly separated from high-confidence recommendations
- model-consistency scenarios lock the fields that would change user trust if they drifted

## Non-Goals For Alpha

- native test generation
- automatic file rewrites or test moves
- remote analysis or source upload
- universal language coverage
- percentage-style coverage replacement
- claiming that every recommended test is definitely worth writing

## First Alpha Demo Story

Run the tool locally on a real repo and show:

1. test targets that are already covered but still risky
2. important behavior with no matching test
3. low-value direct test targets that were skipped
4. misplaced or cross-owner tests that should be kept, moved, or split
5. blockers where the repo has no supported test framework or runnable command

The key message is: this is a test architecture audit layer that makes test generation, manual test writing, and test review aim at better targets.

## Next Implementation Priorities

Done:

- Add a concise repo-level top findings report for project audits, including category counts for missing coverage, weak existing coverage, misplaced coverage, low-value direct targets, and blocked projects.
- Expand real-repo audit reports beyond owned/local repositories with small-library and multiple larger HTTP-framework JavaScript/TypeScript probes.
- Distinguish auxiliary docs, examples, playground, and benchmark workspaces before ranking missing-test infrastructure blockers.
- Require directory-qualified filename evidence for generic JavaScript/TypeScript source basenames.

Next:

1. Continue validating call- and assertion-aware source-to-test evidence across common JavaScript/TypeScript module and execution shapes.
2. Tighten placement findings beyond package/app root inference with more adapter-owned package-boundary signals.
3. Add more model-consistency scenarios for placement summaries as the finding surface grows.
4. Keep adapter hardening focused on common stack variants that improve real-repo audit trust.
