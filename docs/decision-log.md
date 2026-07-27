# Decision Log

This log records project-level decisions that shape architecture, scope, and public positioning.

## Audit Graph First

Decision: build a deterministic audit graph before asking a model to explain, prioritize, or generate.

Rationale: repository facts, framework signals, test commands, source classifications, blockers, and risk scores should be repeatable. Model output can vary in wording, but core recommendations should not drift without new evidence.

Revisit when: deterministic adapters can no longer express useful repository evidence without excessive complexity.

## JavaScript And TypeScript First

Decision: use JavaScript and TypeScript as the first supported adapter.

Rationale: the PC environment can run Node locally, fixtures are cheap to build, and the same adapter contract can later support Kotlin, Swift, and other ecosystems.

Revisit when: the JS/TS adapter contract is stable enough to make a second supported adapter cheaper than more JS/TS fixture work.

## Swift As The Second Supported Adapter

Decision: promote Swift to supported alpha maturity alongside JavaScript/TypeScript, bounded by the checked-in Swift alpha support matrix.

Rationale: Swift now exercises the full shared audit pipeline with deterministic SwiftPM, Xcode, Bazel, Vapor, reactive, and framework fixtures; golden audit and plan artifacts; model-consistency locks; blocker behavior; target-qualified symbol evidence; and pinned maintained-repository validation. RxSwift and SwiftNIO exposed and verified ownership boundaries that synthetic fixtures alone did not cover. This is enough to support popular inspectable patterns without claiming manifest execution, native Objective-C classification, or universal Xcode graph resolution.

Revisit when: common supported Swift shapes produce repeatable false ownership or coverage claims, or compiler/build-tool integration can replace conservative static evidence without weakening deterministic local operation.

## Polyglot Detection Before Universal Adapters

Decision: detect project roots and assign adapters per project instead of assuming one repository has one language.

Rationale: real repositories commonly mix frontend, backend, mobile, tooling, generated clients, and package-specific test commands. Project detection lets adapters stay isolated while the core layer handles repository-level ranking.

Revisit when: cross-project dependency analysis becomes necessary for recommendations that cannot be made from isolated project audits.

## Shared Audit Semantics, Adapter-Owned Proof

Decision: keep evidence collection ecosystem-specific while normalizing proven repository facts into shared audit semantics and shared downstream artifacts.

Rationale: languages differ materially in module resolution, build targets, symbol systems, test frameworks, and available compiler tooling. Reusing JavaScript heuristics would create weak or misleading adapters. The reusable product value lives above that boundary: evidence vocabulary, scoring, explanations, ranking, planning, placement, reporting, stats, model-consistency, CLI/MCP transport, and readiness gates.

Planning assumption: approximately 70-80% of the product architecture should remain shared and approximately 20-30% should be adapter-specific. This is directional and must be validated when another adapter reaches supported maturity.

Revisit when: a supported non-JavaScript adapter demonstrates that shared semantics prevent accurate ecosystem-specific evidence, or measured implementation effort differs materially from the planning assumption.

## Harden Supported Adapters Before Adding Ecosystems

Decision: after the first public alpha, prioritize deeper validation and conservative evidence for JavaScript/TypeScript, Python, Swift, and bounded Kotlin/JVM before adding another language adapter.

Rationale: the current four adapters cover a broad share of likely repositories. Improving project ownership, command accuracy, source-to-test evidence, blocker behavior, real-repository validation, and performance now creates more user trust than adding a shallow fifth adapter. The [Adapter Hardening Plan](adapter-hardening-plan.md) defines the corpus, scorecard, bounded slices, and pull-request routine.

Revisit when: all four adapters meet the hardening definition of done, or repeated user demand identifies an unsupported ecosystem whose value clearly exceeds the remaining trust work.

## Go As The Fifth Adapter Spike

Decision: begin the next ecosystem with a bounded experimental Go adapter for conventional single-module `go.mod` projects and standard-library tests.

Rationale: Go has strong static project, package, test-file, runnable-test, and command conventions. It exercises package-colocated tests and external `_test` packages while keeping the first build/test matrix smaller than .NET, Rust, or dynamic framework ecosystems. The first slice can therefore prove a useful `go-symbol-reference` relationship without executing repository code or weakening the shared evidence contract. The checked-in fixture subsequently passed native `go test ./...`, `go test -race ./...`, and `gofmt` validation with Go 1.26.5 on Darwin arm64.

