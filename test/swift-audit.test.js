import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { auditSwiftRepo } from "../src/adapters/swift/audit.js";

const exampleRoot = path.resolve("examples/swift-spm-xctest");

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
});
