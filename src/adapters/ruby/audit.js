import fs from "node:fs";
import path from "node:path";

const RUBY_SOURCE_EXTENSION = ".rb";
const IGNORED_DIRECTORIES = new Set([
  ".bundle",
  ".git",
  ".idea",
  ".vscode",
  "coverage",
  "log",
  "node_modules",
  "pkg",
  "tmp",
  "vendor"
]);

export function auditRubyRepo(root, options = {}) {
  const files = readRepoFiles(root);
  const sourceFiles = files.filter((file) => isSourceFile(file.path));
  const testFiles = files.filter((file) => isTestFile(file.path));
  const runnableTests = testFiles
    .map((file) => ({ ...file, framework: detectRunnableTestFramework(file) }))
    .filter((file) => file.framework);
  const profile = buildProfile(root, files, sourceFiles, runnableTests);
  const evidenceBySourcePath = collectRubyTestEvidence(sourceFiles, runnableTests);
  const changedPaths = options.changedPaths
    ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(root, currentPath)))
    : undefined;
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];

  for (const file of sourceFiles.filter((candidate) => isIncludedByChangedPaths(candidate.path, changedPaths))) {
    const classification = classifySourceFile(file);
    const name = basenameWithoutExtension(file.path);
    const existingTestEvidence = evidenceBySourcePath.get(normalizePath(file.path)) ?? [];
    const existingTestPaths = [...new Set(existingTestEvidence.map((evidence) => evidence.testPath))];

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
        ...(classification.preferredCoveragePath
          ? { preferredCoveragePath: classification.preferredCoveragePath }
          : {})
      });
      continue;
    }

    const target = {
      id: file.path,
      name,
      path: file.path,
      kind: classification.kind,
      signals: existingTestPaths.length > 0
        ? [...classification.signals, "matching-test"]
        : classification.signals,
      risk: classification.risk,
      testability: classification.testability,
      recommendedTestLevel: classification.testLevel,
      riskReductionScore: classification.riskReductionScore,
      maintenanceCost: classification.maintenanceCost,
      reasons: existingTestPaths.length > 0
        ? [...classification.reasons, "Existing Ruby test naming evidence detected; review behavioral coverage"]
        : classification.reasons,
      existingTestPaths,
      ...(existingTestEvidence.length > 0 ? { existingTestEvidence } : {})
    };

    if (existingTestPaths.length > 0) coveredButRisky.push(target);
    else untestedCandidates.push(target);

    if (classification.risk === "high") {
      const coverageState = existingTestPaths.length > 0
        ? "has only naming-level Ruby test evidence"
        : "has no matching Ruby test evidence";
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
    skipped: skipped.sort((left, right) => left.path.localeCompare(right.path)),
    risks
  };
}

function readRepoFiles(root) {
  const files = [];

  function visit(current) {
    if (current !== root && fs.existsSync(path.join(current, "Gemfile"))) return;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      const relative = normalizePath(path.relative(root, absolute));
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (shouldRead(relative)) {
        files.push({ path: relative, content: fs.readFileSync(absolute, "utf8") });
      }
    }
  }

  visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function shouldRead(currentPath) {
  const normalized = normalizePath(currentPath);
  return normalized.endsWith(RUBY_SOURCE_EXTENSION) ||
    normalized === "Gemfile" ||
    normalized === "Gemfile.lock" ||
    normalized === "Rakefile" ||
    (!normalized.includes("/") && normalized.endsWith(".gemspec"));
}

