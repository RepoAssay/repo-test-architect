import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = [".swift", ".m", ".mm"];

export function auditSwiftRepo(root, options = {}) {
  const files = readRepoFiles(root);
  const profile = buildProfile(root, files);
  const changedPaths = options.changedPaths ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(root, currentPath))) : undefined;
  const testFiles = files.filter((file) => isTestFile(file.path)).map((file) => ({ ...file, path: normalizePath(file.path) }));
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];

  for (const file of files.filter((candidate) => isSourceFile(candidate.path) && isIncludedByChangedPaths(candidate.path, changedPaths))) {
    const name = basenameWithoutExtension(file.path);
    const classification = classifySourceFile(file);
    const existingTestEvidence = findExistingTestEvidence(file.path, testFiles);
    const existingTestPaths = existingTestEvidence.map((evidence) => evidence.testPath);

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
      existingTestPaths,
      ...(existingTestEvidence.length > 0 ? { existingTestEvidence } : {})
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

function readRepoFiles(root) {
  const ignored = new Set([".build", ".git", ".swiftpm", "DerivedData", "build"]);
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
    relative === "Package.swift" ||
    relative.endsWith(".xcodeproj/project.pbxproj") ||
    relative.endsWith(".xcscheme") ||
    relative.endsWith(".xctestplan")
  );
}

function buildProfile(root, files) {
  const paths = files.map((file) => normalizePath(file.path));
  const packageText = files.find((file) => normalizePath(file.path) === "Package.swift")?.content ?? "";
  const testFrameworks = detectTestFrameworks(files, packageText);
  const testCommand = detectTestCommand(paths, testFrameworks);
  const existingTestLocations = detectExistingTestLocations(paths);
  const blockers = detectBlockers(testCommand, testFrameworks);

  return {
    root,
    languages: detectLanguages(paths),
    packageManagers: detectPackageManagers(paths),
    testFrameworks,
    architectures: detectArchitectures(paths, files),
    testCommand,
    detectedConventions: detectConventions(paths),
    existingTestLocations,
    setupSignals: detectSetupSignals(paths, packageText),
    confidence: scoreProfileConfidence(testFrameworks, existingTestLocations, blockers),
    blockers
  };
}

function detectLanguages(paths) {
  const languages = new Set();
  if (paths.some((item) => item.endsWith(".swift"))) languages.add("swift");
  if (paths.some((item) => item.endsWith(".m") || item.endsWith(".mm"))) languages.add("objective-c");
  return [...languages].sort();
}

function detectPackageManagers(paths) {
  const managers = new Set();
  if (paths.includes("Package.swift")) managers.add("swiftpm");
  if (paths.some((item) => item.endsWith(".xcodeproj/project.pbxproj"))) managers.add("xcodebuild");
  return [...managers].sort();
}

