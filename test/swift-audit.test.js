import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditSwiftRepo } from "../src/adapters/swift/audit.js";

const exampleRoot = path.resolve("examples/swift-spm-xctest");
const swiftTestingRoot = path.resolve("examples/swift-spm-swift-testing");
const quickNimbleRoot = path.resolve("examples/swift-spm-quick-nimble");
const customPathsRoot = path.resolve("examples/swift-spm-custom-paths");
const bazelRoot = path.resolve("examples/swift-bazel-xctest");
const vaporRoot = path.resolve("examples/vapor-service-tests");
const vaporMongoRoot = path.resolve("examples/vapor-mongodb-boundaries");

describe("Swift audit adapter", () => {
  it("detects SwiftPM, XCTest, and static Swift conventions", () => {
    const audit = auditSwiftRepo(exampleRoot);

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.languages, ["swift"]);
    assert.deepEqual(audit.profile.packageManagers, ["swiftpm"]);
    assert.deepEqual(audit.profile.testFrameworks, ["XCTest"]);
    assert.equal(audit.profile.testCommand, "swift test");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.architectures.includes("swift-package"));
    assert.ok(audit.profile.architectures.includes("swiftui"));
    assert.ok(audit.profile.architectures.includes("concurrency"));
    assert.ok(audit.profile.detectedConventions.includes("*Tests.swift files"));
    assert.ok(audit.profile.setupSignals.includes("swift package manager"));
    assert.ok(audit.profile.setupSignals.includes("swiftpm test target"));
  });

  it("separates covered logic, async service risk, DTOs, and SwiftUI views", () => {
    const audit = auditSwiftRepo(exampleRoot);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.name),
      ["CheckoutParser"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["PaymentClient"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => target.name),
      ["CheckoutView", "PaymentResponseDTO"]
    );

    const parser = audit.coveredButRisky[0];
    assert.equal(parser.kind, "pure-logic");
    assert.equal(parser.recommendedTestLevel, "unit");
    assert.deepEqual(parser.existingTestPaths, ["Tests/CheckoutCoreTests/CheckoutParserTests.swift"]);
    assert.deepEqual(parser.existingTestEvidence, [
      {
        testPath: "Tests/CheckoutCoreTests/CheckoutParserTests.swift",
        kind: "filename-convention",
        strength: "naming"
      }
    ]);
    assert.ok(parser.signals.includes("matching-test"));

    const client = audit.untestedCandidates[0];
    assert.equal(client.kind, "service");
    assert.ok(client.signals.includes("async-or-concurrency"));
    assert.equal(client.risk, "high");

    const view = audit.skipped.find((target) => target.name === "CheckoutView");
    assert.equal(view.kind, "ui-view");
    assert.match(view.reason, /SwiftUI views/);

    const dto = audit.skipped.find((target) => target.name === "PaymentResponseDTO");
    assert.equal(dto.kind, "dto");
    assert.match(dto.reason, /DTO-only models/);
  });

  it("can limit candidates to changed source files while keeping repo profile", () => {
    const audit = auditSwiftRepo(exampleRoot, {
      changedPaths: ["Sources/CheckoutCore/PaymentClient.swift"]
    });

    assert.deepEqual(audit.profile.testFrameworks, ["XCTest"]);
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["PaymentClient"]
    );
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
  });

  it("normalizes Windows-style changed source paths", () => {
    const audit = auditSwiftRepo(exampleRoot, {
      changedPaths: ["Sources\\CheckoutCore\\PaymentClient.swift"]
    });

    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["PaymentClient"]
    );
  });

  it("ignores changed test files for source target selection", () => {
    const audit = auditSwiftRepo(exampleRoot, {
      changedPaths: ["Tests/CheckoutCoreTests/CheckoutParserTests.swift"]
    });

    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
    assert.deepEqual(audit.recommended, []);
  });

  it("detects mixed Swift and Objective-C Apple projects without inventing a test command", () => {
    const audit = auditSwiftRepo(path.resolve("examples/apple-xcode-mixed"));

    assert.deepEqual(audit.profile.languages, ["objective-c", "swift"]);
    assert.deepEqual(audit.profile.packageManagers, ["xcodebuild"]);
    assert.deepEqual(audit.profile.testFrameworks, []);
    assert.equal(audit.profile.testCommand, undefined);
    assert.ok(audit.profile.architectures.includes("apple-xcode"));
    assert.ok(audit.profile.architectures.includes("swiftui"));
    assert.ok(audit.profile.blockers.includes("No supported Swift test framework detected."));
    assert.ok(audit.profile.blockers.includes("No runnable Swift test command detected from Package.swift or Xcode project markers."));
    assert.deepEqual(
      audit.skipped.map((target) => target.name),
      ["CheckoutView", "LegacyPaymentClient"]
    );
  });

  it("detects Swift Testing package conventions", () => {
    const audit = auditSwiftRepo(swiftTestingRoot);

    assert.deepEqual(audit.profile.languages, ["swift"]);
    assert.deepEqual(audit.profile.packageManagers, ["swiftpm"]);
    assert.deepEqual(audit.profile.testFrameworks, ["Swift Testing"]);
    assert.equal(audit.profile.testCommand, "swift test");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(audit.profile.setupSignals.includes("swift package manager"));
    assert.ok(audit.profile.setupSignals.includes("swiftpm test target"));
    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.name),
      ["DiscountValidator"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => target.name),
      ["PriceResponseDTO"]
    );
  });

  it("audits the checked-in Quick and Nimble SwiftPM fixture", () => {
    const audit = auditSwiftRepo(quickNimbleRoot);

    assert.deepEqual(audit.profile.languages, ["swift"]);
    assert.deepEqual(audit.profile.packageManagers, ["swiftpm"]);
    assert.deepEqual(audit.profile.testFrameworks, ["Nimble", "Quick"]);
    assert.equal(audit.profile.testCommand, "swift test");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.setupSignals.includes("quick test support"));
    assert.ok(audit.profile.setupSignals.includes("nimble assertion support"));
    assert.ok(audit.profile.setupSignals.includes("swiftpm test target"));

    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["StockValidator:pure-logic:unit"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["StockFormatter:pure-logic:unit"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.name}:${target.kind}`),
      ["StockResponseDTO:dto"]
    );

    const validator = audit.coveredButRisky[0];
    assert.ok(validator.signals.includes("matching-test"));
    assert.deepEqual(validator.existingTestPaths, ["Tests/InventoryRulesTests/StockValidatorTests.swift"]);
  });

  it("qualifies Quick spec evidence by SwiftPM target ownership", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-swift-target-evidence-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "Sources", "Core"), { recursive: true });
    fs.mkdirSync(path.join(root, "Sources", "UI"), { recursive: true });
    fs.mkdirSync(path.join(root, "Tests", "CoreSpecs"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "Package.swift"),
      `// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MultiTarget",
    dependencies: [
        .package(url: "https://github.com/Quick/Quick.git", from: "7.0.0")
    ],
    targets: [
        .target(name: "Core"),
        .target(name: "UI"),
        .testTarget(
            name: "CoreSpecs",
            dependencies: [
                "Core",
                .product(name: "Quick", package: "Quick")
            ]
        )
    ]
)
`
    );
    fs.writeFileSync(path.join(root, "Sources", "Core", "Parser.swift"), "func parse(_ value: String) -> String { if value.isEmpty { return \"missing\" }; return value }\n");
    fs.writeFileSync(path.join(root, "Sources", "UI", "Parser.swift"), "func parse(_ value: String) -> String { if value.isEmpty { return \"empty\" }; return value }\n");
    fs.writeFileSync(
      path.join(root, "Tests", "CoreSpecs", "ParserSpec.swift"),
      `import Quick
@testable import Core

final class ParserSpec: QuickSpec {
    override class func spec() {}
}
`
    );

    const audit = auditSwiftRepo(root);

    assert.deepEqual(audit.profile.testFrameworks, ["Quick"]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["Sources/Core/Parser.swift"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["Sources/UI/Parser.swift"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [
      {
        testPath: "Tests/CoreSpecs/ParserSpec.swift",
        kind: "filename-convention",
        strength: "naming"
      }
    ]);
  });

  it("uses custom SwiftPM paths, sources, excludes, and test dependencies", () => {
    const audit = auditSwiftRepo(customPathsRoot);

    assert.deepEqual(audit.profile.packageManagers, ["swiftpm"]);
    assert.equal(audit.profile.testCommand, "swift test");
    assert.ok(audit.profile.setupSignals.includes("swiftpm custom target path"));
    assert.ok(audit.profile.setupSignals.includes("swiftpm explicit sources"));
    assert.ok(audit.profile.existingTestLocations.includes("Verification/Core/Parser"));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), [
      "Modules/CheckoutCore/Parsing/CheckoutParser.swift"
    ]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), [
      "Modules/CheckoutUI/CheckoutParser.swift",
      "Modules/CheckoutCore/Networking/PaymentClient.swift"
    ]);
    assert.ok(!audit.recommended.some((target) => target.path.includes("LegacyGateway.swift")));
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [
      {
        testPath: "Verification/Core/Parser/CheckoutParserTests.swift",
        kind: "filename-convention",
        strength: "naming"
      }
    ]);
  });

  it("uses Bazel swift_test ownership for separately located test sources", () => {
    const audit = auditSwiftRepo(bazelRoot);

    assert.deepEqual(audit.profile.packageManagers, ["bazel"]);
    assert.deepEqual(audit.profile.testFrameworks, ["XCTest"]);
    assert.equal(audit.profile.testCommand, "bazel test //...");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(audit.profile.architectures.includes("bazel-swift"));
    assert.ok(audit.profile.detectedConventions.includes("Bazel swift_test targets"));
    assert.ok(audit.profile.setupSignals.includes("bazel swift_test target"));
    assert.ok(audit.profile.existingTestLocations.includes("verification"));
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["Core/PaymentClient.swift"]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["Core/CheckoutParser.swift"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [
      {
        testPath: "verification/CheckoutParserTests.swift",
        kind: "filename-convention",
        strength: "naming"
      }
    ]);
  });

  it("detects Vapor service routes without inventing missing test conventions", () => {
    const audit = auditSwiftRepo(vaporRoot);

    assert.deepEqual(audit.profile.languages, ["swift"]);
    assert.deepEqual(audit.profile.packageManagers, ["swiftpm"]);
    assert.deepEqual(audit.profile.testFrameworks, []);
    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "low");
    assert.ok(audit.profile.architectures.includes("swift-package"));
    assert.ok(audit.profile.architectures.includes("vapor"));
    assert.ok(audit.profile.setupSignals.includes("vapor dependency"));
    assert.ok(audit.profile.setupSignals.includes("swiftpm executable target"));
    assert.ok(audit.profile.blockers.includes("No supported Swift test framework detected."));
    assert.ok(audit.profile.blockers.includes("No runnable Swift test command detected from Package.swift or Xcode project markers."));
    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["UserRoutes:http-route:integration", "UserService:service:unit"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => target.name),
      ["configure", "routes", "UserResponseDTO"]
    );
  });

  it("detects XCTVapor test support and separates middleware from routes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-vapor-"));
    fs.mkdirSync(path.join(root, "Sources", "App", "Controllers"), { recursive: true });
    fs.mkdirSync(path.join(root, "Sources", "App", "Middleware"), { recursive: true });
    fs.mkdirSync(path.join(root, "Sources", "App", "Models"), { recursive: true });
    fs.mkdirSync(path.join(root, "Tests", "AppTests"), { recursive: true });

    fs.writeFileSync(
      path.join(root, "Package.swift"),
      `// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "App",
    dependencies: [
        .package(url: "https://github.com/vapor/vapor.git", from: "4.100.0")
    ],
    targets: [
        .executableTarget(
            name: "App",
            dependencies: [
                .product(name: "Vapor", package: "vapor")
            ]
        ),
        .testTarget(
            name: "AppTests",
            dependencies: [
                .target(name: "App"),
                .product(name: "XCTVapor", package: "vapor")
            ]
        )
    ]
)
`
    );
    fs.writeFileSync(
      path.join(root, "Sources", "App", "Controllers", "HomeController.swift"),
      `import Vapor

