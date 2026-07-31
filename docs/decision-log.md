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

## Parser-Scoped Go Shadow Resolution

Decision: retain the Go-aware lexical matcher for call and construction shapes, but resolve an ambiguous parameter or local short, `var`, `const`, or `type` binding with lazy parser-backed function and block scopes. Parse and cache only functions containing both a possible binding and a candidate use. A binding in another function or an exited nested block no longer suppresses same-package, imported, Testify, constructor, or module-local dependency evidence; a binding visible at the call still does. Syntax errors keep the conservative file-wide rejection.

Rationale: file-wide suppression prevented false positives but discarded valid relationships in large conventional test files. River's `client_test.go` and `producer_test.go` contain four local variables named `require`; those bindings are unrelated to valid Testify calls in other tests. The bounded scope index upgrades 14 existing River relationships without changing its 576-link graph or any candidate classification. TOML, Chi, Zap, and Resty retain their canonical semantics. A pure-JavaScript parser avoids native addons, external assets, Go toolchain execution, and target-repository code execution.

Revisit when: parser-backed receiver-binding identity, callable-body ownership, or helper flow can be added without turning local syntax into type or control-flow inference.

## Parser-Owned Go Receivers And Callable Bodies

Decision: attach each supported concrete receiver candidate to its declaration position and require the parser to resolve that exact declaration at the method call. Preserve reassigned concrete bindings because Go fixes their static type, but keep interfaces, aliases, parameters, helper returns, and chained constructors excluded. Retain direct test evidence per unique function or method, map that callable to its parser-owned body, and emit a same-package or module-local `go-source-dependency` only when the call occurs inside that directly exercised body.

Rationale: the former file-wide receiver-name count discarded valid calls whenever a nested block or unrelated test reused the same variable name. The former one-hop rule also copied every direct test path on a source file to dependencies called by unrelated sibling functions. Exact-pin review removes those leaked links while recovering concrete method calls across all five pressure repositories. River keeps every candidate classification while moving from 576 to 284 relationships; the bounded TOML, Chi, Zap, and Resty candidate transitions are explained in the [Go Receiver And Callable Ownership Validation Report](go-callable-ownership-validation-report.md). Parser errors withhold receiver and body ownership rather than guessing.

Revisit when: a pinned case justifies parameter/field type identity, interface dispatch, helper-return inference, or a second dependency hop with equally exact provenance.

## Statically Typed Go Test-Helper Receivers

Decision: accept a concrete receiver binding from a unique, non-generic test helper only when its simple named or unnamed return list contains the exact source receiver type and a direct `:=` call maps that result position to the local binding. Allow shared helpers across same-package `_test.go` files; require an external-package helper and its import-qualified return type to be in the calling file. Resolve same-file helper identity and every receiver call with the parser, reject visible local shadows for shared helpers, and keep complex, chained, aliased, interface, parameter, and field flow excluded.

Rationale: Resty's conventional tests centralize `*Client` construction in `dcnl` and `dcldb`, then bind those statically typed results across many test files. The retained rule adds five exact direct `client.go` relationships without changing any candidate classification or upgrading Resty's custom assertion helpers. TOML, Chi, River, and Zap retain their canonical graphs. Indexing helper declarations, result bindings, and receiver calls once keeps the exact Resty audit near its prior performance envelope.

Revisit when: parameter or field receiver identity, cross-file external-package helpers, helper assertions, or deeper helper flow can be proven with the same static ownership guarantees.

## Experimental Single-Package Rust Baseline

Decision: register an experimental `rust` adapter for one conventional Cargo package with a static `[package].name`, the built-in `#[test]` harness, source files under `src/`, inline `#[cfg(test)]` modules, and integration tests under `tests/`. Emit direct `rust-symbol-reference` evidence only for a unique source function called from its inline test module or through an exact package-name and module-qualified `use` binding; built-in assertion macros upgrade the usage to `asserted`.

Rationale: Cargo already had deterministic project detection, and the built-in harness provides a small native command surface. Exact crate/module imports and same-file inline ownership produce useful audit evidence without executing target code during analysis or claiming coverage from an unused import, comment, string, ambiguous module, foreign crate, workspace, or custom harness. The checked-in fixture verifies meaningful covered, untested, and deferred source categories through the shared artifact pipeline and native Cargo commands.

Revisit when: real repositories justify module re-exports, `crate`/`super` paths, receiver-method identity, feature/target selection, doctests, async runtimes, or property-based test frameworks.

## Preserve Cargo Workspace Package Ownership