Revisit when: common Go repositories show that alternate execution models must enter the bounded support claim.

## Preserve Go Workspace Module Ownership

Decision: parse bounded literal `go.work` `use` directives but continue auditing each declared `go.mod` as an independent project with its own module-local `go test ./...` command.

Rationale: Go workspaces activate multiple main modules without turning the workspace directory into one module. Preserving module roots keeps candidate paths, evidence, changed-file filtering, blockers, and commands attached to the source they own. Repository-contained single and block declarations are deterministic; omitted modules, escaping or absolute paths, missing module markers, and malformed declarations suppress commands instead of guessing.

Revisit when: pinned repositories show that repository-external workspace members, workspace `replace` effects, or an explicit aggregate execution strategy can be modeled without weakening ownership or portability.

## Promote Bounded Go To Supported Alpha

Decision: promote the bounded Go adapter from experimental to supported alpha maturity.

Rationale: the conventional-library, HTTP/service, and difficult-workspace roles are pinned and pass all 21 shared validation-corpus areas. Those reviews corrected real ownership and evidence gaps without leaving an unresolved command or direct-evidence upgrade. A generated 400-source/200-test module additionally locks 200 covered candidates, 200 untested candidates, zero skipped candidates, 200 evidence links, and a broad 5-second regression ceiling. The package, CLI, MCP, schema, documentation, conformance, coverage, and release checks now treat Go as a supported adapter while retaining the explicit exclusions in [Go Alpha Support](go-alpha-support.md).

Revisit when: repeated audits inside the documented boundary produce false ownership, verification-command, or direct-evidence claims, or when enough evidence supports expanding beyond static standard-library tests and bounded source relationships.

## Readiness-Gated Release Lifecycle

Decision: use flexible planning windows for public alpha, beta, release candidates, and `1.0`, while making readiness evidence—not a promised calendar date—the promotion authority. Keep the current `0.x` line as public alpha, target `1.0.0-beta.N` and `1.0.0-rc.N` as formal prerelease channels, and promote `1.0.0` to npm `latest` only after its stable gates pass.

Rationale: the product is owner-operated and can develop faster or slower than an initial estimate. Directional dates make sequencing visible, while adapter trust, real-user feedback, compatibility freezes, clean observation periods, and exact-commit distribution checks prevent a date from forcing an immature release. The release owners may accelerate when equivalent evidence already exists and the rationale is recorded, or delay without exception when more confidence is useful.

Revisit when: real release history shows that the planning windows, feedback thresholds, npm tags, or stable cadence in the [Release Lifecycle](release-lifecycle.md) no longer fit the product or its users.

## Local Stdio MCP First

Decision: start with local stdio MCP distribution rather than hosted remote MCP.

Rationale: repository audit needs local source, Git, and test execution context. Keeping repo access local reduces security risk and avoids uploading private source by default.

Revisit when: hosted features are limited to aggregate reporting, evals, policy packs, or model-consistency comparisons with authentication and least-privilege tool access.

## SDK Stdio Wrapper Over Deterministic Tools

Decision: mount the existing dependency-free tool descriptors and dispatcher through `@modelcontextprotocol/sdk` for local stdio transport.

Rationale: the deterministic tool surface should remain testable without transport dependencies, while the shipped MCP binary should use the official SDK protocol implementation.

Revisit when: SDK transport behavior conflicts with required client compatibility or a hosted transport is added.

## Host-Owned Model And Subagent Orchestration

Decision: keep model routing, token and cost budgets, permissions, context management, and subagent lifecycle in the MCP client or agent host. Repo Test Architect emits deterministic advisory `plan-execution-hints/v1` metadata, but its MCP tools do not silently invoke paid models or spawn opaque workers.

Rationale: Codex, Claude Code, Cursor, local agents, and future clients already have different orchestration and permission systems. Duplicating that control inside the MCP server would create double orchestration, hidden cost, provider coupling, and harder-to-reproduce behavior. The audit graph can reduce cost more effectively by proving repository facts before any model is selected and by describing task complexity, minimal context, parallel safety, and review needs in a provider-neutral form.