struct HomeController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        routes.get("hello", use: hello)
    }

    func hello(_ req: Request) async throws -> String {
        "Hello"
    }
}
`
    );
    fs.writeFileSync(
      path.join(root, "Sources", "App", "Middleware", "AuthMiddleware.swift"),
      `import Vapor

struct AuthMiddleware: AsyncMiddleware {
    func respond(to request: Request, chainingTo next: AsyncResponder) async throws -> Response {
        try await next.respond(to: request)
    }
}
`
    );
    fs.writeFileSync(
      path.join(root, "Sources", "App", "Models", "User.swift"),
      `import Fluent
import Vapor

final class User: Model, Content, @unchecked Sendable {
    static let schema = "users"

    @ID(key: .id)
    var id: UUID?

    @Field(key: "email")
    var email: String

    init() {}
}

extension User {
    struct Migration: AsyncMigration {
        func prepare(on database: Database) async throws {
            try await database.schema("users").id().field("email", .string, .required).create()
        }

        func revert(on database: Database) async throws {
            try await database.schema("users").delete()
        }
    }
}
`
    );
    fs.writeFileSync(
      path.join(root, "Sources", "App", "Models", "UserResponseDTO.swift"),
      `import Vapor

struct UserResponseDTO: Content {
    var id: UUID?
    var email: String?
    var displayName: String?
}
`
    );
    fs.writeFileSync(
      path.join(root, "Sources", "App", "configure.swift"),
      `import Vapor