Decision: parse bounded literal Cargo `workspace.members` and optional `default-members`, keep every declared package as an independently detected project, and select `cargo test -p <package>` instead of an aggregate workspace command. Treat complete virtual roots as aggregate-only and retain root packages as exact workspace members.

Rationale: Cargo workspaces coordinate packages without merging their source, tests, candidate paths, or package identities. Exact repository-contained paths with existing manifests provide deterministic ownership; package-qualified commands also avoid `default-members` changing which package a root-directory invocation exercises. Globs, missing or external paths, excluded members, invalid defaults, and omitted packages suppress commands rather than widening the claim.

Revisit when: a pinned repository justifies safe glob expansion, inherited manifest ownership, workspace-level feature selection, or an aggregate execution strategy without weakening package-local provenance.

## Recognize Static Cargo Test Targets Without Inventing Evidence

Decision: treat a static repository-contained `[[test]]` target as built-in Rust harness evidence when its file exists, it is enabled, it uses Cargo's default harness, and it has no required feature selection. Use that fact for framework and command selection only; do not attach source evidence unless literal runnable test bodies prove exact calls.

Rationale: ripgrep disables automatic integration-test discovery and routes 323 integration tests through one explicit target whose local macro expands to `#[test]`. The manifest proves that `cargo test -p ripgrep` owns a built-in test executable, while macro expansion is outside the deterministic source matcher. Separating command proof from relationship proof recovers a native command without claiming coverage that static analysis did not observe.

Revisit when: parser-backed macro invocation ownership or Cargo metadata can prove generated test bodies, required-feature selection, custom harness semantics, or nonstandard target layouts without executing target code.

## Preserve Static Cargo Lib And Bin Source Paths

Decision: extend package source ownership with existing repository-contained `.rs` files named by static `[lib].path` and `[[bin]].path` declarations. Keep conventional `src/` ownership, reject unresolved declared paths with a command blocker, and do not infer ownership for neighboring files that Cargo does not name directly.

Rationale: ripgrep's root package declares `crates/core/main.rs` as its binary crate root, so limiting ownership to `src/` hid a real high-risk runtime file even after the exact test command was recovered. The manifest proves ownership of that file without directory heuristics. The follow-up live audit adds one root candidate while leaving every existing project, command, and evidence relationship stable.

Revisit when: a pinned repository justifies auto-discovered binaries, examples, benches, proc macros, or build-script source ownership without sweeping unrelated files into a crate.

## Traverse Literal Rust Module Graphs From Cargo Roots

Decision: recursively follow top-level `mod name;` declarations from conventional and manifest-declared Cargo crate roots when exactly one native `name.rs` or `name/mod.rs` file exists. Also follow one static repository-contained `#[path = "..."]` or raw-string path attribute. Resolve crate roots, ordinary module files, and `mod.rs` with their native relative bases; stop at missing, ambiguous, escaping, unsupported, nested-package, inline-module, and macro-body edges.

Rationale: owning only ripgrep's manifest-named `crates/core/main.rs` recovered one real candidate but hid the 22 files that its literal module graph compiles. The bounded traversal resolves all 23 files in that binary tree, including mutually exclusive static path modules, without treating directory proximity as ownership. It adds 19 untested candidates, one inline-tested candidate, two deferred wiring files, and one direct relationship while every project, command, blocker, and pre-existing relationship remains stable.

Revisit when: a pinned repository justifies parser-backed inline-module directory contexts, `cfg_attr(path = ...)`, identifier macros, `include!`, generated modules, or target-configuration pruning without executing repository code.

## Preserve Logical Rust Modules In Direct Test Evidence

Decision: retain the logical module name discovered at each literal `mod` edge and use it for direct function evidence. A runnable inline unit test may claim one source file through an exact `crate::` or parent-relative `super::` import when the binding is called, the target module resolves to one owned file, and that file uniquely declares the imported top-level function. Package-name integration imports use the same logical index, including custom Cargo roots outside `src/`.

Rationale: physical paths are not Rust module identities. A custom `[lib].path` can declare `validator` from `code/validator.rs`, while a static `#[path]` can place the same logical shape elsewhere. Recording the declaration edge lets unit and integration tests prove those functions without falling back to directory guesses. Wildcards, unused or shadowed bindings, `self::` test ownership, types, methods, re-exports, ambiguous modules, and deeper source propagation remain uncredited.

Revisit when: receiver construction, module re-exports, direct qualified calls, or one-hop source dependencies can be proven without weakening callable identity.

## Credit Exact Rust Inherent Associated Calls

