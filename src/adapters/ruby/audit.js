import fs from "node:fs";
import path from "node:path";

const RUBY_SOURCE_EXTENSION = ".rb";
const RUBY_REQUIRE_GRAPH_DEPTH = 3;
const MINITEST_ASSERTION_METHODS = [
  "assert",
  "assert_empty",
  "assert_equal",
  "assert_in_delta",
  "assert_in_epsilon",
  "assert_includes",
  "assert_instance_of",
  "assert_kind_of",
  "assert_match",
  "assert_nil",
  "assert_operator",
  "assert_output",
  "assert_path_exists",
  "assert_predicate",
  "assert_raises",
  "assert_respond_to",
  "assert_same",
  "assert_silent",
  "assert_throws",
  "refute",
  "refute_empty",
  "refute_equal",
  "refute_in_delta",
  "refute_in_epsilon",
  "refute_includes",
  "refute_instance_of",
  "refute_kind_of",
  "refute_match",
  "refute_nil",
  "refute_operator",
  "refute_path_exists",
  "refute_predicate",
  "refute_respond_to",
  "refute_same"
];
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
  const evidenceBySourcePath = collectRubyTestEvidence(files, sourceFiles, runnableTests);
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
        ? [...classification.reasons, rubyEvidenceReason(existingTestEvidence)]
        : classification.reasons,
      existingTestPaths,
      ...(existingTestEvidence.length > 0 ? { existingTestEvidence } : {})
    };

    if (existingTestPaths.length > 0) coveredButRisky.push(target);
    else untestedCandidates.push(target);

    if (classification.risk === "high") {
      const coverageState = rubyCoverageState(existingTestEvidence);
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
    normalized === ".rspec" ||
    normalized === "Gemfile" ||
    normalized === "Gemfile.lock" ||
    normalized === "Rakefile" ||
    (!normalized.includes("/") && normalized.endsWith(".gemspec"));
}