public func configure(_ app: Application) throws {
    if Environment.get("PORT") != nil {
        app.http.server.configuration.hostname = "0.0.0.0"
    }
}
`
    );
    fs.writeFileSync(
      path.join(root, "Tests", "AppTests", "AppTests.swift"),
      `@testable import App
import XCTVapor
import Testing

@Test("hello route")
func helloRoute() async throws {}
`
    );

    const audit = auditSwiftRepo(root);

    assert.deepEqual(audit.profile.testFrameworks, ["Swift Testing", "XCTVapor"]);
    assert.equal(audit.profile.testCommand, "swift test");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(audit.profile.setupSignals.includes("vapor dependency"));
    assert.ok(audit.profile.setupSignals.includes("xctvapor test support"));

    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["AuthMiddleware:http-middleware:integration", "HomeController:http-route:integration"]
    );

    const lifecycle = audit.skipped.find((target) => target.name === "configure");
    assert.equal(lifecycle.kind, "vapor-lifecycle");
    assert.ok(lifecycle.signals.includes("vapor-lifecycle"));

    assert.deepEqual(
      audit.skipped
        .filter((target) => target.name === "User" || target.name === "UserResponseDTO")
        .map((target) => `${target.name}:${target.kind}:${target.signals.join(",")}`),
      ["User:persistence-model:fluent-model", "UserResponseDTO:dto:dto-only"]
    );
  });

  it("prioritizes MongoDB query and write boundaries in Vapor apps", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-mongo-"));
    fs.mkdirSync(path.join(root, "Sources", "App", "Controllers"), { recursive: true });
    fs.mkdirSync(path.join(root, "Sources", "App", "Jobs"), { recursive: true });
    fs.mkdirSync(path.join(root, "Tests", "AppTests"), { recursive: true });

    fs.writeFileSync(
      path.join(root, "Package.swift"),
      `// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "App",
    dependencies: [
        .package(url: "https://github.com/vapor/vapor.git", from: "4.100.0"),
        .package(url: "https://github.com/vapor/fluent-mongo-driver.git", from: "1.4.0")
    ],
    targets: [
        .executableTarget(
            name: "App",
            dependencies: [
                .product(name: "Vapor", package: "vapor"),
                .product(name: "FluentMongoDriver", package: "fluent-mongo-driver")
            ]
        ),
        .testTarget(name: "AppTests", dependencies: [.target(name: "App")])
    ]
)
`
    );
    fs.writeFileSync(
      path.join(root, "Sources", "App", "Controllers", "PriceController.swift"),
      `import Vapor