Decision: extend named logical-module imports with direct evidence for `Type::method(...)` when one owned source file uniquely declares the imported struct, enum, or union and one inherent implementation method with that name. Preserve call/assertion usage and reject local shadows, duplicate types or methods, wildcard imports, and trait implementations.

Rationale: Rust builders and constructors are commonly exercised through associated calls before any instance receiver exists. The named import plus unique logical module, type declaration, and inherent method provides a complete static ownership chain. On pinned ripgrep this moves `globset/src/glob.rs` into covered-but-risky through `Glob`/`GlobBuilder` calls in `src/lib.rs` and adds two exact `searcher/testutil.rs` relationships without claiming macro-generated tests or trait dispatch.

Revisit when: a direct constructor result can be bound to one local variable and an instance method can be proven without receiver reassignment, field flow, deref coercion, or trait ambiguity.

## C# As The Seventh Adapter Spike

Decision: register an experimental `csharp` adapter for exactly one root SDK-style test `.csproj` with one static target framework, default compile ownership, `Microsoft.NET.Test.Sdk`, and bounded xUnit, NUnit, or MSTest attributed tests. Select `dotnet test <project>.csproj` only when every ownership and runner check is complete.

Rationale: `.csproj` detection already provides a strong project marker, and the SDK default compile graph plus conventional attributed tests creates a small first command surface. A unique source class, record, or struct used through `Type.Method(...)` or `new Type(...)` produces useful direct evidence without invoking MSBuild or claiming solution semantics. The checked fixture passes natively on .NET 10.0.302 while the ordinary audit remains static.

### 2026-07-28: admit one literal C# production/test project pair

Decision: extend the experimental C# adapter to exactly two static SDK-style projects when one is a production project, one is a supported test project, both use the same literal target framework and default compile ownership, and the test project has exactly one literal relative `ProjectReference` resolving to the production project. Select the test-project command, source candidates only from the production project, and test evidence only from the test project.

Rationale: the conventional `src/<name>` plus `tests/<name>.Tests` shape is the smallest useful cross-project .NET boundary. Requiring the literal edge and equal static frameworks provides deterministic ownership without evaluating MSBuild. Dynamic, escaping, extra, reverse, and transitive edges remain blockers, as do solution-level and central-property semantics.

Revisit when: a repository-contained production/test project pair can be joined through a literal `ProjectReference` without evaluating arbitrary MSBuild, then when pinned repositories justify solution ownership, central properties, multi-targeting, Microsoft.Testing.Platform, or deeper receiver and result-flow evidence.

### 2026-07-28: validate the literal C# pair before widening ownership

Decision: pin `aelassas/tdd` at `aa81c10a1f251ed7f4c7fa3a64a79780a9f3f4fe` as the first C# live probe and keep the adapter experimental. Preserve the exact test-project command and the existing external-boundary recommendation even though the upstream loader tests expose a Darwin portability failure.

Rationale: the repository exercises the intended two-project boundary without inherited MSBuild semantics. Detection produces one supported root, five repeated audits are digest-stable with a 70.4 ms median, the solution builds cleanly, and the native test command reaches all 26 tests. The four failures all come from Windows-style fixture paths in the file-loader tests; the audit already keeps that loader prominent as a high-risk integration boundary. This supports deeper receiver/result-flow evidence next, not broader solution ownership.

Revisit when: exact concrete local bindings and their instance calls can retain type identity through one assignment and into a recognized assertion without accepting reassignment, member flow, interface dispatch, or helper indirection.

### 2026-07-28: credit stable concrete C# receivers and one assertion result

Decision: inside a runnable attributed test body, bind a uniquely owned source type through exact `var value = new Type(...)` or `Type value = new Type(...)`, credit direct `value.Method(...)`, and upgrade usage when that call or one stable local result reaches `Assert.*` or `.Should(...)`.

Rationale: the pinned `aelassas/tdd` tests use this conventional shape throughout. The bounded flow upgrades `Translator`, `TranslatorLoader`, and `TranslatorParser` from called to asserted while keeping four covered candidates, two deferred contracts, and five direct relationships unchanged. Five follow-up audits share one digest with a 72.0 ms median. Receiver/result reassignment, `ref`/`out`, interfaces, fields, properties, helpers, nested local functions, and deferred lambdas remain rejected.

Revisit when: another pinned repository shows that target-typed construction, inherited build/package metadata, or one excluded receiver source creates a larger practical gap than the others.

### 2026-07-28: select one unique C# test edge amid unrelated projects

Decision: when a larger SDK-style repository contains exactly one statically identified test project with one literal repository-contained `ProjectReference` to one production project, collapse and audit only that pair. Preserve every unrelated project as a separate detected root, and block selection when two valid test edges exist.

