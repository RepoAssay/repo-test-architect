import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = [".kt", ".java"];

export function auditKotlinRepo(root, options = {}) {
  const files = readRepoFiles(root);
  const profile = buildProfile(root, files);
  const changedPaths = options.changedPaths ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(root, currentPath))) : undefined;
  const testFiles = files.filter((file) => isTestFile(file.path)).map((file) => normalizePath(file.path));
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];

  for (const file of files.filter((candidate) => isSourceFile(candidate.path) && isIncludedByChangedPaths(candidate.path, changedPaths))) {
    const name = basenameWithoutExtension(file.path);
    const classification = classifySourceFile(file);
    const existingTestPaths = findExistingTests(file.path, testFiles);

    if (classification.skipReason) {
      skipped.push({
        id: file.path,
        name,
        path: file.path,
        kind: classification.kind,
        signals: classification.signals,
        riskReductionScore: classification.riskReductionScore,
        maintenanceCost: classification.maintenanceCost,
        reason: classification.skipReason,
        preferredCoveragePath: classification.preferredCoveragePath
      });
      continue;
    }

    const target = {
      id: file.path,
      name,
      path: file.path,
      kind: classification.kind,
      signals:
        existingTestPaths.length > 0
          ? [...classification.signals, "matching-test"]
          : classification.signals,
      risk: classification.risk,
      testability: classification.testability,
      recommendedTestLevel: classification.testLevel,
      riskReductionScore: classification.riskReductionScore,
      maintenanceCost: classification.maintenanceCost,
      reasons:
        existingTestPaths.length > 0
          ? [...classification.reasons, "Existing test file detected; review missing edge cases"]
          : classification.reasons,
      existingTestPaths
    };

    if (existingTestPaths.length > 0) {
      coveredButRisky.push(target);
    } else {
      untestedCandidates.push(target);
    }

    if (classification.risk === "high") {
      const coverageState = existingTestPaths.length > 0 ? "needs edge-case review" : "has no matching test file";
      risks.push(`${name} has ${classification.reasons.join(", ").toLowerCase()} and ${coverageState}.`);
    }
  }

  const recommended = [...untestedCandidates, ...coveredButRisky].sort(byRiskThenName);

  return {
    schemaVersion: "audit/v1",
    profile,
    untestedCandidates: untestedCandidates.sort(byRiskThenName),
    coveredButRisky: coveredButRisky.sort(byRiskThenName),
    recommended,
    skipped: skipped.sort((a, b) => a.name.localeCompare(b.name)),
    risks
  };
}

function isIncludedByChangedPaths(currentPath, changedPaths) {
  if (!changedPaths) return true;
  return changedPaths.has(normalizePath(currentPath));
}

function readRepoFiles(root) {
  const ignored = new Set([".git", ".gradle", "build", "out", "target"]);
  const files = [];

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;

      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute).replaceAll(path.sep, "/");

      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }

      if (shouldRead(relative)) {
        files.push({
          path: relative,
          content: fs.readFileSync(absolute, "utf8")
        });
      }
    }
  }

  visit(root);
  return files;
}

function shouldRead(relative) {
  return (
    SOURCE_EXTENSIONS.some((extension) => relative.endsWith(extension)) ||
    ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts", "pom.xml", "gradlew", "gradlew.bat"].includes(relative)
  );
}

function buildProfile(root, files) {
  const paths = files.map((file) => normalizePath(file.path));
  const buildText = files
    .filter((file) => ["build.gradle", "build.gradle.kts", "pom.xml"].includes(normalizePath(file.path)))
    .map((file) => file.content)
    .join("\n");
  const testFrameworks = detectTestFrameworks(paths, buildText);
  const testCommand = detectTestCommand(paths, testFrameworks);
  const existingTestLocations = detectExistingTestLocations(paths);
  const blockers = detectBlockers(testCommand, testFrameworks);

  return {
    root,
    languages: detectLanguages(paths),
    packageManagers: detectPackageManagers(paths),
    testFrameworks,
    architectures: ["jvm"],
    testCommand,
    detectedConventions: detectConventions(paths),
    existingTestLocations,
    setupSignals: detectSetupSignals(paths, buildText),
    confidence: scoreProfileConfidence(testFrameworks, existingTestLocations, blockers),
    blockers
  };
}

function detectLanguages(paths) {
  const languages = new Set();
  if (paths.some((item) => item.endsWith(".kt"))) languages.add("kotlin");
  if (paths.some((item) => item.endsWith(".java"))) languages.add("java");
  return [...languages].sort();
}

function detectPackageManagers(paths) {
  const managers = new Set();
  if (paths.some((item) => item.startsWith("build.gradle"))) managers.add("gradle");
  if (paths.includes("pom.xml")) managers.add("maven");
  return [...managers].sort();
}

function detectTestFrameworks(paths, buildText) {
  const frameworks = new Set();
  if (buildText.includes("kotlin(\"test\")") || buildText.includes("kotlin-test")) frameworks.add("kotlin-test");
  if (buildText.includes("useJUnitPlatform") || buildText.includes("junit")) frameworks.add("junit");
  if (paths.some((item) => isTestFile(item))) frameworks.add("junit");
  return [...frameworks].sort();
}