The companion hint artifact is derived from existing plan fields and leaves `plan/v1` and `project-test-plan/v1` unchanged. It describes bounded complexity, known context, parallel safety, a provider-neutral role, and repository-reasoning need. Clients may ignore it without changing audit or plan semantics.

Revisit when: multiple MCP hosts provide evidence that the current hint vocabulary is insufficient, or a separately authorized executor service is introduced with explicit budgets and observable model calls.

## Kotlin Multiplatform JVM As A Bounded Module-Graph Slice

Decision: own Kotlin Multiplatform when the audited root is one Gradle module, or a settings-owned aggregate whose complete set of conventional child modules are KMP modules, with conventional `commonMain`/`commonTest` and target-derived main/test layouts plus exactly one literal `jvm()` or `jvm("name")` declaration per source module. Aggregate verification uses module-qualified target tasks. Cross-module evidence starts from direct test-source-set dependencies or the test module's explicitly exported main dependencies, then follows cycle-safe literal `api(project(":module"))` edges within the common or JVM visibility graph.

Rationale: a literal JVM target provides a deterministic `<targetName>Test` task and a small source-set graph: `commonTest` reaches only `commonMain`, while the target-derived test source set reaches both common and target-specific production code. Kotlin's documented common-source-set propagation selects the dependency module's JVM variant for target tests, and its source-set DSL defines `api` as exposed while `implementation` remains internal. Complete settings ownership plus literal, source-set-qualified export traversal keeps the graph deterministic without treating mixed, remapped, computed, exclusion-bearing, or custom-hierarchy builds as generic multiplatform support.

Revisit when: representative public repositories justify deterministic support for computed or multiple JVM targets, custom source-set hierarchies, mixed aggregates, type-safe project accessors, or non-literal dependency declarations.

## Native Generation Deferred

Decision: keep `generate_selected_test` as a deferred artifact until adapter-specific generation rules and repair-loop coverage exist.

Rationale: useful test strategy is the differentiator. Generating tests before the audit is trustworthy risks producing meaningless tests, invented infrastructure, or false confidence.

Revisit when: a fixture proves generation, exact test command execution, failure parsing, and repair for one adapter without editing production code.

## Audit Contract Before Executors

Decision: treat the deterministic audit artifacts as the stable product contract and keep every test-writing workflow as a replaceable downstream consumer.

Rationale: humans, coding agents, language models, CI policies, and external test tools should be able to trust the same repository evidence and choose independently how to act on it. Model-specific prompting, implementation style, and repair behavior belong in executor profiles; they must not redefine repository facts, risk classifications, or the selected audit target.

Future generation should be layered:

1. stable audit evidence and findings
2. framework-neutral test behavior and acceptance criteria
3. adapter-owned repository conventions, placement, and verification commands
4. model- or agent-specific executor instructions
5. an evidence-producing verification and repair loop

Revisit when: executor evaluations show that the audit contract lacks information required by multiple independent test-writing consumers. Extend the evidence contract before coupling it to one model's preferred prompt shape.

## Public Demo Before Package Release

Decision: prepare a public demo path before publishing an npm package.

Rationale: the tool can be useful as an audit and planning prototype before package metadata, final repository links, and ownership confirmation are ready.

Revisit when: the public repository URL, package metadata, install docs, and release-readiness checks are all final.

## Local-First Stats Before Telemetry

Decision: derive stats from local artifacts before considering external telemetry.

Rationale: stats are useful for audit coverage, fixture quality, model-consistency drift, and later repair-loop trends, but repository source and proprietary artifacts should not leave the local environment by default.

Revisit when: opt-in telemetry has clear source-content exclusions, aggregate-only defaults, and documented retention boundaries.

## Local Diagnostics Without Automatic Reporting

Decision: keep MCP operational diagnostics disabled by default and local-only. When explicitly enabled, record only allowlisted tool name, status, duration, stable error kind, server version, event ID, timestamp, internal-error report ID, and a truncated SHA-256 fingerprint for grouping repeated internal errors. Exclude tool arguments, repository paths, source content, prompts, stack traces, credentials, environment values, model usage, and subagent activity.

Rationale: operators need enough evidence to correlate failures and latency without turning a local repository tool into an undeclared analytics or source-exfiltration surface. Stderr and bounded local JSONL preserve stdio protocol integrity and give users control of the diagnostic record. Sanitized bundles are rebuilt from the allowlist and remain inspectable before sharing.

