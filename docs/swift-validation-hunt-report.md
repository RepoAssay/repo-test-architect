# Swift Validation Hunt Report

This report mirrors the JavaScript/TypeScript real-repository workflow for the supported Swift adapter. The deterministic validation finder ranks active public repositories by exact root evidence rather than relying on topics alone, then selected repositories are shallow-cloned and audited locally without uploading source or running their own test suites.

## Discovery Profiles

The repository finder now separates the major supported and legacy Swift shapes:

| Profile | Required root evidence | Validation purpose |
| --- | --- | --- |
| `swift` | `Package.swift`, with an additional signal for root `Tests` | conventional SwiftPM packages |
| `swiftui-xcode` | checked-in `.xcodeproj` or `.xcworkspace` | application layout, schemes, SwiftUI, and app test folders |
| `swift-vapor` | SwiftPM plus Vapor product or repository markers | server routes, middleware, commands, Fluent, and integration tests |
| `swift-bazel` | `MODULE.bazel` or workspace content referencing rules_swift/Swift rules | Bazel ownership, fixtures, macros, and `swift_test` |
| `swift-macro` | SwiftPM macro or plugin declarations | external declarations, implementation targets, and expansion tests |
| `swift-legacy` | Podfile and/or Xcode project/workspace | older CocoaPods and mixed project layouts |

Example searches:

```powershell
npm run validation:repos -- --profile swiftui-xcode,swift-vapor,swift-macro --min-stars 50
npm run validation:repos -- --profile swift-bazel --min-stars 0 --pushed-since 2024-01-01
```

The SwiftUI/Xcode search surfaced maintained application candidates including FineTune, XcodesApp, Swiftfin, IceCubesApp, and CopilotForXcode. The Bazel profile deliberately searches Starlark-primary repositories because canonical rules_swift workspaces are rarely classified by GitHub as Swift-primary.

## Selected Public Probes