import MongoKitten
import BSON
import FluentMongoDriver

struct PriceController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        routes.get("prices") { req async throws -> [PriceChange] in
            let database = req.db(.mongo)
            guard let database = database as? MongoDatabaseRepresentable else { throw Abort(.internalServerError) }
            let collection = database.raw["price_changes"]
            let pipeline: [Document] = [
                ["$group": Document(dictionaryLiteral: ("_id", "$card_id"), ("latestPrice", Document(dictionaryLiteral: ("$push", "$price"))))],
                ["$project": Document(dictionaryLiteral: ("_id", 0), ("top10", Document(dictionaryLiteral: ("$slice", ["$latestPrice", 10] as Document)))]
            ]
            return try await collection.aggregate([.init(documents: pipeline)]).decode(PriceChange.self).allResults()
        }
    }
}

struct PriceChange: Content {
    let cardId: String
}
`
    );
    fs.writeFileSync(
      path.join(root, "Sources", "App", "Controllers", "SearchController.swift"),
      `import Vapor
import Fluent
import FluentMongoDriver

struct SearchController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        routes.get("search") { req async throws -> [Card] in
            let query = try req.query.get(String.self, at: "query")
            let regexPattern = ".*\\(NSRegularExpression.escapedPattern(for: query)).*"
            var queryDocument = Document()
            queryDocument["name"]["$regex"] = regexPattern
            return try await Card.query(on: req.db(.mongo))
                .filter(.custom(queryDocument))
                .sort(\\.$name, .ascending)
                .limit(25)
                .all()
        }
    }
}

