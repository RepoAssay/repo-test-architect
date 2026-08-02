# Adapter Portfolio Analysis — August 2026

## Decision

Repo Test Architect should not start an eleventh adapter or ship native generation next.

The review ranked product investment order as:

1. promote Elixir through the existing supported-adapter corpus gate
2. reduce cross-adapter maintenance and measured large-repository latency through small shared primitives and adapter-local indexing
3. evaluate one bounded executor loop without enabling generation in the product
4. select any new ecosystem only after explicit demand collection, with C++/CMake and Dart/Flutter as different-cost discovery candidates

Adapter-specific framework expansion remains reactive: a demonstrated false high-confidence result, incorrect command, or strong user request can move a bounded slice earlier, but unsupported breadth alone does not.

Progress since the review baseline: the three Elixir corpus roles passed all 21 standardized areas and Elixir is now supported without semantic widening. The active order therefore starts with the shared-kernel and Swift/Python latency work at item 2.

The separate release/communication track should record the already planned live-audit video after Elixir promotion and use the next public-alpha post to ask which missing ecosystems are blocking adoption. That produces better demand evidence than inferring an adapter order from overall package downloads or repository stars.

## Evidence Base

This review uses the repository state at master commit `b90a0552fa850a4a9f516dffa22fdb8c15b0d6f9` on 2026-08-02.

- At the review baseline, the registry contained ten adapters: nine supported and Elixir experimental.
- Every supported adapter has three exact-commit corpus roles: conventional library/service, framework-heavy application, and difficult ownership graph.
- The supported corpus has 27 cases and 189 reviewed scorecard results: 189 pass, zero fail, zero pending.
- Jason, Plug, and Absinthe subsequently formed the complete Elixir promotion cohort with 21 of 21 freshly measured scorecard areas passing.
- Every adapter has shared conformance, implementation coverage, golden/model-consistency behavior, packaging checks, and a generated 400-source/200-test semantic/performance gate.
- At that review baseline, the suite had 1,345 tests across 103 suites.
- The primary runtime `audit.js` implementations contain 15,156 lines and their primary audit tests contain 13,621 lines. These conservative counts exclude helper modules and the JavaScript TypeScript mirror; they are a maintenance signal, not a quality score.
- The repository issue tracker currently has no adapter requests. Absence of requests is not evidence of absence of demand; it means there is no defensible issue-backed language ranking yet.

Corpus timings are stored exact-pin observations, while generated timings below are one local comparison run. They are useful for identifying outliers, not for ranking language quality or promising universal latency.

## Portfolio Snapshot

| Adapter | Maturity | Project types / frameworks | Corpus or live roles | Implementation / test lines | Primary test cases | Coverage L/B/F | Generated 400/200 | Largest recorded real audit |
| --- | --- | ---: | --- | ---: | ---: | --- | ---: | ---: |
| JavaScript/TypeScript | supported | 4 / 10 | 3 corpus | 2,321 / 1,935 | 57 | 95.26 / 89.65 / 96.95% | 233 ms | 400 ms |
| C#/.NET | supported | 2 / 3 | 3 corpus | 1,795 / 1,675 | 62 | 98.33 / 91.13 / 95.15% | 864 ms | 196 ms |
| Elixir | supported | 1 / 1 | 3 corpus, 21/21 pass | 529 / 500 | 26 | 98.68 / 89.52 / 98.80% | 129 ms | 899 ms |
| Go | supported | 1 / 1 | 3 corpus | 1,892 / 1,345 | 42 | 96.56 / 90.47 / 99.49% | 279 ms | 1,031 ms |
| Kotlin/JVM | supported | 5 / 5 | 3 corpus | 1,466 / 1,371 | 68 | 96.32 / 95.19 / 98.21% | 235 ms | 873 ms |
| PHP | supported | 1 / 1 | 3 corpus | 669 / 538 | 27 | 98.21 / 88.19 / 97.67% | 48 ms | 83 ms |
| Python | supported | 4 / 5 | 3 corpus | 2,028 / 1,718 | 50 | 97.63 / 88.65 / 96.79% | 50 ms | 3,786 ms |
| Ruby | supported | 1 / 2 | 3 corpus | 1,465 / 1,513 | 33 | 98.29 / 92.92 / 97.44% | 34 ms | 59 ms |
| Rust | supported | 2 / 1 | 3 corpus | 1,189 / 773 | 19 | 99.33 / 91.31 / 100.00% | 61 ms | 483 ms |
| Swift | supported | 4 / 9 | 3 corpus | 1,802 / 2,253 | 49 | 97.11 / 93.48 / 100.00% | 429 ms | 14,484 ms |

