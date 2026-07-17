# Swift Alpha Hardening Boundary

This matrix defines the evidence boundary for moving the Swift adapter from an experimental spike toward private-alpha quality. It describes conventions the adapter detects and tests today; it does not yet promote Swift to supported maturity.

## Current Common-Pattern Coverage

| Area | Current support | Evidence used |
| --- | --- | --- |
| Package and project shapes | Swift Package Manager and Xcode projects | `Package.swift`, `.xcodeproj`, shared schemes, and test plans |
| Test frameworks | Swift Testing, XCTest, Quick, Nimble, SnapshotTesting, and XCTVapor | imports, package dependencies, and product declarations |
| Commands | `swift test` and scheme/test-plan-aware `xcodebuild test` | package, project, shared scheme, and unambiguous test-plan markers |
| SwiftPM source layout | conventional `Sources/<Target>/` and `Tests/<TestTarget>/` paths | source target and test target directory ownership |
| Xcode source layout | app/framework source folders plus `*Tests` and `*UITests` folders | project markers and target-like directory names |
| Test names | `*Test.swift`, `*Tests.swift`, and Quick-style `*Spec.swift` | target-qualified filename evidence |
| Application boundaries | services, clients, repositories, storage, commands/workers, parsers, URL/query builders, and error mapping | path, declaration, branching, async/concurrency, encoding, and platform API signals |
| Server boundaries | Vapor routes, middleware, lifecycle files, Fluent models, XCTVapor, and MongoDB operations | imports, protocols, calls, and package products |
| UI boundaries | SwiftUI architecture, views, Xcode UI test folders, and snapshot support | imports, `View` declarations, test locations, and package products |

Swift Package Manager conventionally collects sources and tests by target name under `Sources` and `Tests`, and each target forms a module or test suite. The adapter uses that target ownership to avoid matching the same source filename across unrelated modules. See the official [Creating a Swift package](https://docs.swift.org/swiftpm/documentation/packagemanagerdocs/creatingswiftpackage/) and [Target](https://docs.swift.org/swiftpm/documentation/packagedescription/target/) documentation.

## Evidence Boundary

Swift source-to-test evidence currently remains structural:

- a source/test basename relationship must use a recognized `Test`, `Tests`, or `Spec` suffix
- conventional SwiftPM target directories, Xcode test directories, and `import`/`@testable import` statements qualify ownership
- the same basename in another target is not credited unless the test imports or belongs to that target
- emitted evidence uses `filename-convention` with `naming` strength
- naming evidence does not prove that a symbol is referenced, called, asserted, or behaviorally covered

This normalized evidence now flows through audit, plan, explanation, findings, placement, and stats artifacts using the shared model. Stronger Swift evidence should be added as a distinct direct or referenced relationship only when the adapter can actually prove it.

## Known Gaps Before Swift Alpha

- custom SwiftPM target paths and explicit source lists are not parsed from the manifest
- source-to-test symbol references, calls, assertions, and macros are not resolved
- test target dependencies are inferred from directory ownership and imports rather than a parsed package graph
- multiple Xcode schemes or test plans remain ambiguous when no project-name or single-plan choice exists
- UI tests, snapshot tests, and XCTVapor tests are detected, but runtime reachability is not mapped back to source modules
- Objective-C is visible to the adapter and XCTest detection, but direct Objective-C source classification remains deferred
- generated sources, macros, plugins, conditional manifests, and platform-specific target graphs need more real-repository validation

## Promotion Direction

Swift can move from experimental toward private alpha when:

1. multi-target ownership and custom target-path behavior are validated on maintained public Swift packages
2. at least one direct Swift symbol relationship is emitted without weakening shared evidence semantics
3. Xcode app findings remain conservative across multiple schemes, UI tests, and test plans
4. the deterministic private-alpha gate and pinned real-repository reports remain stable

The goal is the same as JavaScript/TypeScript: support the popular, inspectable shapes well and report uncertainty for the long tail instead of claiming universal repository coverage.
