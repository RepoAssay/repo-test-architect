import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditKotlinRepo } from "../src/adapters/kotlin/audit.js";

const exampleRoot = path.resolve("examples/kotlin-junit-basic");

describe("Kotlin audit adapter", () => {
  it("detects Gradle, JVM languages, test framework, and conventions", () => {
    const audit = auditKotlinRepo(exampleRoot);

    assert.equal(audit.schemaVersion, "audit/v1");
    assert.deepEqual(audit.profile.languages, ["java", "kotlin"]);
    assert.deepEqual(audit.profile.packageManagers, ["gradle"]);
    assert.deepEqual(audit.profile.testFrameworks, ["junit", "kotlin-test"]);
    assert.equal(audit.profile.testCommand, "gradle test");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.existingTestLocations.includes("src/test"));
    assert.ok(audit.profile.detectedConventions.includes("*Test files"));
    assert.ok(audit.profile.setupSignals.includes("gradle kotlin dsl"));
    assert.ok(audit.profile.setupSignals.includes("junit platform"));
  });

  it("separates covered risky logic, untested logic, and DTO-like data classes", () => {
    const audit = auditKotlinRepo(exampleRoot);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.name),
      ["CheckoutCalculator"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["MoneyFormatter"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => target.name),
      ["CheckoutRequest"]
    );

    const calculator = audit.coveredButRisky[0];
    assert.equal(calculator.kind, "pure-logic");
    assert.equal(calculator.recommendedTestLevel, "unit");
    assert.deepEqual(calculator.existingTestPaths, ["src/test/kotlin/com/example/checkout/CheckoutCalculatorTest.kt"]);
    assert.ok(calculator.signals.includes("matching-test"));

    const request = audit.skipped[0];
    assert.equal(request.kind, "dto");
    assert.match(request.reason, /DTO-only models/);
  });

  it("can limit candidates to changed source files while keeping repo profile", () => {
    const audit = auditKotlinRepo(exampleRoot, {
      changedPaths: ["src/main/java/com/example/checkout/MoneyFormatter.java"]
    });

    assert.deepEqual(audit.profile.testFrameworks, ["junit", "kotlin-test"]);
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["MoneyFormatter"]
    );
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
  });

  it("normalizes Windows-style changed source paths", () => {
    const audit = auditKotlinRepo(exampleRoot, {
      changedPaths: ["src\\main\\java\\com\\example\\checkout\\MoneyFormatter.java"]
    });

    assert.deepEqual(audit.profile.testFrameworks, ["junit", "kotlin-test"]);
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["MoneyFormatter"]
    );
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
  });

  it("ignores changed test files for source target selection", () => {
    const audit = auditKotlinRepo(exampleRoot, {
      changedPaths: ["src/test/kotlin/com/example/checkout/CheckoutCalculatorTest.kt"]
    });

    assert.deepEqual(audit.profile.testFrameworks, ["junit", "kotlin-test"]);
    assert.deepEqual(audit.untestedCandidates, []);
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
    assert.deepEqual(audit.recommended, []);
  });

  it("prefers Gradle wrapper test commands when wrapper markers exist", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-kotlin-"));
    fs.mkdirSync(path.join(root, "src", "main", "kotlin"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "build.gradle.kts"),
      'plugins { kotlin("jvm") version "1.9.0" }\ndependencies { testImplementation(kotlin("test")) }\ntasks.test { useJUnitPlatform() }\n',
      "utf8"
    );
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), 'rootProject.name = "wrapped"\n', "utf8");
    fs.writeFileSync(path.join(root, "gradlew"), "#!/usr/bin/env sh\n", "utf8");
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "TokenParser.kt"), "class TokenParser { fun parse(input: String) = input.trim() }\n", "utf8");
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "TokenParserTest.kt"), "class TokenParserTest\n", "utf8");

    const audit = auditKotlinRepo(root);

    assert.equal(audit.profile.testCommand, "./gradlew test");
    assert.ok(audit.profile.setupSignals.includes("gradle kotlin dsl"));
    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.name),
      ["TokenParser"]
    );
  });

  it("detects Maven JVM projects with JUnit test commands", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-maven-"));
    fs.mkdirSync(path.join(root, "src", "main", "java", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "java", "com", "example"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "pom.xml"),
      '<project><dependencies><dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId></dependency></dependencies></project>\n',
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "src", "main", "java", "com", "example", "InvoiceValidator.java"),
      "package com.example; public class InvoiceValidator { boolean valid(int amount) { return amount > 0; } }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "src", "test", "java", "com", "example", "InvoiceValidatorTest.java"),
      "package com.example; public class InvoiceValidatorTest {}\n",
      "utf8"
    );

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.profile.languages, ["java"]);
    assert.deepEqual(audit.profile.packageManagers, ["maven"]);
    assert.deepEqual(audit.profile.testFrameworks, ["junit"]);
    assert.equal(audit.profile.testCommand, "mvn test");
    assert.ok(audit.profile.setupSignals.includes("maven"));
    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.name),
      ["InvoiceValidator"]
    );
  });

  it("detects Gradle Groovy JVM projects with Java test conventions", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-gradle-groovy-"));
    fs.mkdirSync(path.join(root, "src", "main", "java"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "java"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "build.gradle"),
      "plugins { id 'java' }\ndependencies { testImplementation 'org.junit.jupiter:junit-jupiter:5.10.0' }\ntest { useJUnitPlatform() }\n",
      "utf8"
    );
    fs.writeFileSync(path.join(root, "src", "main", "java", "InvoiceValidator.java"), "class InvoiceValidator { boolean valid(int amount) { return amount > 0; } }\n", "utf8");
    fs.writeFileSync(path.join(root, "src", "test", "java", "InvoiceValidatorTest.java"), "class InvoiceValidatorTest {}\n", "utf8");

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.profile.languages, ["java"]);
    assert.deepEqual(audit.profile.packageManagers, ["gradle"]);
    assert.deepEqual(audit.profile.testFrameworks, ["junit"]);
    assert.equal(audit.profile.testCommand, "gradle test");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(audit.profile.detectedConventions.includes("src/test/java"));
    assert.ok(audit.profile.setupSignals.includes("gradle"));
    assert.ok(audit.profile.setupSignals.includes("junit platform"));
    assert.deepEqual(
      audit.coveredButRisky.map((target) => target.name),
      ["InvoiceValidator"]
    );
  });

  it("reports blockers when a JVM repo has no supported test framework", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-kotlin-no-tests-"));
    fs.mkdirSync(path.join(root, "src", "main", "kotlin"), { recursive: true });
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'plugins { kotlin("jvm") version "1.9.0" }\n', "utf8");
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "TokenParser.kt"), "class TokenParser { fun parse(input: String) = input.trim() }\n", "utf8");

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.profile.testFrameworks, []);
    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "low");
    assert.ok(audit.profile.blockers.includes("No supported JVM test framework detected."));
    assert.ok(audit.profile.blockers.includes("No runnable JVM test command detected from Gradle or Maven markers."));
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["TokenParser"]
    );
  });
});