function detectTestFrameworks(files, packageText) {
  const frameworks = new Set();
  const testText = packageText.toLowerCase();
  const sourceText = files.map((file) => file.content).join("\n");

  if (/^\s*import\s+XCTest\b/m.test(sourceText) || /^\s*#import\s+[<"]XCTest\/XCTest\.h[>"]/m.test(sourceText)) {
    frameworks.add("XCTest");
  }

  if (/^\s*import\s+XCTVapor\b/m.test(sourceText) || packageText.includes(".product(name: \"XCTVapor\"")) {
    frameworks.add("XCTVapor");
  }

  if (/^\s*import\s+Testing\b/m.test(sourceText)) {
    frameworks.add("Swift Testing");
  }

  if (testText.includes("swift-testing") || testText.includes("package(url: \"https://github.com/apple/swift-testing")) {
    frameworks.add("Swift Testing");
  }

  if (/^\s*import\s+Quick\b/m.test(sourceText) || /quick\.git|Quick\/Quick|product\(name:\s*"Quick"/i.test(packageText)) {
    frameworks.add("Quick");
  }

  if (/^\s*import\s+Nimble\b/m.test(sourceText) || /nimble\.git|Quick\/Nimble|product\(name:\s*"Nimble"/i.test(packageText)) {
    frameworks.add("Nimble");
  }

  if (/^\s*import\s+SnapshotTesting\b/m.test(sourceText) || /swift-snapshot-testing|pointfreeco\/swift-snapshot-testing|product\(name:\s*"SnapshotTesting"/i.test(packageText)) {
    frameworks.add("SnapshotTesting");
  }

  return [...frameworks].sort();
}

function detectTestCommand(paths, frameworks) {
  if (frameworks.length === 0) return undefined;
  if (paths.includes("Package.swift")) return "swift test";
  if (paths.some((item) => item.endsWith(".xcodeproj/project.pbxproj"))) {
    const scheme = detectXcodeScheme(paths);
    const testPlan = detectXcodeTestPlan(paths);
    if (scheme && testPlan) return `xcodebuild test -scheme ${quoteShellArgument(scheme)} -testPlan ${quoteShellArgument(testPlan)}`;
    return scheme ? `xcodebuild test -scheme ${quoteShellArgument(scheme)}` : "xcodebuild test";
  }
  return undefined;
}

function detectExistingTestLocations(paths) {
  const locations = new Set();
  if (paths.some((item) => item.startsWith("Tests/"))) locations.add("Tests");
  for (const currentPath of paths) {
    const testDirectory = firstTestDirectory(currentPath);
    if (testDirectory) locations.add(testDirectory);
  }
  return [...locations];
}

function detectConventions(paths) {
  const conventions = new Set();
  if (paths.some((item) => /Tests?\.swift$/.test(item))) conventions.add("*Tests.swift files");
  if (paths.some((item) => item.startsWith("Tests/"))) conventions.add("Tests");
  if (paths.some((item) => firstTestDirectory(item)?.endsWith("UITests"))) conventions.add("*UITests folders");
  return [...conventions];
}

function detectSetupSignals(paths, packageText) {
  const signals = new Set();
  if (paths.includes("Package.swift")) signals.add("swift package manager");
  if (paths.some((item) => item.endsWith(".xcodeproj/project.pbxproj"))) signals.add("xcode project");
  if (detectXcodeScheme(paths)) signals.add("xcode shared scheme");
  if (detectXcodeTestPlan(paths)) signals.add("xcode test plan");
  if (packageText.includes("Vapor") || packageText.includes("vapor.git")) signals.add("vapor dependency");
  if (/MongoKitten|FluentMongoDriver|MongoSwift|mongodb|mongo-driver/i.test(packageText)) signals.add("mongodb dependency");
  if (packageText.includes(".product(name: \"XCTVapor\"")) signals.add("xctvapor test support");
  if (/quick\.git|Quick\/Quick|product\(name:\s*"Quick"/i.test(packageText)) signals.add("quick test support");
  if (/nimble\.git|Quick\/Nimble|product\(name:\s*"Nimble"/i.test(packageText)) signals.add("nimble assertion support");
  if (/swift-snapshot-testing|pointfreeco\/swift-snapshot-testing|product\(name:\s*"SnapshotTesting"/i.test(packageText)) signals.add("snapshot testing support");
  if (packageText.includes(".testTarget")) signals.add("swiftpm test target");
  if (packageText.includes(".executableTarget")) signals.add("swiftpm executable target");
  if (packageText.includes(".target")) signals.add("swiftpm target");
  return [...signals];
}

function detectArchitectures(paths, files) {
  const architectures = new Set();
  if (paths.includes("Package.swift")) architectures.add("swift-package");
  if (paths.some((item) => item.endsWith(".xcodeproj/project.pbxproj"))) architectures.add("apple-xcode");
  if (files.some((file) => file.content.includes("import SwiftUI") || /\bView\b/.test(file.content))) architectures.add("swiftui");
  if (files.some((file) => file.content.includes("Vapor"))) architectures.add("vapor");
  if (files.some((file) => isMongoDataAccess(file.content))) architectures.add("mongodb");
  if (files.some((file) => /\bactor\s+\w+/.test(file.content))) architectures.add("concurrency");
  return [...architectures].sort();
}

function detectBlockers(testCommand, frameworks) {
  const blockers = [];
  if (frameworks.length === 0) blockers.push("No supported Swift test framework detected.");
  if (!testCommand) blockers.push("No runnable Swift test command detected from Package.swift or Xcode project markers.");
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
  const mongoSignals = detectMongoSignals(content);

  if (!currentPath.endsWith(".swift")) {
    return skipped(
      "objective-c-source",
      ["objective-c-source"],
      1,
      4,
      "Objective-C source is visible to the Swift adapter but needs dedicated heuristics before direct test recommendations.",
      "Cover through Swift-facing package, service, or integration tests until Objective-C-specific classification is added."
    );
  }

  if (isSwiftUIView(content)) {
    return skipped(
      "ui-view",
      ["swiftui-view"],
      2,
      5,
      "SwiftUI views should only get direct tests when the repo already has UI or snapshot conventions.",
      "Cover through view model, reducer, service, or UI/snapshot tests when a convention exists."
    );
  }

  if (isFluentPersistenceModel(content)) {
    return skipped(
      "persistence-model",
      ["fluent-model"],
      3,
      5,
      "Fluent persistence models are usually better covered through repository, route, migration, or integration tests.",
      "Cover through XCTVapor or repository tests that exercise persistence behavior and schema migrations."
    );
  }

  if (isDtoLike(lowerPath, content)) {
    return skipped(
      "dto",
      ["dto-only"],
      2,
      4,
      "DTO-only models are usually better covered through decoding, mapper, or boundary tests.",
      "Cover through parser, mapper, networking, repository, or route integration tests that consume the model."
    );
  }

  if (isVaporLifecycleFile(lowerPath, content)) {
    return skipped(
      "vapor-lifecycle",
      ["vapor-lifecycle"],
      1,
      3,
      "Vapor bootstrap and route registration files should be covered through endpoint or application integration tests.",
      "Cover through XCTVapor request tests that exercise registered routes and application configuration."
    );
  }

  if (isVaporMiddleware(lowerPath, content)) {
    return recommended(
      "http-middleware",
      ["http-middleware", "vapor-middleware", ...mongoSignals],
      "high",
      "medium",
      "integration",
      mongoSignals.length > 0 ? 8 : 7,
      4,
      ["HTTP middleware behavior", "Vapor request handling", ...mongoReasons(mongoSignals)]
    );
  }

  if (isVaporRoute(lowerPath, content)) {
    return recommended(
      "http-route",
      ["http-route", "vapor-route", ...mongoSignals],
      "high",
      "medium",
      "integration",
      mongoSignals.length > 0 ? 9 : 8,
      5,
      ["HTTP route behavior", "Vapor request handling", ...mongoReasons(mongoSignals)]
    );
  }

  if (mongoSignals.length > 0) {
    return recommended(
      "data-access",
      ["data-access", ...mongoSignals],
      "high",
      "medium",
      "integration",
      mongoSignals.includes("mongodb-aggregation") || mongoSignals.includes("mongodb-write") ? 8 : 7,
      5,
      ["MongoDB data access", ...mongoReasons(mongoSignals)]
    );
  }

  if (matchesAny(lowerPath, ["parser", "mapper", "validator", "formatter", "calculator"])) {
    return recommended("pure-logic", ["pure-logic", "edge-case-surface"], "high", "high", "unit", 9, 2, ["Pure transformation logic", "edge-case surface"]);
  }

  if (matchesAny(lowerPath, ["service", "client", "repository"])) {
    const signals = ["service-boundary"];
    const reasons = ["Service boundary"];
    let risk = "medium";
    let score = 6;

    if (/\basync\b|\bawait\b|\bactor\s+\w+/.test(content)) {
      signals.push("async-or-concurrency");
      reasons.push("async or concurrency behavior");
      risk = "high";
      score = 8;
    }

    return recommended("service", signals, risk, "medium", "unit", score, 4, reasons);
  }

  if (isStorageBoundary(lowerPath, content)) {
    return recommended(
      "storage",
      ["storage-boundary", ...encodingSignals(content)],
      "medium",
      "medium",
      "unit",
      6,
      4,
      ["Persistence boundary", ...encodingReasons(content)]
    );
  }

  if (isCommandOrWorker(lowerPath, content)) {
    const signals = ["command-or-worker"];
    const reasons = ["Command or worker orchestration"];
    let risk = "medium";
    let score = 6;

    if (/\basync\b|\bawait\b|\bactor\s+\w+/.test(content)) {
      signals.push("async-or-concurrency");
      reasons.push("async or concurrency behavior");
      risk = "high";
      score = 8;
    }

    return recommended("command-or-worker", signals, risk, "medium", "unit", score, 4, reasons);
  }

  if (isUrlOrQueryBuilder(lowerPath, content)) {
    return recommended("query-builder", ["query-builder", "edge-case-surface"], "high", "high", "unit", 8, 2, ["URL or query construction", "edge-case surface"]);
  }

  if (isErrorMapping(lowerPath, content)) {
    return recommended("error-mapping", ["error-mapping", "branching-logic"], "medium", "high", "unit", 6, 2, ["Error mapping behavior", "branching logic"]);
  }

  if (hasBranching(content)) {
    return recommended("utility", ["branching-logic"], "medium", "high", "unit", 5, 2, ["Branching logic"]);
  }

  return skipped("low-value", ["low-runtime-behavior"], 1, 3, "No meaningful runtime behavior detected by current Swift heuristics.");
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

function isIncludedByChangedPaths(currentPath, changedPaths) {
  if (!changedPaths) return true;
  return changedPaths.has(normalizePath(currentPath));
}

function isSourceFile(currentPath) {
  const normalized = normalizePath(currentPath);
  return (
    normalized !== "Package.swift" &&
    !isTestPath(normalized) &&
    SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension))
  );
}

function isTestFile(currentPath) {
  const normalized = normalizePath(currentPath);
  return isTestPath(normalized) && normalized.endsWith(".swift");
}

function findExistingTestEvidence(sourcePath, testFiles) {
  const sourceBase = basenameWithoutExtension(sourcePath);
  const sourceOwner = inferSourceOwner(sourcePath);

  return testFiles.flatMap((testFile) => {
    const testBase = basenameWithoutExtension(testFile.path).replace(/(?:Tests?|Spec)$/, "");
    if (testBase !== sourceBase || !testMatchesSourceOwner(testFile, sourceOwner)) return [];
    return [{ testPath: testFile.path, kind: "filename-convention", strength: "naming" }];
  });
}

function testMatchesSourceOwner(testFile, sourceOwner) {
  if (!sourceOwner) return true;
  const normalizedSourceOwner = normalizeModuleName(sourceOwner);
  const importedModules = collectImportedModules(testFile.content).map(normalizeModuleName);
  if (importedModules.includes(normalizedSourceOwner)) return true;
  const testOwner = inferTestOwner(testFile.path);
  return testOwner ? normalizeModuleName(testOwner) === normalizedSourceOwner : true;
}

function inferSourceOwner(currentPath) {
  const segments = normalizePath(currentPath).split("/");
  if (segments[0] === "Sources" && segments.length > 2) return segments[1];
  if (segments.length > 1 && !/Tests?$|UITests?$/.test(segments[0])) return segments[0];
  return undefined;
}

function inferTestOwner(currentPath) {
  const segments = normalizePath(currentPath).split("/");
  const testDirectory = segments[0] === "Tests" && segments.length > 2 ? segments[1] : firstTestDirectory(currentPath);
  return testDirectory?.replace(/(?:UITests?|Tests?)$/, "") || undefined;
}

function collectImportedModules(content) {
  return [...content.matchAll(/^\s*(?:@testable\s+)?import\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm)].map((match) => match[1]);
}

function normalizeModuleName(value) {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/");
}

function normalizeChangedPath(root, currentPath) {
  if (path.isAbsolute(currentPath)) {
    return stripCurrentDirectoryPrefix(normalizePath(path.relative(root, currentPath)));
  }

  return stripCurrentDirectoryPrefix(normalizePath(currentPath));
}

function stripCurrentDirectoryPrefix(currentPath) {
  return currentPath.replace(/^\.\//, "");
}

function basenameWithoutExtension(currentPath) {
  const fileName = normalizePath(currentPath).split("/").at(-1) ?? currentPath;
  return fileName.replace(/\.[^.]+$/, "");
}

function matchesAny(value, fragments) {
  return fragments.some((fragment) => value.includes(fragment));
}

function isTestPath(currentPath) {
  return normalizePath(currentPath).split("/").some((segment) => /Tests?$|UITests?$/.test(segment));
}

function firstTestDirectory(currentPath) {
  return normalizePath(currentPath).split("/").find((segment) => /Tests?$|UITests?$/.test(segment));
}

function detectXcodeScheme(paths) {
  const schemeNames = paths
    .filter((item) => item.endsWith(".xcscheme"))
    .map((item) => basenameWithoutExtension(item))
    .sort();
  if (schemeNames.length === 0) return undefined;

  const projectNames = paths
    .filter((item) => item.endsWith(".xcodeproj/project.pbxproj"))
    .map((item) => item.split("/").at(-2)?.replace(/\.xcodeproj$/, ""))
    .filter(Boolean)
    .sort();

  const projectScheme = schemeNames.find((schemeName) => projectNames.includes(schemeName));
  if (projectScheme) return projectScheme;
  if (schemeNames.length === 1) return schemeNames[0];
  return undefined;
}

function detectXcodeTestPlan(paths) {
  const testPlanNames = paths
    .filter((item) => item.endsWith(".xctestplan"))
    .map((item) => basenameWithoutExtension(item))
    .sort();
  if (testPlanNames.length === 1) return testPlanNames[0];
  return undefined;
}

function quoteShellArgument(value) {
  return /^[A-Za-z0-9_./:-]+$/.test(value) ? value : `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function hasBranching(content) {
  return /\b(if|switch|guard|do|catch)\b|\?[ \t]*[^:\n]+:/.test(content);
}

function isSwiftUIView(content) {
  return content.includes("import SwiftUI") && /\bstruct\s+\w+\s*:\s*View\b/.test(content);
}

function isDtoLike(currentPath, content) {
  return (
    /(dto|model|request|response)/i.test(currentPath) &&
    /\b(struct|class)\s+\w+/.test(content) &&
    !hasBranching(content)
  );
}

function isVaporLifecycleFile(currentPath, content) {
  return (
    content.includes("import Vapor") &&
    (
      currentPath.endsWith("/configure.swift") ||
      currentPath.endsWith("/entrypoint.swift") ||
      currentPath.endsWith("/routes.swift")
    )
  );
}

function isVaporMiddleware(currentPath, content) {
  return (
    content.includes("import Vapor") &&
    (
      currentPath.includes("/middleware/") ||
      /\bAsyncMiddleware\b/.test(content) ||
      /\bMiddleware\b/.test(content) ||
      /\bAuthenticator\b/.test(content)
    )
  );
}

function isVaporRoute(currentPath, content) {
  return (
    content.includes("import Vapor") &&
    (
      currentPath.includes("/routes/") ||
      currentPath.includes("/controllers/") ||
      /\bRouteCollection\b/.test(content) ||
      /\bRoutesBuilder\b/.test(content) ||
      /\b(app|routes|router|grouped)\s*\.\s*(get|post|put|patch|delete|on|group|grouped|webSocket)\s*\(/.test(content)
    )
  );
}

function isMongoDataAccess(content) {
  return detectMongoSignals(content).length > 0;
}

function isStorageBoundary(currentPath, content) {
  return (
    matchesAny(currentPath, ["storage", "persistence", "keychain", "userdefaults"]) ||
    /\bUserDefaults\b|\bSecItem(Add|CopyMatching|Delete|Update)\b|\bPersistence\b/.test(content)
  );
}

function encodingSignals(content) {
  return /\bJSON(Encoder|Decoder)\b|\bCodable\b/.test(content) ? ["encoding-or-decoding"] : [];
}

function encodingReasons(content) {
  return /\bJSON(Encoder|Decoder)\b|\bCodable\b/.test(content) ? ["encoding or decoding behavior"] : [];
}

function isCommandOrWorker(currentPath, content) {
  return (
    matchesAny(currentPath, ["/commands/", "/jobs/", "/worker/"]) ||
    /\b(actor|struct|class)\s+\w*(Command|Job|Worker)\b/.test(content) ||
    /\bAsyncCommand\b|\bCommandSignature\b/.test(content)
  );
}

function isUrlOrQueryBuilder(currentPath, content) {
  return (
    matchesAny(currentPath, ["urlbuilder", "querybuilder"]) ||
    /\bURLComponents\b|\bqueryString\b|\bURLQueryItem\b/.test(content)
  );
}

function isErrorMapping(currentPath, content) {
  return (
    matchesAny(currentPath, ["error"]) &&
    /\benum\s+\w*Error\b/.test(content) &&
    /\bswitch\s+self\b|\blocalizedDescription\b/.test(content)
  );
}

function detectMongoSignals(content) {
  const signals = new Set();
  const hasMongoImport = /(?:^|\n)\s*(?:@preconcurrency\s+)?import\s+(MongoKitten|BSON|MongoSwift|FluentMongoDriver)\b/.test(content);
  const hasMongoDbHandle = /\bdb\s*\(\s*\.mongo\s*\)|\bMongoDatabaseRepresentable\b|\bMongoConnection\b|\.raw\s*\[/.test(content);
  const hasMongoQueryDocument = /\bDocument\s*\(|\bDocument\s*\[|\bqueryDocument\b|"\$(match|lookup|group|unwind|project|sort|slice|regex|push|set|in|and|or)"/.test(content);

  if (hasMongoImport || hasMongoDbHandle || hasMongoQueryDocument) signals.add("mongodb-query");
  if (/\baggregate\s*\(|"\$(match|lookup|group|unwind|project|sortArray|slice|push)"/.test(content)) signals.add("mongodb-aggregation");
  if (/\bfilter\s*\(\s*\.custom\b|\$regex|NSRegularExpression|queryDocument/.test(content)) signals.add("mongodb-dynamic-filter");
  if (/\.(limit|offset|skip|sort)\s*\(/.test(content)) signals.add("pagination-or-sort");
  if (/\b(create|update|save|delete)\s*\(\s*on:\s*[^)]*\.mongo\b|\b(insertOne|updateOne|updateMany|deleteOne|deleteMany|bulkWrite)\s*\(/.test(content)) signals.add("mongodb-write");
  return [...signals].sort();
}

function mongoReasons(signals) {
  const reasons = [];
  if (signals.includes("mongodb-query")) reasons.push("MongoDB query boundary");
  if (signals.includes("mongodb-aggregation")) reasons.push("aggregation pipeline semantics");
  if (signals.includes("mongodb-dynamic-filter")) reasons.push("dynamic BSON filter construction");
  if (signals.includes("pagination-or-sort")) reasons.push("pagination or sorting behavior");
  if (signals.includes("mongodb-write")) reasons.push("MongoDB write/update behavior");
  return reasons;
}

function isFluentPersistenceModel(content) {
  return (
    (content.includes("import Fluent") || content.includes("FluentKit")) &&
    (
      /\b(class|struct)\s+\w+\s*:\s*[^{}]*\bModel\b/.test(content) ||
      /\bAsyncMigration\b|\bMigration\b/.test(content) ||
      /@(ID|Field|Parent|Children|Siblings|OptionalField|Timestamp)\b/.test(content)
    )
  );
}

function byRiskThenName(a, b) {
  const order = { high: 0, medium: 1, low: 2 };
  return order[a.risk] - order[b.risk] || a.name.localeCompare(b.name);
}