The generated checks all preserve 200 covered, 200 untested, and 200 evidence relationships; Rust additionally preserves one skipped wiring target. The real-repository column is not size-normalized. Swift Package Index Server and Django are much larger than the smallest Ruby and PHP pins, which is precisely why they are useful interactive-latency pressure cases.

## What The Numbers Mean

### Maturity

The ten supported adapters are equivalent at the shared promotion contract: each has 21 of 21 reviewed corpus areas passing. Their ecosystem boundaries differ substantially, so “supported” means the documented bounded matrix rather than equal language completeness.

Elixir was the clear administrative outlier at the review baseline. Jason, Plug, and Absinthe fill the same three distinct roles, their freshly repeated native suites pass, their standardized audits are deterministic, and all 21 corpus cells pass under the shared rubric. The registry and public-claim promotion has now closed that gap without semantic expansion.

### Breadth And Precision Risk

- JavaScript/TypeScript has the broadest package/runner/module surface and the largest implementation. Its 53 adapter-touching commits reflect both age and the cost of ESM/CommonJS, workspace, alias, browser, and framework boundaries.
- Swift spans SwiftPM, Xcode, Bazel, Vapor, nine test-framework signals, and the largest primary test file. Its 14.5-second real corpus case is the strongest current latency signal.
- Python combines dynamic packaging, pytest configuration, fixture flow, nox/tox, and three web frameworks. Django's 3.8-second audit and 4,960 evidence links justify profiling before deeper framework expansion.
- Kotlin and C# carry the heaviest static build-graph ownership risks. Their blockers against arbitrary Gradle/Maven/MSBuild evaluation remain features of the trust model, not missing checkboxes to erase.
- Go and Rust are deliberately type-inference-light. Their remaining receiver, trait, macro, feature, and build-target gaps should widen only through exact repository pressure.
- Ruby and PHP are relatively compact at runtime but retain intentionally strong blockers around dynamic DSLs, Rails/Pest, setup orchestration, and deeper helper flow.
- Elixir is compact and well covered, but macro/framework reachability remains deliberately outside direct evidence even after local ExUnit wrapper discovery.

Evidence relationship totals cannot be compared as coverage percentages. Repository sizes and idioms differ, and naming evidence is intentionally weaker than called/asserted evidence. The trustworthy comparison is whether each adapter preserves provenance and uncertainty inside its declared boundary; the corpus says all supported adapters currently do.

### Maintenance Cost

The primary runtime adapter and audit-test surface is now 28,777 lines before helper modules and the JavaScript TypeScript mirror. Historical adapter/test churn totals roughly 36,921 additions and 3,443 deletions; JavaScript, Swift, Kotlin, and C# have the most adapter-touching commits. New adapters copy some recurring mechanics—safe traversal, path normalization, file indexing, deterministic ordering, masked-region scanning, and evidence aggregation—but language grammar and build ownership differ too much for one universal parser.

The right response is a staged shared kernel, not a rewrite:

1. inventory only behavior that is already identical across at least three adapters
2. extract portable traversal, normalized path/file indexes, deterministic collection helpers, and measurement hooks behind existing digests
3. keep language-specific lexical masking, build metadata, symbol ownership, and framework logic adapter-owned
4. profile exact large corpus pins before changing algorithms
5. require unchanged canonical artifacts and no material corpus regression for every extraction

