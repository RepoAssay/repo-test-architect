# SwiftPM Ownership Audit Report

This report validates the Swift adapter's package ownership boundary against maintained public repositories with materially different SwiftPM layouts. [RxSwift](https://github.com/ReactiveX/RxSwift) exercises version-specific manifests, helper-wrapped targets, root module directories, and symlink overlays. [SwiftNIO](https://github.com/apple/swift-nio) exercises a large conventional multi-target package with XCTest and Swift Testing suites.

## Method

Both repositories were shallow-cloned and audited directly. Their build and test suites were not run; deterministic adapter fixtures remain the release gate.

```powershell
node ./src/cli/index.js audit <checkout> --adapter swift --format json
```

| Repository | Audited commit | Ownership role |
| --- | --- | --- |
| `ReactiveX/RxSwift` | `132aea4f236ccadc51590b38af0357a331d51fa2` | version-specific manifests, `rxTarget` helper calls, root targets, and symlinked `Sources` overlays |
| `apple/swift-nio` | `590dd7b4bc222700b429aebb86945d2cd0dddadd` | maintained conventional multi-target package with a large source/test graph |

## Result

| Repository | Frameworks | Command | Untested | Covered | Skipped | Recommended | High-risk notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| RxSwift | RxBlocking, RxTest, XCTest | `swift test` | 121 | 94 | 59 | 215 | 0 |
| SwiftNIO | Swift Testing, XCTest | `swift test` | 131 | 152 | 47 | 283 | 9 |

RxSwift reports the `swiftpm version-specific manifest`, `swiftpm helper target declaration`, and alternate-root signals. Its canonical sources under `RxSwift`, `RxCocoa`, `RxRelay`, and related root modules receive target ownership; the symlinked `Sources/<Module>` copies are not audited again. `RxExample` and playground trees are excluded from the parent audit because they have their own project boundary.

SwiftNIO demonstrates that conventional `Sources/<Target>` and `Tests/<Target>Tests` ownership remains target-qualified at scale. Representative source/test links resolve inside their module, while same-named files in unrelated targets are not credited merely by filename. The reported high-risk notes are candidate-level review findings, not profile blockers.

## Boundary Added

- read `Package.swift` together with root `Package@swift-<version>.swift` manifests
- recognize simple static helper functions returning `.target`, `.testTarget`, `.executableTarget`, `.macro`, or `.plugin`, then parse their call sites
- recover conservative ownership from conventional `Sources`, `Source`, `src`, and `srcs` module directories and matching test-suite names
- allow manifest-declared targets to own a conventional target-named directory at the repository root
- skip symbolic-link file overlays so canonical sources are counted once
- leave playgrounds and standalone example/demo/sample projects to separate project audits

## Remaining Gaps

- the adapter does not execute manifests, evaluate arbitrary helper logic, or select a conditional target graph for a specific platform and compiler
- local arrays that assemble target declarations and dependency aliases can still reduce precise ownership to conventional paths and imports
- a direct root audit may include nested non-example Swift packages such as developer tools; project detection should be used when those packages need independent results
- generated and platform-conditional source membership still needs further maintained-repository probes
