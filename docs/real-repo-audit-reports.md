# Real Repository Audit Reports

This page tracks local audit passes against real repositories that are not checked in as deterministic fixtures.

The purpose is product validation, not regression locking. These reports record what the tool found, what it missed, and which heuristics should be tightened before the private alpha is credible.

## Report Set

| Report | Ecosystem | Source | Command focus | Status |
| --- | --- | --- | --- | --- |
| [Collectors Grimoire Swift packages](cg-swift-audit-report.md) | Swift, Vapor, MongoDB | local sibling `cg-*` repositories | `findings-projects`, Swift adapter audit | current |
| Repo Test Architect self-audit | JavaScript, TypeScript | this repository | direct `javascript` adapter audit, placement audit | summarized below |
| `unjs/defu` audit | TypeScript, Vitest | `unjs/defu` at `82632b6` | `findings-projects`, direct `javascript` adapter ranking | summarized below |
| `h3js/h3` audit | TypeScript, Vitest | `h3js/h3` at `3eb3a57` | `findings-projects`, direct `javascript` adapter ranking | summarized below |
| `honojs/hono` audit | TypeScript, Vitest | `honojs/hono` at `cda1af2` | `findings-projects`, direct `javascript` adapter ranking | summarized below |
| Collectors Grimoire app audit | Swift, Xcode app | `m-stenbe/Collectors-Grimoire` at `a2d4c54` | `findings-projects`, Xcode-style Swift detection | summarized below |

This gives the alpha gate coverage across owned and non-owned JavaScript/TypeScript codebases and multiple Swift codebases, including Swift Package Manager, Vapor/MongoDB, and Xcode-style app structure.

## Repo Test Architect Self-Audit

Command focus:

```powershell
node ./src/cli/index.js rank . --adapter javascript
node ./src/cli/index.js placement . --adapter javascript
```

What the tool found:

- high-confidence JavaScript/TypeScript profile with `npm run test`
- Vitest and Jest signals, `test/` conventions, and matching test evidence
- 27 ranked candidates in the direct root audit after filtering sibling TypeScript reference mirrors for runtime JavaScript modules
- 19 conservative `keep` placement findings for tests that match source targets in the same project
- useful distinction between untested files and covered-but-risky files

Representative findings:

| Category | Examples | Why it matters |
| --- | --- | --- |
| Covered but risky | `adapter-registry`, `explain-target`, `project-findings`, `tool-api`, `test-plan` | Existing tests are treated as evidence, not proof of complete edge-case coverage. |
| Untested candidates | adapter audit modules, CLI/MCP entry modules, JSON-RPC handling | These are branch-heavy implementation files where more focused tests may reduce regression risk. |
| Low-value direct targets | DTO/reference files and low-runtime-behavior modules | The adapter avoids treating every source file as a direct test target. |
| Placement | `test/*.test.js` files matching `src/core/*` targets | Existing tests are reported as correctly colocated with the audited project. |

What it missed or over-reported:

- Direct root audit sees broad branching logic but does not yet understand module ownership well enough to rank adapter files by product risk.
- The project-wide audit of this repository is noisy because checked-in examples are intentionally separate fixture projects.
- The standalone `src/core/report.ts` reference renderer previously appeared as a candidate because the live implementation was duplicated inside the CLI without a runtime sibling module.

Heuristic follow-up:

- add ownership or package-role signals for adapter modules, CLI entrypoints, MCP transport, and core scoring modules
- keep reference implementations paired with their runtime JavaScript modules so the adapter can distinguish shipped behavior from mirrors
- use `--exclude-project "examples/**"` when generating self-audit reports that should ignore checked-in example fixtures

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
- direct ranking found `npm run test` but reported a blocker: `No supported JS test framework detected.`
- no candidates were emitted because the adapter could not identify a supported test framework

Why it matters:

- This is a useful non-owned blocker example. The tool correctly avoids pretending it can make high-confidence recommendations when test framework support is missing.
- The report also shows a near-term adapter gap: common JS package test runners outside Vitest/Jest still need explicit detection before alpha claims should broaden.

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
- `xcodebuild test -scheme "Collector's Grimoire"` as the detected command
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
- Xcode app support is still experimental and should not be described as equivalent to Swift Package Manager support.

Heuristic follow-up:

- split Swift app targets into camera/session, ML/classification, theming, and app-wiring categories
- improve SwiftUI and UIKit wrapper detection so direct test recommendations stay focused on model and state logic
- add app-style fixture coverage only after the Swift Package Manager behavior remains stable

## Current Alpha Gate Read

The real-repo report gate is satisfied for private alpha validation:

- at least three real repositories have local audit summaries: Repo Test Architect, `cg-bff`/Swift package family, and Collectors Grimoire
- one JavaScript/TypeScript codebase is covered by the self-audit, while non-owned JavaScript/TypeScript coverage now includes the small `unjs/defu` library and the larger `h3js/h3` and `honojs/hono` HTTP frameworks
- Swift package and Xcode-style app repos are covered
- reports include findings, misses, and follow-up heuristics
- no report requires source upload or remote service execution

Remaining gap:

- make local sibling package report generation independent of local checkout names
- turn the `h3` and Hono false positives into fixture-backed transitive, directory-qualified, and exported-symbol matching improvements before broadening public support claims