struct Card: Content {
    let name: String
}
`
    );
    fs.writeFileSync(
      path.join(root, "Sources", "App", "Jobs", "PriceHistoryJob.swift"),
      `import Vapor
import FluentMongoDriver

struct PriceHistoryJob {
    func run(app: Application, history: CardPriceHistory) async throws {
        if let existing = try await CardPriceHistory.query(on: app.db(.mongo)).first() {
            try await existing.update(on: app.db(.mongo))
        } else {
            try await history.create(on: app.db(.mongo))
        }
    }
}

final class CardPriceHistory {}
`
    );
    fs.writeFileSync(
      path.join(root, "Tests", "AppTests", "AppTests.swift"),
      `import Testing
@testable import App

@Test func smoke() {}
`
    );

    const audit = auditSwiftRepo(root);

    assert.ok(audit.profile.architectures.includes("mongodb"));
    assert.ok(audit.profile.setupSignals.includes("mongodb dependency"));

    const price = audit.recommended.find((target) => target.name === "PriceController");
    assert.equal(price.kind, "http-route");
    assert.equal(price.riskReductionScore, 9);
    assert.ok(price.signals.includes("mongodb-aggregation"));
    assert.ok(price.reasons.includes("aggregation pipeline semantics"));

    const search = audit.recommended.find((target) => target.name === "SearchController");
    assert.equal(search.kind, "http-route");
    assert.ok(search.signals.includes("mongodb-dynamic-filter"));
    assert.ok(search.signals.includes("pagination-or-sort"));

    const job = audit.recommended.find((target) => target.name === "PriceHistoryJob");
    assert.equal(job.kind, "data-access");
    assert.equal(job.recommendedTestLevel, "integration");
    assert.ok(job.signals.includes("mongodb-write"));
  });

  it("audits the checked-in Vapor MongoDB boundary fixture", () => {
    const audit = auditSwiftRepo(vaporMongoRoot);

    assert.deepEqual(audit.profile.testFrameworks, ["Swift Testing", "XCTVapor"]);
    assert.equal(audit.profile.testCommand, "swift test");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(audit.profile.architectures.includes("mongodb"));
    assert.ok(audit.profile.architectures.includes("vapor"));
    assert.ok(audit.profile.setupSignals.includes("mongodb dependency"));
    assert.ok(audit.profile.setupSignals.includes("xctvapor test support"));

    assert.deepEqual(
      audit.recommended.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      [
        "PriceController:http-route:integration",
        "PriceHistoryJob:data-access:integration",
        "SearchController:http-route:integration"
      ]
    );

    const price = audit.recommended.find((target) => target.name === "PriceController");
    assert.ok(price.signals.includes("mongodb-aggregation"));
    assert.ok(price.reasons.includes("aggregation pipeline semantics"));

    const search = audit.recommended.find((target) => target.name === "SearchController");
    assert.ok(search.signals.includes("mongodb-dynamic-filter"));
    assert.ok(search.signals.includes("pagination-or-sort"));

    const job = audit.recommended.find((target) => target.name === "PriceHistoryJob");
    assert.ok(job.signals.includes("mongodb-write"));
    assert.deepEqual(audit.skipped, []);
  });

  it("classifies common Swift utility sub-kinds", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-swift-subkinds-"));
    fs.mkdirSync(path.join(root, "Sources", "Core", "Worker"), { recursive: true });
    fs.mkdirSync(path.join(root, "Sources", "Core", "Persistence"), { recursive: true });
    fs.mkdirSync(path.join(root, "Sources", "Core", "Networking"), { recursive: true });
    fs.mkdirSync(path.join(root, "Tests", "CoreTests"), { recursive: true });

    fs.writeFileSync(
      path.join(root, "Package.swift"),
      `// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Core",
    targets: [
        .target(name: "Core"),
        .testTarget(name: "CoreTests", dependencies: ["Core"])
    ]
)
`
    );
    fs.writeFileSync(
      path.join(root, "Sources", "Core", "Persistence", "KeychainStorage.swift"),
      `import Foundation