Rationale: pinned `jjosh102/sharp-cast` contains a converter library and its xUnit project alongside an unrelated Blazor application and benchmark executable. The unique edge selects an exact command that passes 165/165 upstream tests, while no UI or benchmark source enters the pair's candidates or evidence. Five static audits retain one digest with a 14.4 ms median. This widens practical repository coverage without interpreting the solution file, evaluating MSBuild, or merging the entire graph.

Revisit when: exact test-class field receivers initialized through target-typed construction can recover the two reviewed Sharp Cast converter gaps without allowing mutable, inherited, interface-typed, or helper-created fields.

### 2026-07-30: credit exact immutable C# test-field receivers

Decision: inside one test class, bind a uniquely owned concrete source type through an exact `private readonly Type field` initialized with `new()`/`new Type(...)`, or through exactly one such assignment in the class's sole parameterless constructor. Credit only body-local calls from runnable attributed tests, retain the existing one-hop result assertion upgrade, and reject mutable, static, interface-typed, property, inherited, helper-created, cross-partial, multiply constructed, reassigned, shadowed, local-function, and deferred-lambda shapes.

Rationale: pinned Sharp Cast uses both supported initialization forms. The bounded rule moves `JsonToCSharpConverter` and `TypeScriptToCSharpConverter` from untested to covered, changing the audit from `7 / 4 / 1` candidates and five relationships to `5 / 6 / 1` and eight without absorbing UI or benchmark source. `TypeScriptToCSharpConverter` is asserted; the two JSON relationships remain called because their asserted output is carried through `out`. Five audits share digest `f3806a31ad40af325eaeb51710daa91bb9725e2d5a552959259a19dd373f2c07` with a 22.9 ms median, and the exact native command still passes 165/165 tests.

Revisit when: bounded `out`-argument identity can prove the two reviewed JSON assertion flows without accepting ref/out mutation generally, or when inherited MSBuild/package metadata creates the larger practical gap.

### 2026-07-30: credit one stable inline C# out result

Decision: for an already-supported concrete local or exact immutable test-field receiver, recognize exactly one top-level `out var name` declared by its direct call and upgrade usage when that local remains stable until a direct `Assert.*` or `.Should(...)` statement. Keep predeclared, explicitly typed, multiple, nested helper-owned, mutated, `ref`/`out`-forwarded, local-function, and lambda assertion flows call-only.

Rationale: pinned Sharp Cast repeatedly uses the exact inline declaration. The rule preserves `5 / 6 / 1` candidates and eight direct relationships while upgrading both `JsonToCSharpConverter` relationships and `CSharpToTypeScriptConverter`, changing usage from three asserted/five called to six asserted/two called. Five audits share digest `285810a7191b41e52b66cbbd7a68c44435424d5dc68e4227031e67265f1d743e` with a 28.3 ms median, and the exact native command still passes 165/165 tests.

Revisit when: a pinned repository shows that explicitly typed or multi-output flow provides a larger practical gain than inherited build/package metadata, without requiring general alias analysis.

### 2026-07-30: admit bounded nearest-file C# build props

Decision: for each selected SDK-style project, read only the nearest exact-cased, non-symbolic, repository-local `Directory.Build.props`. Admit literal unconditional `<TargetFramework>`, `<IsTestProject>`, and supported test-package `Include` declarations, with project-local property precedence. Block imports, conditions around relevant metadata, property-expanded values, multiple frameworks, inherited project or compile items, and symbolic paths instead of evaluating MSBuild.

Rationale: pinned `kthompson/glob` at `719a8593b7c7c085c832e5580f753355ce7ded85` has five projects and one exact library/test edge whose `net8.0` framework comes from root props. The props file also contains a conditional Nerdbank.GitVersioning package, proving unrelated metadata must not invalidate the static framework. Detection preserves the Blazor app and benchmark separately; the selected audit has no blockers, reports `19 / 8 / 1` candidates with ten evidence links, and stays digest-stable across five runs at a 22.5 ms median. After full Git history was restored, all 179 tests passed under the local .NET 10 runtime's explicit major-version roll-forward.

Revisit when: central package management, a chained props hierarchy, or another evaluated MSBuild feature can be bounded without imports, arbitrary property execution, or solution ownership.

### 2026-07-30: admit bounded C# central package versions

