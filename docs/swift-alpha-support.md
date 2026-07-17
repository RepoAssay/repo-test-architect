# Swift Alpha Hardening Boundary

This matrix defines the evidence boundary for moving the Swift adapter from an experimental spike toward private-alpha quality. It describes conventions the adapter detects and tests today; it does not yet promote Swift to supported maturity.

## Current Common-Pattern Coverage

| Area | Current support | Evidence used |
| --- | --- | --- |
| Package and project shapes | Swift Package Manager, Xcode projects/workspaces, and Swift Bazel workspaces | `Package.swift`, `.xcodeproj`, `.xcworkspace`, shared schemes/test plans, `MODULE.bazel`/`WORKSPACE`, and Swift BUILD rules |
| Test frameworks | Swift Testing, XCTest, Quick, Nimble, SnapshotTesting, and XCTVapor | imports, package dependencies, and product declarations |
| Commands | `swift test`, workspace/scheme/test-plan-aware `xcodebuild test`, and `bazel test //...` | package, project/workspace, container-matching shared scheme, scheme-default or otherwise unambiguous test plan, and `swift_test` markers |
| Bazel target layout | `swift_binary`, `swift_library`, and `swift_test`, including test sources owned through direct dependencies | BUILD target sources, module names, direct dependencies, imports, and glob patterns |
| SwiftPM source layout | default `Sources`, `Source`, `src`, `srcs`, and `Tests` search roots plus manifest-declared custom paths, source lists, excludes, and test dependencies | parsed target declarations plus source and test ownership |
| Xcode source layout | app/framework source folders plus `*Tests` and `*UITests` folders | project markers and target-like directory names |
| Test relationships | `*Test.swift`, `*Tests.swift`, Quick-style `*Spec.swift`, and uniquely declared top-level symbol references | target-qualified naming evidence plus module-qualified symbol usage |
| Application boundaries | services, clients, repositories, storage, commands/workers, parsers, URL/query builders, and error mapping | path, declaration, branching, async/concurrency, encoding, and platform API signals |
| Server boundaries | Vapor routes, middleware, lifecycle files, Fluent models, XCTVapor, and MongoDB operations | imports, protocols, calls, and package products |
| UI boundaries | SwiftUI architecture, views, Xcode UI test folders, and snapshot support | imports, `View` declarations, test locations, and package products |

Swift Package Manager searches target-named subdirectories under `Sources`, `Source`, `src`, and `srcs`, with `Tests` also available for test targets; `path`, `sources`, and `exclude` can define further custom layouts. Each target forms a module or test suite. The adapter parses those static declarations and test-target dependencies to avoid matching the same source filename across unrelated modules. See the official [Creating a Swift package](https://docs.swift.org/swiftpm/documentation/packagemanagerdocs/creatingswiftpackage/), [Target](https://docs.swift.org/swiftpm/documentation/packagedescription/target/), [path](https://docs.swift.org/swiftpm/documentation/packagedescription/target/path/), and [sources](https://docs.swift.org/swiftpm/documentation/packagedescription/target/sources/) documentation.

Bazel's `swift_test` can own test sources directly or discover XCTest cases in direct dependencies. The adapter follows both shapes, including tests outside `Tests` directories, and uses `bazel test //...` as the conservative workspace command. See the official [rules_swift API](https://registry.bazel.build/docs/rules_swift) and [Bazel test command](https://bazel.build/docs/user-manual#running-tests) documentation.

Xcode schemes associate test targets and test plans with a project or workspace build. The adapter qualifies commands with a sole or scheme-matching checked-in workspace. When a container-matching shared scheme references multiple checked-in plans, it selects the single default plan; it also accepts a scheme's sole referenced plan or the repository's sole plan. Ambiguous choices remain unreported. See Apple's guidance on [running tests and interpreting results](https://developer.apple.com/documentation/xcode/running-tests-and-interpreting-results) and [organizing tests to improve feedback](https://developer.apple.com/documentation/xcode/organizing-tests-to-improve-feedback).

## Evidence Boundary

Swift filename evidence remains structural:

- a source/test basename relationship must use a recognized `Test`, `Tests`, or `Spec` suffix
- conventional or manifest-declared SwiftPM ownership, target dependencies, Xcode test directories, and `import`/`@testable import` statements qualify ownership
- the same basename in another target is not credited unless the test imports or belongs to that target
- emitted evidence uses `filename-convention` with `naming` strength
- naming evidence does not prove that a symbol is referenced, called, asserted, or behaviorally covered

Swift also emits stronger `swift-symbol-reference` evidence when a test qualified by its import, target directory, or declared build dependency references a uniquely declared top-level type or function from the source file:

- the evidence uses `referenced` strength because a module import does not identify a source file as directly as a relative file import
- constructor and top-level function calls carry `called` usage
- references inside `#expect`, `#require`, XCTest assertions, or Nimble `expect` expressions carry `asserted` usage
- comments, ordinary string literals, test-local declarations, duplicate declarations in the same module, and wrong-target references are not credited
- this evidence proves a static symbol relationship, not runtime execution or behavioral completeness

This normalized evidence now flows through audit, plan, explanation, findings, placement, and stats artifacts using the shared model. Stronger Swift evidence should be added as a distinct direct or referenced relationship only when the adapter can actually prove it.

## Known Gaps Before Swift Alpha

- custom Starlark macros, generated BUILD files, `select()` expressions, aliases, and transitive Bazel test-source graphs are not resolved
- member-level references through inferred receiver types, overload resolution, extensions, aliases, raw-string interpolation, and macro expansion are not resolved
- computed Swift manifests, local variables that assemble targets, conditional target graphs, and dependency aliases are not resolved by the static manifest reader
- multiple Xcode schemes remain ambiguous when none matches the project name; multiple plans remain ambiguous when the selected scheme lacks a single default or sole reference
- UI tests, snapshot tests, and XCTVapor tests are detected, but runtime reachability is not mapped back to source modules
- Objective-C is visible to the adapter and XCTest detection, but direct Objective-C source classification remains deferred
- generated sources, macros, plugins, conditional manifests, and platform-specific target graphs need more real-repository validation

## Promotion Direction

Swift can move from experimental toward private alpha when:

1. multi-target ownership, custom target paths, and Bazel Swift behavior are validated on maintained public repositories
2. Swift symbol evidence remains conservative across maintained public packages with overloaded APIs, extensions, macros, and generated sources
3. Xcode app findings remain conservative across multiple schemes, UI tests, and test plans
4. the deterministic private-alpha gate and pinned real-repository reports remain stable

The goal is the same as JavaScript/TypeScript: support the popular, inspectable shapes well and report uncertainty for the long tail instead of claiming universal repository coverage.