import Security

public class KeychainStorage {
    public func save<T: Codable>(_ value: T, forKey key: String) throws {
        let data = try JSONEncoder().encode(value)
        let query: [String: Any] = [kSecAttrAccount as String: key, kSecValueData as String: data]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw StorageError.failed }
    }
}

enum StorageError: Error { case failed }
`
    );
    fs.writeFileSync(
      path.join(root, "Sources", "Core", "Worker", "AccountWorker.swift"),
      `public actor AccountWorker {
    func login(username: String, password: String) async -> String {
        await Task.yield()
        return username + password
    }
}
`
    );
    fs.writeFileSync(
      path.join(root, "Sources", "Core", "Networking", "URLBuilder.swift"),
      `import Foundation

struct URLBuilder {
    func buildURL(baseURI: String, path: String) -> URL {
        guard var components = URLComponents(string: baseURI) else { preconditionFailure("bad base") }
        let formattedPath = path.hasPrefix("/") ? path : "/\\(path)"
        components.path = components.path.appending(formattedPath)
        guard let url = components.url else { preconditionFailure("bad url") }
        return url
    }
}
`
    );
    fs.writeFileSync(
      path.join(root, "Sources", "Core", "Networking", "APIError.swift"),
      `public enum APIError: Error {
    case serverError(statusCode: Int)
    case notFound

    var localizedDescription: String {
        switch self {
        case .serverError(let statusCode):
            return "Server error \\(statusCode)"
        case .notFound:
            return "Not found"
        }
    }
}
`
    );
    fs.writeFileSync(
      path.join(root, "Tests", "CoreTests", "CoreTests.swift"),
      `import Testing
@testable import Core

@Test func smoke() {}
`
    );

    const audit = auditSwiftRepo(root);
    const byName = new Map(audit.recommended.map((target) => [target.name, target]));

    assert.equal(byName.get("KeychainStorage").kind, "storage");
    assert.ok(byName.get("KeychainStorage").signals.includes("encoding-or-decoding"));
    assert.equal(byName.get("AccountWorker").kind, "command-or-worker");
    assert.ok(byName.get("AccountWorker").signals.includes("async-or-concurrency"));
    assert.equal(byName.get("URLBuilder").kind, "query-builder");
    assert.equal(byName.get("APIError").kind, "error-mapping");
  });

  it("audits Xcode app source folders outside SwiftPM Sources roots", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-xcode-"));
    fs.mkdirSync(path.join(root, "SampleApp.xcodeproj"), { recursive: true });
    fs.mkdirSync(path.join(root, "SampleApp.xcodeproj", "xcshareddata", "xcschemes"), { recursive: true });
    fs.mkdirSync(path.join(root, "SampleApp", "Services"), { recursive: true });
    fs.mkdirSync(path.join(root, "SampleApp", "Views"), { recursive: true });
    fs.mkdirSync(path.join(root, "SampleAppTests"), { recursive: true });
    fs.mkdirSync(path.join(root, "SampleAppUITests"), { recursive: true });

    fs.writeFileSync(
      path.join(root, "SampleApp.xcodeproj", "project.pbxproj"),
      `// !$*UTF8*$!
{
  archiveVersion = 1;
  objectVersion = 77;
}
`
    );
    fs.writeFileSync(
      path.join(root, "SampleApp.xcodeproj", "xcshareddata", "xcschemes", "SampleApp.xcscheme"),
      `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1610" version="1.7"></Scheme>