Decision: for each selected SDK-style project, read only the nearest exact-cased, non-symbolic, repository-local `Directory.Packages.props`. Admit literal unconditional central enablement from the project, `Directory.Build.props`, or `Directory.Packages.props`; require every selected-project package ID to have one matching static `PackageVersion`; and resolve only an exact one-level version property declared literally and unconditionally in that same central file. Block imports, conditional or repeated central declarations, unresolved or chained properties, local `Version`/`VersionOverride`, global package references, dynamic package IDs, and symbolic paths.

Rationale: pinned `efcore/EFCore.CheckConstraints` at `20f0df70cbde15df054dd9f3633b3b974051dc54` is a two-project repository whose versionless references resolve through central metadata enabled in `Directory.Build.props`. Its central file combines literal versions with a same-file `$(EFCoreVersion)` alias. The selected audit emits the exact test-project command with no blockers, reports `10 / 3 / 0` candidates with three direct relationships, and stays digest-stable across five runs at a 12.5 ms median. The unchanged native command restored, built, and passed all 118 tests.

Revisit when: a pinned repository demonstrates that conditional framework-specific versions, safe `VersionOverride`, or a chained central props hierarchy provides enough practical gain to justify a larger static evaluator.

### 2026-07-30: admit literal C# multi-target ownership

Decision: admit one literal unconditional local or nearest-props `TargetFrameworks` declaration containing at least two unique static target monikers. For a production/test pair, require every test target to occur literally in the production target list, case-insensitively. Emit the unchanged test-project `dotnet test` command; do not select one target or infer compatibility between different monikers.

Rationale: pinned `matthewrosse/ErrorOrAspNetCoreExtensions` at `b4244dd08bf5f3dd7b9ce1bea71a5abceb5a94bf` targets `net8.0;net9.0;net10.0` in production and `net10.0` in its xUnit project. The rule composes with its central package metadata, removes the two former multi-target blockers, records both target lists, and emits an unchanged command that passes 49/49 tests. Five audits share digest `5fb277f14deec2bfdba0a679b22d8011b5142691601550b6b487b653dea16067` with a 2.4 ms median. The checked production/test fixture locks the same superset shape and passes 2/2 native tests. A compatibility-shaped `net462` versus `netstandard2.0` case remains blocked, as do conditions, property expansion, repeated declarations, and invalid or duplicate lists.

Revisit when: a pinned repository demonstrates that exact target-framework compatibility mapping or bounded target-conditioned package references provide enough practical gain to justify additional static semantics.

### 2026-07-30: admit finite C# target-conditioned package references

Decision: admit one project-local condition on either a `PackageReference` or its containing `ItemGroup` when it is a finite predicate over the project's already validated literal target list. Each atom compares `$(TargetFramework)` with one declared literal using one shared comparison kind (`==` or `!=`); multiple atoms use one shared `And` or `Or`; and the result must select a non-empty proper subset. Keep test infrastructure packages unconditional, and block inherited, nested, mixed, functional, parenthesized, undeclared-target, or other MSBuild expressions.

Rationale: pinned `S7NetPlus/s7netplus` at `534d9fd69dedb6db1a61f0ce13b94ab8e7f98f26` uses three literal inequalities joined by `And` to include `System.Memory` on four of seven production targets. Its MSTest project targets a literal production subset through one exact edge. The zero-blocker audit reports `35 / 13 / 1` candidates and 19 relationships; five runs share digest `4d873dc46f7baed53e0a8ba83816b6e3d109e4b85fa0d160a8425157c64879e1` at an 88 ms median. The probe also locked package-tag parsing when a child-metadata reference precedes self-closing test packages. The exact command restores and builds all targets, then records expected local host failures for x64 .NET, Mono, and the unavailable macOS Snap7 native library rather than changing the emitted command.

Revisit when: conditional test infrastructure, target compatibility, or a richer boolean grammar can be proven from a pinned repository without invoking general MSBuild evaluation.

### 2026-07-30: credit one stable direct C# type-call result

Decision: inside a runnable attributed test body, upgrade an already recognized direct `Type.Method(...)` or `new Type(...)` call when its complete top-level expression is assigned to one stable local that later reaches a direct `Assert.*` or `.Should(...)` statement. Accept `var` or an explicit result type for static calls, but require `var` or the exact concrete source type for construction. Reject mutation, interface-typed construction, helper indirection, nested local functions, deferred lambdas, and deeper expression flow.

Rationale: pinned S7.Net assigns results from `DataItem.FromAddress(...)`, `TPKT.Read(...)`, and two `Conversion` calls before asserting their values. The rule preserves 35 untested, 13 covered, 1 deferred, and 19 relationships while moving usage from 10 asserted/9 called to 14 asserted/5 called. Five audits share digest `0d1c131f69be3229cb6f431c6905ee7ffc6e5ed56c94c0bd2f79d241cec3da80` with a 101 ms median.