function detectTestCommand(paths, frameworks) {
  if (frameworks.length === 0) return undefined;
  if (paths.includes("gradlew") || paths.includes("gradlew.bat")) return "./gradlew test";
  if (paths.some((item) => item.startsWith("build.gradle"))) return "gradle test";
  if (paths.includes("pom.xml")) return "mvn test";
  return undefined;
}

function detectExistingTestLocations(paths) {
  const locations = new Set();
  if (paths.some((item) => item.startsWith("src/test/"))) locations.add("src/test");
  return [...locations];
}

function detectConventions(paths) {
  const conventions = new Set();
  if (paths.some((item) => /Test\.(kt|java)$/.test(item))) conventions.add("*Test files");
  if (paths.some((item) => item.startsWith("src/test/kotlin/"))) conventions.add("src/test/kotlin");
  if (paths.some((item) => item.startsWith("src/test/java/"))) conventions.add("src/test/java");
  return [...conventions];
}

function detectSetupSignals(paths, buildText) {
  const signals = new Set();
  if (paths.includes("build.gradle.kts")) signals.add("gradle kotlin dsl");
  if (paths.includes("build.gradle")) signals.add("gradle");
  if (paths.includes("settings.gradle.kts") || paths.includes("settings.gradle")) signals.add("gradle settings");
  if (paths.includes("pom.xml")) signals.add("maven");
  if (buildText.includes("useJUnitPlatform")) signals.add("junit platform");
  return [...signals];
}

function detectBlockers(testCommand, frameworks) {
  const blockers = [];
  if (frameworks.length === 0) blockers.push("No supported JVM test framework detected.");
  if (!testCommand) blockers.push("No runnable JVM test command detected from Gradle or Maven markers.");
  return blockers;
}

function scoreProfileConfidence(testFrameworks, existingTestLocations, blockers) {
  if (blockers.length > 1) return "low";
  if (testFrameworks.length > 0 && existingTestLocations.length > 0) return "high";
  if (testFrameworks.length > 0) return "medium";
  return "low";
}

function classifySourceFile(file) {
  const currentPath = normalizePath(file.path);
  const content = file.content;
  const lowerPath = currentPath.toLowerCase();

  if (isDtoLike(lowerPath, content)) {
    return skipped(
      "dto",
      ["dto-only"],
      2,
      4,
      "DTO-only models are usually better covered through boundary parsing or mapper tests.",
      "Cover through parser, mapper, repository, or route integration tests that consume the model."
    );
  }

  if (matchesAny(lowerPath, ["calculator", "parser", "mapper", "validator", "formatter"])) {
    return recommended("pure-logic", ["pure-logic", "edge-case-surface"], "high", "high", "unit", 9, 2, ["Pure transformation logic", "edge-case surface"]);
  }

  if (matchesAny(lowerPath, ["service", "client", "repository"])) {
    return recommended("service", ["service-name"], "medium", "medium", "unit", 6, 4, ["Service boundary"]);
  }

  if (hasBranching(content)) {
    return recommended("utility", ["branching-logic"], "medium", "high", "unit", 5, 2, ["Branching logic"]);
  }

  return skipped("low-value", ["low-runtime-behavior"], 1, 3, "No meaningful runtime behavior detected by current Kotlin heuristics.");
}

function recommended(kind, signals, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons) {
  return { kind, signals, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons };
}

function skipped(kind, signals, riskReductionScore, maintenanceCost, skipReason, preferredCoveragePath) {
  return {
    kind,
    signals,
    risk: "low",
    testability: "low",
    testLevel: "none",
    riskReductionScore,
    maintenanceCost,
    reasons: [],
    skipReason,
    preferredCoveragePath
  };
}

function isSourceFile(currentPath) {
  const normalized = normalizePath(currentPath);
  return normalized.startsWith("src/main/") && SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

function isTestFile(currentPath) {
  const normalized = normalizePath(currentPath);
  return normalized.startsWith("src/test/") && /Test\.(kt|java)$/.test(normalized);
}

function findExistingTests(sourcePath, testPaths) {
  const sourceBase = basenameWithoutExtension(sourcePath);
  return testPaths.filter((testPath) => basenameWithoutExtension(testPath).replace(/Test$/, "") === sourceBase);
}

function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/");
}

function normalizeChangedPath(root, currentPath) {
  if (path.isAbsolute(currentPath)) {
    return normalizePath(path.relative(root, currentPath));
  }

  return normalizePath(currentPath);
}

function basenameWithoutExtension(currentPath) {
  const fileName = normalizePath(currentPath).split("/").at(-1) ?? currentPath;
  return fileName.replace(/\.[^.]+$/, "");
}

function matchesAny(value, fragments) {
  return fragments.some((fragment) => value.includes(fragment));
}

function hasBranching(content) {
  return /\b(if|when|try|catch)\b|\?\s*[^:]+:/.test(content);
}

function isDtoLike(currentPath, content) {
  return (
    /(dto|model|request|response)/i.test(currentPath) &&
    (/^\s*data\s+class\s+/m.test(content) || /^\s*(public\s+)?record\s+/m.test(content))
  );
}

function byRiskThenName(a, b) {
  const order = { high: 0, medium: 1, low: 2 };
  return order[a.risk] - order[b.risk] || a.name.localeCompare(b.name);
}