function buildProfile(root, files, sourceFiles, runnableTests) {
  const gemfile = files.find((file) => file.path === "Gemfile");
  const lockfile = files.find((file) => file.path === "Gemfile.lock");
  const rakefile = files.find((file) => file.path === "Rakefile");
  const gemspecs = files.filter((file) => !file.path.includes("/") && file.path.endsWith(".gemspec"));
  const conventionalTestTask = detectConventionalTestTask(rakefile?.content ?? "");
  const frameworks = [...new Set(runnableTests.map((file) => file.framework))].sort();
  const declaredFrameworks = detectDeclaredFrameworks(
    gemfile?.content ?? "",
    lockfile?.content ?? "",
    gemspecs.map((file) => file.content)
  );
  const blockers = [];

  if (!gemfile) blockers.push("No root Gemfile detected for the bounded Ruby Bundler adapter.");
  if (sourceFiles.length === 0) blockers.push("No conventional Ruby source files detected under lib/.");
  if (runnableTests.length === 0) blockers.push("No runnable conventional Minitest or RSpec test detected.");
  if (frameworks.length > 1) blockers.push("Mixed Minitest and RSpec execution is outside the first bounded Ruby command matrix.");
  if (gemspecs.length > 1) blockers.push("Multiple root gemspecs require explicit Ruby package ownership.");
  for (const framework of frameworks) {
    if (!declaredFrameworks.has(framework)) {
      blockers.push(`${frameworkName(framework)} must be statically declared in Gemfile, Gemfile.lock, or the root gemspec before command ownership is complete.`);
    }
  }
  if (files.some((file) => file.path === "config/application.rb") || /\bgem\s*\(?\s*["']rails["']/.test(gemfile?.content ?? "")) {
    blockers.push("Rails application ownership is outside the first conventional Ruby adapter slice.");
  }

  const existingTestLocations = [];
  if (runnableTests.some((file) => file.path.startsWith("test/"))) existingTestLocations.push("test/ Minitest files");
  if (runnableTests.some((file) => file.path.startsWith("spec/"))) existingTestLocations.push("spec/ RSpec files");
  const detectedConventions = [];
  if (sourceFiles.length > 0) detectedConventions.push("lib/ source layout");
  if (existingTestLocations.includes("test/ Minitest files")) detectedConventions.push("*_test.rb naming");
  if (existingTestLocations.includes("spec/ RSpec files")) detectedConventions.push("*_spec.rb naming");
  if (conventionalTestTask) detectedConventions.push(`${conventionalTestTask} test command`);
  const setupSignals = [];
  if (gemfile) setupSignals.push("Gemfile");
  if (lockfile) setupSignals.push("Gemfile.lock");
  if (gemspecs.length === 1) setupSignals.push(gemspecs[0].path);
  if (rakefile) setupSignals.push("Rakefile");
  const testCommand = blockers.length === 0
    ? selectTestCommand(frameworks[0], conventionalTestTask)
    : undefined;

  return {
    root,
    languages: ["ruby"],
    packageManagers: gemfile ? ["bundler"] : [],
    testFrameworks: frameworks,
    architectures: gemspecs.length === 1 ? ["ruby-gem"] : ["ruby-application"],
    ...(testCommand ? { testCommand } : {}),
    detectedConventions,
    existingTestLocations,
    setupSignals,
    confidence: scoreProfileConfidence(gemfile, sourceFiles, runnableTests, blockers),
    blockers
  };
}

function detectDeclaredFrameworks(gemfileContent, lockfileContent, gemspecContents) {
  const declared = new Set();
  const gemspecContent = gemspecContents.join("\n");
  if (
    /\bgem\s*\(?\s*["']minitest["']/.test(gemfileContent) ||
    /^\s{4}minitest\s+\(/m.test(lockfileContent) ||
    /\.\s*add_(?:development_)?dependency\s*\(?\s*["']minitest["']/.test(gemspecContent)
  ) {
    declared.add("minitest");
  }
  if (
    /\bgem\s*\(?\s*["']rspec(?:-core)?["']/.test(gemfileContent) ||
    /^\s{4}rspec(?:-core)?\s+\(/m.test(lockfileContent) ||
    /\.\s*add_(?:development_)?dependency\s*\(?\s*["']rspec(?:-core)?["']/.test(gemspecContent)
  ) {
    declared.add("rspec");
  }
  return declared;
}

function detectRunnableTestFramework(file) {
  const masked = maskRubyCommentsAndStrings(file.content);
  if (file.path.startsWith("test/") && file.path.endsWith("_test.rb")) {
    const hasCase = /<\s*(?:::)?Minitest::Test\b/.test(masked);
    const hasTestMethod = /^\s*def\s+test_[A-Za-z0-9_!?]+/m.test(masked);
    if (hasCase && hasTestMethod) return "minitest";
  }
  if (file.path.startsWith("spec/") && file.path.endsWith("_spec.rb")) {
    const hasGroup = /\b(?:RSpec\.)?describe\b/.test(masked);
    const hasExample = /\b(?:it|specify)\s*(?:\(|do\b|\{)/.test(masked);
    if (hasGroup && hasExample) return "rspec";
  }
  return undefined;
}

function selectTestCommand(framework, conventionalTestTask) {
  if (framework === "rspec") return "bundle exec rspec";
  if (framework === "minitest" && conventionalTestTask) return "bundle exec rake test";
  if (framework === "minitest") {
    return "bundle exec ruby -Itest -e 'Dir[\"test/**/*_test.rb\"].sort.each { |file| require_relative file }'";
  }
  return undefined;
}

function detectConventionalTestTask(content) {
  const masked = maskRubyCommentsAndStrings(content);
  if (/\bRake::TestTask\.new\s*(?:\(\s*:test\s*\))?\s*(?:do\b|\{)/.test(masked)) return "Rake::TestTask";
  if (/\bMinitest::TestTask\.create\s*(?:\(\s*:test\s*\))?\s*(?:do\b|\{)/.test(masked)) return "Minitest::TestTask";
  return undefined;
}

function collectRubyTestEvidence(sourceFiles, runnableTests) {
  const sourcesByBasename = new Map();
  for (const sourceFile of sourceFiles) {
    const basename = basenameWithoutExtension(sourceFile.path);
    const matches = sourcesByBasename.get(basename) ?? [];
    matches.push(sourceFile.path);
    sourcesByBasename.set(basename, matches);
  }

  const evidenceByPath = new Map();
  for (const testFile of runnableTests) {
    const basename = basenameWithoutExtension(testFile.path).replace(/_(?:test|spec)$/, "");
    const sourcePaths = sourcesByBasename.get(basename) ?? [];
    if (sourcePaths.length !== 1) continue;
    const evidence = evidenceByPath.get(sourcePaths[0]) ?? [];
    evidence.push({
      testPath: testFile.path,
      kind: "filename-convention",
      strength: "naming"
    });
    evidenceByPath.set(sourcePaths[0], evidence);
  }
  return evidenceByPath;
}

function classifySourceFile(file) {
  const masked = maskRubyCommentsAndStrings(file.content);
  const lowerName = basenameWithoutExtension(file.path).toLowerCase();
  if (/(?:automatically generated|code generated|@generated)/i.test(file.content)) {
    return skipped("generated-code", ["generated-code"], 0, 5, "Generated Ruby source should be tested through its generator or consuming behavior.", "generator and consumer tests");
  }

  const hasMethod = /^\s*def\s+(?:self\.)?[A-Za-z_][A-Za-z0-9_!?=]*/m.test(masked);
  if (!hasMethod) {
    const hasTypeOrConstant = /\b(?:class|module)\s+[A-Z]|^\s*[A-Z][A-Za-z0-9_:]*\s*=/m.test(masked);
    return hasTypeOrConstant
      ? skipped("data-model", ["low-runtime-behavior"], 1, 3, "Ruby declarations without methods are better covered through consuming behavior.", "consuming behavior tests")
      : skipped("module-wiring", ["low-runtime-behavior"], 1, 2, "Ruby requires and module wiring are better covered through consuming behavior.", "consuming module tests");
  }

  const signals = [];
  if (/\b(?:if|unless|case|rescue)\b/.test(masked)) signals.push("branching-logic");
  if (/\b(?:raise|fail)\b/.test(masked)) signals.push("edge-case-surface");
  let kind = "business-logic";
  if (lowerName.includes("parser")) kind = "parser";
  else if (lowerName.includes("validator")) kind = "validator";
  else if (lowerName.includes("service")) kind = "service";
  else if (lowerName.includes("repository")) kind = "repository";
  else if (lowerName.includes("client")) kind = "client";
  else if (/(?:mapper|formatter|converter|normalizer)/.test(lowerName)) kind = "transformation";
  else if (lowerName.includes("calculator")) kind = "calculator";
  signals.unshift(
    ["parser", "validator", "transformation", "calculator"].includes(kind)
      ? "pure-logic"
      : ["service", "client", "repository"].includes(kind)
        ? "service-boundary"
        : "runtime-behavior"
  );

  if (["client", "repository"].includes(kind)) {
    return recommended(kind, [...signals, "external-boundary"], "high", "medium", "integration", 8, 5, ["External boundary behavior", "Failure paths and response mapping"]);
  }
  if (signals.includes("branching-logic") || signals.includes("edge-case-surface")) {
    return recommended(kind, signals, "high", "high", "unit", 8, 3, ["Branching Ruby behavior", "Failure or edge-case behavior"]);
  }
  return recommended(kind, signals, "medium", "high", "unit", 6, 2, ["Deterministic Ruby behavior"]);
}

function maskRubyCommentsAndStrings(content) {
  const characters = [...content];
  let state = "code";
  let quote;
  for (let index = 0; index < characters.length; index += 1) {
    const current = characters[index];
    if (state === "comment") {
      if (current === "\n" || current === "\r") state = "code";
      else characters[index] = " ";
      continue;
    }
    if (state === "string") {
      if (current === "\\") {
        characters[index] = " ";
        if (index + 1 < characters.length && characters[index + 1] !== "\n") {
          characters[index + 1] = " ";
          index += 1;
        }
      } else if (current === quote) {
        characters[index] = " ";
        state = "code";
      } else if (current !== "\n" && current !== "\r") {
        characters[index] = " ";
      }
      continue;
    }
    if (current === "#") {
      characters[index] = " ";
      state = "comment";
    } else if (current === "'" || current === '"') {
      quote = current;
      characters[index] = " ";
      state = "string";
    }
  }
  return characters.join("");
}

function scoreProfileConfidence(gemfile, sourceFiles, runnableTests, blockers) {
  if (gemfile && sourceFiles.length > 0 && runnableTests.length > 0 && blockers.length === 0) return "high";
  if (gemfile || sourceFiles.length > 0 || runnableTests.length > 0) return "medium";
  return "low";
}

function frameworkName(framework) {
  return framework === "rspec" ? "RSpec" : "Minitest";
}

function recommended(kind, signals, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons) {
  return { kind, signals, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons };
}

function skipped(kind, signals, riskReductionScore, maintenanceCost, skipReason, preferredCoveragePath) {
  return { kind, signals, riskReductionScore, maintenanceCost, skipReason, preferredCoveragePath };
}

function isSourceFile(currentPath) {
  return normalizePath(currentPath).startsWith("lib/") && normalizePath(currentPath).endsWith(RUBY_SOURCE_EXTENSION);
}

function isTestFile(currentPath) {
  const normalized = normalizePath(currentPath);
  return (normalized.startsWith("test/") && normalized.endsWith("_test.rb")) ||
    (normalized.startsWith("spec/") && normalized.endsWith("_spec.rb"));
}

function isIncludedByChangedPaths(currentPath, changedPaths) {
  return !changedPaths || changedPaths.has(normalizePath(currentPath));
}

function normalizeChangedPath(root, currentPath) {
  const relative = path.isAbsolute(currentPath) ? path.relative(root, currentPath) : currentPath;
  return normalizePath(relative);
}

function basenameWithoutExtension(currentPath) {
  const normalized = normalizePath(currentPath);
  return path.posix.basename(normalized, path.posix.extname(normalized));
}

function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/");
}

function byRiskThenName(left, right) {
  const riskOrder = { high: 0, medium: 1, low: 2 };
  return (riskOrder[left.risk] ?? 3) - (riskOrder[right.risk] ?? 3) || left.name.localeCompare(right.name);
}