Revisit when: a pinned repository demonstrates that property chains, tuple/deconstruction results, helper returns, or deeper result flow can be proven without general data-flow inference.

### 2026-07-30: require runnable-body ownership for basic C# calls

Decision: emit basic direct `Type.Method(...)` and `new Type(...)` evidence only for top-level calls inside a runnable attributed test body. Do not treat calls in test-class constructors, field initializers, ordinary helpers, nested local functions, or deferred lambdas as direct test evidence. Preserve exact immutable field-receiver evidence only when the runnable body itself invokes that receiver.

Rationale: the former file-wide scan made helper-owned calls look direct and could inherit helper-owned assertions. On pinned S7.Net, the tighter rule preserves 35 untested, 13 covered, 1 deferred, and 19 relationship slots while changing the honest evidence mix to 9 asserted direct, 7 called direct, and 3 naming. Five audits share digest `681b34f64d18bb4019550c871a3d43b4d573df826d4ef3275ea8cc6eb8e5c5ff` with a 103 ms median.

Revisit when: helper declarations, exact call sites, parameters/results, and assertion ownership can be joined without file-wide or name-only reachability.

### 2026-07-30: credit one sole-call MSTest expected exception

Decision: when MSTest is the selected framework, treat `[ExpectedException]` or `[ExpectedExceptionAttribute]` as asserted usage only if its runnable method body is exactly one statement containing exactly one direct top-level source `Type.Method(...)` or `new Type(...)` call. Keep multiple calls, preceding setup, wrappers, helpers, nested local functions, deferred lambdas, and non-MSTest attributes called or uncredited under the existing rules.

Rationale: pinned S7.Net contains exact expected-exception methods for `DateTime` and `DateTimeLong`. The rule upgrades only those two relationships, preserving 35 untested, 13 covered, 1 deferred, and 19 total relationships while producing 11 asserted direct, 5 called direct, and 3 naming links. Five audits share digest `2fbaecbad8128b75d36447257589943c851ef4da42ee69f9d540c65a3d3c5ce7` with a 104 ms median.

Revisit when: NUnit/xUnit exception constructs or multi-statement MSTest methods can identify the throwing call without general control-flow or exception analysis.

### 2026-07-30: credit exact framework exception assertion lambdas

Decision: for the selected xUnit, NUnit, or MSTest framework, credit one direct source call inside an exact top-level single-expression lambda passed to the framework's static exception assertion method. Admit synchronous and async/await forms plus a trailing assertion message. Reject block lambdas, multiple or wrapped source calls, captured assertion results, nested control flow, custom assertion owners, and wrong-framework method names.

Rationale: pinned S7.Net directly calls `S7String` and `S7WString` inside MSTest `Assert.ThrowsException(...)` lambdas. The rule moves those two relationships from naming to asserted direct evidence while preserving all 35 untested, 13 covered, 1 deferred, and 19 relationship slots. Five audits share digest `bb035df93e749bfec265b13e1801e25ab4946a50a0cb36e6a853640926f7791d` with a 106 ms median and produce 13 asserted direct, 5 called direct, and 1 naming relationship.

Revisit when: a pinned repository justifies captured exception results, exact block-lambda ownership, or framework-specific assertion overloads without general lambda/control-flow inference.

### 2026-07-30: emit bounded indirect C# test-helper evidence

Decision: follow one unique same-class `private static` helper when a runnable test calls it directly and its top-level block body contains exactly one source `Type.Method(...)` or `new Type(...)` call. Emit `csharp-test-helper` with indirect strength and called/asserted `viaUsage`; suppress it when the same test file already proves direct evidence for that source.

Rationale: pinned S7.Net's `StringTests` exercises `String.ToByteArray(...)` only through one directly invoked assertion helper. The new relationship replaces its filename convention without changing any candidate or relationship count, producing 13 asserted direct, 5 called direct, and 1 called indirect link. Five audits share digest `7eb1d36f04368c7ca4dc845cde920870a809a2294cba81ae3fb14af192a5cf0e` with a 115 ms median.

Revisit when: collection assertions can upgrade the helper's entrypoint usage, or a pinned repository justifies cross-file helpers, receiver identity, helper returns, or a second helper hop without name-only reachability.

### 2026-07-30: recognize selected C# collection and string assertion owners

Decision: when NUnit or MSTest is selected, treat top-level static `CollectionAssert.*` and `StringAssert.*` statements as assertion usage across the existing direct-call, stable-result, receiver, inline-`out`, immutable-field, and one-hop-helper paths. Do not grant those specialized owner spellings assertion status in xUnit projects.