function buildProfile(root, files, sourceFiles, runnableTests) {
  const gemfile = files.find((file) => file.path === "Gemfile");
  const lockfile = files.find((file) => file.path === "Gemfile.lock");
  const rspecOptions = files.find((file) => file.path === ".rspec");
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
  if (rspecOptions) setupSignals.push(".rspec");
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

function collectRubyTestEvidence(files, sourceFiles, runnableTests) {
  const gemfile = files.find((file) => file.path === "Gemfile");
  const rootGemspecs = files.filter((file) => !file.path.includes("/") && file.path.endsWith(".gemspec"));
  const hasBundledLibraryLoadPath = rootGemspecs.length === 1 && /^\s*gemspec(?:\s|$)/m.test(
    maskRubyCommentsAndStrings(gemfile?.content ?? "")
  );
  const rubyFilesByPath = new Map(
    files
      .filter((file) => file.path.endsWith(RUBY_SOURCE_EXTENSION))
      .map((file) => [normalizePath(file.path), file])
  );
  const configuredRSpecHelpers = collectConfiguredRSpecHelpers(
    files.find((file) => file.path === ".rspec")?.content ?? "",
    rubyFilesByPath
  );
  const declarationsBySourcePath = new Map(
    sourceFiles.map((file) => [normalizePath(file.path), collectRubySourceDeclarations(file.content)])
  );
  const constantsBySourcePath = new Map(
    [...declarationsBySourcePath].map(([sourcePath, declarations]) => [sourcePath, [...declarations.keys()]])
  );
  const sourcesByBasename = new Map();
  for (const sourceFile of sourceFiles) {
    const basename = basenameWithoutExtension(sourceFile.path);
    const matches = sourcesByBasename.get(basename) ?? [];
    matches.push(sourceFile.path);
    sourcesByBasename.set(basename, matches);
  }

  const evidenceByPath = new Map();
  for (const testFile of runnableTests) {
    const reachableSources = collectReachableRubySources(
      testFile,
      rubyFilesByPath,
      hasBundledLibraryLoadPath,
      testFile.framework === "rspec" ? configuredRSpecHelpers : []
    );
    const reachableOwnersByConstant = new Map();
    for (const sourcePath of reachableSources.keys()) {
      for (const constant of constantsBySourcePath.get(sourcePath) ?? []) {
        const owners = reachableOwnersByConstant.get(constant) ?? [];
        owners.push(sourcePath);
        reachableOwnersByConstant.set(constant, owners);
      }
    }

    const maskedTest = maskRubyCommentsAndStrings(testFile.content);
    const runnableBodies = collectRubyRunnableBodies(testFile, maskedTest);
    for (const [sourcePath, depth] of reachableSources) {
      let usage;
      let hasUniqueReferencedConstant = false;
      for (const constant of constantsBySourcePath.get(sourcePath) ?? []) {
        if (reachableOwnersByConstant.get(constant)?.length !== 1 || !hasRubyConstantReference(maskedTest, constant)) {
          continue;
        }
        hasUniqueReferencedConstant = true;
        usage = strongerRubyUsage(
          usage,
          findRubyConstantUsage(
            runnableBodies,
            constant,
            declarationsBySourcePath.get(sourcePath)?.get(constant) ?? new Set(),
            testFile.framework
          )
        );
      }
      if (!hasUniqueReferencedConstant) continue;
      addRubyEvidence(evidenceByPath, sourcePath, {
        testPath: testFile.path,
        kind: "ruby-constant-reference",
        strength: depth === 1 ? "direct" : "referenced",
        ...(usage ? { usage } : {})
      });
    }

    const basename = basenameWithoutExtension(testFile.path).replace(/_(?:test|spec)$/, "");
    const sourcePaths = sourcesByBasename.get(basename) ?? [];
    if (sourcePaths.length !== 1) continue;
    const existing = evidenceByPath.get(sourcePaths[0]) ?? [];
    if (existing.some((evidence) => evidence.testPath === testFile.path)) continue;
    addRubyEvidence(evidenceByPath, sourcePaths[0], {
      testPath: testFile.path,
      kind: "filename-convention",
      strength: "naming"
    });
  }
  return evidenceByPath;
}

function collectConfiguredRSpecHelpers(content, rubyFilesByPath) {
  const helpers = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*--require(?:=|\s+)([A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*)\s*(?:#.*)?$/);
    if (!match) continue;
    if (match[1].split("/").some((segment) => segment === "." || segment === "..")) continue;
    const request = withRubyExtension(match[1]);
    const candidates = [...new Set([request, `spec/${request}`])]
      .map(normalizePath)
      .filter((candidate) => rubyFilesByPath.has(candidate));
    if (candidates.length === 1) helpers.push(rubyFilesByPath.get(candidates[0]));
  }
  return helpers.sort((left, right) => left.path.localeCompare(right.path));
}

function collectReachableRubySources(testFile, rubyFilesByPath, hasBundledLibraryLoadPath, configuredHelpers = []) {
  const visitedDepth = new Map([[normalizePath(testFile.path), 0]]);
  const sourceDepth = new Map();
  const queue = [{ file: testFile, depth: 0 }];
  for (const helper of configuredHelpers) {
    const helperPath = normalizePath(helper.path);
    if ((visitedDepth.get(helperPath) ?? Infinity) <= 1) continue;
    visitedDepth.set(helperPath, 1);
    queue.push({ file: helper, depth: 1 });
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.depth >= RUBY_REQUIRE_GRAPH_DEPTH) continue;
    for (const requirement of collectLiteralRubyRequires(current.file.content)) {
      const requiredPath = resolveOwnedRubyRequire(
        current.file.path,
        requirement,
        rubyFilesByPath,
        hasBundledLibraryLoadPath
      );
      if (!requiredPath) continue;
      const nextDepth = current.depth + 1;
      if (isSourceFile(requiredPath)) {
        sourceDepth.set(requiredPath, Math.min(sourceDepth.get(requiredPath) ?? Infinity, nextDepth));
      }
      if (nextDepth >= RUBY_REQUIRE_GRAPH_DEPTH) continue;
      if ((visitedDepth.get(requiredPath) ?? Infinity) <= nextDepth) continue;
      visitedDepth.set(requiredPath, nextDepth);
      queue.push({ file: rubyFilesByPath.get(requiredPath), depth: nextDepth });
    }
  }

  return new Map([...sourceDepth].sort(([left], [right]) => left.localeCompare(right)));
}

function collectLiteralRubyRequires(content) {
  const requirements = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(require|require_relative)\s*(?:\(\s*)?(["'])([^"'\\]+)\2\s*\)?\s*(?:#.*)?$/);
    if (!match || match[3].includes("#{")) continue;
    requirements.push({ kind: match[1], request: match[3] });
  }
  return requirements;
}

function resolveOwnedRubyRequire(fromPath, requirement, rubyFilesByPath, hasBundledLibraryLoadPath) {
  let candidate;
  if (requirement.kind === "require") {
    if (!hasBundledLibraryLoadPath) return undefined;
    if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(requirement.request)) return undefined;
    candidate = `lib/${withRubyExtension(requirement.request)}`;
  } else {
    if (!/^[A-Za-z0-9_./-]+$/.test(requirement.request)) return undefined;
    candidate = path.posix.normalize(path.posix.join(path.posix.dirname(normalizePath(fromPath)), withRubyExtension(requirement.request)));
    if (candidate === ".." || candidate.startsWith("../") || path.posix.isAbsolute(candidate)) return undefined;
  }
  const normalized = normalizePath(candidate);
  return rubyFilesByPath.has(normalized) ? normalized : undefined;
}

function withRubyExtension(request) {
  return request.endsWith(RUBY_SOURCE_EXTENSION) ? request : `${request}${RUBY_SOURCE_EXTENSION}`;
}

function collectRubySourceDeclarations(content) {
  const declarations = new Map();
  const stack = [];
  for (const line of maskRubyCommentsAndStrings(content).split(/\r?\n/)) {
    const indentation = line.match(/^( *)\S/);
    if (!indentation) continue;
    const indent = indentation[1].length;
    while (stack.length > 0 && stack.at(-1).indent >= indent) stack.pop();

    const constantMatch = line.match(/^( *)(class|module)\s+((?:::)?[A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*)\b/);
    if (constantMatch) {
      const parent = stack.at(-1);
      if (parent?.kind === "method") {
        stack.push({ indent, kind: "method" });
        continue;
      }
      const declared = constantMatch[3].replace(/^::/, "");
      const parentConstant = parent?.constant;
      const constant = constantMatch[3].startsWith("::") || !parentConstant
        ? declared
        : `${parentConstant}::${declared}`;
      if (!declarations.has(constant)) declarations.set(constant, new Set());
      stack.push({ indent, kind: "constant", constant, declarationKind: constantMatch[2] });
      continue;
    }

    if (/^( *)class\s*<<\s*self\b/.test(line)) {
      const parent = stack.at(-1);
      stack.push(parent?.kind === "constant"
        ? { indent, kind: "singleton", constant: parent.constant }
        : { indent, kind: "method" });
      continue;
    }

    const methodMatch = line.match(/^( *)def\s+(?:(self)\.)?([a-z_][A-Za-z0-9_]*[!?=]?)(?![A-Za-z0-9_!?=])/);
    if (!methodMatch) continue;
    const scope = stack.at(-1);
    const directScope = scope && indent === scope.indent + 2;
    if (directScope && scope.kind === "constant" && methodMatch[2]) {
      declarations.get(scope.constant)?.add(methodMatch[3]);
    } else if (directScope && scope.kind === "singleton" && !methodMatch[2]) {
      declarations.get(scope.constant)?.add(methodMatch[3]);
    } else if (
      directScope &&
      scope.kind === "constant" &&
      scope.declarationKind === "class" &&
      methodMatch[3] === "initialize"
    ) {
      declarations.get(scope.constant)?.add("new");
    }
    stack.push({ indent, kind: "method" });
  }
  return new Map(
    [...declarations]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([constant, methods]) => [constant, new Set([...methods].sort())])
  );
}

function collectRubyRunnableBodies(testFile, maskedContent) {
  const lines = maskedContent.split(/\r?\n/);
  const bodies = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (testFile.framework === "minitest") {
      const match = line.match(/^( *)def\s+test_[A-Za-z0-9_!?]+\s*(?:\([^)]*\))?\s*$/);
      if (!match) continue;
      const close = findRubyIndentedEnd(lines, index, match[1].length);
      if (close !== -1) bodies.push(lines.slice(index + 1, close).join("\n"));
      continue;
    }

    const example = line.match(/^( *)\s*(?:it|specify)\b/);
    if (!example) continue;
    const openBrace = line.indexOf("{");
    const closeBrace = line.lastIndexOf("}");
    if (openBrace !== -1 && closeBrace > openBrace) {
      bodies.push(line.slice(openBrace + 1, closeBrace));
      continue;
    }
    if (!/\bdo\b/.test(line)) continue;
    const close = findRubyIndentedEnd(lines, index, example[1].length);
    if (close !== -1) bodies.push(lines.slice(index + 1, close).join("\n"));
  }
  return bodies;
}

