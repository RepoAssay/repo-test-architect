# Collectors Grimoire Swift Audit Report

This report records a local audit pass across sibling `cg-*` Swift Package Manager repositories. The source repositories are not fixtures in this repository, so the results are evidence for adapter direction rather than stable regression snapshots.

## Method

The audit used the Swift adapter against each sibling repository with a `Package.swift` file. The run focused on the deterministic audit profile and the highest-ranked recommended targets.

All audited packages were detected as runnable with `swift test`, and all had high-confidence test profiles. Most packages already use Swift Testing; `cg-networking` uses XCTest, and `cg-bff` uses Swift Testing with XCTVapor.

## Summary

| Repository | Frameworks | Architectures | Recommended | Main kinds | Mongo targets |
| --- | --- | --- | ---: | --- | ---: |
| `cg-account` | Swift Testing | concurrency, SwiftPM | 2 | service, utility | 0 |
| `cg-apienvironment` | Swift Testing | SwiftPM | 0 | none | 0 |
| `cg-bff` | Swift Testing, XCTVapor | concurrency, MongoDB, SwiftPM, Vapor | 24 | routes, data-access, middleware, utilities | 12 |
| `cg-chat` | Swift Testing | concurrency, SwiftPM | 2 | service, utility | 0 |
| `cg-configuration` | Swift Testing | concurrency, SwiftPM, SwiftUI | 1 | utility | 0 |
| `cg-finance` | Swift Testing | concurrency, SwiftPM, SwiftUI | 1 | service | 0 |
| `cg-magicthegathering` | Swift Testing | concurrency, SwiftPM, SwiftUI | 2 | service, utility | 0 |
| `cg-magicthegathering-ml` | Swift Testing | SwiftPM | 0 | none | 0 |
| `cg-networking` | XCTest | concurrency, SwiftPM, SwiftUI | 5 | service, utilities | 0 |
| `cg-persistence` | Swift Testing | SwiftPM | 3 | utilities | 0 |
| `cg-pod` | Swift Testing | concurrency, SwiftPM, SwiftUI | 1 | service | 0 |
| `cg-tcg-ml` | Swift Testing | SwiftPM | 0 | none | 0 |

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

These should generally be covered with XCTVapor integration tests and seeded MongoDB fixture data. For pure query-builder extraction, unit tests can assert generated BSON or pipeline shape, but the current code shape mostly points to integration coverage.

## Package-Level Targets

The smaller packages mostly surface focused service or utility candidates:

| Repository | Top target | Evidence |
| --- | --- | --- |
| `cg-account` | `AccountService` | async service boundary |
| `cg-chat` | `ChatService` | async service boundary |
| `cg-finance` | `FinanceService` | async service boundary |
| `cg-magicthegathering` | `MTGService` | async service boundary |
| `cg-networking` | `DefaultNetworkingClient` | async service boundary |
| `cg-pod` | `PodService` | async service boundary |
| `cg-persistence` | `KeychainStorage`, `UserDefaultsStorage` | branching storage behavior |

These are good candidates for package-level Swift Testing or XCTest coverage before broadening into generation work.

## Adapter Findings

The latest Swift adapter improvements are useful on these repositories:

- Swift Testing and XCTest detection is enough for all audited packages.
- XCTVapor detection correctly makes `cg-bff` runnable through `swift test`.
- Fluent persistence models no longer dominate recommendations.
- MongoDB data-access signals make the route/query risks visible without hiding route classification.

Remaining heuristic gaps:

- Several `utility` recommendations are still broad. The adapter could split storage, command, worker, and URL/query-building utilities into more precise kinds.
- SwiftUI architecture detection is sometimes triggered by source-level `View` references, even when UI coverage is not the main concern.
- The audit does not yet distinguish package APIs from app-only implementation details across the `cg-*` package family.
- MongoDB guidance is still signal-based. It flags aggregation, dynamic filters, pagination, and writes, but it does not validate query semantics.

## Suggested Next Work

1. Improve generated plan text for `mongodb-*` signals so plans recommend seeded data, aggregation result ordering, pagination boundaries, and idempotent write/update cases.
2. Add Swift utility sub-kinds for storage, command, worker, URL/query building, and error mapping.
3. Add a project-level report command that can summarize a local workspace without checking local-only sibling paths into stable fixtures.
4. Use `cg-bff` as the manual reference repo for future Vapor/Mongo heuristic checks, but keep deterministic tests synthetic.