Revisit when: a real alpha support loop demonstrates that opt-in external reporting is necessary and can provide an exact payload preview plus documented endpoint, retention, deletion, and ownership.

## One Canonical Repository Analysis Entrypoint

Decision: make `analyze` in the CLI and `analyze_repository` in MCP the recommended start for an unfamiliar repository or a general test-architecture review. The operation audits detected project roots once and derives a versioned `repository-analysis/v1` bundle containing the summary, findings, ranking, plan, execution hints, stats, and verification commands. Keep specialist commands available for focused requests and saved artifacts.

Rationale: the focused artifact surface is valuable for advanced users and deterministic model workflows, but requiring humans or models to discover and sequence many similarly weighted commands creates avoidable routing errors. A canonical complete artifact preserves the audit-first boundary while giving both audiences one reliable entrypoint.

Revisit when: measured usage shows that the complete artifact is too large for common clients, or a different small set of entrypoints produces more reliable human and model outcomes without hiding unsupported projects or rescanning repositories.

## Explicit Go Build Targets Without Host Leakage

Decision: make Go build-target ownership opt-in through an explicit `GOOS`, `GOARCH`, and custom-tag object shared by direct audits, project audits, repository analysis, CLI flags, and MCP. Evaluate bounded boolean `//go:build` expressions and standard filename suffix constraints statically. Keep nonmatching sources visible as excluded plan items, and block legacy-only, malformed, unsupported-pair, cgo, release, compiler, or architecture-feature constraints.

Rationale: silently inheriting the machine running the audit would make artifacts vary by host and could incorrectly connect tests to source that is not part of the selected build. Explicit target context keeps commands and evidence reproducible while covering the common platform and custom-tag cases without executing `go list` or repository code.

Revisit when: a pinned live corpus demonstrates a deterministic need for cgo/toolchain/release-tag evaluation or multi-target aggregation with an artifact shape that preserves per-target ownership.

## One-Hop Go Source Dependency Evidence

Decision: allow one indirect `go-source-dependency` relationship from a runnable test's directly called source file to another selected file in the same package directory when the caller makes an unqualified call to a uniquely owned top-level function. Preserve `viaUsage: called`, reject visible local shadows and selectors, and never propagate from naming/type evidence or an existing indirect relationship.

Rationale: the first pinned Go audit showed heavily exercised parser, type-cache, and TOML-type files as untested because tests call public decode and encode entrypoints one file away. A single explicit file dependency recovers useful coverage context while keeping receiver methods, dynamic dispatch, deeper graphs, cross-package calls, and assertion completeness outside the claim.

Revisit when: the remaining pinned Go roles show that function-level call ownership or a deeper graph can be proven without turning a direct entrypoint call into package-wide coverage.

## Go-Aware Lexical Masking

Decision: mask Go comments, interpreted strings, raw strings, runes, and escapes with one stateful lexical scan before static symbol matching. Preserve source positions and newlines, keep literal contents available when parsing imports, and do not change the package, uniqueness, or call-shape requirements for evidence.

Rationale: the pinned HTTP probe contained wildcard route strings with `/*` and `*/`. A comment regular expression interpreted those literal characters as a block comment and hid a real top-level function call between them, producing a false untested result for fully exercised code. Lexical states remove that ambiguity without treating text inside comments or strings as executable evidence.

Revisit when: live Go syntax demonstrates a construct the bounded scanner cannot distinguish safely, or adopting a parser can improve correctness without executing repository code or introducing host-dependent behavior.

## Explicitly Typed Go Receiver-Method Evidence

Decision: emit direct `go-symbol-reference` evidence for a unique receiver-type/method pair only when a runnable test calls it through one unique explicitly typed short or `var` binding. Support value and pointer receivers plus exact external-package aliases; reject constructor inference, reassignment, duplicate or shadowed bindings, parameter inference, interfaces, embedding, and generic receivers.

Rationale: receiver methods are ordinary Go behavior and were the largest repeated evidence gap after promotion. Requiring both the source receiver type and a concrete test binding recovers calls such as `client := PaymentClient{...}; client.Authorize(...)` without guessing what `NewClient()`, an interface value, or a reassigned variable contains. The checked-in client fixture validates the call with native `httptest`, race testing, and formatting.

