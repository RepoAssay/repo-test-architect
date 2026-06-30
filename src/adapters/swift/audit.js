import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = [".swift", ".m", ".mm"];

export function auditSwiftRepo(root, options = {}) {
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
    relative.endsWith(".xcodeproj/project.pbxproj")
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

  if (/^\s*import\s+XCTest\b/m.test(sourceText)) {
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
  return [...frameworks].sort();
}

function detectTestCommand(paths, frameworks) {
  if (frameworks.length === 0) return undefined;
  if (paths.includes("Package.swift")) return "swift test";
  if (paths.some((item) => item.endsWith(".xcodeproj/project.pbxproj"))) return "xcodebuild test";
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
  if (packageText.includes("Vapor") || packageText.includes("vapor.git")) signals.add("vapor dependency");
  if (packageText.includes(".product(name: \"XCTVapor\"")) signals.add("xctvapor test support");
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
    return recommended("http-middleware", ["http-middleware", "vapor-middleware"], "high", "medium", "integration", 7, 4, ["HTTP middleware behavior", "Vapor request handling"]);
  }

  if (isVaporRoute(lowerPath, content)) {
    return recommended("http-route", ["http-route", "vapor-route"], "high", "medium", "integration", 8, 5, ["HTTP route behavior", "Vapor request handling"]);
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

function findExistingTests(sourcePath, testPaths) {
  const sourceBase = basenameWithoutExtension(sourcePath);
  return testPaths.filter((testPath) => basenameWithoutExtension(testPath).replace(/Tests?$/, "") === sourceBase);
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

function hasBranching(content) {
  return /\b(if|switch|guard|do|catch)\b|\?\s*[^:]+:/.test(content);
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

function byRiskThenName(a, b) {
  const order = { high: 0, medium: 1, low: 2 };
  return order[a.risk] - order[b.risk] || a.name.localeCompare(b.name);
}