function findRubyIndentedEnd(lines, startIndex, indent) {
  const endPattern = new RegExp(`^ {${indent}}end\\b`);
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (endPattern.test(lines[index])) return index;
  }
  return -1;
}

function findRubyConstantUsage(runnableBodies, constant, declaredMethods, framework) {
  if (declaredMethods.size === 0) return undefined;
  const escapedConstant = escapeRegex(constant);
  let usage;
  for (const body of runnableBodies) {
    const lines = body.split(/\r?\n/);
    const deferredLines = collectDeferredRubyLines(lines);
    for (const method of declaredMethods) {
      const callPattern = new RegExp(
        `(?:^|[^A-Za-z0-9_:])(?:::)?${escapedConstant}\\s*\\.\\s*${escapeRegex(method)}(?![A-Za-z0-9_!?=])`
      );
      const directCallPattern = new RegExp(
        `^\\s*(?:::)?${escapedConstant}\\s*\\.\\s*${escapeRegex(method)}(?![A-Za-z0-9_!?=])`
      );
      const callLines = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line, index }) => !deferredLines.has(index) && callPattern.test(line));
      if (callLines.length === 0) continue;
      usage = strongerRubyUsage(usage, "called");
      if (callLines.some(({ line }) => isRubyAssertionLine(line, framework))) return "asserted";
      if (hasStableAssertedRubyResult(lines, directCallPattern, framework)) return "asserted";
    }
  }
  return usage;
}

