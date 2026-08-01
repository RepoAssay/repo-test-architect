# Near-Term Roadmap

This roadmap tracks the next practical milestones before Repo Test Architect should claim broader adapter support or native test generation.

The first public alpha is shipped. Seven supported adapters have completed the measurable [Adapter Hardening Plan](adapter-hardening-plan.md), most recently bounded C# and Rust. See [Alpha Readiness](alpha-readiness.md) for the standing product acceptance gates and the [Release Lifecycle](release-lifecycle.md) for the flexible alpha, beta, release-candidate, and `1.0` planning windows.

## Current Baseline

The repository is public, `repo-test-architect@0.2.0` is the current public alpha through npm, and `io.github.RepoAssay/repo-test-architect@0.2.0` is the matching Official MCP Registry version.

The useful baseline is:

- deterministic JavaScript/TypeScript audit pipeline
- supported Swift, Python, and bounded Kotlin/JVM adapters
- supported bounded Go module adapter with literal repository-contained `go.work` ownership and explicit static build-target selection
- supported bounded Rust adapter for conventional Cargo packages, literal repository-contained workspace members, and built-in tests
- polyglot project detection with unsupported-project reporting
- project-level ranking, planning, provider-neutral execution hints, placement, stats, and local MCP tool calls
- disabled-by-default local MCP diagnostics, safe internal-error report IDs, runtime checks, and inspectable sanitized bundles
- model-consistency scenarios for stable audit and plan outputs
- release gate through `npm run release:check`
- native test generation intentionally deferred

## Release Progression

The current planning target is to keep the public alpha active through at least mid/late September 2026, begin beta in late September or October if its evidence gates pass, and consider `1.0.0` in November or December at the earliest. These are owner-controlled planning windows rather than delivery promises: strong evidence can justify a documented acceleration, while unresolved trust work can delay promotion for as long as necessary. The normative stages, version lines, cadence, and promotion gates live in the [Release Lifecycle](release-lifecycle.md).

### Future Release Automation

