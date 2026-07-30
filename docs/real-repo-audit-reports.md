# Real Repository Audit Reports

This page tracks local audit passes against real repositories that are not checked in as deterministic fixtures.

The purpose is product validation, not regression locking. These reports record what the tool found, what it missed, and which heuristics should be tightened while the public alpha matures.

## Report Set

| Report | Ecosystem | Source | Command focus | Status |
| --- | --- | --- | --- | --- |
| [C# TDD live validation](csharp-tdd-validation-report.md) | C#, literal SDK production/test pair, xUnit | `aelassas/tdd` at `aa81c10` | pair ownership, exact test-project command, native build/test comparison, external-boundary portability finding | current; first C# live probe |
| [C# Sharp Cast live validation](csharp-sharp-cast-validation-report.md) | C#, unique literal test edge amid unrelated SDK projects, xUnit | `jjosh102/sharp-cast` at `57cd4f3` | selective pair ownership, unrelated-project isolation, exact command, field-receiver pressure | current; second C# live probe |
| [C# Glob live validation](csharp-glob-validation-report.md) | C#, inherited static framework, unique literal test edge, xUnit | `kthompson/glob` at `719a859` | nearest `Directory.Build.props`, conditional unrelated metadata, exact command, native test comparison | current; third C# live probe |
| [C# central packages live validation](csharp-central-packages-validation-report.md) | C#, central NuGet versions, literal SDK production/test pair, xUnit | `efcore/EFCore.CheckConstraints` at `20f0df7` | nearest `Directory.Packages.props`, one-level version aliases, exact command, native test comparison | current; fourth C# live probe |
| [Rust ripgrep live validation](rust-ripgrep-validation-report.md) | Rust, literal Cargo workspace, explicit macro-driven test target | `BurntSushi/ripgrep` at `f9c05a9` | twelve-project ownership, exact package commands, native workspace tests, explicit built-in target recovery | current; first Rust live probe |
| [Go validation hunt](go-validation-hunt-report.md) | Go modules, standard `testing`, parser library | `BurntSushi/toml` at `c6d720d` | project ownership, module command, direct and one-hop source evidence, native test comparison | current; passing corpus role |
| [Go HTTP validation](go-http-validation-report.md) | Go modules, `net/http`, routers and middleware | `go-chi/chi` at `8b258c7` | explicit build target, nested-module ownership, lexical evidence, native coverage comparison | current; passing corpus role |
| [Go workspace ownership validation](go-ownership-validation-report.md) | Go modules, literal `go.work`, nested driver packages | `riverqueue/river` at `b6c733c` | nine-owner project detection, module-local commands, generic function evidence, native prerequisite review | current; passing corpus role |
| [Go dot-import validation](go-dot-import-validation-report.md) | Go modules, external `_test` packages, logging interfaces | `uber-go/zap` at `5b81b37` | exact dot-import provenance, native coverage comparison, intentional interface and release-tag boundaries | current; post-promotion pressure |
| [Go constructor-result validation](go-constructor-validation-report.md) | Go modules, constructor-heavy HTTP clients | `go-resty/resty` at `503cee1` | exact concrete result positions, tuple reassignment controls, native race validation | current; post-promotion pressure |
| [Go cross-package source validation](go-cross-package-validation-report.md) | Go modules, internal packages, exact imported calls | `riverqueue/river` at `b6c733c` and `uber-go/zap` at `5b81b37` | one-callable caller boundary, exported dependency functions, deeper-hop controls | current; bounded hardening pressure |
| [Go assertion-usage validation](go-assertion-validation-report.md) | Go modules, standard `testing`, Testify | TOML, Chi, River, Zap, and Resty exact pins | exact failure conditions, one-hop result bindings, assertion alias controls, unchanged candidate counts | current; parity hardening pressure |
| [Go parser-scoped binding validation](go-parser-scope-validation-report.md) | Go modules, local declarations, Testify aliases | TOML, Chi, River, Zap, and Resty exact pins | function/block shadow ownership, conservative parse fallback, unchanged candidate counts | current; post-parity hardening pressure |
| [Go receiver and callable ownership validation](go-callable-ownership-validation-report.md) | Go modules, concrete receivers, one-hop source dependencies | TOML, Chi, River, Zap, and Resty exact pins | declaration-to-call receiver identity, exact assertion occurrences, multi-callable body ownership, leaked-edge removal | current; post-parity hardening pressure |
| [Go test-helper receiver validation](go-helper-return-validation-report.md) | Go modules, concrete receivers, statically typed test helpers | TOML, Chi, River, Zap, and Resty exact pins | helper declaration/result ownership, cross-file same-package helpers, shadow controls, Resty relationship recovery | current; final Go tightening pressure |
| [Four-adapter live validation refresh](live-validation-refresh-2026-07-26.md) | JavaScript/TypeScript, Kotlin/JVM, Python, Swift | all 12 exact-commit validation-corpus repositories | three-run static audits, semantic drift review, and regression conversion | current |
| [Collectors Grimoire Swift packages](cg-swift-audit-report.md) | Swift, Vapor, MongoDB | local sibling `cg-*` repositories | `findings-projects`, Swift adapter audit | current |
| [Swift reactive libraries](swift-reactive-audit-report.md) | Swift, XCTest, RxTest, RxBlocking | `ReactiveX/RxSwift` at `132aea4`, `iZettle/Flow` at `b452ec9` | direct Swift adapter audit and evidence boundaries | current |
| [SwiftPM ownership](swiftpm-ownership-audit-report.md) | Swift, SwiftPM, XCTest, Swift Testing | `ReactiveX/RxSwift` at `132aea4`, `apple/swift-nio` at `590dd7b` | versioned/computed manifests, multi-target ownership, and duplicate boundaries | current |
| [Swift validation hunt](swift-validation-hunt-report.md) | SwiftUI/Xcode, Vapor, macros, Bazel, CocoaPods-era Apple projects | FineTune, Swift Package Index Server, ReerCodable, rules_swift, Quick, and local `cg-*` packages | repository discovery profiles plus direct Swift adapter audits | current |
| [Vapor database templates](swift-vapor-database-audit-report.md) | Swift, Vapor, Fluent, SQL, MongoDB | official Vapor PostgreSQL, MySQL, and SQLite templates plus local `cg-bff` | direct Swift adapter audit and database evidence boundaries | current |
| [Python validation hunt](python-validation-hunt-report.md) | Python, pytest, uv, FastAPI, Flask, Django | `tox-dev/tox-uv`, `fastapi/asyncer`, the FastAPI full-stack template backend, `JoeanAmier/XHS-Downloader`, `pallets/flask`, `pytest-dev/pytest`, and `django/django` | repository discovery profiles, source ownership, framework/command detection, direct/re-export/fixture evidence, coverage configuration, performance, and no-tests-yet blocker behavior | current |
| [Kotlin/JVM validation hunt](kotlin-jvm-validation-hunt-report.md) | Kotlin, Java, Gradle, Maven, JUnit | JUnit 4, Cash App Barber, Mockito-Kotlin, graphql-java, and KotlinPoet | module/source-set ownership, wrapper commands, direct/static/top-level symbol evidence, runnable-test boundaries, and explicit unsupported-shape blockers | current |
| Repo Test Architect self-audit | JavaScript, TypeScript | this repository | direct `javascript` adapter audit, placement audit | summarized below |
| `unjs/defu` audit | TypeScript, Vitest | `unjs/defu` at `82632b6` | `findings-projects`, direct `javascript` adapter ranking | summarized below |
| `h3js/h3` audit | TypeScript, Vitest | `h3js/h3` at `3eb3a57` | `findings-projects`, direct `javascript` adapter ranking | summarized below |
| `honojs/hono` audit | TypeScript, Vitest | `honojs/hono` at `cda1af2` | `findings-projects`, direct `javascript` adapter ranking | summarized below |
| `react-hook-form/react-hook-form` audit | TypeScript, Jest, React Testing Library | `react-hook-form/react-hook-form` at `521adfc` | direct `javascript` adapter audit and timing | summarized below |
| `typescript-eslint/typescript-eslint` audit | TypeScript, Vitest, pnpm/Nx workspace | `typescript-eslint/typescript-eslint` at `c2386e4` | project detection, project audits, and timing | summarized below |
| [Browser E2E and Bun audit](browser-bun-audit-report.md) | TypeScript, Playwright, Cypress, Bun | `microsoft/playwright-mcp`, `archfz/cypress-terminal-report`, `honojs/hono` | direct JavaScript adapter audit and evidence boundaries | current |
| `expressjs/express` audit | JavaScript, Mocha, Supertest | `expressjs/express` at `ae6dd37` | direct `javascript` adapter audit | summarized below |
| Collectors Grimoire app audit | Swift, Xcode app | `m-stenbe/Collectors-Grimoire` at `a2d4c54` | `findings-projects`, Xcode-style Swift detection | summarized below |

This gives the alpha gate coverage across owned and non-owned JavaScript/TypeScript codebases and multiple Swift codebases, including browser E2E runners, Bun, Swift Package Manager, all four official Fluent database drivers, Xcode-style app structure, and maintained plus legacy reactive libraries.

## Repo Test Architect Self-Audit

Command focus:

```powershell
node ./src/cli/index.js rank . --adapter javascript
node ./src/cli/index.js placement . --adapter javascript
```

What the tool found:

- high-confidence JavaScript/TypeScript profile with `npm run test`
- Node test runner signals, `test/` conventions, and matching test evidence
- 26 covered-but-risky candidates in the direct root audit after filtering sibling TypeScript reference mirrors and nested example packages
- 186 conservative `keep` placement evidence links for tests that match source targets in the same project
- useful distinction between untested files and covered-but-risky files

Representative findings:

| Category | Examples | Why it matters |
| --- | --- | --- |
| Covered but risky | `adapter-registry`, `explain-target`, `project-findings`, `tool-api`, `test-plan` | Existing tests are treated as evidence, not proof of complete edge-case coverage. |
| Low-value direct targets | DTO/reference files and low-runtime-behavior modules | The adapter avoids treating every source file as a direct test target. |
| Placement | `test/*.test.js` files matching `src/core/*` targets | Existing tests are reported as correctly colocated with the audited project. |

What it missed or over-reported:

- Direct root audit sees broad branching logic but does not yet understand module ownership well enough to rank adapter files by product risk.
- Matching-test evidence is now complete for direct root candidates, but it does not prove that every important branch is asserted.
- The standalone `src/core/report.ts` reference renderer previously appeared as a candidate because the live implementation was duplicated inside the CLI without a runtime sibling module.

Heuristic follow-up:

- add ownership or package-role signals for adapter modules, CLI entrypoints, MCP transport, and core scoring modules
- keep reference implementations paired with their runtime JavaScript modules so the adapter can distinguish shipped behavior from mirrors
- use project-level audits when checked-in nested packages should be evaluated independently from the root package

## `unjs/defu` Audit

Source:

- repository: `unjs/defu`
- audited commit: `82632b6` (`2026-05-17`, `chore(deps): update all non-major dependencies (#161)`)

Command focus:

```powershell
node ./src/cli/index.js detect <defu checkout> --format json
node ./src/cli/index.js findings-projects <defu checkout>
node ./src/cli/index.js rank <defu checkout> --adapter javascript --format json
```

What the tool found:

- one supported JavaScript/TypeScript project from `package.json`
- high-confidence JavaScript adapter audit with `npm run test`
- Vitest test tooling through package metadata
- two medium-priority findings in the repo-level report
- category summary with one missing-coverage finding and one covered-but-risky finding

Representative findings:

| Category | Examples | Why it matters |
| --- | --- | --- |
| Covered but risky | `src/defu.ts` with `test/defu.test.ts` | Existing tests are recognized as evidence while still keeping branch-heavy merge behavior visible for edge-case review. |
| Missing coverage | `src/_utils.ts` | The audit surfaced branching helper logic that deserves scrutiny, but manual review found nearby coverage under a non-identical test filename. |
| Blockers | none | The adapter correctly avoided blocking a repo with a runnable test command and supported framework signals. |

What it missed or over-reported:

- `src/_utils.ts` was reported as having no existing tests, but `test/utils.test.ts` covers `isPlainObject` from that file.
- The current matching heuristic is path/name oriented. It does not yet connect exported function names to tests when the source file has a leading underscore and the test omits it.
- The `defu` covered-but-risky finding is useful, but the rationale is still generic branch-heavy language rather than merge-specific cases such as prototype pollution, array merge ordering, custom merger behavior, and non-plain objects.

Heuristic follow-up:

- add exported-symbol matching between source files and tests, especially when filenames differ by private prefixes like `_`
- improve JavaScript/TypeScript utility rationale so merge helpers, guards, and object-shape predicates get domain-specific review hints
- keep covered-but-risky targets visible, but include a concise "already covered by" line in markdown so reviewers can evaluate whether the warning is fair

Re-audit after call/assertion-aware evidence (`2026-07-12`):

- the same pinned commit now reports zero untested candidates, two covered-but-risky targets, and one skipped target
- `src/_utils.ts` is connected directly to `test/utils.test.ts` with `asserted` usage, resolving the earlier false missing-coverage report; its additional relationship to `test/defu.test.ts` remains separately classified as bounded-indirect evidence
- `src/defu.ts` is also connected to direct asserted evidence, producing two direct asserted links and one bounded-indirect link across the project
- this validates the intended trust model: stronger usage evidence improves the finding without upgrading a weaker transitive relationship

## `h3js/h3` Audit

Source:

- repository: `h3js/h3`
- audited commit: `3eb3a57` (`2026-07-09`, `docs: add QUERY method docs (#1447)`)

Command focus:

```powershell
node ./src/cli/index.js detect <h3 checkout> --format json
node ./src/cli/index.js findings-projects <h3 checkout> --format json
node ./src/cli/index.js rank <h3 checkout> --adapter javascript --format json
```

What the tool found:

- four supported JavaScript/TypeScript project roots: the package root plus `docs`, `examples`, and `playground`
- high-confidence root audit with the repository's `pnpm test` command and Vitest tooling
- 50 repo-level findings after current matching improvements: one missing coverage, 43 weak existing coverage, and six blocked-project findings
- eight high-severity findings: the untested service-worker entry plus covered auth, CORS, proxy, session, and WebSocket boundaries
- matching tests for many branch-heavy HTTP behaviors, including auth, body handling, CORS, events, handlers, middleware, JSON-RPC, paths, proxies, and sessions
- a high-priority service-worker entry finding based on the runtime boundary and lack of a filename-matched test

Representative findings:

| Category | Examples | Why it matters |
| --- | --- | --- |
| Covered but risky | `src/utils/auth.ts`, `src/utils/body.ts`, `src/handler.ts`, `src/utils/json-rpc.ts` | The tool keeps branch-heavy HTTP behavior visible while citing matching tests. |
| Missing coverage | `src/_entries/service-worker.ts` | The remaining direct-root missing candidate is a runtime entry boundary that warrants manual review. |
| Resolved name mismatches | `src/error.ts`, `src/utils/cookie.ts` | Plural filename, direct import, and package-entry matching now connect `test/errors.test.ts` and `test/cookies.test.ts` to these sources. |
| HTTP boundary roles | auth, CORS, request body, cookie, cache, and streaming utilities | Flat `src/utils/*` modules now receive behavioral rationale from HTTP boundary types without requiring framework-specific directory names. |
| Stateful HTTP roles | response construction, request events, proxies, and sessions | Lifecycle, translation, abort, header, expiry, rotation, and tamper branches now replace generic utility rationale. |
| Request dispatch roles | handlers, routes, request access, query boundaries, and WebSockets | Dispatch, registration, URL/header access, structured query input, upgrades, and connection lifecycle receive distinct review guidance. |
| Blocked subprojects | `docs`, `examples`, `playground` | Package markers create separate projects, but these workspace roles intentionally have no independent test framework or command. |

What it missed or over-reported:

- Earlier false missing-coverage findings for `src/error.ts` and `src/utils/cookie.ts` are now resolved through plural filename, direct import, and package-entry evidence.
- Static import and symbol evidence establishes plausible reachability but does not prove that tests assert the important behavior.
- Six blocker records from docs, examples, and playground remain visible, but auxiliary-workspace ranking prevents them from displacing root findings.
- The summary calls project audit coverage complete while also reporting six blockers, which is structurally valid but easy for a reader to interpret as contradictory.
- Twenty-four branch-heavy root candidates remain generic utilities after handler, route, request, query, and WebSocket roles are identified.

Heuristic follow-up:

- expand assertion-aware symbol evidence beyond static reachability when the audit needs to distinguish import from exercised behavior
- evaluate remaining generic utilities only where stable domain boundaries are stronger than filename coincidence

Re-audit after call/assertion-aware evidence (`2026-07-12`):

- the same pinned commit still detects four audited project roots, one untested candidate, 43 covered-but-risky targets, 16 skipped targets, and six blockers
- evidence now separates 10 asserted and 23 called direct-import relationships from 347 structural relationships without proven call/assertion usage
- the structural pool contains 282 bounded-indirect, 54 referenced-barrel, and six filename-convention links; those remain useful reachability evidence but are not promoted to asserted coverage
- the stable candidate counts show that the new usage dimension improves review precision without silently reclassifying audit targets
- after propagating usage through one-hop relative barrels, the same evidence graph reports 21 asserted and 65 called relationships, up from 10 asserted and 23 called; 53 of 54 referenced-barrel links now carry usage proof while candidate counts remain unchanged
- conservative bounded-indirect provenance additionally records 93 asserted and 186 called entrypoint paths for 279 of 282 indirect links; these are reported as `viaUsage`, not as assertions of the dependency itself

## `honojs/hono` Audit

Source:

- repository: `honojs/hono`
- audited commit: `cda1af2` (`2026-07-10`, `4.12.29`)

Command focus:

```powershell
node ./src/cli/index.js detect <hono checkout> --format json
node ./src/cli/index.js findings-projects <hono checkout> --format json
node ./src/cli/index.js rank <hono checkout> --adapter javascript --format json
```

What the tool found:

- seven supported JavaScript/TypeScript project roots: the package root plus six benchmark packages
- high-confidence root audit with Vitest conventions and the repository test command
- 148 repo-level findings: four missing coverage, 100 weak existing coverage, 32 low-value direct targets, and 12 blocked-project findings
- 19 high-severity findings after security middleware, request validation, response parsing, proxy behavior, and shared WebSocket lifecycle receive behavioral classifications while benchmark setup blockers remain low-severity auxiliary findings
- direct, bounded transitive-relative, relative-barrel, package-entry, exact-subpath, and wildcard-export evidence across a large conditional export surface
- direct root ranking with one missing candidate and extensive existing-test evidence across adapters, middleware, routers, JSX, client, and utility modules
- imported-symbol filtering narrowed existing-test path lists for 25 root candidates without moving any covered candidate back to missing
- machine-readable evidence provenance records 183 direct, 39 referenced-symbol, 57 filename-convention, and 820 bounded-indirect root test links

Representative findings:

| Category | Examples | Why it matters |
| --- | --- | --- |
| Covered but risky | validator modules, client modules, service-worker handlers, routing implementations | Branch-heavy framework behavior remains visible with concrete test paths. |
| Bounded indirect evidence | `fetch-result-please.ts`, `hono-base.ts`, ETag `digest.ts`, regex-router `matcher.ts` and `trie.ts` | Two bounded source-dependency hops now connect these implementations to tests of their consumers. |
| Export evidence | helper, middleware, JSX, client, and runtime entrypoints | The audit exercises the newer self-package and wildcard export matching on a real public package surface. |
| HTTP framework roles | routers, security middleware, request validation, streaming, response parsing, runtime adapters | Findings now describe the behavioral boundary and edge cases instead of collapsing these modules into generic branching utilities. |
| Auxiliary blockers | six `benchmarks/*` packages | Benchmark packages remain visible without displacing actionable root-package findings. |

What it missed or over-reported:

- Bounded transitive matching moved seven direct-root candidates from missing to covered-but-risky: client result parsing, JSX intrinsic helpers, ETag digest, `hono-base.ts`, two regex-router internals, and streaming utilities. The service-worker entry remains the sole direct-root missing candidate.
- The import walk stops after two source-dependency hops. This records plausible execution evidence without claiming that arbitrary downstream modules are covered.
- Bounded-indirect links make up most Hono evidence paths. Consumers can now distinguish these weaker reachability links from direct imports and referenced barrel symbols instead of treating all existing-test paths as equal.
- Directory qualification now prevents filename-only evidence from unrelated generic `index.ts`, `utils.ts`, `handler.ts`, and `types.ts` tests. Remaining broad matches come from imported barrels and tested consumers rather than basename coincidence.
- Barrel matching now requires named, aliased, default, namespace, or destructured CommonJS bindings to be referenced outside their import declaration. It remains static evidence: a reference does not prove that every behavioral branch was asserted.
- Markdown now displays at most five existing-test paths per finding and directs readers to the complete JSON evidence; machine-readable artifacts remain unchanged.
- HTTP role classification is deliberately limited to files that already qualify as branch-heavy; role paths do not promote otherwise low-value files into recommendations.

Heuristic follow-up:

- distinguish referenced bindings from actual runtime calls and assertions when stronger static evidence is available
- continue validating the HTTP role vocabulary against frameworks with flat utility layouts and different request/response abstractions

Re-audit after call/assertion-aware evidence (`2026-07-12`):

- the same pinned commit still detects seven audited project roots, four untested candidates, 100 covered-but-risky targets, 100 skipped targets, and 12 blockers
- evidence now separates 39 asserted and 116 called direct-import relationships from the larger structural evidence graph
- 820 bounded-indirect, 57 filename-convention, and 39 referenced-barrel links remain deliberately unlabelled as called or asserted
- only 155 of 1,099 evidence links currently carry usage proof, making direct-import call/assertion analysis valuable while clearly identifying barrel and transitive usage analysis as the next evidence-depth gap
- after propagating usage through relative barrels and declared package entry/subpath imports, the same graph reports 40 asserted and 146 called relationships; 31 additional export-surface links gain usage proof while candidate counts and evidence strengths remain stable
- conservative bounded-indirect provenance additionally records 114 asserted and 631 called entrypoint paths for 745 of 820 indirect links, without reclassifying those dependencies as directly called or asserted

## Additional JavaScript/TypeScript Probe: `sindresorhus/is`

Source:

- repository: `sindresorhus/is`
- audited commit: `7821031` (`2026-05-11`, `Fix CI`)

Result:

- project detection found one supported JavaScript/TypeScript project from `package.json`
- direct audit found a high-confidence Node test runner profile with `npm run test` and no blockers
- `source/index.ts` is covered-but-risky through direct imports from `test/test.ts` and `test/type-tests.ts`
- the two evidence links distinguish asserted runtime usage from called type-test usage
- two low-runtime-behavior source modules are skipped instead of promoted as direct test targets

Why it matters:

- This closes the previous false blocker for a non-owned TypeScript package using Node's built-in runner with an explicit TypeScript execution flag.
- The probe also locks common `source/` roots and generically named files inside `test/`, rather than requiring `src/` plus `.test` or `.spec` filenames.
- Runner support remains explicit rather than universal; unsupported frameworks should still produce blockers.

## Additional React Probe: `react-hook-form/react-hook-form`

Source:

- repository: `react-hook-form/react-hook-form`
- audited commit: `521adfc` (`2026-07-16`, `fix: expose resetDefaultValues through form context (#13598)`)

Result:

- direct audit found a high-confidence Jest and React Testing Library profile with `npm run test` and no blockers
- the initial audit took about 90 seconds and emitted roughly 159,000 output tokens; module-import parsing was repeated while matching every source against every test
- caching parsed module imports and dependency specifiers reduced the same audit to 9.7 seconds while preserving the evidence graph
- the follow-up large-suite slice indexes module paths and caches relative resolution plus barrel/export metadata; a generated 400-source/200-test audit improved locally from about 9.8 seconds to about 0.25 seconds with the same 200 covered, 200 untested, and 200 evidence relationships
- the generated check uses a broad 5,000 ms cross-platform regression ceiling; this is not a new timing guarantee for React Hook Form or another external repository
- eight declared `use*` modules are now classified as React hooks with component-level testing guidance and existing-test evidence
- `useController.ts` is no longer falsely classified as an HTTP route merely because its name contains `controller`
- the resulting audit contains one untested candidate, 37 covered-but-risky targets, and 67 skipped targets

Why it matters:

- React hooks in `.ts` files previously fell through to generic branching or low-runtime classifications, while hook names containing `controller` could receive incorrect HTTP rationale.
- Hook detection now runs before generic component and controller heuristics, but only for hook-shaped declarations inside detected React projects.
- Precomputing static import analysis removes repeated parsing without weakening the conservative two-hop dependency boundary or dropping complete JSON evidence.

## Workspace Probe: `typescript-eslint/typescript-eslint`

Source:

- repository: `typescript-eslint/typescript-eslint`
- audited commit: `c2386e4` (`2026-07-16`, `chore(deps): update dependency prettier to v3.9.5 (#12486)`)

Result:

- initial detection reported 30 supported JavaScript/TypeScript projects from the pnpm/Nx workspace
- nine package manifests under `packages/integration-tests/fixtures/*` were dependency fixtures rather than independently auditable projects, producing 18 meaningless setup blockers
- treating nested `fixtures` and `__fixtures__` directories as detection traversal boundaries reduced the project graph to 21 roots while preserving direct audits when a fixture itself is passed as the repository root
- four genuine auxiliary or no-test package blockers remain visible for the website-related packages and `tools/dummypkg`
- the final project audit reports 43 untested candidates, 581 covered-but-risky targets, and 1,213 skipped targets
- skipping test-evidence analysis for targets already classified as low-value reduced the full workspace audit from 50.7 seconds to 25.3 seconds; `packages/ast-spec` alone contains 843 skipped targets

Why it matters:

- Package manifests inside integration fixtures describe test inputs, not repository ownership boundaries. Reporting them as projects inflates audit coverage and blocker counts.
- Direct fixture audits remain possible, so the traversal rule removes workspace noise without making fixture repositories unauditable.
- Evidence matching cannot affect a skipped target's artifact, making the previous source-by-test analysis pure discarded work in type-heavy packages.
- Project source-file stats now apply the same nested ownership and fixture boundaries, avoiding double counts from both workspace-root and package-root scans.

Follow-up workspace command hardening:

- a directly or project-audited child package now inherits npm, pnpm, Yarn, or Bun command ownership only from the nearest statically matching workspace declaration
- package-local lockfiles or `packageManager` remain authoritative, while an unrelated sibling outside the declared patterns keeps its own package-manager result
- multiple owning-workspace lockfiles without an explicit `packageManager` now block the package-script command instead of selecting one by implementation order
- a package-root or owned test-harness config can contribute bounded static test discovery; an ancestor config requires an explicit child-script path that remains inside the owning workspace
- ambient root configs, arbitrary fixture configs, and unowned ancestor paths do not contribute test locations
- deterministic positive and near-miss fixtures lock these boundaries; the pinned typescript-eslint checkout should be rerun to gather live evidence for the new configuration behavior

## Additional JavaScript Probe: `expressjs/express`

Source:

- repository: `expressjs/express`
- audited commit: `ae6dd37` (`2026-07-12`, `feat: allow conditional revalidation for QUERY requests (#7366)`)

Result:

- direct audit found a high-confidence Mocha and Supertest profile with `npm run test` and no blockers
- all six runtime modules under `lib/` are classified instead of the previous zero-target result
- `application.js`, `request.js`, and `response.js` have bounded package-entry evidence with called and asserted entrypoint usage
- `utils.js` has five direct relative-import evidence links
- `view.js` remains an untested candidate because its package-entry path is beyond the conservative two-hop dependency limit
- `express.js` is skipped as low-runtime-behavior composition rather than promoted as a direct test target

Why it matters:

- Supertest alone previously produced a high-confidence profile with zero source targets, which overstated audit usefulness.
- Supporting `lib/`, Mocha, callable CommonJS exports, and root `require('..')` resolution makes the profile and candidate graph agree.
- The remaining `view.js` gap stays visible instead of silently expanding dependency traversal and weakening provenance.

## Collectors Grimoire App Audit

Source:

- repository: `m-stenbe/Collectors-Grimoire`
- audited commit: `a2d4c54` (`2025-01-27`, `Long overdue updates`)

Command focus:

```powershell
node ./src/cli/index.js findings-projects <Collectors-Grimoire checkout>
```

What the tool found:

- one Xcode-style Apple project
- Swift and Objective-C project signals
- Swift Testing and XCTest conventions
- `xcodebuild test -project "Collector's Grimoire.xcodeproj" -scheme "Collector's Grimoire"` as the detected command
- nine medium-severity missing-coverage findings
- many SwiftUI view and app-wiring files skipped as low-value direct test targets

Representative findings:

| Category | Examples | Why it matters |
| --- | --- | --- |
| Missing coverage | `CameraModel`, `CameraModel2`, `MTGCoreML`, `Theme` | The adapter found branch-heavy app code without matching tests. |
| Skipped low-value direct tests | SwiftUI views, app entry/wiring, environment containers | The audit avoided recommending direct tests for UI/wiring files without a matching UI or snapshot convention. |
| Existing structure | Xcode test folders and shared scheme | Detection can handle an app repo, not only Swift Package Manager fixtures. |

What it missed or over-reported:

- Branching logic is too generic as a rationale for app-specific Swift files.
- Camera and CoreML files need richer domain labels than `utility`.
- Xcode app support is bounded to the checked-in Swift alpha matrix and should not be described as equivalent to native Objective-C analysis or arbitrary Xcode build-graph evaluation.

Heuristic follow-up:

- split Swift app targets into camera/session, ML/classification, theming, and app-wiring categories
- improve SwiftUI and UIKit wrapper detection so direct test recommendations stay focused on model and state logic
- add app-style fixture coverage only after the Swift Package Manager behavior remains stable

## Current Alpha Gate Read

The real-repo report gate is satisfied for public-alpha validation:

- at least three real repositories have local audit summaries: Repo Test Architect, `cg-bff`/Swift package family, and Collectors Grimoire
- one JavaScript/TypeScript codebase is covered by the self-audit, while non-owned JavaScript/TypeScript coverage now includes the small `unjs/defu` and `sindresorhus/is` libraries, React Hook Form, the TypeScript ESLint monorepo, Express, and the `h3js/h3` and `honojs/hono` HTTP frameworks
- Swift package and Xcode-style app repos are covered
- reports include findings, misses, and follow-up heuristics
- no report requires source upload or remote service execution

Remaining gap:

- make local sibling package report generation independent of local checkout names
- rerun the pinned JavaScript/TypeScript repositories against the hardened conditional-export, module-format, barrel, type-only, and alias boundaries before broadening public support claims
- rerun pinned real repositories to populate their still-pending standardized performance observations
- rerun the pinned Playwright/Cypress repositories to record whether the new literal request-to-route boundary produces useful evidence without changing the older report's conservative runtime-reachability conclusions
