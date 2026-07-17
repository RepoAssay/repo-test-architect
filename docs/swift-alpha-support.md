# Swift Alpha Support

This matrix is the acceptance boundary for the supported Swift private-alpha adapter. It describes conventions the adapter detects and tests today; it is not a claim that every Swift repository, computed build graph, or Objective-C implementation will be interpreted perfectly.

## Current Common-Pattern Coverage

| Area | Current support | Evidence used |
| --- | --- | --- |
| Package and project shapes | Swift Package Manager, Xcode projects/workspaces, and Swift Bazel workspaces | `Package.swift`, `.xcodeproj`, `.xcworkspace`, shared schemes/test plans, `MODULE.bazel`/`WORKSPACE`, and Swift BUILD rules |
| Test frameworks | Swift Testing, XCTest, Quick, Nimble, SnapshotTesting, VaporTesting, XCTVapor, RxTest, and RxBlocking | imports, package dependencies, and product declarations; VaporTesting supports modern Vapor/Swift Testing suites while XCTVapor supports XCTest suites |
| Commands | `swift test`, project/workspace/scheme/test-plan-aware `xcodebuild test`, and `bazel test //...` | package, sole or scheme-matching project/workspace, container-matching shared scheme, scheme-default or otherwise unambiguous test plan, and `swift_test` markers |
| Bazel target layout | `swift_binary`, `swift_library`, and `swift_test`, including test sources owned through direct dependencies | BUILD target sources, module names, direct dependencies, imports, and glob patterns |
| SwiftPM source layout | library, executable, test, macro, and plugin targets under default or alternate roots, version-specific manifests, simple target helper wrappers, plus manifest-declared custom paths, source lists, excludes, and test dependencies | parsed target declarations, target kinds, source ownership, and test dependencies |
| Xcode source layout | app/framework source folders plus `*Tests` and `*UITests` folders | project markers and target-like directory names |
| Dependency boundaries | excludes CocoaPods, Carthage, checked-out package caches, conventional vendored roots, SwiftPM symlink overlays, and standalone example/playground projects | `Pods`, `Carthage`, `SourcePackages`, `.symlinks`, `Vendor`, `vendor`, symbolic links, nested project markers, and playground directories |
| Generated source boundaries | skips conventional generated directories, protobuf/gRPC or `.generated.swift` files, and explicit generator headers | path segments, filename suffixes, and the first 12 source lines |
| Test relationships | `*Test.swift`, `*Tests.swift`, Quick-style `*Spec.swift`, root-level test filenames, and uniquely declared top-level symbol references | target-qualified naming evidence plus module-qualified symbol usage |
| Application boundaries | services, clients, repositories, storage, commands/workers, parsers, URL/query builders, and error mapping | path, declaration, branching, async/concurrency, encoding, and platform API signals |
| Server boundaries | Vapor routes, middleware, lifecycle files, Fluent models and queries, VaporTesting/XCTVapor, and PostgreSQL, MySQL/MariaDB, SQLite, and MongoDB drivers | imports, protocols, operations, package products, and driver declarations |
| UI boundaries | SwiftUI architecture, views, Xcode UI test folders, and snapshot support | imports, `View` declarations, test locations, and package products |
| Reactive boundaries | RxSwift/RxCocoa/RxRelay modules, RxTest scheduler support, RxBlocking support, and established signal primitive declarations | imports, product declarations, module paths, and conservative type declarations |

