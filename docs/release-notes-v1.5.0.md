# Repo Test Architect 1.5.0

Status: **prepared, not yet published**. Publication status is recorded here and in the [publication ledger](distribution-metrics.md) once the release commit is published.

## Summary

A compatible minor release that fixes the eight adapter issues found by the product-monorepo hunts and by a run on a large Swift monorepo, and pins the first three product-monorepo corpus cases. JavaScript/TypeScript workspace packages that rely on the root test script are now audited with that runner and a working command, stale runner configuration no longer produces a false command, and packages without a `src/` directory are audited from the package root. The Kotlin/JVM adapter audits Android flavor source sets, suggests the flavored unit-test task instead of the aggregate `test` task, and skips test-support modules. The Swift adapter credits initializers declared in extensions of nested types and skips test doubles shipped in `Sources/`.

The 20 MCP tool names, the CLI commands, inputs and artifact schemas are unchanged except for two optional fields in the `validation-corpus/v1` schema. Audit results change on affected repositories, as listed under [Compatibility Notes](#compatibility-notes).

## Why

The 1.4.0 hunts on cal.com and Now in Android filed six issues (#329, #330, #331, #336, #337, #341), and a 1.4.0 run on a large Swift monorepo found two more (#349, #350). All eight are shape problems of real product repositories: root-run workspace tests, migrated runners, source-at-root packages, flavored Android apps, test-support modules, nested Swift types and mocks shipped with production code.

## JavaScript/TypeScript

- **Workspace packages inherit the root test runner** (#329, PR #344). A package with no runner or test script of its own is run by the owning workspace's root `test` script when that script selects Vitest or Jest, the root depends on the runner, and the package's tests provably belong to it: the root's literal include and exclude patterns decide when present, otherwise a test file must import the runner. The package reports the runner, the `workspace-inherited runner` convention and a command in the package manager's documented form (`npm --prefix <root> test -- <package>`, `pnpm -C <root> run test <package>`, `yarn --cwd <root> test <package>`, `yarn run -T test <package>`); Bun inherits the runner but not the command.
- **Stale runner configuration does not select a command** (#330, PR #344). A runner known only from a configuration file is dropped when the tests import a different unit runner; the command is withheld with the `conflicting-runner-config` diagnostic unless a script or inherited command applies. Unit runners and Playwright are also recognised from test-file imports (comments ignored), which never produce a bare `npx <runner>` command. Scripts may set environment variables before the runner (`TZ=UTC vitest run`).
- **Packages without a conventional source root are audited from the package root** (#331, PR #345), excluding tooling configuration, test setup files, test doubles and stories, top-level support folders and test-double folders at any depth.

## Kotlin/JVM

- **Android flavor source sets** (#336, PR #346). Flavors known from a module's own literal `productFlavors` block, or from a `src/test<Flavor>` / `src/androidTest<Flavor>` set in an Android module, are shared across the module graph; `src/<flavor>` sources are production code and flavor test sets give the usual evidence kinds.
- **Android module detection reads plugin applications** (PRs #346, #353): a module's own build file decides, catalog aliases count only when they name an Android module kind (`android.application|library|test|feature`), and add-on plugins such as `android.lint` do not.
- **The flavored unit-test task replaces the aggregate `test` task** (#341, PR #346). With one flavor dimension and exactly one flavor with unit tests the command is `./gradlew test<Flavor>DebugUnitTest`; otherwise it is withheld with `ambiguous-android-variant`.
- **Test-support modules are skipped** (#337, PR #347). A module applying `com.android.test`, or with a test-support name corroborated by a main-configuration test-library dependency or a `src/main` test-framework import, has its sources skipped as `test-support`; the module stays in the graph.

## Swift

- **Nested-type extension initializers** (#349, PR #351). Members of `extension Outer.Inner` are credited through the qualified call `Outer.Inner(label:)`; nested types' own initializers join the ambiguity check, and a sibling project's own outer type blocks cross-package links.
- **Test doubles in `Sources/` are skipped** (#350, PR #351): test-double folders below the module root, prefixed test-support targets that only tests of the same manifest depend on, and file-named `…Mock`/`…Fake`/`…Stub`/`…Spy` types that conform to a project protocol.

## Validation

- `validation-corpus/v1` gains optional `measurement: "project" | "repository"` and `observed.projectCount`; repository-scan cases measure `auditDetectedProjects` and refuse scans with failed projects (PR #348).
- Pinned product-monorepo cases: `swift-icecubesapp` (#348), `javascript-calcom` and `kotlin-nowinandroid` (#352). The role is now required for the JavaScript/TypeScript, Kotlin/JVM and Swift adapters.

## Compatibility Notes

- **JavaScript/TypeScript:** workspace packages run by the root gain a framework, a command and `high` confidence instead of `missing-test-framework` / `missing-test-command`; packages with a stale configuration lose a false `npx jest`-style command and gain `conflicting-runner-config`; packages whose tests import a runner gain it in `testFrameworks`; packages without `src/`/`lib/` gain candidates where they had none. On cal.com blockers fall from 214 to 1 and candidates rise from 558 to 1,416; one package with both Vitest unit tests and a Playwright e2e spec (`googlecalendar`) still withholds its command.
- **Kotlin/JVM:** flavored Android apps get `test<Flavor>DebugUnitTest` or a withheld command instead of `./gradlew test`; flavor sources and test sets add candidates and evidence; test-support module sources move from candidates to `skipped` with kind `test-support`. The Android boundary message is reworded and keeps its prefix.
- **Swift:** nested extension files gain evidence; test doubles move to `skipped` with kind `test-support`.
- New diagnostic codes: `conflicting-runner-config`, `ambiguous-android-variant`. New skipped kind: `test-support` (Kotlin, Swift). No artifact field is removed or renamed; golden snapshots are unchanged.

## Installation And Upgrade

```sh
npx --yes repo-test-architect@1.5.0 doctor
npx --yes repo-test-architect@1.5.0 review .
```

Clients that pinned `1.4.0` must update their package argument to receive these changes.

## Verification

Every change has regression tests from its issue's fixture plus the negatives found in review; each pull request (#344, #345, #346, #347, #348, #351, #352, #353) passed the Linux `pr-gate`, the Windows portability check and an independent model review before merge, with the macOS Swift check on #351. The release commit passed the full local release gate (1,810 tests) and strict distribution checks; the three-OS release matrix is recorded in the publication ledger once it has run on the release commit.