OIDC-based GitHub Actions publication is a future operational improvement rather than a beta or `1.0` blocker. The proposed protected `publish.yml` flow would replace repeated npm and MCP browser authentication with short-lived, on-demand identities after one release-environment approval, while preserving exact-commit three-OS gates, clean registry verification, and GitHub release creation. Its public-repository security requirements and manual fallback are defined in [Distribution](distribution.md#deferred-oidc-release-automation); implementation can wait until release frequency makes the current owner-driven process meaningfully costly.

## Milestone 1: Alpha Test Architecture Audit

Goal: make the audit trustworthy enough for a technical lead to run on a real repository and review with a team.

Acceptance:

- real-repo audit reports exist for representative repositories
- coverage value, covered-but-risky targets, skipped low-value targets, blockers, and risks are visible
- placement findings can explain conservative `keep`, `move`, and `split` decisions
- one concise repo-level summary can show top findings with evidence
- native generation remains deferred

## Milestone 2: Public Demo Polish

Goal: make the current audit-first value easy to show without implying generation is complete.

Acceptance:

- demo commands stay covered by `npm run demo:check`
- docs explain that generation is deferred
- README points to the demo path, product positioning, and release gate
- before the next public-alpha announcement, record a concise captioned audit of a pinned public repository that shows project detection, the exact verification command, one high-value untested target, one proven existing-test relationship, and a conservative exclusion; attach it to the LinkedIn post with the install command and repository link
- package and MCP Registry identities stay locked by the distribution checks

### Output Format Roadmap

Keep the versioned JSON artifact as the canonical source of audit facts. Additional formats are presentation-only renderers and must not reclassify candidates, change scores, omit machine-readable provenance, or produce recommendations that disagree with JSON.

Preferred implementation order:

1. CSV for deterministic spreadsheet and BI workflows.
2. HTML for navigable reports with expandable evidence.
3. PDF generated from the HTML renderer for sharing and archival, rather than a separate report implementation.
4. SARIF only after audit findings map cleanly to code-scanning semantics without overstating advisory findings as defects.

Potential CLI shape:

```powershell
repo-test-architect audit . --format csv
repo-test-architect audit . --format html --output audit.html
repo-test-architect audit . --format pdf --output audit.pdf
```

Markdown and JSON remain the supported formats until each additional renderer has deterministic fixtures and cross-format consistency tests.

#### Future Scorecard Visualization

The deterministic Markdown and `validation-scorecard/v1` JSON views now provide the scorecard contract for each adapter and pinned corpus case. Run `npm run corpus:scorecard` for the human-readable matrix or add `-- --format json` for the versioned derived artifact.

A later HTML renderer should present the same contract as a compact card. The card may use a repository-native assay seal, segmented ring, or similarly distinct corner badge instead of a generic star rating. Its visual language should remain recognizable as an audit result rather than a popularity or product-review score.

Every renderer must show two separate measures:

- **review completeness**: reviewed scorecard areas divided by the seven defined areas, such as `5/7 reviewed`
- **reviewed pass rate**: passing areas divided by reviewed areas, such as `5/5 reviewed checks pass`

These measures must never be collapsed into an unexplained repository-quality percentage. A repository with five passing and two pending areas is `71% reviewed` with a `5/5` reviewed pass rate, not “71% quality.”

Detection, ownership, command, evidence, ranking, stability, and performance each retain visible `pass`, `pending`, or `fail` text in the current scorecard. Future icons can reinforce those areas—for example search, repository boundary, terminal, linked evidence, ranking bars, fingerprint, and speedometer—but color or icon shape must not be the only state indicator. The design should remain accessible, printable through the later PDF renderer, and deterministic from `validation-corpus/v1`; it must not create new scores or alter the canonical corpus data.

## Milestone 3: Adapter Spike Hardening

Goal: prove the adapter contract keeps holding as additional ecosystems move from detection-only to audited fixtures.

Status: Swift, Python, bounded Kotlin/JVM, bounded Go, bounded C#, and bounded Rust have reached supported alpha maturity, and the seven-adapter hardening gate is complete. Go passes standalone, two-module `go.work`, explicit build-target, parser-owned same-package and module-local source-dependency, bounded standard-library/Testify assertion usage, lexical masking, parser-scoped local and receiver bindings, generic-function, explicit, exact-constructor, and statically typed test-helper receiver-method evidence, multi-callable body-ownership, and generated 400-source/200-test performance fixtures plus all three pinned live roles against `BurntSushi/toml`, `go-chi/chi`, and `riverqueue/river`. Post-promotion Zap and Resty pressure additionally recovered exact dot-import, concrete constructor-result, bounded cross-package, assertion-usage, callable-owned, and test-helper-owned evidence. See [Go Alpha Support](go-alpha-support.md).

The supported bounded Rust adapter covers conventional Cargo packages, literal repository-contained workspace members with exact package commands, the built-in `#[test]` harness, inline `#[cfg(test)]` modules, exact integration-test crate-module imports and unconditional crate-root symbol re-exports, production exclusion for exact external `#[cfg(test)]` module graphs, native Cargo verification, golden artifacts, shared conformance, and a generated 400-source/200-test semantic/performance gate. serde_json, Starship, and ripgrep fill all three live roles with 21/21 scorecard areas passing; globbed or incomplete workspaces, custom harnesses, nonstandard async/property frameworks, doctest evidence, and deeper receiver/trait/re-export ownership remain later slices. See [Rust Alpha Support](rust-alpha-support.md).

The C#/.NET adapter is now supported at bounded alpha maturity for one static SDK-style test project or one unique literal production/test edge. Nine pinned live probes cover deterministic ownership amid unrelated projects, inherited and central metadata, literal multi-target and target-conditioned packages, xUnit/NUnit/MSTest, native Microsoft.Testing.Platform hosts, exact assertion/evidence pressure, one-hop target aliases, and linked compile ownership. TDD, usbipd-win, and Sharp Cast fill the three shared validation-corpus roles with all 21 C# areas passing, and the generated 400-source/200-test semantic/performance gate runs cross-platform. Solution ownership, broader evaluated MSBuild ownership, framework compatibility inference, transitive project edges, deeper helper/result flow, conditional/overridden central versions, and broader test-platform variants remain outside the supported boundary; see [C# Alpha Support](csharp-alpha-support.md).

Rust has reached supported parity. Ruby is now the active experimental adapter: its conventional Bundler/Minitest/RSpec foundation is checked in with native-fixture, shared-conformance, implementation-coverage, golden, model, and generated performance gates. The pinned rubyzip audit passed 412 native tests and locks exact runner, root-gemspec, require/constant, singleton-call, assertion, and direct immutable constructor-local receiver rules. The pinned Faraday audit passed 639 native RSpec examples and locks one exact root `.rspec` helper plus exact one-line `let`/`subject` constructor receivers, improving three reviewed relationships while excluding generated service methods. Factory Bot passed 764 adapter-selected RSpec examples plus its broader upstream task and locks nearest exact constant-owned `described_class` plus conservative memo boundaries. The fourth Diplomat pin passed 281 RSpec examples and now locks both a complete two-gemspec named aggregate and exact per-file `spec_helper` loading, moving from 9/20/3 to 8/21/3 with six exact relationships while rejecting its dynamic source fan-out. Dinie then passed 579 examples and locks exact same-group RSpec helper constructor returns, strengthening three reviewed relationships without changing its 26/19/11 candidate split or 47-link graph; CGRateS passed 27 examples as a no-change lexical-constant control. Shared-example binding is the next evidence decision before Rails and the formal promotion corpus. PHP then Elixir remain the provisional next-adapter sequence, while representative public repositories and concrete requests can still reorder demand.

Useful hardening targets:

- Go parameter/field receiver identity, complex or chained helper-return flow, helper assertions, interface dispatch, and deeper dependency graphs remain excluded after parser-backed local, helper-result, and callable-body ownership
- Kotlin/JVM with Gradle/Maven, bounded single-module and settings-owned all-KMP literal-JVM-target graphs with source-set-qualified API traversal, JUnit variants, bounded Kotest common specs, conventional Spock features, and method-level TestNG
- Swift Package Manager with XCTest, Swift Testing, Quick/Nimble, and SnapshotTesting signals
- Python fixture reachability, async/parametrized/property-based pytest conventions, Django/Flask routes, tox/nox commands, coverage configuration, and no-tests-yet blocker behavior

Python's supported boundary and known exclusions are tracked in [Python Alpha Support](python-alpha-support.md). Kotlin/JVM's conventional Gradle/Maven, directly declared aggregate, exported-transitive dependency, single-module and settings-owned all-KMP literal-JVM-target ownership with cycle-safe source-set `api` traversal, JUnit, bounded Kotest common-spec, conventional Spock feature, and method-level TestNG boundary is tracked in [Kotlin/JVM Alpha Support](kotlin-jvm-alpha-support.md); computed/nested Maven reactors, inherited/dynamic dependencies, custom/composite or mixed KMP Gradle graphs, Android, broader KMP shapes, and additional Kotest/Spock/TestNG semantics remain post-promotion pressure.

### Adapter Reuse Boundary

The expected architecture is mostly shared product infrastructure with an ecosystem-specific evidence collector at the bottom. As a planning estimate, roughly 70-80% of the product should remain reusable across adapters, while roughly 20-30% will vary by language, build system, and test framework. These percentages are directional rather than release metrics and should be revisited after a second adapter reaches supported maturity.

Shared core responsibilities include:

- versioned audit, explanation, ranking, plan, placement, findings, and stats artifacts
- normalized evidence concepts such as relationship kind, strength, direct usage, and indirect entrypoint usage
- candidate scoring, risk classification, project aggregation, reporting, CLI/MCP transport, model-consistency checks, and readiness gates

Adapter-owned responsibilities include:

- project/build metadata, source sets, module resolution, exports, packages, and target ownership
- framework and test-command detection
- language-aware source classification and generated/DTO/wiring conventions
- proof that a test references, calls, asserts, or reaches a source target

Adapters should normalize their evidence into the shared contract instead of copying JavaScript implementation techniques. Python, Kotlin/JVM, and Swift may use parser, compiler, language-server, or build-tool APIs where those provide safer symbol and call resolution than lightweight text analysis.

Target pipeline:

```text
adapter-owned repository and test evidence
                  -> shared normalized audit graph
                  -> shared ranking, reporting, planning, stats, and review
```

Acceptance:

- adapter emits the shared audit model
- adapter documents which evidence fields it can prove and which remain unavailable or structural-only
- language-specific analyzers do not change shared evidence semantics
- unsupported-to-supported transition is visible in project detection
- golden audit and plan snapshots exist
- model-consistency scenario covers adapter-specific recommendations
- release gate still passes through `npm run release:check`
- native generation remains deferred unless adapter-specific repair-loop tests exist

## Milestone 4: Placement And Boundary Analysis

Goal: move beyond candidate ranking into repo-structure advice.

Acceptance:

- placement findings can recommend `keep`, `move`, or `split`
- package ownership is preserved in project-derived artifacts
- app-level tests that belong in package-level test targets are reported conservatively
- findings include reason text and risk notes instead of automatic rewrites

## Milestone 5: Local MCP Transport

Goal: keep the local stdio MCP SDK wrapper aligned with the deterministic tool dispatcher.

Status: wired for local stdio through `@modelcontextprotocol/sdk`.

Acceptance:

- tool descriptors remain deterministic
- local stdio server exposes the same tool names
- no remote repo upload is required
- client config docs stay aligned with package binaries
- smoke and release checks cover the boot path

### Host-Owned Model And Subagent Orchestration

The MCP server should expose deterministic repository evidence and advisory execution hints, while the installing CLI or agent host owns model selection, token and cost budgets, permissions, context management, and subagent lifecycle. Repo Test Architect must not silently call paid models or spawn opaque workers behind an MCP tool invocation.

The first companion `plan-execution-hints/v1` artifact now helps capable hosts route `plan/v1` or `project-test-plan/v1` work without naming a provider or forcing one orchestration strategy. It includes:

- `complexity`: bounded low, medium, or high implementation difficulty
- `contextScope`: the minimum source, test, build, and documentation paths needed
- `parallelizable`: whether the item can safely run independently of other plan items
- `recommendedAgentRole`: implementation, repository reasoning, or review
- `requiresRepositoryReasoning`: whether deterministic evidence is insufficient by itself

These fields remain advisory. Clients may ignore them and receive the same audit and plan facts either way. The intended cost shape is deterministic MCP analysis first, inexpensive summarization or routine implementation where appropriate, and stronger reasoning models only for ambiguous architecture, difficult generation, repair, or final review.

Acceptance for the first routing artifact:

- hints derive deterministically from existing audit evidence
- no hint selects a vendor, model name, or price tier
- the MCP server performs no hidden model or subagent calls
- clients that ignore hints preserve identical audit and plan semantics
- model-consistency fixtures lock the routing fields before clients depend on them

Status: met for the companion artifact through shared derivation, CLI and MCP exposure, and JavaScript, Python, Swift, and Kotlin model-consistency locks. Host-specific routing policy and actual subagent lifecycle remain outside Repo Test Architect.

## Milestone 6: Generation Readiness Gate

Goal: define the minimum proof needed before native test generation is enabled.

Acceptance:

- generation consumes a selected stable audit or plan item without rediscovering repository facts
- adapter-specific generation policy exists
- generated tests reuse discovered conventions
- model- or agent-specific instructions live in replaceable executor profiles
- repair loop only edits generated test files by default
- fixtures cover compile failures, assertion failures, and skipped recommendations
- evaluation records convention adherence, unrelated edits, verification results, repair attempts, and contradictions of audit evidence
- risk report explains what was generated, skipped, repaired, and still risky

Native generation should remain off until this gate is met.