Swift Package Manager searches target-named subdirectories under `Sources`, `Source`, `src`, and `srcs`, with `Tests` also available for test targets; `path`, `sources`, and `exclude` can define further custom layouts. Each target forms a module, test suite, macro, or package plugin. The adapter conservatively merges `Package.swift` with `Package@swift-<version>.swift`, recognizes simple static helpers that return a target declaration, and falls back to conventional module directories when declarations are assembled indirectly. It parses those static declarations and test-target dependencies to avoid matching the same source filename across unrelated modules. Macro implementation sources remain analyzable, while plugin implementations are deferred to package-level invocation tests. Symbolic-link overlays are not followed when the canonical source is already present, and standalone example/demo/sample projects or playgrounds are left to separate project audits. See the official [Creating a Swift package](https://docs.swift.org/swiftpm/documentation/packagemanagerdocs/creatingswiftpackage/), [Target](https://docs.swift.org/swiftpm/documentation/packagedescription/target/), [target types](https://docs.swift.org/swiftpm/documentation/packagedescription/target/targettype/), [path](https://docs.swift.org/swiftpm/documentation/packagedescription/target/path/), and [sources](https://docs.swift.org/swiftpm/documentation/packagedescription/target/sources/) documentation.

Bazel's `swift_test` can own test sources directly or discover XCTest cases in direct dependencies. The adapter follows both shapes, including tests outside `Tests` directories, and uses `bazel test //...` as the conservative workspace command. See the official [rules_swift API](https://registry.bazel.build/docs/rules_swift) and [Bazel test command](https://bazel.build/docs/user-manual#running-tests) documentation.

Xcode schemes associate test targets and test plans with a project or workspace build. The adapter uses portable schemes checked into `xcshareddata/xcschemes`, ignores user-local `xcuserdata` schemes, and does not mistake a project's internal `.xcodeproj/project.xcworkspace` metadata for a selected workspace. It qualifies commands with a sole or scheme-matching checked-in workspace, preferring it over a sole or scheme-matching project. When a container-matching shared scheme references multiple checked-in plans, it selects the single default plan; it also accepts a scheme's sole referenced plan or the repository's sole plan. Ambiguous choices remain unreported. See Apple's guidance on [running tests and interpreting results](https://developer.apple.com/documentation/xcode/running-tests-and-interpreting-results) and [organizing tests to improve feedback](https://developer.apple.com/documentation/xcode/organizing-tests-to-improve-feedback).

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

## Known Alpha Gaps

- custom Starlark macros, generated BUILD files, `select()` expressions, aliases, and transitive Bazel test-source graphs are not resolved
- member-level references through inferred receiver types, overload resolution, extensions, aliases, raw-string interpolation, and macro expansion are not resolved
- computed Swift manifest arrays, arbitrary helper logic, conditional target graphs, and dependency aliases are not fully resolved by the static manifest reader; version-specific manifests, simple target-returning helpers, and conventional module ownership are covered
- database driver presence identifies the environment but does not prove that tests use an isolated database, execute migrations, or exercise production-engine semantics
- reactive virtual-time, event-ordering, disposal, completion, reentrancy, and error-path coverage is not inferred from RxTest/RxBlocking presence
- multiple Xcode schemes remain ambiguous when none matches the project name; multiple plans remain ambiguous when the selected scheme lacks a single default or sole reference
- UI tests, snapshot tests, VaporTesting tests, and XCTVapor tests are detected, but runtime reachability is not mapped back to source modules
- Objective-C is visible to the adapter and XCTest detection, but direct Objective-C source classification remains deferred
- unrecognized generator-specific outputs, plugin invocation reachability, conditional target selection, and platform-specific target graphs need more real-repository validation

## Validation Depth

Swift is supported at the same maturity level as the JavaScript/TypeScript adapter because:

1. multi-target ownership is validated against maintained SwiftNIO and RxSwift repositories, with custom-path and Bazel behavior locked by deterministic fixtures
2. Swift symbol evidence stays target-qualified and conservative across public packages with overloaded APIs, extensions, macros, generated sources, and reactive frameworks
3. Xcode app behavior covers shared schemes, workspaces, UI test locations, and test plans, with a pinned app-style repository report
4. golden audits/plans, Swift-specific model-consistency scenarios, blocker behavior, and the full deterministic private-alpha gate remain stable

Supported maturity remains bounded to this matrix. The maintenance goal is the same as JavaScript/TypeScript: support popular, inspectable shapes well and report uncertainty for the long tail instead of claiming universal repository coverage. Native Objective-C source classification, manifest execution, and runtime coverage proof remain outside the supported promise.