`
    );
    fs.writeFileSync(
      path.join(root, "SampleApp", "Services", "SessionService.swift"),
      `import Foundation

struct SessionService {
    func isExpired(_ date: Date, now: Date) -> Bool {
        date < now
    }
}
`
    );
    fs.writeFileSync(
      path.join(root, "SampleApp", "Views", "LoginView.swift"),
      `import SwiftUI

struct LoginView: View {
    var body: some View {
        Text("Login")
    }
}
`
    );
    fs.writeFileSync(
      path.join(root, "SampleAppTests", "SessionServiceTests.swift"),
      `import XCTest

final class SessionServiceTests: XCTestCase {
    func testExpired() {}
}
`
    );
    fs.writeFileSync(
      path.join(root, "SampleAppUITests", "SampleAppUITests.swift"),
      `import XCTest

final class SampleAppUITests: XCTestCase {
    func testLaunch() {}
}
`
    );

    const audit = auditSwiftRepo(root);

    assert.deepEqual(audit.profile.packageManagers, ["xcodebuild"]);
    assert.deepEqual(audit.profile.testFrameworks, ["XCTest"]);
    assert.equal(audit.profile.testCommand, "xcodebuild test -scheme SampleApp");
    assert.ok(audit.profile.setupSignals.includes("xcode shared scheme"));
    assert.ok(audit.profile.detectedConventions.includes("*UITests folders"));
    assert.ok(audit.profile.existingTestLocations.includes("SampleAppTests"));
    assert.ok(audit.profile.existingTestLocations.includes("SampleAppUITests"));
    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.name}:${target.kind}:${target.existingTestPaths.join(",")}`),
      ["SessionService:service:SampleAppTests/SessionServiceTests.swift"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.name}:${target.kind}`),
      ["LoginView:ui-view"]
    );
  });

  it("prefers an Xcode scheme matching the project name when multiple shared schemes exist", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-xcode-scheme-"));
    fs.mkdirSync(path.join(root, "Collector's Grimoire.xcodeproj", "xcshareddata", "xcschemes"), { recursive: true });
    fs.mkdirSync(path.join(root, "Collector's GrimoireTests"), { recursive: true });

    fs.writeFileSync(path.join(root, "Collector's Grimoire.xcodeproj", "project.pbxproj"), "{}\n");
    fs.writeFileSync(path.join(root, "Collector's Grimoire.xcodeproj", "xcshareddata", "xcschemes", "Collector's Grimoire Beta.xcscheme"), "<Scheme></Scheme>\n");
    fs.writeFileSync(path.join(root, "Collector's Grimoire.xcodeproj", "xcshareddata", "xcschemes", "Collector's Grimoire.xcscheme"), "<Scheme></Scheme>\n");
    fs.writeFileSync(
      path.join(root, "Collector's GrimoireTests", "CollectorTests.swift"),
      `import XCTest

