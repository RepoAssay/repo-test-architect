import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = [".swift", ".m", ".mm"];

export function auditSwiftRepo(root, options = {}) {
  const files = readRepoFiles(root);
  const bazelGraph = parseBazelSwiftGraph(files);
  const swiftPmGraph = parseSwiftPmGraph(files);
  const sourceGraph = mergeSourceGraphs(bazelGraph, swiftPmGraph);
  const sourceSymbols = collectUniqueSwiftSourceSymbols(files, sourceGraph);
  const profile = buildProfile(root, files, sourceGraph);
  const changedPaths = options.changedPaths ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(root, currentPath))) : undefined;
  const testFiles = files
    .filter((file) => isTestFile(file.path, sourceGraph))
    .map((file) => ({ ...file, path: normalizePath(file.path) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];

  for (const file of files.filter((candidate) => isSourceFile(candidate.path, sourceGraph) && isIncludedByChangedPaths(candidate.path, changedPaths))) {
    const name = basenameWithoutExtension(file.path);
    const classification = classifySourceFile(file, sourceGraph);
    const existingTestEvidence = findExistingTestEvidence(file.path, testFiles, sourceGraph, sourceSymbols);
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
  const ignored = new Set([
    ".build",
    ".git",
    ".swiftpm",
    ".symlinks",
    "build",
    "Carthage",
    "DerivedData",
    "Pods",
    "SourcePackages",
    "Vendor",
    "vendor"
  ]);
  const files = [];

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;

      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute).replaceAll(path.sep, "/");

      if (entry.isDirectory()) {
        if (shouldIgnoreSwiftDirectory(absolute, entry.name)) continue;
        visit(absolute);
        continue;
      }

      if (entry.isSymbolicLink()) continue;

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
    isSwiftPmManifestPath(relative) ||
    isBazelWorkspaceFile(relative) ||
    isBazelBuildFile(relative) ||
    relative.endsWith(".xcodeproj/project.pbxproj") ||
    isXcodeWorkspaceDataPath(relative) ||
    isSharedXcodeSchemePath(relative) ||
    relative.endsWith(".xctestplan")
  );
}

function shouldIgnoreSwiftDirectory(absolute, name) {
  if (name.endsWith(".playground") || /^Playgrounds?$/i.test(name)) return true;
  if (!/(?:^|[-_])(?:examples?|demos?|samples?)$|(?:Example|Demo|Sample)(?:App)?s?$/i.test(name)) return false;
  return fs.readdirSync(absolute, { withFileTypes: true }).some((entry) =>
    entry.name === "Package.swift" || entry.name.endsWith(".xcodeproj") || entry.name.endsWith(".xcworkspace")
  );
}