Rationale: pinned S7.Net uses MSTest `CollectionAssert.AreEqual(...)` around direct `ConnectionRequest` and `TsapPair` calls and around the bounded helper's sole `String.ToByteArray(...)` call. Exactly those three relationships move from called to asserted, retaining 35 untested, 13 covered, 1 deferred, and 19 relationships. Five audits share digest `fe016f99fc7ab972eb6048dcc9e7e7c0dabe190eed4ffb2a8f08964ecadbfc9e` with a 113 ms median.

Revisit when: a pinned repository justifies namespace/import provenance for assertion owners, constraint-based NUnit assertion forms, or another framework-owned assertion family without broad name-only inference.

### 2026-07-30: reject unqualified well-known System type collisions

Decision: when a C# test file contains `using System;`, do not treat an unqualified call or construction of a well-known root `System` type name as evidence for a same-named source type. Preserve dotted source qualifications and exact aliases whose right-hand side matches the unique source namespace/type, and reject explicit `System.Type` qualifications across every existing evidence path.

Rationale: pinned S7.Net's `DateTimeLongTests.cs` constructs `System.DateTime`, but name-only matching also attached that test file to `S7.Net.Types.DateTime`. The guard removes exactly that false called relationship while retaining the source class's real asserted tests and the explicit `Boolean = S7.Net.Types.Boolean` alias. Candidate counts remain 35 untested, 13 covered, and 1 deferred; relationships move from 19 to 18. Five audits share digest `616cefd4bb73e781157cc1182f0677153955b1fc720bdbf2c3bf529f0dd9c856` with a 141 ms median.

Revisit when: parser-backed namespace/import resolution can replace the bounded root-type collision set and distinguish every qualified type without compiling the target repository.

### 2026-07-30: preserve independent C# owners in repository-wide audits

Decision: keep collocated independent SDK test projects as separate detected owners with one exact command each, while passing the repository root into every project audit so bounded shared central package metadata remains available. Do not merge those projects through proximity, shared package props, or solution files.

Rationale: pinned official `nunit/nunit-csharp-samples` at `2058fb69939911d647b817e0d7a871ba9e4d34a6` contains six independent NUnit 5 test projects sharing one root `Directory.Packages.props`. Repository-wide auditing selects all six with no blockers or skipped projects, emits six project-local commands, and remains digest-stable across five runs at a 7.1 ms median. All 238 .NET 10 tests pass; the sole additional `net48` leg requires Mono on macOS. Framework-driven custom attributes remain untested or naming-only rather than gaining invented direct evidence.

Revisit when: an exact aggregate project, build file, or statically complete solution owner can prove one repository-level command without erasing project-local ownership or portability detail.

### 2026-07-30: recognize provenance-backed NUnit ClassicAssert

Decision: when NUnit is selected, treat `ClassicAssert.*` as assertion usage only if the test file has an exact `NUnit.Framework.Legacy` namespace import without a same-named source type, aliases `ClassicAssert` exactly to `NUnit.Framework.Legacy.ClassicAssert`, or uses that fully qualified owner. Apply it to the existing direct-call, stable-result, receiver, inline-`out`, immutable-field, and one-hop-helper paths. Reject local/source `ClassicAssert` collisions and non-NUnit lookalikes.

Rationale: pinned official NUnit samples use `using NUnit.Framework.Legacy;` and `ClassicAssert` throughout `MoneyTest.cs`. The exact owner proof distinguishes NUnit's compatibility API from a same-named helper without broad namespace inference. `Money.cs` and `MoneyBag.cs` were already asserted through `Assert.That`, so five follow-up audits intentionally retain the prior repository digest with an 8.5 ms median. Dedicated positive and near-miss fixtures prove direct, stable-result, helper, alias, qualification, local/source collisions, and wrong-framework behavior.

Revisit when: another pinned NUnit repository justifies static imports, non-default owner aliases, or additional legacy assertion owners without treating arbitrary assertion-shaped methods as framework proof.

### 2026-07-31: admit one root C# target-framework property alias

Decision: resolve an exact project-local `TargetFramework` or `TargetFrameworks` value of `$(PropertyName)` only when the nearest repository-owned `Directory.Build.props` declares that property exactly once, unconditionally, at top level, with a literal value that already satisfies the bounded target grammar. Reject local-only, missing, repeated, conditional, chained, nested, target-owned, item-expanded, or mixed-expression values.

