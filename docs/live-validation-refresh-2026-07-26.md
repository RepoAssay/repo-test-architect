# Live Validation Refresh — 2026-07-26

This report records the first complete four-adapter live-repository refresh after the bounded Swift hardening phase. Each repository was shallow-cloned at the exact full SHA stored in `evals/validation-corpus.json`, then audited locally three times. Repository code and test suites were not executed.

## Results

| Adapter | Corpus case | Commit | Outcome | Fresh median |
| --- | --- | --- | --- | ---: |
| JavaScript | `javascript-playwright-mcp` | `55679f5` | semantic and digest match | 5 ms |
| JavaScript | `javascript-cypress-terminal-report` | `b66713f` | semantic and digest match | 20 ms |
| JavaScript | `javascript-hono-bun` | `c285f9a` | semantic and digest match | 395 ms |
| Kotlin/JVM | `kotlin-junit4` | `300468b` | semantic and digest match | 242 ms |
| Kotlin/JVM | `kotlin-graphql-java` | `94f398d` | semantic and digest match | 871 ms |
| Kotlin/JVM | `kotlin-maven-surefire` | `8dcf263` | regression fixed and baseline refreshed | 556 ms |
| Python | `python-asyncer` | `783a462` | semantic and digest match | 13 ms |
| Python | `python-fastapi-template-backend` | `4d3d5e9` | semantic and digest match | 14 ms |
| Python | `python-django` | `dca76b1` | semantic and digest match | 3,787 ms |
| Swift | `swift-reercodable` | `9e9edc2` | semantic and digest match | 375 ms |
| Swift | `swift-package-index-server` | `26943bf` | intentional evidence improvement; baseline refreshed | 14,484 ms |
| Swift | `swift-rules-swift` | `4428a62` | intentional false-positive removal; baseline refreshed | 135 ms |

Nine cases reproduced their stored semantic result and canonical digest exactly. Timing samples can vary independently of the normalized digest, so unchanged cases retain their existing performance baselines rather than creating timing-only corpus churn.

## Findings

Maven Surefire initially collapsed to zero root targets. The previous incomplete-reactor guard correctly rejected unsafe child discovery but also rejected a fully literal nested aggregator. The resulting regression fix recursively follows contained direct POM modules only when every level has static coordinates and a complete literal graph; any computed, missing, dynamic, or escaping descendant still blocks aggregate ownership. The refreshed root audit reports 27 untested candidates, 139 covered-but-risky targets, 137 skipped targets, and 356 evidence relationships. Embedded fixture projects remain separately detectable.

Swift Package Index gained direct called evidence for four extension sources: `API+SearchController.swift`, `PackageCollection+signing.swift`, `Joined4+BuildResult.swift`, and `PackageReadme+Model.swift`. Its actionable total remains 182, with four targets moving from untested to covered and four additional evidence relationships.

rules_swift removed two unrelated asserted relationships that had made `test/fixtures/android/jni.swift` look covered. That file now honestly appears untested. `String+RandomExtensions.swift` remains covered through stronger called-symbol evidence. The actionable total remains 34, with one target moving from covered to untested and the evidence count dropping from eight to six.

## Outcome

All 12 corpus scorecards pass after the refresh. The live-report phase is complete, with the only false-confidence regression converted into focused tests and the two intentional Swift changes recorded at their pinned commits. The next hardening slice is the human-facing validation scorecard, keeping review completeness separate from reviewed pass rate.