Revisit when: pinned live cases demonstrate a safe static constructor-return or typed-parameter rule that materially improves evidence without turning inferred or dynamic dispatch into direct coverage.

## Exact Go Dot-Import Evidence

Decision: treat `.` as an exact external-package import mode when an external `_test` package imports its own module-local package path. Resolve only exported, uniquely owned symbols and preserve the existing shadow, call-shape, explicit receiver-binding, and one-hop dependency boundaries. Blank imports and unrelated paths remain ineligible.

Rationale: the pinned Zap pressure pass reported seven files as untested despite 92.5% module statement coverage because its external tests deliberately dot-import `zapcore` and `zaptest/observer`. The adapter already had exact package ownership but discarded the dot alias. Retaining the unqualified import mode recovers 69 evidence relationships without constructor inference, interface dispatch, or package-wide coverage claims; the two remaining untested internal helper files both have zero native coverage.

Revisit when: another pinned repository demonstrates that dot-import ambiguity survives the exact package, exported identifier, unique symbol, and test-local shadow checks.

## Exact Go Constructor-Result Receiver Evidence

Decision: allow direct receiver-method evidence when a runnable test binds an exact result position from a unique, simple, non-generic top-level function declaration with `:=`. Support single results and entirely named or entirely unnamed simple result lists, including pointer results, through same-package and exact default, named, or dot external imports. Preserve unique binding, reassignment, shadow, package ownership, and exported external symbol checks.

Rationale: pinned Resty pressure showed ordinary client methods hidden behind declarations such as `func New() *Client` and `client := New()`. The source declaration supplies the concrete type without runtime inference. Position-aware tuple matching also covers `(client *Client, err error)` without treating interface, alias, helper, chained-call, or dynamic results as concrete receivers. Resty gained three reviewed relationships and lost one stale relationship after tuple reassignment detection was corrected; TOML and Chi gained bounded corpus evidence while River stayed stable.

Revisit when: a pinned case justifies a parser-backed grouped-result, generic-constructor, helper-return, or typed-parameter rule without expanding into interface dispatch or flow-sensitive type inference.

## Bounded Go Cross-Package Source Evidence

Decision: allow one indirect `go-source-dependency` hop from a directly called source file to an exported, uniquely owned function in another package of the same module only when the caller file has exactly one callable declaration and uses an exact default, named, or dot import. Reject blank or external imports, visible alias shadows, ambiguous multi-callable caller files, uncalled files, nested modules, and all second-hop propagation.

Rationale: the initial broad file-level rule inflated River from 572 to 1,199 relationships because a large source file's many test paths were copied across every imported call. Requiring a single callable makes the file-to-function relationship unambiguous without parsing full function bodies. The bounded rule adds only four reviewed River relationships from `MetadataSet` to `MetadataUpdatesFromWorkContext` and one Zap relationship from `LoggedEntry.ContextMap` to `NewMapObjectEncoder`, with no candidate reclassification.

Revisit when: a parser-backed function-body map can prove which callable owns an imported call and preserve direct test-to-symbol provenance in multi-callable files.

## Bounded Go Assertion Usage

Decision: upgrade a direct Go call from `called` to `asserted` only when the call appears in the final condition of an `if` whose top-level branch invokes a failure method on an exact `*testing.T` or `*testing.F` parameter, or inside a supported function from an exact Testify `assert`/`require` import. Also allow one unique, unreassigned `:=` result binding consumed by those bodies. Preserve that strength as `viaUsage` across one bounded source hop and let asserted evidence win over called evidence for the same relationship.

Rationale: every other mature adapter distinguishes execution from an observed result. TOML and Chi provide conservative standard-library examples, while River and Zap provide exact Testify pressure. The retained rule upgrades 3, 2, 12, and 56 relationships respectively without changing any candidate or relationship count; Resty's unchanged 119-link audit is the negative control. Indexing result bindings once per test file keeps River's three-run median at 899 ms instead of the initial repeated-scan result near 1.43 seconds.

Revisit when: parser-backed scopes can prove helper assertions, Example output checks, composite-literal initializers, or deeper result flow without treating an unrelated failure call as observation of a source result.