Rationale: pinned `dorssel/usbipd-win` at `15e5f85663482d0698f080eeb41950ca839e8893` declares `MainTargetFramework=net10.0` once at the root and uses the exact alias in both its selected `Usbipd` and `UnitTests` projects. Resolving that one hop removes the framework-evaluation and missing-static-target blockers while preserving 27 untested, 14 covered, 3 deferred, and 15 evidence relationships. Five audits share digest `1183ee92d1a8edd8d3ec3b0edb5019bf46aaf590552e9769809cafbe05eb21b4` with a 179.5 ms median. The custom `Compile` graph remains the only command blocker.

Revisit when: a pinned repository proves a safe need for project-local aliases, chained props, conditional values, or other MSBuild evaluation without invoking the build engine.

### 2026-07-31: admit one contained C# compile include glob

Decision: add files from exactly one project-local, self-closing `Compile Include="relative/path/*.cs"` item when the direct directory resolves inside the audit root and every matched source is a regular non-symbolic file. Preserve default SDK ownership and reject multiple items, conditions, recursive/property/item expansion, explicit files, child metadata, `Remove`/`Update`, disabled defaults, and missing, empty, symbolic, or escaping directories.

Rationale: pinned usbipd-win links nine `Usbipd.Automation` sources into the selected production project through one exact sibling glob. Owning those files removes the audit's last blocker, emits `dotnet test UnitTests/UnitTests.csproj`, and exposes six covered, two untested, and one deferred linked files. The complete graph moves to 29 untested, 20 covered, 4 deferred, and 28 evidence relationships; five runs share digest `217512fa1b455feb2a9a464b706f3f06ef6ba2296e6c820c5f7aff89a2be1450` with a 200.4 ms median. The unchanged command reaches compilation locally but requires the repository's Windows/x64 host; its exact pinned upstream run passes all 3,037 tests.

Revisit when: a pinned repository justifies multiple includes, explicit file lists, linked sources outside the audit root, or `Remove`/`Update` semantics without general MSBuild item evaluation.

### 2026-07-31: add the C# promotion performance gate

Decision: run a generated 400-source/200-test SDK project pair through the C# adapter in both alpha and release readiness, requiring exactly 200 covered candidates, 200 untested candidates, zero skipped candidates, and 200 direct evidence relationships under a broad 5-second ceiling.

Rationale: the C# adapter now has extensive fixture and live-repository depth, but it lacked the synthetic semantic and timing guard carried by every supported adapter. The generated pair exercises project selection, source ownership, runnable xUnit discovery, direct asserted evidence, and candidate classification at useful scale. Its first local run completed in 880 ms without weakening the shared ceiling.

Revisit when: normal CI variance approaches the ceiling or a representative large C# ownership shape exposes a more useful deterministic scale fixture.

### 2026-07-31: promote bounded C# to supported alpha

Decision: promote the bounded C# adapter from experimental to supported alpha maturity without widening its documented MSBuild, project-graph, command, or evidence boundary.

Rationale: TDD, usbipd-win, and Sharp Cast now fill the shared conventional-library/service, framework-heavy application, and difficult-ownership corpus roles. Their exact pinned checkouts are blocker-free and digest-stable across fresh five-run standardized measurements, and all 21 C# detection, ownership, command, evidence, ranking, stability, and performance areas pass review. The generated 400-source/200-test gate, shared conformance, implementation coverage, golden/model-consistency artifacts, package verification, and Linux, Windows, and macOS alpha gates supply the same promotion infrastructure as the existing supported adapters.

Revisit when: a documented in-boundary repository produces false ownership, a guessed or missing verification command, direct-evidence inflation, or performance outside the recorded gates.

### 2026-07-31: add the Rust module-graph performance gate

Decision: run a generated Cargo library with 400 literal behavioral modules and 200 built-in integration tests through the Rust adapter in every alpha and release check. Require exactly 200 covered candidates, 200 untested candidates, 200 direct evidence relationships, and one skipped `src/lib.rs` module-wiring target under a broad 5-second ceiling.

Rationale: Rust already had fixture, shared-conformance, golden, model-consistency, native Cargo, and pinned ripgrep evidence, but lacked the generated semantic and timing pressure carried by the supported adapters. The fixture exercises literal module traversal, exact package-name integration imports, runnable `#[test]` ownership, asserted function evidence, and candidate classification at useful scale. Its first local audit completed in 59 ms. Keeping the mandatory crate root as an exact skipped invariant avoids pretending its declarations are independently testable behavior.

Revisit when: normal CI variance approaches the ceiling or a representative large Rust repository exposes a more useful deterministic module or evidence shape.
