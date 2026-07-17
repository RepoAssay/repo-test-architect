# Swift Reactive Repository Audit Report

This report validates the Swift adapter against two public signal-based libraries: maintained [RxSwift](https://github.com/ReactiveX/RxSwift) as the primary reference and archived [Flow](https://github.com/iZettle/Flow) as a legacy compatibility reference. The source repositories are not checked-in fixtures, so pinned audit results guide heuristics without making external repositories part of the deterministic gate.

## Method

The repositories were shallow-cloned and audited directly without running their own build or test suites:

```powershell
node ./src/cli/index.js audit <checkout> --adapter swift --format json
```

| Repository | Audited commit | Role |
| --- | --- | --- |
| `ReactiveX/RxSwift` | `132aea4f236ccadc51590b38af0357a331d51fa2` | maintained primary reference for XCTest, RxTest, and RxBlocking |
| `iZettle/Flow` | `b452ec9f7f525d24d99d5c01ef5853ab28223d23` | archived legacy reference for XCTest-based signal tests and nonstandard test placement |

## Result

| Repository | Frameworks | Architectures | Untested | Covered | Skipped | Recommended | High-risk notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| RxSwift | RxBlocking, RxTest, XCTest | Apple/Xcode, reactive streams, SwiftPM, SwiftUI | 121 | 94 | 59 | 215 | 0 |
| Flow | XCTest | Apple/Xcode, reactive streams, SwiftPM, SwiftUI | 21 | 20 | 4 | 41 | 0 |

Both profiles are high confidence, select `swift test`, and report no blockers. RxTest and RxBlocking are identified as reactive testing support alongside the XCTest runner; they do not replace the repository-native test command. Flow remains a normal XCTest project from the adapter's perspective.

## Problems Exposed and Fixed

The first live pass exposed three trust problems:

- ordinary Swift `.filter`, `.sort`, and regular-expression operations were mistaken for MongoDB operations because secondary query signals did not require MongoDB context
- `.xcodeproj/project.xcworkspace` metadata was treated as a user-selected workspace even though it is internal Xcode project state
- Flow's root-level `Disposable+CombineTests.swift` was treated as production because test filenames were only recognized inside test-named directories or parsed build targets

The hardened passes require an import, database handle, or BSON/document marker before emitting MongoDB query signals; ignore internal project workspaces while retaining real checked-in `.xcworkspace` containers; recognize root-level `*Test.swift`, `*Tests.swift`, and `*Spec.swift` files; recover RxSwift targets declared through its `rxTarget` helper and version-specific manifest; and avoid recounting its symlink source overlay, examples, and playgrounds. After the changes, neither reactive repository emits MongoDB candidates, Flow's root Combine test is excluded from production recommendations, and RxSwift falls from 522 duplicate-heavy recommendations to 215 canonical source recommendations.

## Reactive Boundary

The adapter now reports:

- `RxTest` and `RxBlocking` from imports or SwiftPM product declarations
- setup signals for RxSwift, RxTest scheduler support, and RxBlocking support
- `reactive-streams` architecture from established reactive module imports, Rx module paths, or strong stream primitive declarations

This is intentionally profile-level support. It does not claim that a virtual-time scheduler test covers every event ordering, disposal, completion, reentrancy, or error path. Existing filename and Swift symbol evidence still describes static relationships rather than runtime execution.

## Remaining Gaps

- RxSwift's remaining conditional and locally assembled target graph cannot be fully evaluated by the static reader, so some source/test ownership still uses conservative conventional paths and imports.
- Large framework repositories still contain generated, compatibility, and platform-specific source shapes that need stronger ownership boundaries; symlink overlays, standalone examples, and playgrounds are now bounded.
- Reactive primitives are not yet assigned broad special-purpose recommendations solely because they are named `Observable`, `Signal`, `Future`, or `Disposable`; doing that without module context would create false positives in ordinary Swift concurrency and callback code.
- Flow should remain a regression reference for a once-popular layout, not a source of expanding product-specific heuristics now that the repository is archived.

## Validation Direction

RxSwift should be rerun periodically as the maintained public probe. Flow should be retained at the pinned commit when changes touch root test discovery, XCTest ownership, Combine bridges, or older Xcode/SwiftPM layouts. Deterministic synthetic tests remain the release gate for every issue found through these live probes.
