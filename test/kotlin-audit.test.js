import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditKotlinRepo } from "../src/adapters/kotlin/audit.js";

const exampleRoot = path.resolve("examples/kotlin-junit-basic");
const gradleGroovyRoot = path.resolve("examples/kotlin-gradle-groovy-junit");
const mavenRoot = path.resolve("examples/kotlin-maven-junit");

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

  it("normalizes absolute changed source paths from the audited root", () => {
    const audit = auditKotlinRepo(exampleRoot, {
      changedPaths: [path.join(exampleRoot, "src", "main", "java", "com", "example", "checkout", "MoneyFormatter.java")]
    });

    assert.deepEqual(audit.profile.testFrameworks, ["junit", "kotlin-test"]);
    assert.deepEqual(
      audit.untestedCandidates.map((target) => target.name),
      ["MoneyFormatter"]
    );
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.skipped, []);
  });

  it("normalizes current-directory changed source paths", () => {
    const audit = auditKotlinRepo(exampleRoot, {
      changedPaths: ["./src/main/java/com/example/checkout/MoneyFormatter.java"]
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
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "TokenParserTest.kt"), "class TokenParserTest { @Test fun parses() { TokenParser().parse(\"x\") } }\n", "utf8");

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
      "package com.example; public class InvoiceValidatorTest { @Test void validates() { new InvoiceValidator().valid(1); } }\n",
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

  it("audits the checked-in Maven JUnit fixture", () => {
    const audit = auditKotlinRepo(mavenRoot);

    assert.deepEqual(audit.profile.languages, ["java"]);
    assert.deepEqual(audit.profile.packageManagers, ["maven"]);
    assert.deepEqual(audit.profile.testFrameworks, ["junit"]);
    assert.equal(audit.profile.testCommand, "mvn test");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.detectedConventions.includes("src/test/java"));
    assert.ok(audit.profile.setupSignals.includes("maven"));
    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["InvoiceValidator:pure-logic:unit"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["MoneyFormatter:pure-logic:unit"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.name}:${target.kind}`),
      ["InvoiceRequest:dto"]
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
    fs.writeFileSync(path.join(root, "src", "test", "java", "InvoiceValidatorTest.java"), "class InvoiceValidatorTest { @Test void validates() { new InvoiceValidator().valid(1); } }\n", "utf8");

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

  it("audits the checked-in Gradle Groovy JUnit fixture", () => {
    const audit = auditKotlinRepo(gradleGroovyRoot);

    assert.deepEqual(audit.profile.languages, ["java"]);
    assert.deepEqual(audit.profile.packageManagers, ["gradle"]);
    assert.deepEqual(audit.profile.testFrameworks, ["junit"]);
    assert.equal(audit.profile.testCommand, "gradle test");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.detectedConventions.includes("src/test/java"));
    assert.ok(audit.profile.setupSignals.includes("gradle"));
    assert.ok(audit.profile.setupSignals.includes("gradle settings"));
    assert.ok(audit.profile.setupSignals.includes("junit platform"));
    assert.deepEqual(
      audit.coveredButRisky.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["ShipmentValidator:pure-logic:unit"]
    );
    assert.deepEqual(
      audit.untestedCandidates.map((target) => `${target.name}:${target.kind}:${target.recommendedTestLevel}`),
      ["WeightFormatter:pure-logic:unit"]
    );
    assert.deepEqual(
      audit.skipped.map((target) => `${target.name}:${target.kind}`),
      ["ShipmentRequest:dto"]
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

  it("does not treat an empty same-basename test shell as source coverage", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-kotlin-empty-test-"));
    fs.mkdirSync(path.join(root, "src", "main", "kotlin", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin", "com", "example"), { recursive: true });
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'dependencies { testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "com", "example", "TokenParser.kt"), "package com.example\nclass TokenParser { fun parse(value: String) = if (value.isBlank()) null else value }\n");
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "com", "example", "TokenParserTest.kt"), "package com.example\nclass TokenParserTest\n");

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.name), ["TokenParser"]);
  });

  it("records exact imported JVM symbols as direct test evidence", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-kotlin-import-"));
    fs.mkdirSync(path.join(root, "src", "main", "kotlin", "com", "example", "tokens"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin", "com", "example", "integration"), { recursive: true });
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'dependencies { testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "com", "example", "tokens", "TokenParser.kt"), "package com.example.tokens\nclass TokenParser { fun parse(value: String) = if (value.isBlank()) null else value }\n");
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "com", "example", "integration", "ParsingTest.kt"), "package com.example.integration\nimport com.example.tokens.TokenParser\nimport kotlin.test.Test\nclass ParsingTest { @Test fun parses() { TokenParser().parse(\"token\") } }\n");

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "src/test/kotlin/com/example/integration/ParsingTest.kt",
      kind: "jvm-symbol-reference",
      strength: "direct",
      usage: "called"
    }]);
  });

  it("keeps duplicate source basenames isolated by package ownership", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-kotlin-owners-"));
    for (const owner of ["billing", "shipping"]) {
      fs.mkdirSync(path.join(root, "src", "main", "java", "com", "example", owner), { recursive: true });
      fs.writeFileSync(
        path.join(root, "src", "main", "java", "com", "example", owner, "MoneyFormatter.java"),
        `package com.example.${owner}; public class MoneyFormatter { String format(int value) { return value > 0 ? \"+\" : \"-\"; } }\n`
      );
    }
    fs.mkdirSync(path.join(root, "src", "test", "java", "com", "example", "billing"), { recursive: true });
    fs.writeFileSync(path.join(root, "pom.xml"), "<project><dependency><groupId>org.junit</groupId></dependency></project>\n");
    fs.writeFileSync(path.join(root, "src", "test", "java", "com", "example", "billing", "MoneyFormatterTest.java"), "package com.example.billing; class MoneyFormatterTest { @Test void formats() { new MoneyFormatter().format(1); } }\n");

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["src/main/java/com/example/billing/MoneyFormatter.java"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["src/main/java/com/example/shipping/MoneyFormatter.java"]);
  });

  it("prefers Maven wrapper commands and reports the wrapper signal", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-maven-wrapper-"));
    fs.mkdirSync(path.join(root, "src", "main", "java"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "java"), { recursive: true });
    fs.writeFileSync(path.join(root, "pom.xml"), "<project><dependency><groupId>org.junit.jupiter</groupId></dependency></project>\n");
    fs.writeFileSync(path.join(root, "mvnw"), "#!/bin/sh\n");
    fs.writeFileSync(path.join(root, "src", "main", "java", "TokenParser.java"), "class TokenParser { String parse(String value) { return value == null ? \"\" : value; } }\n");
    fs.writeFileSync(path.join(root, "src", "test", "java", "TokenParserTest.java"), "class TokenParserTest { @Test void parses() { new TokenParser().parse(\"x\"); } }\n");

    const audit = auditKotlinRepo(root);

    assert.equal(audit.profile.testCommand, "./mvnw test");
    assert.ok(audit.profile.setupSignals.includes("maven wrapper"));
  });

  it("detects JUnit 4 from test imports without relying on a generic test filename", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-junit4-"));
    fs.mkdirSync(path.join(root, "src", "main", "java", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "java", "com", "example"), { recursive: true });
    fs.writeFileSync(path.join(root, "build.gradle"), "plugins { id 'java' }\n");
    fs.writeFileSync(path.join(root, "src", "main", "java", "com", "example", "TokenParser.java"), "package com.example; class TokenParser { String parse(String value) { return value == null ? \"\" : value; } }\n");
    fs.writeFileSync(path.join(root, "src", "test", "java", "com", "example", "ParsingSpec.java"), "package com.example; import org.junit.Test; class ParsingSpec { @Test public void parses() { new TokenParser().parse(\"x\"); } }\n");

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.profile.testFrameworks, ["junit"]);
    assert.ok(audit.profile.setupSignals.includes("junit 4"));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.name), ["TokenParser"]);
  });

  it("maps imported top-level Kotlin functions back to their owning source file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-kotlin-function-"));
    fs.mkdirSync(path.join(root, "src", "main", "kotlin", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin", "com", "example", "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'dependencies { testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "com", "example", "TokenParser.kt"), "package com.example\nfun parseToken(value: String) = if (value.isBlank()) null else value\n");
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "com", "example", "tests", "ParsingTest.kt"), "package com.example.tests\nimport com.example.parseToken\nimport kotlin.test.Test\nclass ParsingTest { @Test fun parses() { parseToken(\"x\") } }\n");

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.name), ["TokenParser"]);
    assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].strength, "direct");
  });

  it("maps Java static member imports back to the declaring source file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-java-static-"));
    fs.mkdirSync(path.join(root, "src", "main", "java", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "java", "com", "example", "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "pom.xml"), "<project><dependency><groupId>org.junit.jupiter</groupId></dependency></project>\n");
    fs.writeFileSync(path.join(root, "src", "main", "java", "com", "example", "TokenValidator.java"), "package com.example; public class TokenValidator { public static boolean valid(String value) { return value != null && !value.isBlank(); } }\n");
    fs.writeFileSync(path.join(root, "src", "test", "java", "com", "example", "tests", "ValidationTest.java"), "package com.example.tests; import static com.example.TokenValidator.valid; class ValidationTest { @Test void validates() { valid(\"x\"); } }\n");

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.name), ["TokenValidator"]);
    assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].usage, "called");
  });

  it("blocks aggregate roots and unsupported test frameworks instead of overstating confidence", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-gradle-aggregate-"));
    fs.mkdirSync(path.join(root, "library", "src", "main", "kotlin"), { recursive: true });
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'dependencies { testImplementation("io.kotest:kotest-runner-junit5:6.0.0") }\n');
    fs.writeFileSync(path.join(root, "library", "src", "main", "kotlin", "TokenParser.kt"), "class TokenParser { fun parse(value: String) = if (value.isBlank()) null else value }\n");

    const audit = auditKotlinRepo(root);

    assert.equal(audit.profile.confidence, "low");
    assert.ok(audit.profile.blockers.includes("No supported root JVM source set detected; audit a Gradle or Maven module root."));
    assert.ok(audit.profile.blockers.includes("Unsupported JVM test frameworks detected: kotest."));
    assert.deepEqual(audit.recommended, []);
  });

  it("marks Android source sets outside the supported JVM module boundary", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-android-"));
    fs.mkdirSync(path.join(root, "src", "main", "kotlin", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "androidTest", "kotlin", "com", "example"), { recursive: true });
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'plugins { id("com.android.library") }\ndependencies { testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "com", "example", "TokenParser.kt"), "package com.example\nclass TokenParser { fun parse(value: String) = if (value.isBlank()) null else value }\n");
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "com", "example", "TokenParserTest.kt"), "package com.example\nclass TokenParserTest { @Test fun parses() { TokenParser().parse(\"x\") } }\n");
    fs.writeFileSync(path.join(root, "src", "androidTest", "kotlin", "com", "example", "DeviceTest.kt"), "package com.example\nclass DeviceTest\n");

    const audit = auditKotlinRepo(root);

    assert.equal(audit.profile.confidence, "medium");
    assert.ok(audit.profile.blockers.includes("Android unit and instrumentation source sets are outside the supported JVM module boundary."));
  });

  it("does not treat unexecuted src/test support code as coverage evidence", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-test-helper-"));
    fs.mkdirSync(path.join(root, "src", "main", "kotlin", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin", "com", "example"), { recursive: true });
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'dependencies { testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "com", "example", "TokenParser.kt"), "package com.example\nclass TokenParser { fun parse(value: String) = if (value.isBlank()) null else value }\n");
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "com", "example", "TestFixtures.kt"), "package com.example\nval parserFixture = TokenParser()\n");

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.name), ["TokenParser"]);
  });

  it("upgrades Kotlin receiver aliases used inside assertions to asserted evidence", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-kotlin-assertion-"));
    fs.mkdirSync(path.join(root, "src", "main", "kotlin", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin", "com", "example"), { recursive: true });
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'dependencies { testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "com", "example", "TokenParser.kt"), "package com.example\nclass TokenParser { fun parse(value: String) = if (value.isBlank()) null else value }\n");
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "com", "example", "TokenParserTest.kt"), "package com.example\nimport kotlin.test.Test\nimport kotlin.test.assertEquals\nclass TokenParserTest { private val parser = TokenParser()\n@Test fun parses() { assertEquals(\"x\", parser.parse(\"x\")) } }\n");

    const audit = auditKotlinRepo(root);

    assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].usage, "asserted");
  });

  it("traces Java call results into later assertions", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-java-assertion-"));
    fs.mkdirSync(path.join(root, "src", "main", "java", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "java", "com", "example"), { recursive: true });
    fs.writeFileSync(path.join(root, "pom.xml"), "<project><dependency><groupId>org.junit.jupiter</groupId></dependency></project>\n");
    fs.writeFileSync(path.join(root, "src", "main", "java", "com", "example", "TokenValidator.java"), "package com.example; class TokenValidator { boolean valid(String value) { return value != null && !value.isBlank(); } }\n");
    fs.writeFileSync(path.join(root, "src", "test", "java", "com", "example", "TokenValidatorTest.java"), "package com.example; class TokenValidatorTest { @Test void validates() { TokenValidator validator = new TokenValidator();\nboolean result = validator.valid(\"x\");\nassertTrue(result); } }\n");

    const audit = auditKotlinRepo(root);

    assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].usage, "asserted");
  });

  it("keeps constructed JVM symbols at called usage when no assertion consumes them", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-java-called-"));
    fs.mkdirSync(path.join(root, "src", "main", "java", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "java", "com", "example"), { recursive: true });
    fs.writeFileSync(path.join(root, "pom.xml"), "<project><dependency><groupId>org.junit.jupiter</groupId></dependency></project>\n");
    fs.writeFileSync(path.join(root, "src", "main", "java", "com", "example", "TokenValidator.java"), "package com.example; class TokenValidator { boolean valid(String value) { return value != null && !value.isBlank(); } }\n");
    fs.writeFileSync(path.join(root, "src", "test", "java", "com", "example", "TokenValidatorTest.java"), "package com.example; class TokenValidatorTest { @Test void validates() { TokenValidator validator = new TokenValidator();\nvalidator.valid(\"x\"); } }\n");

    const audit = auditKotlinRepo(root);

    assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].usage, "called");
  });
});