function collectDeferredRubyLines(lines) {
  const deferred = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^( *).*(?:\blambda\b|->)\s*(?:\([^)]*\)\s*)?(do\b|\{)/);
    if (!match) continue;
    deferred.add(index);
    if (match[2] === "do") {
      const close = findRubyIndentedEnd(lines, index, match[1].length);
      for (let current = index + 1; current <= close; current += 1) deferred.add(current);
    } else if (!lines[index].includes("}")) {
      const closePattern = new RegExp(`^ {${match[1].length}}\\}`);
      for (let current = index + 1; current < lines.length; current += 1) {
        deferred.add(current);
        if (closePattern.test(lines[current])) break;
      }
    }
  }
  return deferred;
}

function hasStableAssertedRubyResult(lines, directCallPattern, framework) {
  for (let index = 0; index < lines.length; index += 1) {
    const assignment = lines[index].match(/^\s*([a-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!assignment || !isDirectRubyCallExpression(assignment[2], directCallPattern)) continue;
    const local = assignment[1];
    const mutation = new RegExp(`^\\s*${escapeRegex(local)}\\s*(?:\\|\\|=|&&=|[+\\-*/%]=|=(?!=|~|>))`);
    if (lines.filter((line) => mutation.test(line)).length !== 1) continue;
    const reference = new RegExp(`(?:^|[^A-Za-z0-9_])${escapeRegex(local)}(?![A-Za-z0-9_])`);
    if (lines.slice(index + 1).some((line) => isRubyAssertionLine(line, framework) && reference.test(line))) {
      return true;
    }
  }
  return false;
}

function isDirectRubyCallExpression(expression, directCallPattern) {
  const match = expression.match(directCallPattern);
  if (!match) return false;
  const remainder = expression.slice(match[0].length).trim();
  if (remainder === "") return true;
  if (!remainder.startsWith("(")) return false;
  const close = findClosingRubyParenthesis(remainder);
  return close !== -1 && remainder.slice(close + 1).trim() === "";
}

function findClosingRubyParenthesis(expression) {
  let depth = 0;
  for (let index = 0; index < expression.length; index += 1) {
    if (expression[index] === "(") depth += 1;
    else if (expression[index] === ")") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function isRubyAssertionLine(line, framework) {
  if (framework === "rspec") return /^\s*expect\s*(?:\(|\{)/.test(line);
  const methods = MINITEST_ASSERTION_METHODS.map(escapeRegex).join("|");
  return new RegExp(`^\\s*(?:${methods})\\s*(?:\\(|\\b)`).test(line);
}

function strongerRubyUsage(left, right) {
  if (left === "asserted" || right === "asserted") return "asserted";
  return left ?? right;
}

function hasRubyConstantReference(maskedContent, constant) {
  const escaped = escapeRegex(constant);
  return new RegExp(`(?:^|[^A-Za-z0-9_:])(?:::)?${escaped}(?![A-Za-z0-9_:])`, "m").test(maskedContent);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addRubyEvidence(evidenceByPath, sourcePath, evidence) {
  const current = evidenceByPath.get(sourcePath) ?? [];
  current.push(evidence);
  current.sort((left, right) => left.testPath.localeCompare(right.testPath) || left.strength.localeCompare(right.strength));
  evidenceByPath.set(sourcePath, current);
}

function rubyEvidenceReason(evidence) {
  if (evidence.some((item) => item.usage === "asserted")) {
    return "Existing exact Ruby method-call and assertion evidence detected; review behavioral coverage";
  }
  if (evidence.some((item) => item.usage === "called")) {
    return "Existing exact Ruby method-call evidence detected; review behavioral coverage";
  }
  return evidence.some((item) => item.kind === "ruby-constant-reference")
    ? "Existing exact Ruby require and constant-reference evidence detected; review behavioral coverage"
    : "Existing Ruby test naming evidence detected; review behavioral coverage";
}

function rubyCoverageState(evidence) {
  if (evidence.some((item) => item.usage === "asserted")) return "has exact Ruby method-call and assertion evidence";
  if (evidence.some((item) => item.usage === "called")) return "has exact Ruby method-call evidence";
  if (evidence.some((item) => item.strength === "direct")) return "has direct Ruby require and constant-reference evidence";
  if (evidence.some((item) => item.strength === "referenced")) return "has bounded Ruby require-graph and constant-reference evidence";
  if (evidence.length > 0) return "has only naming-level Ruby test evidence";
  return "has no matching Ruby test evidence";
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