function buildProfile(root, files, bazelGraph) {
  const paths = files.map((file) => normalizePath(file.path));
  const packageText = swiftPmManifestText(files);
  const testFrameworks = detectTestFrameworks(files, packageText);
  const testCommand = detectTestCommand(paths, testFrameworks, bazelGraph, files);
  const existingTestLocations = detectExistingTestLocations(paths, bazelGraph);
  const blockers = detectBlockers(testCommand, testFrameworks);

  return {
    root,
    languages: detectLanguages(paths),
    packageManagers: detectPackageManagers(paths, bazelGraph),
    testFrameworks,
    architectures: detectArchitectures(paths, files, bazelGraph),
    testCommand,
    detectedConventions: detectConventions(paths, bazelGraph),
    existingTestLocations,
    setupSignals: detectSetupSignals(paths, packageText, bazelGraph, files),
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

function detectPackageManagers(paths, bazelGraph) {
  const managers = new Set();
  if (paths.includes("Package.swift")) managers.add("swiftpm");
  if (hasXcodeContainer(paths)) managers.add("xcodebuild");
  if (bazelGraph.hasSwiftRules) managers.add("bazel");
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

  if (/^\s*import\s+VaporTesting\b/m.test(sourceText) || packageText.includes(".product(name: \"VaporTesting\"")) {
    frameworks.add("VaporTesting");
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

  if (/^\s*import\s+RxTest\b/m.test(sourceText) || /product\(name:\s*"RxTest"|\bRxTest\b/.test(packageText)) {
    frameworks.add("RxTest");
  }

  if (/^\s*import\s+RxBlocking\b/m.test(sourceText) || /product\(name:\s*"RxBlocking"|\bRxBlocking\b/.test(packageText)) {
    frameworks.add("RxBlocking");
  }

  return [...frameworks].sort();
}

function detectTestCommand(paths, frameworks, bazelGraph, files) {
  if (frameworks.length === 0) return undefined;
  if (bazelGraph.hasSwiftTest) return "bazel test //...";
  if (paths.includes("Package.swift")) return "swift test";
  if (hasXcodeContainer(paths)) {
    const scheme = detectXcodeScheme(paths);
    const testPlan = detectXcodeTestPlan(paths, files, scheme);
    const workspace = detectXcodeWorkspace(paths, scheme);
    const project = workspace ? undefined : detectXcodeProject(paths, scheme);
    const containerOption = workspace
      ? ` -workspace ${quoteShellArgument(workspace)}`
      : project ? ` -project ${quoteShellArgument(project)}` : "";
    if (scheme && testPlan) return `xcodebuild test${containerOption} -scheme ${quoteShellArgument(scheme)} -testPlan ${quoteShellArgument(testPlan)}`;
    if (scheme) return `xcodebuild test${containerOption} -scheme ${quoteShellArgument(scheme)}`;
    return `xcodebuild test${containerOption}`;
  }
  return undefined;
}

function detectExistingTestLocations(paths, bazelGraph) {
  const locations = new Set();
  if (paths.some((item) => item.startsWith("Tests/"))) locations.add("Tests");
  for (const currentPath of paths) {
    const testDirectory = firstTestDirectory(currentPath);
    if (testDirectory) locations.add(testDirectory);
  }
  for (const currentPath of bazelGraph.testSources) {
    if (!currentPath.startsWith("Tests/")) locations.add(path.posix.dirname(currentPath));
  }
  return [...locations];
}

function detectConventions(paths, bazelGraph) {
  const conventions = new Set();
  if (paths.some((item) => /Tests?\.swift$/.test(item))) conventions.add("*Tests.swift files");
  if (paths.some((item) => item.startsWith("Tests/"))) conventions.add("Tests");
  if (paths.some((item) => firstTestDirectory(item)?.endsWith("UITests"))) conventions.add("*UITests folders");
  if (bazelGraph.hasSwiftTest) conventions.add("Bazel swift_test targets");
  return [...conventions];
}

function detectSetupSignals(paths, packageText, bazelGraph, files) {
  const signals = new Set();
  const sourceText = files.map((file) => file.content).join("\n");
  if (paths.includes("Package.swift")) signals.add("swift package manager");
  if (paths.some(isVersionSpecificSwiftPmManifestPath)) signals.add("swiftpm version-specific manifest");
  if (paths.some((item) => item.endsWith(".xcodeproj/project.pbxproj"))) signals.add("xcode project");
  if (paths.some(isXcodeWorkspaceDataPath)) signals.add("xcode workspace");
  if (detectXcodeScheme(paths)) signals.add("xcode shared scheme");
  if (paths.some((item) => item.endsWith(".xctestplan"))) signals.add("xcode test plan");
  const scheme = detectXcodeScheme(paths);
  const testPlans = new Set(paths.filter((item) => item.endsWith(".xctestplan")).map(basenameWithoutExtension));
  if (scheme && detectSchemeTestPlan(files, scheme, testPlans)) signals.add("xcode scheme test plan");
  if (packageText.includes("Vapor") || packageText.includes("vapor.git")) signals.add("vapor dependency");
  if (/\bFluent\b|fluent(?:-[a-z]+)?\.git|fluent-[a-z]+-driver/i.test(packageText)) signals.add("fluent orm");
  for (const driver of detectDatabaseDrivers(packageText)) signals.add(`${driver} database driver`);
  if (packageText.includes(".product(name: \"XCTVapor\"") || /^\s*import\s+XCTVapor\b/m.test(sourceText)) signals.add("xctvapor test support");
  if (packageText.includes(".product(name: \"VaporTesting\"") || /^\s*import\s+VaporTesting\b/m.test(sourceText)) signals.add("vapor testing support");
  if (/quick\.git|Quick\/Quick|product\(name:\s*"Quick"/i.test(packageText)) signals.add("quick test support");
  if (/nimble\.git|Quick\/Nimble|product\(name:\s*"Nimble"/i.test(packageText)) signals.add("nimble assertion support");
  if (/swift-snapshot-testing|pointfreeco\/swift-snapshot-testing|product\(name:\s*"SnapshotTesting"/i.test(packageText)) signals.add("snapshot testing support");
  if (/rxswift|product\(name:\s*"RxSwift"|product\(name:\s*"RxCocoa"|product\(name:\s*"RxRelay"/i.test(packageText)) signals.add("rxswift reactive support");
  if (/product\(name:\s*"RxTest"|\bRxTest\b/.test(packageText)) signals.add("rxtest scheduler support");
  if (/product\(name:\s*"RxBlocking"|\bRxBlocking\b/.test(packageText)) signals.add("rxblocking support");
  if (packageText.includes(".testTarget")) signals.add("swiftpm test target");
  if (packageText.includes(".executableTarget")) signals.add("swiftpm executable target");
  if (bazelGraph.hasMacroTargets) signals.add("swiftpm macro target");
  if (bazelGraph.hasPluginTargets) signals.add("swiftpm plugin target");
  if (bazelGraph.hasHelperTargets) signals.add("swiftpm helper target declaration");
  if (packageText.includes(".target")) signals.add("swiftpm target");
  if (bazelGraph.hasCustomTargetPaths) signals.add("swiftpm custom target path");
  if (bazelGraph.hasExplicitSources) signals.add("swiftpm explicit sources");
  if (bazelGraph.hasAlternateSourceRoots) signals.add("swiftpm alternate source root");
  if (bazelGraph.hasSwiftRules) signals.add("bazel swift rules");
  if (bazelGraph.hasSwiftTest) signals.add("bazel swift_test target");
  return [...signals];
}

function detectArchitectures(paths, files, bazelGraph) {
  const architectures = new Set();
  if (paths.includes("Package.swift")) architectures.add("swift-package");
  if (hasXcodeContainer(paths)) architectures.add("apple-xcode");
  if (bazelGraph.hasSwiftRules) architectures.add("bazel-swift");
  if (files.some((file) => file.content.includes("import SwiftUI") || /\bView\b/.test(file.content))) architectures.add("swiftui");
  if (files.some((file) => file.content.includes("Vapor"))) architectures.add("vapor");
  if (files.some((file) => hasFluentPersistence(file.content))) architectures.add("database-persistence");
  for (const driver of detectDatabaseDrivers(files.map((file) => file.content).join("\n"))) architectures.add(driver);
  if (files.some((file) => isReactiveStreamsSource(file.path, file.content))) architectures.add("reactive-streams");
  if (files.some((file) => /\bactor\s+\w+/.test(file.content))) architectures.add("concurrency");
  return [...architectures].sort();
}

function detectBlockers(testCommand, frameworks) {
  const blockers = [];
  if (frameworks.length === 0) blockers.push("No supported Swift test framework detected.");
  if (!testCommand) blockers.push("No runnable Swift test command detected from Package.swift or Xcode project/workspace markers.");
  return blockers;
}

function scoreProfileConfidence(testFrameworks, existingTestLocations, blockers) {
  if (blockers.length > 1) return "low";
  if (testFrameworks.length > 0 && existingTestLocations.length > 0) return "high";
  if (testFrameworks.length > 0) return "medium";
  return "low";
}

function classifySourceFile(file, sourceGraph) {
  const currentPath = normalizePath(file.path);
  const content = file.content;
  const lowerPath = currentPath.toLowerCase();
  const databaseSignals = detectDatabaseSignals(content);

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

  if (isGeneratedSwiftSource(currentPath, content)) {
    return skipped(
      "generated",
      ["generated-code"],
      1,
      8,
      "Generated Swift source should not be test-authored directly.",
      "Test generator inputs and consuming behavior, then regenerate the source through its owning tool."
    );
  }

  if (sourceGraph.pluginSources.has(currentPath)) {
    return skipped(
      "swiftpm-plugin",
      ["swiftpm-plugin"],
      2,
      6,
      "Swift package plugin implementations are build tooling rather than product runtime behavior.",
      "Cover through package-level integration checks that invoke the plugin against representative targets."
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
      "Cover through VaporTesting, XCTVapor, or repository integration tests that exercise persistence behavior and schema migrations."
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
      "Cover through VaporTesting or XCTVapor request tests that exercise registered routes and application configuration."
    );
  }

  if (isVaporMiddleware(lowerPath, content)) {
    return recommended(
      "http-middleware",
      ["http-middleware", "vapor-middleware", ...databaseSignals],
      "high",
      "medium",
      "integration",
      databaseSignals.length > 0 ? 8 : 7,
      4,
      ["HTTP middleware behavior", "Vapor request handling", ...databaseReasons(databaseSignals)]
    );
  }

  if (isVaporRoute(lowerPath, content)) {
    return recommended(
      "http-route",
      ["http-route", "vapor-route", ...databaseSignals],
      "high",
      "medium",
      "integration",
      databaseSignals.length > 0 ? 9 : 8,
      5,
      ["HTTP route behavior", "Vapor request handling", ...databaseReasons(databaseSignals)]
    );
  }

  if (databaseSignals.length > 0) {
    return recommended(
      "data-access",
      ["data-access", ...databaseSignals],
      "high",
      "medium",
      "integration",
      hasHighRiskDatabaseSemantics(databaseSignals) ? 8 : 7,
      5,
      ["Database access boundary", ...databaseReasons(databaseSignals)]
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

function isSourceFile(currentPath, bazelGraph) {
  const normalized = normalizePath(currentPath);
  return (
    !isSwiftPmManifestPath(normalized) &&
    !isTestFile(normalized, bazelGraph) &&
    !bazelGraph.ignoredSources.has(normalized) &&
    SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension))
  );
}

function isTestFile(currentPath, bazelGraph) {
  const normalized = normalizePath(currentPath);
  return (isTestPath(normalized) || /(?:Tests?|Spec)\.swift$/.test(normalized) || bazelGraph.testSources.has(normalized)) && normalized.endsWith(".swift");
}

function findExistingTestEvidence(sourcePath, testFiles, sourceGraph, sourceSymbols) {
  const sourceBase = basenameWithoutExtension(sourcePath);
  const sourceOwner = sourceGraph.sourceOwners.get(normalizePath(sourcePath)) ?? inferSourceOwner(sourcePath);
  const symbols = sourceSymbols.get(normalizePath(sourcePath)) ?? new Set();

  return testFiles.flatMap((testFile) => {
    const testBase = basenameWithoutExtension(testFile.path).replace(/(?:Tests?|Spec)$/, "");
    if (!testMatchesSourceOwner(testFile, sourceOwner, sourceGraph)) return [];
    const symbolUsage = findSwiftSymbolUsage(testFile.content, symbols);
    if (symbolUsage) {
      return [{
        testPath: testFile.path,
        kind: "swift-symbol-reference",
        strength: "referenced",
        ...(symbolUsage !== "referenced" ? { usage: symbolUsage } : {})
      }];
    }
    if (testBase !== sourceBase) return [];
    return [{ testPath: testFile.path, kind: "filename-convention", strength: "naming" }];
  });
}

function testMatchesSourceOwner(testFile, sourceOwner, sourceGraph) {
  if (!sourceOwner) return true;
  const normalizedSourceOwner = normalizeModuleName(sourceOwner);
  const importedModules = collectImportedModules(testFile.content).map(normalizeModuleName);
  if (importedModules.includes(normalizedSourceOwner)) return true;
  const declaredDependencies = [...(sourceGraph.testDependencies.get(testFile.path) ?? [])].map(normalizeModuleName);
  if (declaredDependencies.includes(normalizedSourceOwner)) return true;
  if (sourceGraph.testDependencies.has(testFile.path)) return false;
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

function collectUniqueSwiftSourceSymbols(files, sourceGraph) {
  const symbolsByPath = new Map();
  const pathsByOwnerAndSymbol = new Map();

  for (const file of files.filter((candidate) =>
    isSourceFile(candidate.path, sourceGraph) &&
    candidate.path.endsWith(".swift") &&
    !isGeneratedSwiftSource(candidate.path, candidate.content)
  )) {
    const currentPath = normalizePath(file.path);
    const owner = normalizeModuleName(sourceGraph.sourceOwners.get(currentPath) ?? inferSourceOwner(currentPath) ?? "__root__");
    const symbols = collectTopLevelSwiftDeclarations(file.content);
    symbolsByPath.set(currentPath, symbols);
    for (const symbol of symbols) {
      const key = `${owner}:${symbol}`;
      pathsByOwnerAndSymbol.set(key, new Set([...(pathsByOwnerAndSymbol.get(key) ?? []), currentPath]));
    }
  }

  return new Map([...symbolsByPath].map(([currentPath, symbols]) => {
    const owner = normalizeModuleName(sourceGraph.sourceOwners.get(currentPath) ?? inferSourceOwner(currentPath) ?? "__root__");
    return [currentPath, new Set([...symbols].filter((symbol) => pathsByOwnerAndSymbol.get(`${owner}:${symbol}`)?.size === 1))];
  }));
}

function collectTopLevelSwiftDeclarations(content) {
  const masked = maskSwiftCommentsAndStrings(content);
  const symbols = new Set();
  let braceDepth = 0;

  for (const line of masked.split("\n")) {
    if (braceDepth === 0) {
      for (const match of line.matchAll(/\b(?:struct|class|enum|actor|protocol|func)\s+`?([A-Za-z_][A-Za-z0-9_]*)`?/g)) {
        symbols.add(match[1]);
      }
    }
    braceDepth += [...line].filter((character) => character === "{").length;
    braceDepth -= [...line].filter((character) => character === "}").length;
    braceDepth = Math.max(0, braceDepth);
  }

  return symbols;
}

function findSwiftSymbolUsage(content, symbols) {
  if (symbols.size === 0) return undefined;
  const masked = maskSwiftCommentsAndStrings(content).replace(/^\s*(?:@testable\s+)?import\s+.*$/gm, "");

  for (const symbol of [...symbols].sort()) {
    const escapedSymbol = escapeRegex(symbol);
    const reference = new RegExp(`\\b${escapedSymbol}\\b`);
    if (!reference.test(masked)) continue;
    const declaration = new RegExp(`\\b(?:struct|class|enum|actor|protocol|func|typealias)\\s+${escapedSymbol}\\b`);
    const withoutDeclarations = masked.replace(declaration, "");
    if (!reference.test(withoutDeclarations)) continue;
    if (swiftAssertionBodies(masked).some((body) => reference.test(body))) return "asserted";
    if (new RegExp(`\\b${escapedSymbol}\\s*(?:<[^>\\n]+>\\s*)?\\(`).test(withoutDeclarations)) return "called";
    return "referenced";
  }

  return undefined;
}

function swiftAssertionBodies(content) {
  const bodies = [];
  const matcher = /(?:#expect|#require|XCTAssert[A-Za-z]*|expect)\s*\(/g;
  let match;

  while ((match = matcher.exec(content)) !== null) {
    let depth = 1;
    let index = matcher.lastIndex;
    for (; index < content.length && depth > 0; index += 1) {
      if (content[index] === "(") depth += 1;
      else if (content[index] === ")") depth -= 1;
    }
    bodies.push(content.slice(matcher.lastIndex, index - 1));
    matcher.lastIndex = index;
  }

  return bodies;
}

function maskSwiftCommentsAndStrings(content) {
  let result = "";
  let index = 0;
  let blockCommentDepth = 0;
  let lineComment = false;
  let stringDelimiter;

  while (index < content.length) {
    const current = content[index];
    const next = content[index + 1];
    if (lineComment) {
      if (current === "\n") {
        lineComment = false;
        result += "\n";
      } else result += " ";
      index += 1;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (current === "/" && next === "*") {
        blockCommentDepth += 1;
        result += "  ";
        index += 2;
      } else if (current === "*" && next === "/") {
        blockCommentDepth -= 1;
        result += "  ";
        index += 2;
      } else {
        result += current === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (stringDelimiter) {
      if (content.startsWith(stringDelimiter, index)) {
        result += " ".repeat(stringDelimiter.length);
        index += stringDelimiter.length;
        stringDelimiter = undefined;
      } else if (current === "\\" && stringDelimiter === "\"") {
        result += "  ";
        index += 2;
      } else {
        result += current === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (current === "/" && next === "/") {
      lineComment = true;
      result += "  ";
      index += 2;
    } else if (current === "/" && next === "*") {
      blockCommentDepth = 1;
      result += "  ";
      index += 2;
    } else if (content.startsWith("\"\"\"", index)) {
      stringDelimiter = "\"\"\"";
      result += "   ";
      index += 3;
    } else if (current === "\"") {
      stringDelimiter = "\"";
      result += " ";
      index += 1;
    } else {
      result += current;
      index += 1;
    }
  }

  return result;
}

function mergeSourceGraphs(...graphs) {
  const testDependencies = new Map();
  for (const graph of graphs) {
    for (const [testPath, dependencies] of graph.testDependencies) {
      testDependencies.set(testPath, new Set([...(testDependencies.get(testPath) ?? []), ...dependencies]));
    }
  }

  const sourceOwners = new Map(graphs.flatMap((graph) => [...graph.sourceOwners]));
  const testSources = new Set(graphs.flatMap((graph) => [...graph.testSources]));
  const ignoredSources = new Set(graphs.flatMap((graph) => [...graph.ignoredSources]));
  const pluginSources = new Set(graphs.flatMap((graph) => [...(graph.pluginSources ?? [])]));
  for (const ownedPath of [...sourceOwners.keys(), ...testSources]) ignoredSources.delete(ownedPath);

  return {
    hasSwiftRules: graphs.some((graph) => graph.hasSwiftRules),
    hasSwiftTest: graphs.some((graph) => graph.hasSwiftTest),
    hasCustomTargetPaths: graphs.some((graph) => graph.hasCustomTargetPaths),
    hasExplicitSources: graphs.some((graph) => graph.hasExplicitSources),
    hasAlternateSourceRoots: graphs.some((graph) => graph.hasAlternateSourceRoots),
    hasMacroTargets: graphs.some((graph) => graph.hasMacroTargets),
    hasPluginTargets: graphs.some((graph) => graph.hasPluginTargets),
    hasHelperTargets: graphs.some((graph) => graph.hasHelperTargets),
    sourceOwners,
    testSources,
    ignoredSources,
    pluginSources,
    testDependencies
  };
}

function parseSwiftPmGraph(files) {
  const packageFiles = files.filter((file) => isSwiftPmManifestPath(file.path));
  const emptyGraph = {
    hasSwiftRules: false,
    hasSwiftTest: false,
    hasCustomTargetPaths: false,
    hasExplicitSources: false,
    hasAlternateSourceRoots: false,
    hasMacroTargets: false,
    hasPluginTargets: false,
    hasHelperTargets: false,
    sourceOwners: new Map(),
    testSources: new Set(),
    testDependencies: new Map(),
    ignoredSources: new Set(),
    pluginSources: new Set()
  };
  if (!packageFiles.some((file) => normalizePath(file.path) === "Package.swift")) return emptyGraph;
  return mergeSourceGraphs(...packageFiles.map((packageFile) => parseSwiftPmManifestGraph(packageFile, files, emptyGraph)));
}

function parseSwiftPmManifestGraph(packageFile, files, emptyGraph) {
  const swiftPaths = files.map((file) => normalizePath(file.path)).filter((currentPath) => currentPath.endsWith(".swift"));
  const targetExtraction = extractSwiftPmTargets(packageFile.content);
  const rules = targetExtraction.targets
    .filter((rule) => rule.kind !== "plugin" || /\bcapability\s*:/.test(rule.body))
    .map((rule) => ({
      ...rule,
      name: readStringAttribute(rule.body, "name")
    }))
    .filter((rule) => rule.name);
  const targetNames = new Set(rules.map((rule) => rule.name));
  const sourceOwners = new Map();
  const testSources = new Set();
  const testDependencies = new Map();
  const ignoredSources = new Set();
  const pluginSources = new Set();
  let hasCustomTargetPaths = false;
  let hasExplicitSourceLists = false;
  let hasAlternateSourceRoots = false;

  for (const rule of rules) {
    const isTest = rule.kind === "testTarget";
    const isPlugin = rule.kind === "plugin";
    const declaredPath = readStringAttribute(rule.body, "path");
    const targetPath = declaredPath ?? inferDefaultSwiftPmTargetPath(rule.name, isTest, isPlugin, swiftPaths);
    const sourceEntries = readStringArrayAttribute(rule.body, "sources");
    const excludeEntries = readStringArrayAttribute(rule.body, "exclude");
    const hasExplicitSources = /\bsources\s*:/.test(rule.body);
    if (declaredPath) hasCustomTargetPaths = true;
    if (hasExplicitSources) hasExplicitSourceLists = true;
    const conventionalRoot = isPlugin ? "Plugins" : isTest ? "Tests" : "Sources";
    if (!declaredPath && !targetPath.startsWith(`${conventionalRoot}/`)) hasAlternateSourceRoots = true;
    const ownedSources = resolveSwiftPmSources(targetPath, sourceEntries, excludeEntries, hasExplicitSources, swiftPaths);
    if (hasExplicitSources || excludeEntries.length > 0) {
      for (const swiftPath of swiftPaths.filter((candidate) => pathContains(targetPath, candidate))) {
        if (!ownedSources.has(swiftPath)) ignoredSources.add(swiftPath);
      }
    }
    const dependencies = new Set(readStringArrayAttribute(rule.body, "dependencies").filter((dependency) => targetNames.has(dependency)));

    for (const sourcePath of ownedSources) {
      if (isTest) {
        testSources.add(sourcePath);
        testDependencies.set(sourcePath, dependencies);
      } else {
        sourceOwners.set(sourcePath, rule.name);
        if (isPlugin) pluginSources.add(sourcePath);
      }
    }
  }

  applyConventionalSwiftPmOwnership(swiftPaths, targetNames, sourceOwners, testSources, testDependencies, ignoredSources);

  return {
    ...emptyGraph,
    hasCustomTargetPaths,
    hasExplicitSources: hasExplicitSourceLists,
    hasAlternateSourceRoots,
    hasMacroTargets: rules.some((rule) => rule.kind === "macro"),
    hasPluginTargets: rules.some((rule) => rule.kind === "plugin"),
    hasHelperTargets: targetExtraction.hasHelperTargets,
    sourceOwners,
    testSources,
    testDependencies,
    ignoredSources,
    pluginSources
  };
}

function extractSwiftPmTargets(content) {
  const targets = extractCallBodies(content, /\.(testTarget|executableTarget|macro|plugin|target)\s*\(/g);
  const helpers = extractSwiftPmTargetHelpers(content);
  let helperCallCount = 0;
  for (const [helperName, kind] of helpers) {
    const matcher = new RegExp(`\\.(${escapeRegex(helperName)})\\s*\\(`, "g");
    for (const call of extractCallBodies(content, matcher)) {
      targets.push({ ...call, kind });
      helperCallCount += 1;
    }
  }
  return { targets, hasHelperTargets: helperCallCount > 0 };
}

function applyConventionalSwiftPmOwnership(swiftPaths, declaredTargetNames, sourceOwners, testSources, testDependencies, ignoredSources) {
  const targetNames = new Map([...declaredTargetNames].map((name) => [normalizeModuleName(name), name]));

  for (const swiftPath of swiftPaths) {
    const match = swiftPath.match(/^(?:Sources|Source|src|srcs)\/([^/]+)\//);
    if (match && !/(?:Tests?|UITests?)$/.test(match[1])) targetNames.set(normalizeModuleName(match[1]), match[1]);
  }

  for (const swiftPath of swiftPaths) {
    if (ignoredSources.has(swiftPath) || isTestPath(swiftPath) || /(?:Tests?|Spec)\.swift$/.test(swiftPath)) continue;
    const segments = swiftPath.split("/");
    const conventionalMatch = swiftPath.match(/^(?:Sources|Source|src|srcs)\/([^/]+)\//);
    const owner = conventionalMatch?.[1] ?? targetNames.get(normalizeModuleName(segments[0]));
    if (owner) sourceOwners.set(swiftPath, sourceOwners.get(swiftPath) ?? owner);
  }

  for (const swiftPath of swiftPaths) {
    if (!isTestPath(swiftPath) && !/(?:Tests?|Spec)\.swift$/.test(swiftPath)) continue;
    const inferredOwner = inferTestOwner(swiftPath);
    const dependency = inferredOwner && targetNames.get(normalizeModuleName(inferredOwner));
    if (!dependency) continue;
    testSources.add(swiftPath);
    if (!testDependencies.has(swiftPath)) testDependencies.set(swiftPath, new Set([dependency]));
  }
}

function extractSwiftPmTargetHelpers(content) {
  const helpers = new Map();
  const matcher = /\bstatic\s+func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*->\s*Target\b/g;
  let match;
  while ((match = matcher.exec(content)) !== null) {
    const openingBrace = content.indexOf("{", matcher.lastIndex);
    if (openingBrace < 0) continue;
    const body = readBalancedSwiftBody(content, openingBrace, "{", "}");
    const kind = body.match(/\.(testTarget|executableTarget|macro|plugin|target)\s*\(/)?.[1];
    if (kind) helpers.set(match[1], kind);
    matcher.lastIndex = openingBrace + body.length;
  }
  return helpers;
}

function readBalancedSwiftBody(content, openingIndex, opening, closing) {
  let depth = 0;
  let quote;
  let escaped = false;
  let index = openingIndex;
  for (; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'") quote = character;
    else if (character === opening) depth += 1;
    else if (character === closing && --depth === 0) return content.slice(openingIndex, index + 1);
  }
  return content.slice(openingIndex);
}

function extractCallBodies(content, matcher) {
  const calls = [];
  let match;

  while ((match = matcher.exec(content)) !== null) {
    let depth = 1;
    let quote;
    let escaped = false;
    let index = matcher.lastIndex;
    for (; index < content.length && depth > 0; index += 1) {
      const character = content[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = undefined;
      } else if (character === "\"" || character === "'") quote = character;
      else if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
    }
    calls.push({ kind: match[1], body: content.slice(matcher.lastIndex, index - 1) });
    matcher.lastIndex = index;
  }

  return calls;
}

function readStringAttribute(body, attribute) {
  return body.match(new RegExp(`\\b${attribute}\\s*:\\s*["']([^"']+)["']`))?.[1];
}

function readStringArrayAttribute(body, attribute) {
  const start = body.search(new RegExp(`\\b${attribute}\\s*:\\s*\\[`));
  if (start < 0) return [];
  const openingBracket = body.indexOf("[", start);
  let depth = 1;
  let quote;
  let escaped = false;
  let index = openingBracket + 1;

  for (; index < body.length && depth > 0; index += 1) {
    const character = body[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = undefined;
    } else if (character === "\"" || character === "'") quote = character;
    else if (character === "[") depth += 1;
    else if (character === "]") depth -= 1;
  }

  return [...body.slice(openingBracket + 1, index - 1).matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

function resolveSwiftPmSources(targetPath, sourceEntries, excludeEntries, hasExplicitSources, swiftPaths) {
  const normalizedTargetPath = normalizePath(targetPath).replace(/^\.\//, "").replace(/\/$/, "");
  const candidates = hasExplicitSources
    ? swiftPaths.filter((swiftPath) => sourceEntries.some((entry) => pathContains(path.posix.join(normalizedTargetPath, entry), swiftPath)))
    : swiftPaths.filter((swiftPath) => pathContains(normalizedTargetPath, swiftPath));

  return new Set(candidates.filter((swiftPath) => !excludeEntries.some((entry) => pathContains(path.posix.join(normalizedTargetPath, entry), swiftPath))));
}

function inferDefaultSwiftPmTargetPath(targetName, isTest, isPlugin, swiftPaths) {
  const defaultRoot = isPlugin ? "Plugins" : isTest ? "Tests" : "Sources";
  const searchRoots = isPlugin
    ? ["Plugins"]
    : isTest ? ["Tests", "Sources", "Source", "src", "srcs", ""] : ["Sources", "Source", "src", "srcs", ""];
  return searchRoots
    .map((root) => root ? `${root}/${targetName}` : targetName)
    .find((candidate) => swiftPaths.some((swiftPath) => pathContains(candidate, swiftPath))) ?? `${defaultRoot}/${targetName}`;
}

function pathContains(ownerPath, currentPath) {
  const normalizedOwner = normalizePath(ownerPath).replace(/^\.\/?/, "").replace(/\/$/, "");
  if (!normalizedOwner) return true;
  return currentPath === normalizedOwner || currentPath.startsWith(`${normalizedOwner}/`);
}

function parseBazelSwiftGraph(files) {
  const swiftPaths = files
    .map((file) => normalizePath(file.path))
    .filter((currentPath) => currentPath.endsWith(".swift"));
  const sourceOwners = new Map();
  const testSources = new Set();
  const rules = [];
  let hasSwiftRules = false;
  let hasSwiftTest = false;

  for (const file of files.filter((candidate) => isBazelBuildFile(candidate.path))) {
    const packageDirectory = path.posix.dirname(normalizePath(file.path)).replace(/^\.$/, "");
    for (const rule of extractBazelSwiftRules(file.content)) {
      hasSwiftRules = true;
      if (rule.kind === "swift_test") hasSwiftTest = true;
      const name = readBazelStringAttribute(rule.body, "name");
      const owner = readBazelStringAttribute(rule.body, "module_name") ?? name;
      const ownedSources = resolveBazelSwiftSources(rule.body, packageDirectory, swiftPaths);
      const label = name ? bazelRuleLabel(packageDirectory, name) : undefined;
      const dependencies = readBazelLabelAttribute(rule.body, "deps").map((dependency) => resolveBazelLabel(packageDirectory, dependency));
      rules.push({ ...rule, label, owner, ownedSources, dependencies });

      for (const sourcePath of ownedSources) {
        if (rule.kind === "swift_test") testSources.add(sourcePath);
        else if (owner) sourceOwners.set(sourcePath, owner);
      }
    }
  }

  const rulesByLabel = new Map(rules.filter((rule) => rule.label).map((rule) => [rule.label, rule]));
  for (const rule of rules.filter((candidate) => candidate.kind === "swift_test" && candidate.ownedSources.size === 0)) {
    for (const dependency of rule.dependencies) {
      for (const sourcePath of rulesByLabel.get(dependency)?.ownedSources ?? []) testSources.add(sourcePath);
    }
  }

  return { hasSwiftRules, hasSwiftTest, sourceOwners, testSources, testDependencies: new Map(), ignoredSources: new Set() };
}

function extractBazelSwiftRules(content) {
  return extractCallBodies(content, /\b(swift_binary|swift_library|swift_test)\s*\(/g);
}

function readBazelStringAttribute(body, attribute) {
  return body.match(new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`))?.[1];
}

function readBazelLabelAttribute(body, attribute) {
  const expression = body.match(new RegExp(`\\b${attribute}\\s*=([\\s\\S]*?)(?:,\\s*\\n\\s*[A-Za-z_]\\w*\\s*=|\\s*$)`))?.[1] ?? "";
  return [...expression.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

function bazelRuleLabel(packageDirectory, name) {
  return `//${packageDirectory}:${name}`;
}

function resolveBazelLabel(packageDirectory, label) {
  if (label.startsWith("//")) return label.includes(":") ? label : `${label}:${label.split("/").at(-1)}`;
  if (label.startsWith(":")) return bazelRuleLabel(packageDirectory, label.slice(1));
  return label;
}

function resolveBazelSwiftSources(body, packageDirectory, swiftPaths) {
  const sourceExpression = body.match(/\bsrcs\s*=([\s\S]*?)(?:,\s*\n\s*[A-Za-z_]\w*\s*=|\s*$)/)?.[1] ?? "";
  const entries = [...sourceExpression.matchAll(/["']([^"']+\.swift)["']/g)].map((match) => match[1]);
  const resolved = new Set();

  for (const entry of entries) {
    const packagePath = path.posix.join(packageDirectory, entry);
    if (!entry.includes("*")) {
      if (swiftPaths.includes(packagePath)) resolved.add(packagePath);
      continue;
    }
    const pattern = new RegExp(`^${escapeRegex(packagePath).replaceAll("\\*\\*", ".*").replaceAll("\\*", "[^/]*")}$`);
    for (const swiftPath of swiftPaths) {
      if (pattern.test(swiftPath)) resolved.add(swiftPath);
    }
  }

  return resolved;
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, "\\$&");
}

function isBazelWorkspaceFile(currentPath) {
  const fileName = normalizePath(currentPath).split("/").at(-1);
  return fileName === "MODULE.bazel" || fileName === "WORKSPACE" || fileName === "WORKSPACE.bazel";
}

function isSwiftPmManifestPath(currentPath) {
  return /^Package(?:@swift-\d+(?:\.\d+)*)?\.swift$/.test(normalizePath(currentPath));
}

function isVersionSpecificSwiftPmManifestPath(currentPath) {
  return /^Package@swift-\d+(?:\.\d+)*\.swift$/.test(normalizePath(currentPath));
}

function swiftPmManifestText(files) {
  return files
    .filter((file) => isSwiftPmManifestPath(file.path))
    .sort((a, b) => normalizePath(a.path).localeCompare(normalizePath(b.path)))
    .map((file) => file.content)
    .join("\n");
}

function isBazelBuildFile(currentPath) {
  const fileName = normalizePath(currentPath).split("/").at(-1);
  return fileName === "BUILD" || fileName === "BUILD.bazel";
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
    .filter(isSharedXcodeSchemePath)
    .map((item) => basenameWithoutExtension(item))
    .sort();
  if (schemeNames.length === 0) return undefined;

  const workspaceNames = paths
    .filter(isXcodeWorkspaceDataPath)
    .map((item) => item.split("/").at(-2)?.replace(/\.xcworkspace$/, ""))
    .filter(Boolean);
  const workspaceScheme = schemeNames.find((schemeName) => workspaceNames.includes(schemeName));
  if (workspaceScheme) return workspaceScheme;
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

function detectXcodeWorkspace(paths, scheme) {
  const workspaces = [...new Set(paths
    .filter(isXcodeWorkspaceDataPath)
    .map((item) => item.split("/").at(-2))
    .filter(Boolean))].sort();
  if (workspaces.length === 1) return workspaces[0];
  if (scheme) return workspaces.find((workspace) => basenameWithoutExtension(workspace) === scheme);
  return undefined;
}

function detectXcodeProject(paths, scheme) {
  const projects = [...new Set(paths
    .filter((item) => item.endsWith(".xcodeproj/project.pbxproj"))
    .map((item) => item.split("/").at(-2))
    .filter(Boolean))].sort();
  if (projects.length === 1) return projects[0];
  if (scheme) return projects.find((project) => basenameWithoutExtension(project) === scheme);
  return undefined;
}

function hasXcodeContainer(paths) {
  return paths.some((item) => item.endsWith(".xcodeproj/project.pbxproj") || isXcodeWorkspaceDataPath(item));
}

function isXcodeWorkspaceDataPath(currentPath) {
  const normalized = normalizePath(currentPath);
  return normalized.endsWith(".xcworkspace/contents.xcworkspacedata") && !normalized.includes(".xcodeproj/project.xcworkspace/");
}

function isSharedXcodeSchemePath(currentPath) {
  return /(?:^|\/)xcshareddata\/xcschemes\/[^/]+\.xcscheme$/.test(normalizePath(currentPath));
}

function detectXcodeTestPlan(paths, files, scheme) {
  const testPlanNames = paths
    .filter((item) => item.endsWith(".xctestplan"))
    .map((item) => basenameWithoutExtension(item))
    .sort();
  const schemePlan = scheme ? detectSchemeTestPlan(files, scheme, new Set(testPlanNames)) : undefined;
  if (schemePlan) return schemePlan;
  if (testPlanNames.length === 1) return testPlanNames[0];
  return undefined;
}

function detectSchemeTestPlan(files, scheme, availablePlans) {
  const schemeFile = files.find((file) => isSharedXcodeSchemePath(file.path) && basenameWithoutExtension(file.path) === scheme);
  if (!schemeFile) return undefined;
  const references = [...schemeFile.content.matchAll(/<TestPlanReference\b[^>]*>/g)].flatMap((match) => {
    const reference = match[0].match(/\breference\s*=\s*"(?:container:)?([^"]+\.xctestplan)"/)?.[1];
    if (!reference) return [];
    const name = basenameWithoutExtension(reference);
    if (availablePlans && !availablePlans.has(name)) return [];
    return [{ name, isDefault: /\bdefault\s*=\s*"YES"/.test(match[0]) }];
  });
  const defaultPlans = references.filter((reference) => reference.isDefault);
  if (defaultPlans.length === 1) return defaultPlans[0].name;
  if (references.length === 1) return references[0].name;
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

function isGeneratedSwiftSource(currentPath, content) {
  const lowerPath = normalizePath(currentPath).toLowerCase();
  const pathSegments = lowerPath.split("/");
  if (pathSegments.some((segment) => [".generated", "derivedsources", "generated", "generatedsources"].includes(segment))) return true;
  if (/\.(?:generated|grpc|pb)\.swift$/.test(lowerPath)) return true;
  const header = content.split(/\r?\n/).slice(0, 12).join("\n");
  return /\b(?:automatically\s+generated|generated\s+(?:by|from|using)|machine-generated)\b|\bdo\s+not\s+edit\b/i.test(header);
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
  const hasMongoOperation = hasMongoDbHandle || hasMongoQueryDocument || /\baggregate\s*\(|\bfilter\s*\(\s*\.custom\b|\$regex|\b(insertOne|updateOne|updateMany|deleteOne|deleteMany|bulkWrite)\s*\(/.test(content);

  if ((!hasMongoImport && !hasMongoDbHandle && !hasMongoQueryDocument) || !hasMongoOperation) return [];

  signals.add("mongodb-query");
  if (/\baggregate\s*\(|"\$(match|lookup|group|unwind|project|sortArray|slice|push)"/.test(content)) signals.add("mongodb-aggregation");
  if (/\bfilter\s*\(\s*\.custom\b|\$regex|NSRegularExpression|queryDocument/.test(content)) signals.add("mongodb-dynamic-filter");
  if (/\.(limit|offset|skip|sort)\s*\(/.test(content)) signals.add("pagination-or-sort");
  if (/\b(create|update|save|delete)\s*\(\s*on:\s*[^)]*\.mongo\b|\b(insertOne|updateOne|updateMany|deleteOne|deleteMany|bulkWrite)\s*\(/.test(content)) signals.add("mongodb-write");
  return [...signals].sort();
}

function detectDatabaseSignals(content) {
  const signals = new Set(detectMongoSignals(content));
  const hasFluentContext = /^\s*(?:@testable\s+)?import\s+(?:Fluent|FluentKit|Fluent[A-Za-z]+Driver)\b/m.test(content);
  const hasSqlContext = /^\s*import\s+(?:SQLKit|PostgresKit|MySQLKit|SQLiteKit)\b/m.test(content) || /\bSQLDatabase\b|\.sql\(\)/.test(content);
  const hasQuery = /\.query\s*\(\s*on:|\b(?:Model|Database)QueryBuilder\b|\.filter\s*\(|\.join\s*\(/.test(content);
  const hasRead = hasQuery || /\.(?:find|all|first|count|paginate)\s*\(/.test(content);
  const hasWrite = /\.(?:create|save|update|delete)\s*\(\s*on:|\b(?:insert|update|delete)\s*\(/.test(content);
  const hasTransaction = /\b(?:withTransaction|transaction)\s*(?:\(|\{)/.test(content);
  const hasRawSql = hasSqlContext && /\b(?:SQLQueryString|SQLRawBuilder)\b|\.raw\s*\(|\.execute\s*\(/.test(content);
  const hasDatabaseOperation = hasRead || hasWrite || hasTransaction || hasRawSql || signals.size > 0;

  if ((!hasFluentContext && !hasSqlContext && signals.size === 0) || !hasDatabaseOperation) return [];

  signals.add("database-access");
  if (hasQuery && hasFluentContext) signals.add("fluent-query");
  if (hasRead) signals.add("database-read");
  if (hasWrite || signals.has("mongodb-write")) signals.add("database-write");
  if (hasTransaction) signals.add("database-transaction");
  if (hasRawSql) signals.add("raw-sql");
  if (/\.(?:limit|offset|skip|sort|paginate)\s*\(/.test(content)) signals.add("pagination-or-sort");
  for (const driver of detectDatabaseDrivers(content)) signals.add(`database-driver-${driver}`);
  return [...signals].sort();
}

function detectDatabaseDrivers(content) {
  const drivers = new Set();
  if (/FluentPostgresDriver|PostgresKit|fluent-postgres-driver|\.psql\b/i.test(content)) drivers.add("postgresql");
  if (/FluentMySQLDriver|MySQLKit|fluent-mysql-driver|\.mysql\b/i.test(content)) drivers.add("mysql");
  if (/FluentSQLiteDriver|SQLiteKit|fluent-sqlite-driver|\.sqlite\b/i.test(content)) drivers.add("sqlite");
  if (/MongoKitten|FluentMongoDriver|MongoSwift|fluent-mongo-driver|mongo-swift-driver|mongodb-vapor|\.mongo\b/i.test(content)) drivers.add("mongodb");
  return [...drivers].sort();
}

function hasFluentPersistence(content) {
  return /\bFluent\b|fluent(?:-[a-z]+)?\.git|fluent-[a-z]+-driver/i.test(content) || detectDatabaseSignals(content).length > 0;
}

function hasHighRiskDatabaseSemantics(signals) {
  return ["database-transaction", "database-write", "mongodb-aggregation", "mongodb-dynamic-filter", "raw-sql"].some((signal) => signals.includes(signal));
}

function isReactiveStreamsSource(currentPath, content) {
  return (
    /^\s*(?:@testable\s+)?import\s+(?:RxSwift|RxCocoa|RxRelay|RxTest|RxBlocking|ReactiveSwift|ReactiveCocoa)\b/m.test(content) ||
    /(?:^|\/)Rx(?:Swift|Cocoa|Relay|Test|Blocking)(?:\/|$)/.test(normalizePath(currentPath)) ||
    /\b(?:class|struct|enum|protocol)\s+(?:Observable|Observer|Subject|Relay|Signal|SignalProducer|Disposable|Scheduler)\b/.test(content)
  );
}

function databaseReasons(signals) {
  const reasons = [];
  if (signals.includes("database-access")) reasons.push("database access behavior");
  if (signals.includes("fluent-query")) reasons.push("Fluent query semantics");
  if (signals.includes("database-transaction")) reasons.push("transaction and rollback behavior");
  if (signals.includes("raw-sql")) reasons.push("raw SQL semantics");
  if (signals.includes("mongodb-query")) reasons.push("MongoDB-specific query semantics");
  if (signals.includes("mongodb-aggregation")) reasons.push("aggregation pipeline semantics");
  if (signals.includes("mongodb-dynamic-filter")) reasons.push("dynamic BSON filter construction");
  if (signals.includes("pagination-or-sort")) reasons.push("pagination or sorting behavior");
  if (signals.includes("database-write")) reasons.push("database write/update behavior");
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