| Repository | Audited commit | Role | Frameworks | Command | Untested | Covered | Skipped | Recommended | High-risk notes |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| [FineTune](https://github.com/ronitsingh10/FineTune) | `2285279d36d3f8115c1c2d4aecd904f1bdf96a51` | compact maintained SwiftUI/Xcode application | Swift Testing | `xcodebuild test -project FineTune.xcodeproj -scheme FineTune` | 41 | 44 | 66 | 85 | 3 |
| [Swift Package Index Server](https://github.com/SwiftPackageIndex/SwiftPackageIndex-Server) | `26943bfd3e62f29348e6a06722ba5fcd9dc11d58` | production Vapor/Fluent service | SnapshotTesting, Swift Testing, VaporTesting | `swift test` | 91 | 93 | 166 | 184 | 75 |
| [ReerCodable](https://github.com/reers/ReerCodable) | `9e9edc29e1aa6c6c644f5761737506cc243236f7` | macro declarations, implementations, and expansion tests | Swift Testing, XCTest | `swift test` | 17 | 22 | 15 | 39 | 0 |
| [rules_swift](https://github.com/bazelbuild/rules_swift) | `4428a622d5127737fda3d55752659a657216281a` | canonical Bazel/rules_swift workspace | Swift Testing, XCTest | `bazel test //...` | 29 | 5 | 102 | 34 | 0 |
| [Quick](https://github.com/Quick/Quick) | `2b4547b230e94d84320724fd6df65e418b058be2` | maintained framework with older Xcode/CocoaPods compatibility structure | Nimble, Quick, XCTest | `swift test` | 14 | 21 | 35 | 35 | 2 |

All five profiles are high confidence and report no blockers. These are adapter audits, not claims that the repositories' own test suites pass at the pinned commits.

## Local No-Meaningful-Tests Cohort

Twelve neighboring `cg-*` Swift packages were also audited. Each currently contains at least one checked-in test source, but most are scaffold or placeholder suites and therefore behave like no-meaningful-tests repositories from the evidence graph.

| Package | Swift files | Test files | Untested | Covered | Skipped | High-risk notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `cg-account` | 6 | 1 | 2 | 0 | 2 | 2 |
| `cg-apienvironment` | 3 | 1 | 0 | 0 | 1 | 0 |
| `cg-bff` | 65 | 1 | 24 | 0 | 36 | 20 |
| `cg-chat` | 5 | 1 | 2 | 0 | 1 | 2 |
| `cg-configuration` | 4 | 1 | 1 | 0 | 1 | 0 |
| `cg-finance` | 6 | 1 | 2 | 0 | 2 | 2 |
| `cg-magicthegathering` | 10 | 1 | 3 | 0 | 5 | 2 |
| `cg-magicthegathering-ml` | 3 | 1 | 0 | 0 | 1 | 0 |
| `cg-networking` | 14 | 5 | 4 | 1 | 3 | 2 |
| `cg-persistence` | 6 | 1 | 4 | 0 | 0 | 0 |
| `cg-pod` | 6 | 1 | 2 | 0 | 2 | 2 |
| `cg-tcg-ml` | 3 | 1 | 0 | 0 | 1 | 0 |

This cohort is useful for validating candidate value and placeholder-test honesty: framework detection must not turn an empty or unrelated suite into matching coverage.

## Problems Exposed and Fixed

The live probes found several concrete sources of audit noise:

- unrelated Bazel fixtures named `main.swift` were credited through filename convention when custom Starlark macros left their module ownership unresolved; generic Swift filenames now require an import, declared dependency, or matching test/module owner
- external macro declaration files containing only `#externalMacro` wiring were recommended as direct utility tests; they are now deferred to macro expansion and representative client-compilation tests while implementation targets remain analyzable
- files under a Vapor `Controllers` directory were all treated as HTTP routes, including nested response models, query helpers, and compatibility helpers; controller-adjacent files now require request-handler or explicit route-registration behavior, while real database helpers remain integration-level data-access targets
- comments and ordinary collection/rendering operations could leak MongoDB, database-write, or raw-SQL signals through names such as `MongoKitten`, `Set.insert`, and `HTML.raw`; source-level driver detection now masks comments and strings, Fluent writes require `on:` semantics, and raw SQL requires SQL context
- protocol references in tests could credit a concrete implementation declared in the same source file even when the test only defined a mock conformer; mixed files now require evidence for a concrete declaration, while protocol-only files explicitly defer direct testing to conformers and consumers

After hardening, three unrelated rules_swift example entrypoints moved from covered to untested instead of borrowing a fixture's `main.swift` test name. ReerCodable's 15 external declaration files moved out of direct recommendations, reducing its recommendations from 54 to 39 without hiding the macro implementation sources.

The Swift Package Index calibration kept the same 184 actionable targets while moving seven controller-adjacent helpers out of the HTTP-route bucket: five retained high-risk data-access treatment and two became medium-risk branching utilities. It also removed a false MongoDB architecture from the Postgres service and reduced high-risk notes from 77 to 75. The small 90/94 to 91/93 coverage shift reflects corrected target identity rather than a lost test suite.

The FineTune calibration exposed `AccessibilityPermissionService` as untested because its only previous evidence was a mock conforming to `AccessibilityTrustProviding`; concrete instantiation and call evidence still count normally. Four protocol-only contracts now carry an explicit deferred-coverage reason, with `ProcessTapControlling` moving out of direct recommendations. The result changes from 40/46/65/86 to 41/44/66/85 for untested/covered/skipped/recommended while preserving all three high-risk notes.

## Next Validation Pressure

- FineTune should remain the compact application probe for protocol-driven dependency injection, CoreAudio boundaries, and Swift Testing evidence.
- Swift Package Index Server should remain the recurring Vapor/Fluent pressure test, especially as SQL builder and migration semantics expand.
- rules_swift still relies on custom Starlark macros that the static reader does not expand; its examples and fixtures should remain a recurring ownership probe.
- The local `cg-*` packages should remain a no-meaningful-tests cohort even as real suites are added incrementally, because they expose the difference between framework presence and source coverage.