final class CollectorTests: XCTestCase {
    func testExample() {}
}
`
    );

    const audit = auditSwiftRepo(root);

    assert.equal(audit.profile.testCommand, `xcodebuild test -scheme "Collector's Grimoire"`);
    assert.ok(audit.profile.setupSignals.includes("xcode shared scheme"));
  });

  it("detects popular SwiftPM test support libraries", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-swift-frameworks-"));
    fs.mkdirSync(path.join(root, "Sources", "Feature"), { recursive: true });
    fs.mkdirSync(path.join(root, "Tests", "FeatureTests"), { recursive: true });

    fs.writeFileSync(
      path.join(root, "Package.swift"),
      `// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "Feature",
    dependencies: [
        .package(url: "https://github.com/Quick/Quick.git", from: "7.0.0"),
        .package(url: "https://github.com/Quick/Nimble.git", from: "13.0.0"),
        .package(url: "https://github.com/pointfreeco/swift-snapshot-testing", from: "1.17.0")
    ],
    targets: [
        .target(name: "Feature"),
        .testTarget(
            name: "FeatureTests",
            dependencies: [
                "Feature",
                .product(name: "Quick", package: "Quick"),
                .product(name: "Nimble", package: "Nimble"),
                .product(name: "SnapshotTesting", package: "swift-snapshot-testing")
            ]
        )
    ]
)
`
    );
    fs.writeFileSync(
      path.join(root, "Sources", "Feature", "FeatureFlags.swift"),
      `struct FeatureFlags {
    func isEnabled(_ key: String) -> Bool {
        key == "checkout"
    }
}
`
    );
    fs.writeFileSync(
      path.join(root, "Tests", "FeatureTests", "FeatureFlagsSpec.swift"),
      `import Quick
import Nimble
import SnapshotTesting
@testable import Feature

final class FeatureFlagsSpec: QuickSpec {
    override class func spec() {}
}
`
    );

    const audit = auditSwiftRepo(root);

    assert.deepEqual(audit.profile.testFrameworks, ["Nimble", "Quick", "SnapshotTesting"]);
    assert.equal(audit.profile.testCommand, "swift test");
    assert.ok(audit.profile.setupSignals.includes("quick test support"));
    assert.ok(audit.profile.setupSignals.includes("nimble assertion support"));
    assert.ok(audit.profile.setupSignals.includes("snapshot testing support"));
  });

  it("detects Objective-C XCTest imports in mixed Apple projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-objc-xctest-"));
    fs.mkdirSync(path.join(root, "LegacyApp.xcodeproj"), { recursive: true });
    fs.mkdirSync(path.join(root, "LegacyAppTests"), { recursive: true });
    fs.writeFileSync(path.join(root, "LegacyApp.xcodeproj", "project.pbxproj"), "{}\n");
    fs.writeFileSync(
      path.join(root, "LegacyAppTests", "LegacyPaymentClientTests.m"),
      `#import <XCTest/XCTest.h>

@interface LegacyPaymentClientTests : XCTestCase
@end

@implementation LegacyPaymentClientTests
- (void)testPayment {}
@end
`
    );

    const audit = auditSwiftRepo(root);

    assert.deepEqual(audit.profile.testFrameworks, ["XCTest"]);
    assert.equal(audit.profile.testCommand, "xcodebuild test");
    assert.deepEqual(audit.profile.blockers, []);
  });

  it("includes a single Xcode test plan in scheme-based test commands", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-xctestplan-"));
    fs.mkdirSync(path.join(root, "SampleApp.xcodeproj", "xcshareddata", "xcschemes"), { recursive: true });
    fs.mkdirSync(path.join(root, "SampleAppTests"), { recursive: true });

    fs.writeFileSync(path.join(root, "SampleApp.xcodeproj", "project.pbxproj"), "{}\n");
    fs.writeFileSync(path.join(root, "SampleApp.xcodeproj", "xcshareddata", "xcschemes", "SampleApp.xcscheme"), "<Scheme></Scheme>\n");
    fs.writeFileSync(path.join(root, "SampleApp.xctestplan"), "{}\n");
    fs.writeFileSync(
      path.join(root, "SampleAppTests", "SampleAppTests.swift"),
      `import XCTest

final class SampleAppTests: XCTestCase {
    func testExample() {}
}
`
    );

    const audit = auditSwiftRepo(root);

    assert.equal(audit.profile.testCommand, "xcodebuild test -scheme SampleApp -testPlan SampleApp");
    assert.ok(audit.profile.setupSignals.includes("xcode test plan"));
  });
});
