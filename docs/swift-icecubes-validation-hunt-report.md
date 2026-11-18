# Swift Product-Monorepo Validation Hunt: Ice Cubes

This report records the product-monorepo hunt pass (#325) for the Swift adapter against [`Dimillian/IceCubesApp`](https://github.com/Dimillian/IceCubesApp), a Mastodon client built as an Xcode application over local Swift packages, shallow-cloned at commit `98098b9c4b5928f89f338203193c2bf40ab7f38c` (upstream commit of October 13, 2026). It was audited three times from the repository checkout: at `1ee4659` (master after #333 and #334), at `a6878ba` (after #335 added cross-package evidence) and with the #338 fix (#339), so that each Swift change from the post-1.3.0 plan is measured on a public application of the #309, #310, #311, #312 and #318 shape. The auditor's `review --format json --limit 50` and `analyze --format json` commands were run from the repository root; no Xcode, SwiftPM, build, test or application code of Ice Cubes was executed.

## Shape

One Xcode project (`IceCubesApp.xcodeproj`) with five shared schemes (the app, an action extension, a widgets extension, a notification service extension and a share extension) and no test target of its own; 13 local Swift packages under `Packages/` (`Account`, `AppAccount`, `Conversations`, `DesignSystem`, `Env`, `Explore`, `Lists`, `MediaUI`, `Models`, `NetworkClient`, `Notifications`, `StatusKit`, `Timeline`), six of which declare test targets, with 23 Swift files under their `Tests` directories in XCTest and Swift Testing; 22 `.xcscheme` files in all once the packages' own shared schemes are counted. Sixteen of those 23 files import another local package's module (such as `Models`, `NetworkClient`, `Env` and `DesignSystem`) beside their own.

## Results

| Measure | 1ee4659 (before #335) | with #335 | with #338 |
| --- | ---: | ---: | ---: |
| Detected project roots | 14 (root project + 13 packages), all audited once | 14 | 14 |
| Verification commands | `swift test` for 4 packages | same | same |
| Blockers | 2 (`Env`, `StatusKit` import UIKit: withheld with the `xcodebuild test -destination 'platform=iOS Simulator,name=<device>'` shape) | same | same |
| Diagnostics | 8 `missing-test-target` (root project and 7 packages without tests), 2 `host-unavailable-framework` | same | same |
| Confidence | high 6, medium 8; no `low` | same | same |
| Findings | 367: 151 missing, 20 weak, 194 low-value, 0 misplaced, 0 blocked, 2 command-withheld; 13 high | 396: 140 missing, 40 misplaced; 12 high | 382: 147 missing, 19 misplaced; 12 high |
| Cross-package evidence | none | 40 links on 13 targets (19 `called`, 21 without a `called` or `asserted` usage: type-position mentions) | 19 links on 5 targets, all `called` |
| `review --format json --limit 50` | 154 KB | 155 KB | 0.58 s, 0.58 s, 0.57 s (three runs); 154 KB |
| `analyze --format json` | 1.5 MB | 1.6 MB | 1.6 MB |
| Stability | three `audit-projects` runs, one canonical digest | same | same |

Counts describe heuristic audit targets, not runtime line or branch coverage. Timings are local observations of the whole repository.

## What Each Change Did Here

- **#309 (1.2.0) and detection.** The root project and the 13 packages are separate audits; nothing is counted twice, and the root project owns only the app and extension sources (21 untested candidates, 43 skipped, 30 of them SwiftUI views deferred by convention).
- **#311 (1.3.0).** `Env` and `StatusKit` import UIKit in compiled sources; `swift test` is withheld for them with the destination hint, while `Account`, `Models`, `NetworkClient` and `Timeline` keep `swift test`. Both withholdings are `command-withheld` findings at medium severity and leave confidence `high`.
- **#312 (#333).** The root project and seven packages have no test target. They carry no blockers, confidence `medium`, one `missing-test-target` coverage gap each, and their sources are audited in full. The released 1.3.0 CLI on the same clone reports 18 high-severity `blocked-project` findings (16 from the eight roots without tests, at confidence `low`, and 2 from the UIKit withholdings, at `medium`) and 31 high-severity findings in all; with #333 the eight become one medium `missing-coverage` finding each and the two become `command-withheld`.
- **#310 (#334).** The root project has five shared schemes but no tests, so command selection never reaches the scheme rule here; the packages' own shared schemes are not Xcode containers. The rule is exercised by the fixtures in `test/swift-audit.test.js`, not by this repository.
- **#318 (#335).** Sixteen test files import sibling modules. The first rule linked 40 relationships on 13 targets, 21 of them without a `called` or `asserted` usage (type-position mentions): `EditorStoreTests` in StatusKit mentions `Theme`, `CurrentInstance`, `StreamWatcher` and `UserPreferences` as dependencies of the store under test, which marked a `DesignSystem` source and three `Env` sources as covered and advised moving that test closer to those packages. That is #338.
- **#338.** Requiring `called` or `asserted` usage across packages keeps 19 links on five targets: `Models/Account.swift`, `Models/Alias/HTMLString.swift`, `Models/Alias/ServerDate.swift` and `Models/Status.swift` through StatusKit's `AutocompleteServiceTests`, `PostingServiceTests` and `TextServiceTests` and Timeline's `TimelineDatasourceMediaFilterTests`, `TimelineTestFactories` and `TimelineViewModelTests`, and `NetworkClient/MastodonClient.swift` through Env's `RouterTests` and Timeline's `TimelineViewModelTests`. Each remaining link yields one `misplaced-coverage` finding with `Models` or `NetworkClient` as suggested owner. For a shared model package such advice is reviewable rather than certain, which is the decision-log's standing caveat.

## Findings

1. **Cross-package links on type mentions (fixed; #338).** Described above. Fixed in #339.
2. **Observation: shared model packages attract placement advice.** `Models` has its own test target (3 targets covered locally) and still receives 17 of the 19 remaining cross-package links, because StatusKit and Timeline tests call `Status(...)`, `HTMLString(...)` and `ServerDate(...)` to build fixtures. The links are correct under the call rule, and the plan no longer asks for duplicate tests, but a reader of the findings must judge whether such tests belong in `Models`. No change proposed; the decision log's revisit clause covers intentional integration coverage.
3. **Observation: no scheme-selection pressure.** The repository's only Xcode container has no tests, so #334's rule did not fire. A public Xcode application whose app target carries unit tests across several shared schemes is still needed to exercise it on real scheme files beyond the fixtures.

## Scorecard

Pinned as `swift-icecubesapp`, the Swift adapter's `product-monorepo` corpus case, with a repository-scan measurement (`measurement: "repository"`): 14 projects, 139 untested, 24 covered-but-risky and 232 skipped targets, 40 evidence relationships (local and cross-package), `swift test` as the only distinct command (the four packages that have a command use it; the other ten projects have none, two of them withheld for UIKit), 323 ms median over five scans (439, 335, 323, 323, 323 ms) and one canonical digest across them. Detection: pass. Ownership: pass (root and packages owned once; nested packages excluded from the root). Command: pass (`swift test` where it builds on the host, withheld with the destination shape where it does not). Evidence: pass with #339 (every cross-package link is a call; the local evidence rules are unchanged). Ranking: pass. Stability: pass (five identical digests). Performance: pass (the samples above). The role is enforced for the Swift adapter from this pin on.
