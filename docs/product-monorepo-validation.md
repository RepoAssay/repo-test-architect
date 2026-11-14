# Product-Monorepo Validation

This plan records what the first two runs of Repo Test Architect on private product monorepos found, why the live-validation corpus had not found it, and which open-source repositories close that gap for every adapter. The decision is recorded in the [decision log](decision-log.md) under "a product-monorepo validation role for every adapter", and the work is tracked in [#325](https://github.com/RepoAssay/repo-test-architect/issues/325).

## What Happened

Between November 9 and November 13, 2026 the MCP server was run through Claude Code against two private repositories: a Swift application with about eighteen local packages under one Xcode workspace, and a multi-module Android application. Two runs produced eight adapter issues and one transport failure:

| Issue | Adapter | Shape that exposed it | Failure class |
| --- | --- | --- | --- |
| #306, #307 | MCP server | about eighteen connected packages | a 21 MB tool result crashed the client; fixed in 1.2.0 |
| #309 | Swift | local packages below a root workspace | nested packages audited twice; fixed in 1.2.0 |
| #310 | Swift | several shared Xcode schemes | root project blocked; open |
| #311 | Swift | iOS-only packages | `swift test` suggested at high confidence for a package that cannot build on the host; fixed in 1.3.0 |
| #312 | all adapters | a package without a test target | reported as a high-severity blocker rather than a finding; open design question |
| #315 | Kotlin/JVM | mapper files holding only top-level extension functions | reported as untested; fixed in 1.3.0 |
| #316 | Kotlin/JVM | Android `src/test` and `src/androidTest` source sets | misleading blocker, instrumented tests dropped silently; fixed in 1.3.0 |
| #317 | Swift | `Type+Feature.swift` extension files tested through bound locals | reported as untested; fixed in 1.3.0 |
| #318 | Swift | tests in a sibling package that import the module | ignored; open |

Every entry is a shape problem: project nesting, platform constraints, source-set layout, team naming conventions, cross-package ownership, or scale. None is a parsing defect inside a shape the corpus already covered. Most failures were conservative (missing evidence or a blocker); #311 was a false high-confidence command, the class that erodes trust fastest.

## What The Corpus Covers Today

`evals/validation-corpus.json` pins three public repositories per adapter in three roles: a conventional library or service, a framework-heavy application, and a difficult ownership graph. The validation hunt reports add a few more repositories per adapter. Nearly all of them are open-source libraries and frameworks: single products, conventional layouts, audits that finish in seconds, selected because the adapter could explain them. The Swift corpus is ReerCodable, the Swift Package Index server and rules_swift, with Quick and one small SwiftUI application in the hunt; the Kotlin/JVM hunt covered twenty-three repositories and no Android application. Those repositories confirmed the heuristics the adapters already had. They did not hunt for shapes the adapters had not modeled, and the other nine adapters were validated to the same depth.

## The Fourth Role

A product monorepo is an application or service repository, not a library, with several packages or modules under one root, at least one platform or build constraint the host cannot satisfy by default, and the naming and layout conventions of a team rather than of a framework template. One such repository per adapter becomes a fourth corpus role beside the existing three, pinned at an exact commit with a scorecard like the others, once a hunt pass against it has been triaged.

Selection criteria: open source and maintained, large enough that `review_repository` exercises project detection across more than one package or module, and representative of how companies lay out that ecosystem rather than how a library author does.

## Candidates

These are starting points, not pins. A hunt pass verifies the current layout, records the exact commit, and may replace a candidate whose shape has drifted.

| Adapter | Candidate | Why this shape |
| --- | --- | --- |
| Swift | `Dimillian/IceCubesApp` | an Xcode application built from many local Swift packages, the #309, #310 and #318 shape; `signalapp/Signal-iOS` as the heavier second case |
| Kotlin/JVM | `android/nowinandroid` | a multi-module Android application with convention plugins, build variants, `androidTest` and computed Gradle includes, the #315 and #316 shape |
| JavaScript/TypeScript | `calcom/cal.com` | a Turborepo monorepo with web applications, shared packages and several test runners |
| Python | `PostHog/posthog` | a Django application with plugin packages and mixed pytest layouts |
| Go | `mattermost/mattermost` | a server with a web application, plugins and several modules in one repository |
| Rust | `astral-sh/ruff` | a Cargo workspace of many crates behind one product; `zed-industries/zed` as the heavier second case |
| Ruby | `mastodon/mastodon` | a large Rails application with engines-style subsystems and both RSpec and system tests |
| PHP | `monicahq/monica` | a Laravel application with feature and unit suites outside the library layout |
| Elixir | `plausible/analytics` | a Phoenix application with several OTP applications and mixed test support |
| C# | `bitwarden/server` | a multi-project solution with many test projects and shared build properties; `jellyfin/jellyfin` as the second case |
| Dart | `immich-app/immich` | a Flutter mobile application inside a polyglot monorepo with a TypeScript server, which also exercises the JavaScript adapter |

## Corpus Role And Enforcement

`validation-corpus/v1` accepts the role `product-monorepo` beside the three existing roles. `scripts/check-validation-corpus.js` keeps the three existing roles required for every adapter and requires `product-monorepo` only for the adapters listed in its `productMonorepoRequiredAdapters` set, so a pin can land adapter by adapter; once every adapter has one, the role joins the required list. A pin needs what every other corpus case needs: the full 40-character commit, the project root and audit options, the support boundary, the hunt report, the observed command (or `null` when withholding passed command review), candidate counts, at least three timing samples with their median, repeated identical canonical digests, and a reviewed seven-area scorecard. A failing scorecard area stays in the hunt report as an open finding; it is not pinned as passing.

## Procedure

1. Shallow-clone the candidate at an exact commit and run `repo-test-architect review <root>` and `analyze <root> --format json` without executing repository code.
2. Triage every blocker, every high-confidence command, and the untested candidates of each project root against the repository's real tests, as the hunt reports do. A command that would fail, a blocker that misdescribes the repository, and a test that exists but is not linked are each an issue with a minimal reproduction.
3. Fix issues through reviewed pull requests, each with a regression fixture, a support-matrix update and a decision-log entry when a rule changes.
4. Pin the repository as the adapter's product-monorepo corpus case with a scorecard and a validation report, and keep it in the live-validation refresh.

## Passes

| Adapter | Repository | Commit | Report | Outcome |
| --- | --- | --- | --- | --- |
| JavaScript/TypeScript | `calcom/cal.com` | `ef7954d16ab50882ca2f263c551537115b8a8bb1` | [cal.com hunt](javascript-calcom-validation-hunt-report.md) | three adapter issues (#329 root-owned runner configuration not inherited, #330 stale `jest.config.json` selects `npx jest`, #331 package-root sources not audited); not pinned until they are fixed |

## Order

The first public pass was `calcom/cal.com` for JavaScript/TypeScript, the most used adapter (see Passes above); it ran at once rather than waiting for re-runs of the private repositories, which only the owner can perform and which remain follow-up validation. `Dimillian/IceCubesApp` and `android/nowinandroid` come next, as public release gates for the Swift and Kotlin/JVM changes that follow 1.3.0 (#310, #312, #318), so that those changes ship with reproducible evidence. The remaining candidates then follow in usage order: Python, Go, Rust, Ruby, PHP, Elixir, C#, Dart. Each pass verifies the candidate's current shape first and replaces a candidate whose layout has drifted, recording the reason here.
