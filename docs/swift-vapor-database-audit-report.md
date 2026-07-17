# Swift Vapor Database Audit Report

This report validates database-boundary detection against maintained official Vapor templates and the local `cg-bff` reference application. The purpose is to keep test recommendations centered on application persistence behavior rather than privileging MongoDB or recommending tests merely because a database driver is installed.

## Method

The public repositories were shallow-cloned and audited without running their application test suites:

```powershell
node ./src/cli/index.js audit <checkout> --adapter swift --format json
```

| Repository | Audited commit | Detected driver |
| --- | --- | --- |
| [`vapor/template-fluent-postgres`](https://github.com/vapor/template-fluent-postgres) | `280a13faca701befa731861a768a27dacea20ad7` | PostgreSQL |
| [`vapor/template-fluent-mysql`](https://github.com/vapor/template-fluent-mysql) | `18244c5f86ff1b2e22557b60547cc3f2c048cfb8` | MySQL |
| [`vapor/template-fluent-sqlite`](https://github.com/vapor/template-fluent-sqlite) | `b4730b97c6f929452f5c0db13e6543503eda15ae` | SQLite |
| local `cg-bff` | current local checkout | MongoDB |

The official [Fluent overview](https://docs.vapor.codes/fluent/overview/) currently lists PostgreSQL, SQLite, MySQL/MariaDB, and MongoDB as its four officially supported drivers. Those four drivers form the deterministic profile boundary.

## Template Results

All three official templates produce a high-confidence profile with `swift test`, Swift Testing, VaporTesting, no blockers, and the expected driver architecture.

| Template | Architectures | Untested | Covered | Skipped |
| --- | --- | ---: | ---: | ---: |
| PostgreSQL | database persistence, PostgreSQL, SwiftPM, Vapor | 1 | 1 | 5 |
| MySQL | database persistence, MySQL, SwiftPM, Vapor | 1 | 1 | 5 |
| SQLite | database persistence, SQLite, SwiftPM, Vapor | 1 | 1 | 5 |

Each template identifies `TodoController` as an HTTP route with generic database access, Fluent query, read, and write signals. The driver remains a profile qualifier because the controller itself uses Fluent's database-neutral API. Merely importing or configuring a driver does not create a direct test recommendation.

The common recommendation is an application integration test that exercises the route and verifies persisted state. The [Vapor testing guide](https://docs.vapor.codes/advanced/testing/) explicitly supports this shape with VaporTesting, a dedicated test database, migrations, teardown, and serialized suites for database tests.

## MongoDB Reference Result

The `cg-bff` audit remains stable at 24 recommended targets and now reports 14 targets with a generic `database-access` signal. MongoDB-specific qualifiers remain on the targets that directly use `.mongo`, BSON documents, custom filters, aggregation pipelines, or MongoDB writes. Two Fluent-backed routes remain generic because their source does not contain MongoDB-specific behavior.

This preserves useful distinctions:

- all persistence recommendations share database read, write, transaction, pagination, raw SQL, or Fluent query vocabulary
- aggregation pipelines and dynamic BSON filters retain MongoDB-specific rationale
- routes and middleware keep their primary HTTP classification rather than becoming database targets
- plain Fluent models and migrations remain indirect coverage targets for repository or application integration tests

## Deterministic Coverage

The Swift adapter regression suite now covers:

- PostgreSQL, MySQL/MariaDB, SQLite, and MongoDB driver profiles
- Swift Testing with VaporTesting and legacy XCTest with XCTVapor
- Fluent reads, writes, filters, sorting, pagination, and transactions
- raw SQL as an engine-sensitive integration boundary
- MongoDB aggregation, BSON filters, and write operations
- driver imports without database behavior, which must not become recommendations

The checked-in MongoDB fixture uses VaporTesting so golden artifacts represent the current recommended Vapor testing surface. XCTVapor remains supported for existing repositories.

## Evidence Boundary

Static detection cannot prove that a query is correct, that a migration works on the production engine, or that a test uses an isolated database. Driver-specific behavior should be tested against the production engine when correctness depends on transactions, constraints, raw queries, aggregation, collation, ordering, or concurrency. SQLite in-memory tests are useful for database-neutral behavior but are not evidence for another engine's semantics.