### Demand And Missing Ecosystems

Current internal demand evidence is insufficient to select a new language: the issue tracker has no adapter requests, while package downloads and repository interest indicate product traction but not which stack failed to install.

External ecosystem evidence provides a shortlist, not authorization. [GitHub's 2025 Octoverse analysis](https://github.blog/news-insights/octoverse/what-the-fastest-growing-tools-reveal-about-how-software-is-being-built/) places TypeScript, Python, JavaScript, Java, C#, PHP, C++, and Go among the ten most-used languages; this portfolio already covers all of those except C++. Shell and HCL also appear in that top ten, but their test architecture is usually owned by another runtime and is a poorer fit for a source-to-test adapter. Separately, Flutter's official ecosystem page describes [more than 20,000 packages, plugins, and integrations](https://flutter.dev/ecosystem), making Dart/Flutter a plausible bounded mobile/multiplatform candidate even though it is not the largest missing GitHub language.

| Candidate | Reach signal | Plausible first boundary | Cost/risk | Decision |
| --- | --- | --- | --- | --- |
| C++/CMake | strongest missing mainstream language signal | one literal CMake project, conventional sources, GoogleTest or Catch2, exact CTest command | very high: CMake evaluation, headers, targets, macros, generated code, toolchains | discovery candidate only; require representative repositories and demand |
| Dart/Flutter | large package/plugin ecosystem and clear mobile gap | one `pubspec.yaml`, `lib/`, `test/`, `package:test` or `flutter_test`, exact `dart test`/`flutter test` selection | medium: generated code, platform folders, widget/integration test split | lower-risk discovery candidate after demand collection |
| Android extension | expands an existing language surface | bounded Android Gradle module plus local JVM/instrumented test separation | very high: variants, AGP, devices/emulators, resources | separate Kotlin product decision, not incidental widening |
| Shell/Bats | Shell is widely used | one script tree and Bats tests | medium semantics, lower source-ownership value | wait for a concrete request |
| HCL/Terraform | HCL is widely used | configuration ownership plus tests in another language | poor fit for current source/test contract | do not prioritize as a language adapter |

Scala, Clojure, Lua, Perl, Zig, and other ecosystems remain valid requests, but no current repository-owned demand signal distinguishes them.

## Ranked Investment Plan

### 1. Promote Elixir Without Further Semantic Expansion

Why first: it converts already completed work into a consistent public claim at the lowest risk and closes the only maturity inconsistency.

Slices:

1. Complete: add Jason, Plug, and Absinthe as the three exact Elixir corpus roles with full commit SHAs, support boundaries, and report links. Their current semantic observations are recorded with all scorecard areas pending until freshly measured through the standard corpus tool.
2. Complete: clone each exact pin cleanly, run five standardized audits, record canonical digests, raw durations, medians, candidate/evidence counts, and reviewed command outcomes. All seven areas pass for all three cases, and post-native audits retain the same digests.
3. Complete: after 21 of 21 passed, change Elixir to supported in registry, README, status, scorecard, and support documentation. Re-run the exact release gate.

Acceptance:

- three full-SHA roles and 21 reviewed passes
- no adapter behavior widened merely to make a score pass
- native commands remain consistent with the three reports
- shared conformance, generated performance, native fixture, package, Windows, alpha, and release gates pass

### 2. Build A Small Shared Audit Kernel And Profile Large Repositories

Why second: it improves all ten adapters and controls the cost of future breadth. The goal is safer maintenance and faster interactive audits, not fewer files for its own sake.

Slices:

1. Publish a duplication inventory that classifies traversal/path/index, balanced-region, lexical, build-ownership, and evidence code as shareable or adapter-owned.
2. Extract one behavior-identical portable traversal and normalized file-index primitive, migrate two low-risk adapters first, and prove byte-identical artifacts before wider adoption.
3. Add five-run phase timing around traversal, project parsing, source indexing, test parsing, and evidence joining for development/performance scripts without changing public artifacts.
4. Profile Swift Package Index Server and Django at their pins. Replace repeated scans with adapter-local indexes/caches where the profiles prove a hotspot.

Acceptance:

- canonical corpus digests unchanged for refactor-only slices
- no supported corpus median regresses by more than 10% in a same-machine five-run comparison
- identified repeated-scan hotspots improve materially or receive a documented reason not to change
- language-specific parsing does not move into a lowest-common-denominator universal parser

### 3. Run A Bounded Executor Evaluation, Not Product Generation

Why third: generation could add substantial user value, but shipping it before convention, repair, and safety evidence would undermine the audit's trust advantage.

Scope:

- consume one selected stable plan item; never re-audit or reinterpret ownership
- start with a low-complexity checked-in JavaScript/TypeScript fixture because it is the default and broadest current user path
- allow writes only to the intended generated test file in a temporary copy
- run the exact adapter-owned command, permit at most one bounded repair, and record compile/assertion failures, unrelated edits, elapsed time, and contradictions of audit evidence
- keep `generate_selected_test` returning `generation-deferred/v1`

Acceptance before any product enablement:

- a versioned executor-evaluation contract and deterministic fixture set
- explicit convention adherence and unrelated-edit checks
- recoverable failure/repair behavior
- evidence that more than one replaceable executor profile can consume the same audit facts without changing them

### 4. Collect Demand, Then Choose One Discovery Spike

Why fourth: an eleventh adapter increases permanent maintenance. Current ecosystem popularity narrows the candidates, but current user evidence does not select one.

Actions:

- use the next captioned live-audit post to ask for language, build system, test framework, and a representative repository
- keep the GitHub feature-request form as the durable input
- record declined installs or unsupported-project detections when users volunteer them; do not add network telemetry
- choose one discovery spike only when at least one concrete user/request signal and three viable public repository roles exist

Decision rule:

- choose C++/CMake when reach demand is strong enough to justify the higher ownership cost
- choose Dart/Flutter when mobile/multiplatform demand is present and a smaller bounded adapter is more valuable than maximum language reach
- prefer extending an existing adapter only when the requested project shape shares real ownership semantics; Android does not automatically qualify

### 5. Keep Framework Expansion Evidence-Triggered

Existing exclusions are not a queue to implement in order. Rails, Pest, Phoenix/Ecto, Android, broader browser reachability, arbitrary build evaluation, deeper type inference, and macro expansion all carry false-confidence risk. A slice enters the queue when it fixes a demonstrated false claim/blocker on a representative repository or answers repeated user demand with a bounded positive and negative rule.

## Near-Term Sequence

The recommended concrete sequence is:

1. Elixir corpus manifest with pending measurements — complete
2. Elixir standardized measurements and 21-area review — complete
3. Elixir supported promotion — complete
4. record the pinned live-audit video and prepare the next public-alpha announcement/request for adapters
5. shared-kernel duplication inventory and phase instrumentation
6. first byte-preserving traversal/index extraction
7. Swift/Python large-repository latency slice based on profiles
8. executor-evaluation contract and first fixture experiment
9. demand review and a go/no-go decision for C++/CMake, Dart/Flutter, an existing-adapter expansion, or no new ecosystem yet

This sequence deliberately separates promotion, communication, refactoring, performance, experimental execution, and ecosystem expansion so each can remain one reviewable PR slice with its own evidence.

## Revisit Triggers

The ranking should change when any of the following occurs:

- a supported adapter makes a reviewed false high-confidence ownership, command, or evidence claim
- a material security or release regression appears
- repeated user requests identify one unsupported ecosystem or framework
- large-repository profiling shows an interactive audit is materially slower than the current pins
- executor evaluation demonstrates safe, repeatable value or reveals missing audit-contract fields
- beta evidence requires a different product milestone than the current public-alpha plan
