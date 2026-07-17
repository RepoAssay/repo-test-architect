# Collectors Grimoire Swift Audit Report

This report records local audit passes across sibling `cg-*` Swift Package Manager repositories. The source repositories are not fixtures in this repository, so the results are evidence for adapter direction rather than stable regression snapshots.

## Method

The audit used the Swift adapter against each sibling repository with a `Package.swift` file. The run focused on the deterministic audit profile and the highest-ranked recommended targets.

All audited packages were detected as runnable with `swift test`, and all had high-confidence test profiles. Most packages already use Swift Testing; `cg-networking` uses XCTest, and `cg-bff` uses Swift Testing with XCTVapor.

## Summary

| Repository | Frameworks | Architectures | Recommended | Main kinds | Mongo targets |
| --- | --- | --- | ---: | --- | ---: |
| `cg-account` | Swift Testing | concurrency, SwiftPM | 2 | service, command-or-worker | 0 |
| `cg-apienvironment` | Swift Testing | SwiftPM | 0 | none | 0 |
| `cg-bff` | Swift Testing, XCTVapor | concurrency, MongoDB, SwiftPM, Vapor | 24 | routes, data-access, middleware, utilities | 12 |
| `cg-chat` | Swift Testing | concurrency, SwiftPM | 2 | service, command-or-worker | 0 |
| `cg-configuration` | Swift Testing | concurrency, SwiftPM, SwiftUI | 1 | utility | 0 |
| `cg-finance` | Swift Testing | concurrency, SwiftPM, SwiftUI | 1 | service | 0 |
| `cg-magicthegathering` | Swift Testing | concurrency, SwiftPM, SwiftUI | 2 | service, utility | 0 |
| `cg-magicthegathering-ml` | Swift Testing | SwiftPM | 0 | none | 0 |
| `cg-networking` | XCTest | concurrency, SwiftPM, SwiftUI | 5 | service, query-builder, error-mapping, utilities | 0 |
| `cg-persistence` | Swift Testing | SwiftPM | 4 | storage | 0 |
| `cg-pod` | Swift Testing | concurrency, SwiftPM, SwiftUI | 2 | service, command-or-worker | 0 |
| `cg-tcg-ml` | Swift Testing | SwiftPM | 0 | none | 0 |

## Top Findings Pass

The latest pass used the project-level top findings command:

```powershell
node ./src/cli/index.js findings-projects ../cg-bff
node ./src/cli/index.js findings-projects ../cg-networking
node ./src/cli/index.js findings-projects ../cg-persistence
```

Top-findings results:

| Repository | Findings | High severity | Placement | Blockers | Strongest examples |
| --- | ---: | ---: | ---: | ---: | --- |
| `cg-bff` | 24 | 20 | 0 | 0 | `CardsController`, `PriceController`, `SearchController`, `PodController`, `UserAuthenticator` |
| `cg-networking` | 5 | 2 | 0 | 0 | `URLBuilder`, `DefaultNetworkingClient`, `APIError` |
| `cg-persistence` | 4 | 0 | 0 | 0 | `KeychainStorage`, `UserDefaultsStorage`, `Persistence` |

This confirms the new repo-level findings artifact is useful on real Swift package repos: it surfaces the highest-risk Vapor and persistence boundaries first, keeps focused package utilities visible, and does not invent blockers for packages with runnable Swift test commands.

## Highest-Value Targets

The strongest audit value is in `cg-bff`. It concentrates the riskiest integration behavior: Vapor routes, middleware, MongoDB reads/writes, aggregation pipelines, dynamic filters, pagination, and seed/update jobs.

Top `cg-bff` targets from the audit:

| Target | Kind | Evidence |
| --- | --- | --- |
| `CardsController` | `http-route` | Vapor route, MongoDB query |
| `PriceController` | `http-route` | Vapor route, MongoDB aggregation |
| `SearchController` | `http-route` | Vapor route, dynamic MongoDB filter, pagination/sort |
| `PodController` | `http-route` | Vapor route, dynamic MongoDB filter, write behavior, pagination/sort |
| `UserController` | `http-route` | Vapor route, MongoDB query/write behavior |
| `DailyCardsUpdateJob` | `data-access` | MongoDB query/write behavior |
| `DailyPricesUpdateJob` | `data-access` | MongoDB query/write behavior, pagination/sort |
| `SeedCommand` | `data-access` | MongoDB query/write behavior |
| `SeedPriceCommand` | `data-access` | MongoDB query/write behavior |
| `SeedPriceTodayCommand` | `data-access` | MongoDB query/write behavior, pagination/sort |
| `UserAuthenticator` | `http-middleware` | Vapor middleware, MongoDB query |

These should generally be covered with VaporTesting or XCTVapor integration tests and seeded MongoDB fixture data. For pure query-builder extraction, unit tests can assert generated BSON or pipeline shape, but the current code shape mostly points to integration coverage.

## Package-Level Targets

The smaller packages mostly surface focused service or utility candidates:

| Repository | Top target | Evidence |
| --- | --- | --- |
| `cg-account` | `AccountService` | async service boundary |
| `cg-chat` | `ChatService` | async service boundary |
| `cg-finance` | `FinanceService` | async service boundary |
| `cg-magicthegathering` | `MTGService` | async service boundary |
| `cg-networking` | `DefaultNetworkingClient`, `URLBuilder`, `APIError` | async service boundary, URL/query construction, error mapping |
| `cg-pod` | `PodService` | async service boundary |
| `cg-persistence` | `KeychainStorage`, `UserDefaultsStorage` | persistence boundary, encoding/decoding behavior |

These are good candidates for package-level Swift Testing or XCTest coverage before broadening into generation work.

## Adapter Findings

The latest Swift adapter improvements are useful on these repositories:

- Swift Testing and XCTest detection is enough for all audited packages.
- XCTVapor detection correctly makes the existing `cg-bff` suite runnable through `swift test`; VaporTesting is also recognized for newer Swift Testing-based Vapor projects.
- Fluent persistence models no longer dominate recommendations.
- Generic database-access and Fluent query signals make persistence risks comparable across drivers, while MongoDB qualifiers preserve aggregation, BSON filter, and write semantics without hiding route classification.
- Swift utility sub-kinds split storage, worker/command, URL/query-building, and error-mapping targets out of the generic utility bucket.

Remaining heuristic gaps:

- Some `utility` recommendations are still broad, especially generic helper and extension files.
- SwiftUI architecture detection is sometimes triggered by source-level `View` references, even when UI coverage is not the main concern.
- The audit does not yet distinguish package APIs from app-only implementation details across the `cg-*` package family.
- MongoDB guidance is still signal-based. It flags aggregation, dynamic filters, pagination, and writes, but it does not validate query semantics.
- Top-findings output currently has no placement findings for these packages, so package-boundary advice still needs richer cross-repository ownership evidence.

## Suggested Next Work

1. Improve generated persistence plan text so plans recommend isolated databases, migrations, seeded data, ordering, pagination boundaries, transactions, and idempotent writes when the corresponding signals exist.
2. Add a project-level report command that can summarize a local workspace without checking local-only sibling paths into stable fixtures.
3. Use `cg-bff` as the manual reference repo for future Vapor/Mongo heuristic checks, but keep deterministic tests synthetic.
