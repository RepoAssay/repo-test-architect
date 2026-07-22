import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditKotlinRepo } from "../src/adapters/kotlin/audit.js";

const exampleRoot = path.resolve("examples/kotlin-junit-basic");
const gradleGroovyRoot = path.resolve("examples/kotlin-gradle-groovy-junit");
const mavenRoot = path.resolve("examples/kotlin-maven-junit");
const testNgRoot = path.resolve("examples/kotlin-maven-testng");

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

  it("inherits a parent Gradle wrapper for a conventionally included module", () => {
    const aggregateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-gradle-parent-wrapper-"));
    const root = path.join(aggregateRoot, "libraries", "tokens");
    fs.mkdirSync(path.join(root, "src", "main", "kotlin"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin"), { recursive: true });
    fs.writeFileSync(path.join(aggregateRoot, "settings.gradle.kts"), 'include(":libraries:tokens")\n');
    fs.writeFileSync(path.join(aggregateRoot, "gradlew"), "#!/usr/bin/env sh\n");
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'dependencies { testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "TokenParser.kt"), "class TokenParser { fun parse(value: String) = value.trim() }\n");
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "TokenParserTest.kt"), "class TokenParserTest { @Test fun parses() { TokenParser().parse(\"x\") } }\n");

    const audit = auditKotlinRepo(root);

    assert.equal(audit.profile.testCommand, "../../gradlew :libraries:tokens:test");
    assert.ok(audit.profile.setupSignals.includes("parent gradle wrapper"));
    assert.deepEqual(audit.profile.blockers, []);
  });

  it("does not infer a Gradle task for a custom project-directory remap", () => {
    const aggregateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-gradle-remap-"));
    const root = path.join(aggregateRoot, "modules", "token-core");
    fs.mkdirSync(path.join(root, "src", "main", "kotlin"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin"), { recursive: true });
    fs.writeFileSync(path.join(aggregateRoot, "settings.gradle.kts"), '// include(":modules:token-core")\ninclude(":tokens")\nproject(":tokens").projectDir = file("modules/token-core")\n');
    fs.writeFileSync(path.join(aggregateRoot, "gradlew"), "#!/usr/bin/env sh\n");
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'dependencies { testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "TokenParser.kt"), "class TokenParser { fun parse(value: String) = value.trim() }\n");
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "TokenParserTest.kt"), "class TokenParserTest { @Test fun parses() { TokenParser().parse(\"x\") } }\n");

    const audit = auditKotlinRepo(root);

    assert.equal(audit.profile.testCommand, "gradle test");
    assert.ok(!audit.profile.setupSignals.includes("parent gradle wrapper"));
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

  it("audits the checked-in Maven reactor fixture as one dependency-qualified graph", () => {
    const audit = auditKotlinRepo(path.resolve("examples/kotlin-maven-reactor-junit"));

    assert.equal(audit.profile.testCommand, "./mvnw test");
    assert.equal(audit.profile.confidence, "high");
    assert.ok(audit.profile.setupSignals.includes("maven reactor graph"));
    assert.deepEqual(audit.profile.existingTestLocations, ["token-tests/src/test"]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), [
      "token-core/src/main/java/com/example/token/TokenParser.java"
    ]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestPaths, [
      "token-tests/src/test/java/com/example/token/TokenParserTest.java"
    ]);
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

  it("inherits a parent Maven wrapper for a declared reactor module", () => {
    const aggregateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-maven-parent-wrapper-"));
    const root = path.join(aggregateRoot, "token-core");
    fs.mkdirSync(path.join(root, "src", "main", "java"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "java"), { recursive: true });
    fs.writeFileSync(path.join(aggregateRoot, "pom.xml"), "<project><modules><module>token-core</module></modules></project>\n");
    fs.writeFileSync(path.join(aggregateRoot, "mvnw"), "#!/bin/sh\n");
    fs.writeFileSync(path.join(root, "pom.xml"), "<project><dependency><groupId>org.junit.jupiter</groupId></dependency></project>\n");
    fs.writeFileSync(path.join(root, "src", "main", "java", "TokenParser.java"), "class TokenParser { String parse(String value) { return value == null ? \"\" : value; } }\n");
    fs.writeFileSync(path.join(root, "src", "test", "java", "TokenParserTest.java"), "class TokenParserTest { @Test void parses() { new TokenParser().parse(\"x\"); } }\n");

    const audit = auditKotlinRepo(root);

    assert.equal(audit.profile.testCommand, "../mvnw -f ../pom.xml -pl token-core test");
    assert.ok(audit.profile.setupSignals.includes("parent maven wrapper"));
    assert.deepEqual(audit.profile.blockers, []);
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

  it("blocks unowned aggregate roots even when Kotest is declared", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-gradle-aggregate-"));
    fs.mkdirSync(path.join(root, "library", "src", "main", "kotlin"), { recursive: true });
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'dependencies { testImplementation("io.kotest:kotest-runner-junit5:6.0.0") }\n');
    fs.writeFileSync(path.join(root, "library", "src", "main", "kotlin", "TokenParser.kt"), "class TokenParser { fun parse(value: String) = if (value.isBlank()) null else value }\n");

    const audit = auditKotlinRepo(root);

    assert.equal(audit.profile.confidence, "low");
    assert.ok(audit.profile.blockers.includes("No supported root JVM source set detected; audit a Gradle or Maven module root."));
    assert.ok(audit.profile.blockers.includes("Kotest support requires a Gradle JVM test task using JUnit Platform."));
    assert.deepEqual(audit.recommended, []);
  });

  it("recognizes runnable FunSpec, ShouldSpec, and StringSpec evidence with Kotest assertions", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-kotest-specs-"));
    fs.mkdirSync(path.join(root, "src", "main", "kotlin", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin", "com", "example"), { recursive: true });
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), 'rootProject.name = "kotest-specs"\n');
    fs.writeFileSync(path.join(root, "gradlew"), "#!/usr/bin/env sh\n");
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'plugins { kotlin("jvm") version "2.0.0" }\ndependencies { testImplementation("io.kotest:kotest-runner-junit5:6.0.0") }\ntasks.test { useJUnitPlatform() }\n');
    for (const name of ["TokenParser", "TokenValidator", "TokenFormatter"]) {
      fs.writeFileSync(path.join(root, "src", "main", "kotlin", "com", "example", `${name}.kt`), `package com.example\nclass ${name} { fun run(value: String) = value.trim() }\n`);
    }
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "com", "example", "ParserSpec.kt"), 'package com.example\nimport io.kotest.core.spec.style.FunSpec\nimport io.kotest.matchers.shouldBe\nclass ParserSpec : FunSpec({ test("parses") { val parser = TokenParser(); val result = parser.run("x"); result shouldBe "x" } })\n');
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "com", "example", "ValidatorSpec.kt"), 'package com.example\nimport io.kotest.core.spec.style.ShouldSpec\nimport io.kotest.assertions.throwables.shouldNotThrowAny\nclass ValidatorSpec : ShouldSpec({ should("validate") { shouldNotThrowAny { TokenValidator().run("x") } } })\n');
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "com", "example", "FormatterSpec.kt"), 'package com.example\nimport io.kotest.core.spec.style.StringSpec\nimport io.kotest.matchers.shouldBe\nclass FormatterSpec :\n    StringSpec({ "formats" { TokenFormatter().run(" x ") shouldBe "x" } })\n');

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.profile.testFrameworks, ["junit", "kotest"]);
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.setupSignals.includes("kotest"));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.name), ["TokenFormatter", "TokenParser", "TokenValidator"]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.existingTestEvidence[0].usage), ["asserted", "asserted", "asserted"]);
  });

  it("keeps unsupported Kotest styles and lifecycle semantics explicit", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-kotest-boundary-"));
    fs.mkdirSync(path.join(root, "src", "main", "kotlin", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin", "com", "example"), { recursive: true });
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), 'rootProject.name = "kotest-boundary"\n');
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'plugins { kotlin("jvm") version "2.0.0" }\ndependencies { testImplementation("io.kotest:kotest-runner-junit5:6.0.0") }\ntasks.test { useJUnitPlatform() }\n');
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "com", "example", "TokenParser.kt"), "package com.example\nclass TokenParser { fun parse(value: String) = value.trim() }\n");
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "com", "example", "ParserSpec.kt"), 'package com.example\nimport io.kotest.core.spec.style.BehaviorSpec\nimport io.kotest.datatest.withData\nclass ParserSpec : BehaviorSpec({ beforeTest { } given("token") { Then("parse") { withData("x") { TokenParser().parse(it) } } } })\n');

    const audit = auditKotlinRepo(root);

    assert.ok(audit.profile.blockers.includes("Unsupported Kotest spec styles detected: BehaviorSpec."));
    assert.ok(audit.profile.blockers.includes("Kotest lifecycle hooks, extensions, and isolation configuration are outside the supported evidence boundary."));
    assert.ok(audit.profile.blockers.includes("Kotest data-driven and property tests are outside the supported evidence boundary."));
    assert.deepEqual(audit.untestedCandidates.map((target) => target.name), ["TokenParser"]);
    assert.deepEqual(audit.coveredButRisky, []);
  });

  it("does not accept Kotest dependencies without Gradle JUnit Platform execution", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-kotest-execution-"));
    fs.mkdirSync(path.join(root, "src", "main", "kotlin"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin"), { recursive: true });
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'plugins { kotlin("jvm") version "2.0.0" }\ndependencies { testImplementation("io.kotest:kotest-runner-junit5:6.0.0") }\n');
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "TokenParser.kt"), "class TokenParser { fun parse(value: String) = value.trim() }\n");
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "ParserSpec.kt"), 'import io.kotest.core.spec.style.FunSpec\nclass ParserSpec : FunSpec({ test("parse") { TokenParser().parse("x") } })\n');

    const audit = auditKotlinRepo(root);

    assert.ok(!audit.profile.testFrameworks.includes("kotest"));
    assert.ok(audit.profile.blockers.includes("Kotest support requires a Gradle JVM test task using JUnit Platform."));
    assert.deepEqual(audit.untestedCandidates.map((target) => target.name), ["TokenParser"]);
  });

  it("audits method-level Maven TestNG tests with asserted provenance", () => {
    const audit = auditKotlinRepo(testNgRoot);

    assert.deepEqual(audit.profile.testFrameworks, ["testng"]);
    assert.equal(audit.profile.testCommand, "mvn test");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.setupSignals.includes("testng"));
    assert.deepEqual(audit.untestedCandidates.map((target) => target.name), ["TokenFormatter"]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.name), ["TokenParser"]);
    assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].usage, "asserted");
  });

  it("audits method-level Gradle TestNG tests only with useTestNG execution", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-gradle-testng-"));
    fs.mkdirSync(path.join(root, "src", "main", "kotlin", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin", "com", "example"), { recursive: true });
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), 'rootProject.name = "testng"\n');
    fs.writeFileSync(path.join(root, "gradlew"), "#!/usr/bin/env sh\n");
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'plugins { kotlin("jvm") version "2.0.0" }\ndependencies { testImplementation("org.testng:testng:7.11.0") }\ntasks.test { useTestNG() }\n');
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "com", "example", "TokenParser.kt"), "package com.example\nclass TokenParser { fun parse(value: String) = value.trim() }\n");
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "com", "example", "TokenParserTest.kt"), 'package com.example\nimport org.testng.Assert.assertEquals\nimport org.testng.annotations.Test\nclass TokenParserTest { @Test fun parses() { val result = TokenParser().parse(" x "); assertEquals(result, "x") } }\n');

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.profile.testFrameworks, ["testng"]);
    assert.equal(audit.profile.testCommand, "./gradlew test");
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.name), ["TokenParser"]);
  });

  it("keeps advanced TestNG annotations out of evidence", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-testng-boundary-"));
    fs.mkdirSync(path.join(root, "src", "main", "java", "com", "example"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "java", "com", "example"), { recursive: true });
    fs.writeFileSync(path.join(root, "pom.xml"), '<project><modelVersion>4.0.0</modelVersion><groupId>com.example</groupId><artifactId>boundary</artifactId><version>1</version><dependencies><dependency><groupId>org.testng</groupId><artifactId>testng</artifactId><version>7.11.0</version><scope>test</scope></dependency></dependencies></project>\n');
    for (const name of ["TokenFormatter", "TokenParser"]) {
      fs.writeFileSync(path.join(root, "src", "main", "java", "com", "example", `${name}.java`), `package com.example; public class ${name} { public String run(String value) { return value.trim(); } }\n`);
    }
    fs.writeFileSync(path.join(root, "src", "test", "java", "com", "example", "ParserDataTest.java"), 'package com.example; import org.testng.annotations.DataProvider; import org.testng.annotations.Test; class ParserDataTest { @DataProvider Object[][] tokens() { return new Object[][] {{"x"}}; } @Test(dataProvider = "tokens") void parses(String value) { new TokenParser().run(value); } }\n');
    fs.writeFileSync(path.join(root, "src", "test", "java", "com", "example", "FormatterClassTest.java"), 'package com.example; import org.testng.annotations.Test; @Test public class FormatterClassTest { public void formats() { new TokenFormatter().run("x"); } }\n');

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.profile.testFrameworks, ["testng"]);
    assert.ok(audit.profile.blockers.includes("TestNG class-level tests, lifecycle hooks, generated or parameterized tests, listeners, and dependency or group semantics are outside the supported evidence boundary."));
    assert.deepEqual(audit.untestedCandidates.map((target) => target.name), ["TokenFormatter", "TokenParser"]);
    assert.deepEqual(audit.coveredButRisky, []);
  });

  it("blocks TestNG without conventional execution and with custom selection", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-testng-execution-"));
    fs.mkdirSync(path.join(root, "src", "main", "kotlin"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "test", "kotlin"), { recursive: true });
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), 'rootProject.name = "testng-execution"\n');
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'plugins { kotlin("jvm") version "2.0.0" }\ndependencies { testImplementation("org.testng:testng:7.11.0") }\ntasks.test { useTestNG { includeGroups("fast") } }\n');
    fs.writeFileSync(path.join(root, "src", "main", "kotlin", "TokenParser.kt"), "class TokenParser { fun parse(value: String) = value.trim() }\n");
    fs.writeFileSync(path.join(root, "src", "test", "kotlin", "TokenParserTest.kt"), 'import org.testng.annotations.Test\nclass TokenParserTest { @Test fun parses() { TokenParser().parse("x") } }\n');

    const audit = auditKotlinRepo(root);

    assert.ok(!audit.profile.testFrameworks.includes("testng"));
    assert.ok(audit.profile.blockers.includes("TestNG support requires a direct Maven dependency or a Gradle JVM test task using useTestNG()."));
    assert.ok(audit.profile.blockers.includes("TestNG suite XML, group filters, and parallel or custom execution configuration are outside the supported execution boundary."));
    assert.deepEqual(audit.untestedCandidates.map((target) => target.name), ["TokenParser"]);
  });

  it("audits conventionally declared Gradle modules with dependency-qualified test evidence", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-gradle-module-graph-"));
    for (const moduleName of ["token-core", "token-tests", "unrelated-tests"]) {
      fs.mkdirSync(path.join(root, moduleName), { recursive: true });
    }
    fs.mkdirSync(path.join(root, "token-core", "src", "main", "kotlin", "com", "example", "token"), { recursive: true });
    fs.mkdirSync(path.join(root, "token-tests", "src", "test", "kotlin", "com", "example", "tests"), { recursive: true });
    fs.mkdirSync(path.join(root, "unrelated-tests", "src", "test", "kotlin", "com", "example", "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), 'include(":token-core", ":token-tests", ":unrelated-tests")\n');
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'plugins { kotlin("jvm") version "2.0.0" apply false }\n');
    fs.writeFileSync(path.join(root, "gradlew"), "#!/usr/bin/env sh\n");
    fs.writeFileSync(path.join(root, "token-core", "build.gradle.kts"), 'plugins { kotlin("jvm") }\n');
    fs.writeFileSync(path.join(root, "token-tests", "build.gradle.kts"), 'plugins { kotlin("jvm") }\ndependencies { testImplementation(project(":token-core")); testImplementation(kotlin("test")) }\ntasks.test { useJUnitPlatform() }\n');
    fs.writeFileSync(path.join(root, "unrelated-tests", "build.gradle.kts"), 'plugins { kotlin("jvm") }\ndependencies { testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "token-core", "src", "main", "kotlin", "com", "example", "token", "TokenParser.kt"), "package com.example.token\nclass TokenParser { fun parse(value: String) = if (value.isBlank()) null else value }\n");
    const testContent = "package com.example.tests\nimport com.example.token.TokenParser\nimport kotlin.test.Test\nclass ParsingTest { @Test fun parses() { TokenParser().parse(\"x\") } }\n";
    fs.writeFileSync(path.join(root, "token-tests", "src", "test", "kotlin", "com", "example", "tests", "ParsingTest.kt"), testContent);
    fs.writeFileSync(path.join(root, "unrelated-tests", "src", "test", "kotlin", "com", "example", "tests", "PretendCoverageTest.kt"), testContent);

    const audit = auditKotlinRepo(root);

    assert.equal(audit.profile.testCommand, "./gradlew test");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.setupSignals.includes("gradle module graph"));
    assert.deepEqual(audit.profile.existingTestLocations, ["token-tests/src/test", "unrelated-tests/src/test"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestPaths, ["token-tests/src/test/kotlin/com/example/tests/ParsingTest.kt"]);
  });

  it("follows only exported Gradle dependencies beyond the direct test-module edge", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-gradle-transitive-"));
    const modules = ["token-core", "exported-bridge", "private-bridge", "excluded-top", "cycle-a", "cycle-b", "exported-tests", "private-tests", "excluded-tests", "cycle-tests"];
    for (const moduleName of modules) fs.mkdirSync(path.join(root, moduleName), { recursive: true });
    fs.mkdirSync(path.join(root, "token-core", "src", "main", "kotlin", "com", "example", "token"), { recursive: true });
    for (const moduleName of ["exported-tests", "private-tests", "excluded-tests", "cycle-tests"]) {
      fs.mkdirSync(path.join(root, moduleName, "src", "test", "kotlin", "com", "example", "tests"), { recursive: true });
    }
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), `include(${modules.map((name) => `":${name}"`).join(", ")})\n`);
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'plugins { kotlin("jvm") version "2.0.0" apply false }\n');
    fs.writeFileSync(path.join(root, "gradlew"), "#!/usr/bin/env sh\n");
    fs.writeFileSync(path.join(root, "token-core", "build.gradle.kts"), 'plugins { kotlin("jvm") }\n');
    fs.writeFileSync(path.join(root, "exported-bridge", "build.gradle.kts"), 'plugins { `java-library` }\ndependencies { api(project(":token-core")) }\n');
    fs.writeFileSync(path.join(root, "private-bridge", "build.gradle.kts"), 'plugins { kotlin("jvm") }\ndependencies { implementation(project(":token-core")); constraints { api(project(":token-core")) }; /* api(project(":token-core")) */ }\n// api(project(":token-core"))\n');
    fs.writeFileSync(path.join(root, "excluded-top", "build.gradle.kts"), 'plugins { `java-library` }\ndependencies { api(project(":exported-bridge")) { exclude(group = "com.example", module = "token-core") } }\n');
    fs.writeFileSync(path.join(root, "cycle-a", "build.gradle.kts"), 'plugins { `java-library` }\ndependencies { api(project(":cycle-b")) }\n');
    fs.writeFileSync(path.join(root, "cycle-b", "build.gradle.kts"), 'plugins { `java-library` }\ndependencies { api(project(":cycle-a")) }\n');
    fs.writeFileSync(path.join(root, "exported-tests", "build.gradle.kts"), 'plugins { kotlin("jvm") }\ndependencies { testImplementation(project(":exported-bridge")); testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "private-tests", "build.gradle.kts"), 'plugins { kotlin("jvm") }\ndependencies { testImplementation(project(":private-bridge")); testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "excluded-tests", "build.gradle.kts"), 'plugins { kotlin("jvm") }\ndependencies { testImplementation(project(":excluded-top")); testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "cycle-tests", "build.gradle.kts"), 'plugins { kotlin("jvm") }\ndependencies { testImplementation(project(":cycle-a")); testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "token-core", "src", "main", "kotlin", "com", "example", "token", "TokenParser.kt"), "package com.example.token\nclass TokenParser { fun parse(value: String) = value.trim() }\n");
    const testContent = "package com.example.tests\nimport com.example.token.TokenParser\nimport kotlin.test.Test\nclass ParsingTest { @Test fun parses() { TokenParser().parse(\"x\") } }\n";
    fs.writeFileSync(path.join(root, "exported-tests", "src", "test", "kotlin", "com", "example", "tests", "ParsingTest.kt"), testContent);
    fs.writeFileSync(path.join(root, "private-tests", "src", "test", "kotlin", "com", "example", "tests", "PretendCoverageTest.kt"), testContent);
    fs.writeFileSync(path.join(root, "excluded-tests", "src", "test", "kotlin", "com", "example", "tests", "PretendExcludedCoverageTest.kt"), testContent);
    fs.writeFileSync(path.join(root, "cycle-tests", "src", "test", "kotlin", "com", "example", "tests", "PretendCyclicCoverageTest.kt"), testContent);

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.coveredButRisky[0].existingTestPaths, ["exported-tests/src/test/kotlin/com/example/tests/ParsingTest.kt"]);
  });

  it("audits conventional Maven reactor modules with dependency-qualified test evidence", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-maven-reactor-"));
    for (const moduleName of ["token-core", "token-tests", "unrelated-tests", "profile-only"]) {
      fs.mkdirSync(path.join(root, moduleName), { recursive: true });
    }
    fs.mkdirSync(path.join(root, "token-core", "src", "main", "java", "com", "example", "token"), { recursive: true });
    fs.mkdirSync(path.join(root, "token-tests", "src", "test", "java", "com", "example", "tests"), { recursive: true });
    fs.mkdirSync(path.join(root, "unrelated-tests", "src", "test", "java", "com", "example", "tests"), { recursive: true });
    fs.mkdirSync(path.join(root, "profile-only", "src", "main", "java"), { recursive: true });
    fs.writeFileSync(path.join(root, "pom.xml"), '<project><groupId>com.example</groupId><artifactId>tokens</artifactId><version>1</version><packaging>pom</packaging><modules><module>token-core</module><module>token-tests</module><module>unrelated-tests</module></modules><profiles><profile><modules><module>profile-only</module></modules></profile></profiles><build><plugins><plugin><configuration><modules><module>profile-only</module></modules></configuration></plugin></plugins></build></project>\n');
    fs.writeFileSync(path.join(root, "mvnw"), "#!/bin/sh\n");
    const childPrefix = '<project><parent><groupId>com.example</groupId><artifactId>tokens</artifactId><version>1</version></parent>';
    fs.writeFileSync(path.join(root, "token-core", "pom.xml"), `${childPrefix}<artifactId>token-core</artifactId></project>\n`);
    fs.writeFileSync(path.join(root, "token-tests", "pom.xml"), `${childPrefix}<artifactId>token-tests</artifactId><dependencies><dependency><groupId>${"${project.groupId}"}</groupId><artifactId>token-core</artifactId><scope>test</scope></dependency><dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><scope>test</scope></dependency></dependencies></project>\n`);
    fs.writeFileSync(path.join(root, "unrelated-tests", "pom.xml"), `${childPrefix}<artifactId>unrelated-tests</artifactId><dependencies><dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><scope>test</scope></dependency></dependencies></project>\n`);
    fs.writeFileSync(path.join(root, "profile-only", "pom.xml"), `${childPrefix}<artifactId>profile-only</artifactId></project>\n`);
    fs.writeFileSync(path.join(root, "token-core", "src", "main", "java", "com", "example", "token", "TokenParser.java"), "package com.example.token; public class TokenParser { public String parse(String value) { return value == null ? \"\" : value.trim(); } }\n");
    const testContent = "package com.example.tests; import com.example.token.TokenParser; class ParsingTest { @Test void parses() { new TokenParser().parse(\"x\"); } }\n";
    fs.writeFileSync(path.join(root, "token-tests", "src", "test", "java", "com", "example", "tests", "ParsingTest.java"), testContent);
    fs.writeFileSync(path.join(root, "unrelated-tests", "src", "test", "java", "com", "example", "tests", "PretendCoverageTest.java"), testContent);
    fs.writeFileSync(path.join(root, "profile-only", "src", "main", "java", "ProfileParser.java"), "class ProfileParser { String parse(String value) { return value.trim(); } }\n");

    const audit = auditKotlinRepo(root);

    assert.equal(audit.profile.testCommand, "./mvnw test");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.profile.setupSignals.includes("maven reactor graph"));
    assert.deepEqual(audit.profile.existingTestLocations, ["token-tests/src/test", "unrelated-tests/src/test"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestPaths, ["token-tests/src/test/java/com/example/tests/ParsingTest.java"]);
    assert.ok(!audit.recommended.some((target) => target.path.includes("profile-only")));
  });

  it("follows only exported Maven dependencies beyond the direct test-module edge", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-maven-transitive-"));
    const modules = ["token-core", "exported-bridge", "provided-bridge", "optional-bridge", "excluded-top", "exported-tests", "provided-tests", "optional-tests", "excluded-tests"];
    for (const moduleName of modules) fs.mkdirSync(path.join(root, moduleName), { recursive: true });
    fs.mkdirSync(path.join(root, "token-core", "src", "main", "java", "com", "example", "token"), { recursive: true });
    for (const moduleName of ["exported-tests", "provided-tests", "optional-tests", "excluded-tests"]) {
      fs.mkdirSync(path.join(root, moduleName, "src", "test", "java", "com", "example", "tests"), { recursive: true });
    }
    fs.writeFileSync(path.join(root, "pom.xml"), `<project><groupId>com.example</groupId><artifactId>tokens</artifactId><version>1</version><packaging>pom</packaging><modules>${modules.map((name) => `<module>${name}</module>`).join("")}</modules></project>\n`);
    fs.writeFileSync(path.join(root, "mvnw"), "#!/bin/sh\n");
    const childPrefix = '<project><parent><groupId>com.example</groupId><artifactId>tokens</artifactId><version>1</version></parent>';
    const dependency = (artifactId, extra = "") => `<dependencies><dependency><groupId>${"${project.groupId}"}</groupId><artifactId>${artifactId}</artifactId>${extra}</dependency></dependencies>`;
    fs.writeFileSync(path.join(root, "token-core", "pom.xml"), `${childPrefix}<artifactId>token-core</artifactId></project>\n`);
    fs.writeFileSync(path.join(root, "exported-bridge", "pom.xml"), `${childPrefix}<artifactId>exported-bridge</artifactId>${dependency("token-core")}</project>\n`);
    fs.writeFileSync(path.join(root, "provided-bridge", "pom.xml"), `${childPrefix}<artifactId>provided-bridge</artifactId>${dependency("token-core", "<scope>provided</scope>")}</project>\n`);
    fs.writeFileSync(path.join(root, "optional-bridge", "pom.xml"), `${childPrefix}<artifactId>optional-bridge</artifactId>${dependency("token-core", '<optional>${core.optional}</optional>')}</project>\n`);
    fs.writeFileSync(path.join(root, "excluded-top", "pom.xml"), `${childPrefix}<artifactId>excluded-top</artifactId>${dependency("exported-bridge", "<exclusions><exclusion><groupId>com.example</groupId><artifactId>token-core</artifactId></exclusion></exclusions>")}</project>\n`);
    for (const prefix of ["exported", "provided", "optional"]) {
      fs.writeFileSync(path.join(root, `${prefix}-tests`, "pom.xml"), `${childPrefix}<artifactId>${prefix}-tests</artifactId>${dependency(`${prefix}-bridge`, "<scope>test</scope>")}</project>\n`);
    }
    fs.writeFileSync(path.join(root, "excluded-tests", "pom.xml"), `${childPrefix}<artifactId>excluded-tests</artifactId>${dependency("excluded-top", "<scope>test</scope>")}</project>\n`);
    fs.writeFileSync(path.join(root, "token-core", "src", "main", "java", "com", "example", "token", "TokenParser.java"), "package com.example.token; public class TokenParser { public String parse(String value) { return value.trim(); } }\n");
    const testContent = "package com.example.tests; import com.example.token.TokenParser; import org.junit.jupiter.api.Test; class ParsingTest { @Test void parses() { new TokenParser().parse(\"x\"); } }\n";
    fs.writeFileSync(path.join(root, "exported-tests", "src", "test", "java", "com", "example", "tests", "ParsingTest.java"), testContent);
    fs.writeFileSync(path.join(root, "provided-tests", "src", "test", "java", "com", "example", "tests", "PretendProvidedCoverageTest.java"), testContent);
    fs.writeFileSync(path.join(root, "optional-tests", "src", "test", "java", "com", "example", "tests", "PretendOptionalCoverageTest.java"), testContent);
    fs.writeFileSync(path.join(root, "excluded-tests", "src", "test", "java", "com", "example", "tests", "PretendExcludedCoverageTest.java"), testContent);

    const audit = auditKotlinRepo(root);

    assert.deepEqual(audit.coveredButRisky[0].existingTestPaths, ["exported-tests/src/test/java/com/example/tests/ParsingTest.java"]);
  });

  it("keeps custom Gradle project-directory remaps outside aggregate ownership", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-gradle-aggregate-remap-"));
    fs.mkdirSync(path.join(root, "modules", "token-core", "src", "main", "kotlin"), { recursive: true });
    fs.mkdirSync(path.join(root, "modules", "token-core", "src", "test", "kotlin"), { recursive: true });
    fs.mkdirSync(path.join(root, "tokens", "src", "main", "kotlin"), { recursive: true });
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), 'include(":tokens")\nproject(":tokens").projectDir = file("modules/token-core")\n');
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'plugins { kotlin("jvm") version "2.0.0" apply false }\ndependencies { testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "modules", "token-core", "build.gradle.kts"), 'plugins { kotlin("jvm") }\n');
    fs.writeFileSync(path.join(root, "tokens", "build.gradle.kts"), 'plugins { kotlin("jvm") }\n');
    fs.writeFileSync(path.join(root, "modules", "token-core", "src", "main", "kotlin", "TokenParser.kt"), "class TokenParser { fun parse(value: String) = value.trim() }\n");
    fs.writeFileSync(path.join(root, "modules", "token-core", "src", "test", "kotlin", "TokenParserTest.kt"), "class TokenParserTest { @Test fun parses() { TokenParser().parse(\"x\") } }\n");
    fs.writeFileSync(path.join(root, "tokens", "src", "main", "kotlin", "CoincidentalParser.kt"), "class CoincidentalParser { fun parse(value: String) = value.trim() }\n");

    const audit = auditKotlinRepo(root);

    assert.equal(audit.profile.confidence, "low");
    assert.ok(audit.profile.blockers.includes("No supported root JVM source set detected; audit a Gradle or Maven module root."));
    assert.deepEqual(audit.recommended, []);
    assert.ok(!audit.profile.setupSignals.includes("gradle module graph"));
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

  it("marks Kotlin Multiplatform modules outside the supported JVM module boundary", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-multiplatform-"));
    fs.mkdirSync(path.join(root, "jvm-tools", "src", "main", "kotlin"), { recursive: true });
    fs.mkdirSync(path.join(root, "jvm-tools", "src", "test", "kotlin"), { recursive: true });
    fs.mkdirSync(path.join(root, "library", "src", "commonMain", "kotlin"), { recursive: true });
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), 'include(":jvm-tools", ":library")\n');
    fs.writeFileSync(path.join(root, "build.gradle.kts"), 'plugins { kotlin("multiplatform") version "2.0.0" apply false }\n');
    fs.writeFileSync(path.join(root, "jvm-tools", "build.gradle.kts"), 'plugins { kotlin("jvm") }\ndependencies { testImplementation(kotlin("test")) }\n');
    fs.writeFileSync(path.join(root, "library", "build.gradle.kts"), 'plugins { kotlin("multiplatform") }\n');
    fs.writeFileSync(path.join(root, "jvm-tools", "src", "main", "kotlin", "TokenParser.kt"), "class TokenParser { fun parse(value: String) = value.trim() }\n");
    fs.writeFileSync(path.join(root, "jvm-tools", "src", "test", "kotlin", "TokenParserTest.kt"), "class TokenParserTest { @Test fun parses() { TokenParser().parse(\"x\") } }\n");
    fs.writeFileSync(path.join(root, "library", "src", "commonMain", "kotlin", "CommonToken.kt"), "class CommonToken\n");

    const audit = auditKotlinRepo(root);

    assert.equal(audit.profile.confidence, "medium");
    assert.ok(audit.profile.blockers.includes("Kotlin Multiplatform modules and target-specific source sets are outside the supported JVM module boundary."));
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["jvm-tools/src/main/kotlin/TokenParser.kt"]);
    assert.ok(!audit.recommended.some((target) => target.path.includes("commonMain")));
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
