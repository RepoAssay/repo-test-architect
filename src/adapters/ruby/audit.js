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
  const rootGemspecOwnership = analyzeRootGemspecOwnership(gemfile?.content ?? "", gemspecs);
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
  if (gemspecs.length > 1 && !rootGemspecOwnership.complete) {
    blockers.push("Multiple root gemspecs require a complete set of exact top-level Gemfile name declarations.");
  }
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
  if (gemspecs.length > 1 && rootGemspecOwnership.complete) {
    detectedConventions.push("complete named root gemspec ownership");
  }
  if (conventionalTestTask) detectedConventions.push(`${conventionalTestTask} test command`);
  const setupSignals = [];
  if (gemfile) setupSignals.push("Gemfile");
  if (lockfile) setupSignals.push("Gemfile.lock");
  if (rspecOptions) setupSignals.push(".rspec");
  if (gemspecs.length === 1 || rootGemspecOwnership.complete) {
    setupSignals.push(...gemspecs.map((gemspec) => gemspec.path));
  }
  if (rakefile) setupSignals.push("Rakefile");
  const testCommand = blockers.length === 0
    ? selectTestCommand(frameworks[0], conventionalTestTask)
    : undefined;

  return {
    root,
    languages: ["ruby"],
    packageManagers: gemfile ? ["bundler"] : [],
    testFrameworks: frameworks,
    architectures: gemspecs.length === 1 || rootGemspecOwnership.complete
      ? ["ruby-gem"]
      : ["ruby-application"],
    ...(testCommand ? { testCommand } : {}),
    detectedConventions,
    existingTestLocations,
    setupSignals,
    confidence: scoreProfileConfidence(gemfile, sourceFiles, runnableTests, blockers),
    blockers
  };
}

function analyzeRootGemspecOwnership(gemfileContent, rootGemspecs) {
  const hasGemspecDeclaration = /^\s*gemspec(?:\s|\()/m.test(
    maskRubyCommentsAndStrings(gemfileContent)
  );
  if (rootGemspecs.length <= 1) {
    return {
      complete: rootGemspecs.length === 1,
      hasBundledLibraryLoadPath: rootGemspecs.length === 1 && hasGemspecDeclaration
    };
  }

  const declarationLines = gemfileContent
    .split(/\r?\n/)
    .filter((line) => /^\s*gemspec(?:\s|\()/.test(line));
  const selectedNames = declarationLines
    .map(matchExactRootGemspecNameDeclaration)
    .filter(Boolean);
  const rootNames = rootGemspecs.map((gemspec) => findExactRootGemspecName(gemspec.content));
  const complete = declarationLines.length === rootGemspecs.length &&
    selectedNames.length === declarationLines.length &&
    rootNames.every(Boolean) &&
    new Set(rootNames).size === rootNames.length &&
    new Set(selectedNames).size === selectedNames.length &&
    selectedNames.every((name) => rootNames.includes(name)) &&
    rootNames.every((name) => selectedNames.includes(name));
  return { complete, hasBundledLibraryLoadPath: complete };
}

function findExactRootGemspecName(content) {
  const names = [];
  for (const line of content.split(/\r?\n/)) {
    const constructor = line.match(
      /^\s*Gem::Specification\.new\s*(?:\(\s*)?(["'])([A-Za-z0-9_.-]+)\1(?:\s*,|\s*\))/
    );
    const assignment = line.match(
      /^\s*[a-z_][A-Za-z0-9_]*\.name\s*=\s*(["'])([A-Za-z0-9_.-]+)\1\s*(?:#.*)?$/
    );
    if (constructor) names.push(constructor[2]);
    if (assignment) names.push(assignment[2]);
  }
  const uniqueNames = [...new Set(names)];
  return uniqueNames.length === 1 ? uniqueNames[0] : undefined;
}

function matchExactRootGemspecNameDeclaration(line) {
  const direct = line.match(
    /^gemspec\s+name:\s*(["'])([A-Za-z0-9_.-]+)\1\s*(?:#.*)?$/
  );
  if (direct) return direct[2];
  const parenthesized = line.match(
    /^gemspec\(\s*name:\s*(["'])([A-Za-z0-9_.-]+)\1\s*\)\s*(?:#.*)?$/
  );
  return parenthesized?.[2];
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
  const hasBundledLibraryLoadPath = analyzeRootGemspecOwnership(
    gemfile?.content ?? "",
    rootGemspecs
  ).hasBundledLibraryLoadPath;
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
    const runnableBodies = collectRubyRunnableBodies(testFile, maskedTest, testFile.content);
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
            declarationsBySourcePath.get(sourcePath)?.get(constant) ?? emptyRubyDeclarations(),
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
    const match = line.match(/^(\s*)(require|require_relative)\s*(?:\(\s*)?(["'])([^"'\\]+)\3\s*\)?\s*(?:#.*)?$/);
    if (!match || match[4].includes("#{")) continue;
    requirements.push({ kind: match[2], request: match[4], topLevel: match[1].length === 0 });
  }
  return requirements;
}

function resolveOwnedRubyRequire(fromPath, requirement, rubyFilesByPath, hasBundledLibraryLoadPath) {
  let candidate;
  if (requirement.kind === "require") {
    const normalizedFromPath = normalizePath(fromPath);
    if (
      requirement.topLevel &&
      requirement.request === "spec_helper" &&
      normalizedFromPath.startsWith("spec/") &&
      normalizedFromPath.endsWith("_spec.rb") &&
      rubyFilesByPath.has("spec/spec_helper.rb")
    ) {
      return "spec/spec_helper.rb";
    }
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
  const lines = maskRubyCommentsAndStrings(content).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
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
      if (!declarations.has(constant)) declarations.set(constant, emptyRubyDeclarations());
      declarations.get(constant).declarationKinds.add(constantMatch[2]);
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
    let directSingletonDeclaration;
    if (directScope && scope.kind === "constant" && methodMatch[2]) {
      const declaration = declarations.get(scope.constant);
      declaration?.singletonMethods.add(methodMatch[3]);
      if (methodMatch[3] === "new") declaration.hasDirectSingletonNew = true;
      directSingletonDeclaration = declaration;
    } else if (directScope && scope.kind === "singleton" && !methodMatch[2]) {
      const declaration = declarations.get(scope.constant);
      declaration?.singletonMethods.add(methodMatch[3]);
      if (methodMatch[3] === "new") declaration.hasDirectSingletonNew = true;
      directSingletonDeclaration = declaration;
    } else if (
      directScope &&
      scope.kind === "constant" &&
      scope.declarationKind === "class" &&
      methodMatch[3] === "initialize"
    ) {
      const declaration = declarations.get(scope.constant);
      declaration?.singletonMethods.add("new");
      if (declaration) declaration.hasDirectInitializer = true;
    } else if (directScope && scope.kind === "constant" && !methodMatch[2]) {
      declarations.get(scope.constant)?.instanceMethods.add(methodMatch[3]);
    }
    if (directSingletonDeclaration && methodMatch[3] !== "new") {
      const close = findRubyIndentedEnd(lines, index, indent);
      const body = close === -1
        ? ""
        : lines.slice(index + 1, close).filter((bodyLine) => bodyLine.trim()).join("\n");
      const constructorPattern = /^\s*(?:self\s*\.\s*)?new(?![A-Za-z0-9_!?=])/;
      if (body && isDirectRubyCallExpression(body, constructorPattern)) {
        directSingletonDeclaration.constructorFactoryMethods.add(methodMatch[3]);
      }
    }
    stack.push({ indent, kind: "method" });
  }
  return new Map(
    [...declarations]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([constant, declaration]) => [constant, {
        ...declaration,
        declarationKinds: new Set([...declaration.declarationKinds].sort()),
        singletonMethods: new Set([...declaration.singletonMethods].sort()),
        instanceMethods: new Set([...declaration.instanceMethods].sort()),
        constructorFactoryMethods: new Set([...declaration.constructorFactoryMethods].sort())
      }])
  );
}

function emptyRubyDeclarations() {
  return {
    declarationKinds: new Set(),
    singletonMethods: new Set(),
    instanceMethods: new Set(),
    constructorFactoryMethods: new Set(),
    hasDirectInitializer: false,
    hasDirectSingletonNew: false
  };
}

function collectRubyRunnableBodies(testFile, maskedContent, rawContent) {
  const lines = maskedContent.split(/\r?\n/);
  const rawLines = rawContent.split(/\r?\n/);
  const bodies = [];
  if (testFile.framework === "minitest") {
    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index].match(/^( *)def\s+test_[A-Za-z0-9_!?]+\s*(?:\([^)]*\))?\s*$/);
      if (!match) continue;
      const close = findRubyIndentedEnd(lines, index, match[1].length);
      if (close !== -1) bodies.push({ content: lines.slice(index + 1, close).join("\n") });
    }
    return bodies;
  }

  const hasRSpecMemoizedDeclaration = testFile.framework === "rspec" && lines.some((line) => (
    /^\s*(?:let|subject)!?\s*(?:\(|\{|do\b)/.test(line)
  ));
  const hasRSpecHelperDeclaration = testFile.framework === "rspec" && lines.some((line) => (
    /^\s*def\s+[a-z_][A-Za-z0-9_]*[!?]?\s*(?:\([^)]*\))?\s*$/.test(line)
  ));
  const sharedGroups = collectRubyRSpecSharedRanges(lines);
  const rspecGroups = collectRubyRSpecGroupRanges(lines, sharedGroups);
  const memoizedDeclarations = hasRSpecMemoizedDeclaration
    ? collectRubyRSpecMemoizedDeclarations(lines, rspecGroups, sharedGroups)
    : [];
  const hasOwnedMemoizedDeclaration = memoizedDeclarations.some((declaration) => declaration.constant);
  const helperDeclarations = hasRSpecHelperDeclaration
    ? collectRubyRSpecHelperDeclarations(lines, rspecGroups, sharedGroups)
    : [];
  const hasOwnedHelperDeclaration = helperDeclarations.some((declaration) => declaration.constant);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const example = line.match(/^( *)\s*(?:it|specify)\b/);
    if (!example || sharedGroups.some((group) => rubyRangeContains(group, index))) continue;
    const describedConstant = findRubyRSpecDescribedConstant(lines, index);
    const memoizedReceivers = hasOwnedMemoizedDeclaration
      ? collectRubyRSpecMemoizedReceivers(
        index,
        describedConstant,
        rspecGroups,
        sharedGroups,
        memoizedDeclarations
      )
      : new Map();
    const helperReceivers = hasOwnedHelperDeclaration
      ? collectRubyRSpecHelperReceivers(
        index,
        describedConstant,
        rspecGroups,
        sharedGroups,
        helperDeclarations
      )
      : new Map();
    const body = collectRubyRSpecExampleBody(lines, index, example[1].length, {
      describedConstant,
      memoizedReceivers,
      helperReceivers
    });
    if (body) bodies.push(body);
  }

  const sharedExamples = collectRubyRSpecSharedExamples(rawLines, rspecGroups, sharedGroups);
  for (const inclusion of collectRubyRSpecSharedExampleInclusions(
    rawLines,
    lines,
    rspecGroups,
    sharedGroups
  )) {
    const candidates = sharedExamples.filter((sharedExample) => (
      sharedExample.name === inclusion.name &&
      sharedExample.start < inclusion.index &&
      sharedExample.groups.every((group) => inclusion.groups.includes(group))
    ));
    const depth = Math.max(...candidates.map((candidate) => candidate.depth), -1);
    const winners = candidates.filter((candidate) => candidate.depth === depth);
    if (winners.length !== 1) continue;
    const selected = winners[0];
    for (let index = selected.start + 1; index < selected.close; index += 1) {
      if (sharedGroups.some((group) => (
        group.start !== selected.start && rubyRangeContains(group, index)
      ))) {
        continue;
      }
      const example = lines[index].match(/^( *)\s*(?:it|specify)\b/);
      if (!example) continue;
      const body = collectRubyRSpecExampleBody(lines, index, example[1].length, {
        describedConstant: inclusion.describedConstant,
        memoizedReceivers: new Map(),
        helperReceivers: new Map()
      });
      if (body) bodies.push(body);
    }
  }
  return bodies;
}

function collectRubyRSpecExampleBody(lines, index, indent, metadata) {
  const line = lines[index];
  const openBrace = line.indexOf("{");
  const closeBrace = line.lastIndexOf("}");
  if (openBrace !== -1 && closeBrace > openBrace) {
    return { content: line.slice(openBrace + 1, closeBrace), ...metadata };
  }
  if (!/\bdo\b/.test(line)) return undefined;
  const close = findRubyIndentedEnd(lines, index, indent);
  return close === -1
    ? undefined
    : { content: lines.slice(index + 1, close).join("\n"), ...metadata };
}

function collectRubyRSpecGroupRanges(lines, sharedGroups = []) {
  const groups = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (sharedGroups.some((group) => rubyRangeContains(group, index))) continue;
    const group = lines[index].match(
      /^( *)\s*(?:RSpec\.)?(?:describe|context)\b.*\bdo\s*$/
    );
    if (!group) continue;
    const close = findRubyIndentedEnd(lines, index, group[1].length);
    if (close !== -1) groups.push({ start: index, close, indent: group[1].length });
  }
  return groups;
}

function collectRubyRSpecSharedRanges(lines) {
  const groups = [];
  for (let index = 0; index < lines.length; index += 1) {
    const shared = lines[index].match(
      /^( *)\s*(?:RSpec\.)?shared_(?:examples(?:_for)?|context)\b.*\bdo\b/
    );
    if (!shared) continue;
    const close = findRubyIndentedEnd(lines, index, shared[1].length);
    if (close !== -1) groups.push({ start: index, close, indent: shared[1].length });
  }
  return groups;
}

function collectRubyRSpecSharedExamples(rawLines, groups, sharedGroups) {
  const sharedExamples = [];
  for (const range of sharedGroups) {
    const declaration = matchExactRubyRSpecSharedExample(rawLines[range.start]);
    if (!declaration || declaration.indent !== range.indent) continue;
    const containingGroups = groups.filter((group) => rubyRangeContains(group, range.start));
    const nearestGroup = containingGroups.at(-1);
    if (
      (nearestGroup && declaration.indent !== nearestGroup.indent + 2) ||
      (!nearestGroup && declaration.indent !== 0)
    ) {
      continue;
    }
    sharedExamples.push({
      ...range,
      name: declaration.name,
      depth: containingGroups.length,
      groups: containingGroups
    });
  }
  return sharedExamples;
}

function collectRubyRSpecSharedExampleInclusions(rawLines, lines, groups, sharedGroups) {
  const inclusions = [];
  for (let index = 0; index < rawLines.length; index += 1) {
    if (sharedGroups.some((group) => rubyRangeContains(group, index))) continue;
    const inclusion = matchExactRubyRSpecSharedExampleInclusion(rawLines[index]);
    if (!inclusion) continue;
    const containingGroups = groups.filter((group) => rubyRangeContains(group, index));
    const nearestGroup = containingGroups.at(-1);
    if (!nearestGroup || inclusion.indent !== nearestGroup.indent + 2) continue;
    const describedConstant = findRubyRSpecDescribedConstant(lines, index);
    if (!describedConstant) continue;
    inclusions.push({
      ...inclusion,
      index,
      describedConstant,
      groups: containingGroups
    });
  }
  return inclusions;
}

function matchExactRubyRSpecSharedExample(line) {
  const direct = line.match(
    /^( *)(?:RSpec\.)?shared_(?:examples|examples_for)\s+(["'])([A-Za-z0-9][A-Za-z0-9 _./:!?-]*)\2\s+do\s*(?:#.*)?$/
  );
  const parenthesized = line.match(
    /^( *)(?:RSpec\.)?shared_(?:examples|examples_for)\(\s*(["'])([A-Za-z0-9][A-Za-z0-9 _./:!?-]*)\2\s*\)\s+do\s*(?:#.*)?$/
  );
  const match = direct ?? parenthesized;
  return match ? { indent: match[1].length, name: match[3] } : undefined;
}

function matchExactRubyRSpecSharedExampleInclusion(line) {
  const direct = line.match(
    /^( *)(?:it_behaves_like|include_examples)\s+(["'])([A-Za-z0-9][A-Za-z0-9 _./:!?-]*)\2\s*(?:#.*)?$/
  );
  const parenthesized = line.match(
    /^( *)(?:it_behaves_like|include_examples)\(\s*(["'])([A-Za-z0-9][A-Za-z0-9 _./:!?-]*)\2\s*\)\s*(?:#.*)?$/
  );
  const match = direct ?? parenthesized;
  return match ? { indent: match[1].length, name: match[3] } : undefined;
}

function collectRubyRSpecMemoizedDeclarations(lines, groups, sharedGroups) {
  const declarations = [];
  for (let index = 0; index < lines.length; index += 1) {
    const declaration = lines[index].match(
      /^\s*(let|subject)(!?)\s*(?:\(\s*:([a-z_][A-Za-z0-9_]*)\s*\))?\s*(?:\{|do\b)/
    );
    if (!declaration || (declaration[1] === "let" && !declaration[3])) continue;
    if (sharedGroups.some((group) => rubyRangeContains(group, index))) continue;
    const declarationGroups = groups.filter((group) => rubyRangeContains(group, index));
    if (declarationGroups.length === 0) continue;

    const exact = lines[index].match(
      /^\s*(let|subject)\s*(?:\(\s*:([a-z_][A-Za-z0-9_]*)\s*\))?\s*\{\s*(.*)\s*\}\s*$/
    );
    const receivers = declaration[1] === "let"
      ? [declaration[3]]
      : [...new Set([declaration[3], "subject"].filter(Boolean))];
    const constructor = exact?.[3]?.match(
      /^\s*((?:::)?[A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*|described_class)\s*\.\s*new(?![A-Za-z0-9_!?=])/
    );
    let constant;
    let usesDescribedClass = false;
    if (constructor) {
      const constructorPattern = new RegExp(
        `^\\s*${escapeRegex(constructor[1])}\\s*\\.\\s*new(?![A-Za-z0-9_!?=])`
      );
      if (isDirectRubyCallExpression(exact[3], constructorPattern)) {
        usesDescribedClass = constructor[1] === "described_class";
        constant = usesDescribedClass
          ? findRubyRSpecDescribedConstant(lines, index)
          : constructor[1].replace(/^::/, "");
      }
    }
    declarations.push({
      constant,
      depth: declarationGroups.length,
      groups: declarationGroups,
      index,
      receivers,
      usesDescribedClass
    });
  }
  return declarations;
}

function collectRubyRSpecMemoizedReceivers(
  exampleIndex,
  describedConstant,
  groups,
  sharedGroups,
  declarations
) {
  if (sharedGroups.some((group) => rubyRangeContains(group, exampleIndex))) return new Map();
  const exampleGroups = groups.filter((group) => rubyRangeContains(group, exampleIndex));
  const winners = new Map();
  for (const declaration of declarations) {
    if (declaration.groups.some((group) => !exampleGroups.includes(group))) continue;
    for (const receiver of declaration.receivers) {
      const current = winners.get(receiver);
      if (!current || declaration.depth > current.depth || (
        declaration.depth === current.depth && declaration.index > current.index
      )) {
        winners.set(receiver, declaration);
      }
    }
  }

  const receiversByConstant = new Map();
  for (const [receiver, winner] of winners) {
    if (!winner.constant || (winner.usesDescribedClass && winner.constant !== describedConstant)) continue;
    const constant = winner.constant;
    const receivers = receiversByConstant.get(constant) ?? new Set();
    receivers.add(receiver);
    receiversByConstant.set(constant, receivers);
  }
  return receiversByConstant;
}

function collectRubyRSpecHelperDeclarations(lines, groups, sharedGroups) {
  const declarations = [];
  for (let index = 0; index < lines.length; index += 1) {
    const helper = lines[index].match(
      /^( *)def\s+([a-z_][A-Za-z0-9_]*[!?]?)\s*(?:\([^)]*\))?\s*$/
    );
    if (!helper || sharedGroups.some((group) => rubyRangeContains(group, index))) continue;
    const declarationGroups = groups.filter((group) => rubyRangeContains(group, index));
    const nearestGroup = declarationGroups.at(-1);
    if (!nearestGroup || helper[1].length !== nearestGroup.indent + 2) continue;
    const close = findRubyIndentedEnd(lines, index, helper[1].length);
    if (close === -1) continue;

    const expression = lines
      .slice(index + 1, close)
      .filter((line) => line.trim())
      .join("\n");
    const constructor = expression.match(
      /^\s*((?:::)?[A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*|described_class)\s*\.\s*new(?![A-Za-z0-9_!?=])/
    );
    let constant;
    let usesDescribedClass = false;
    if (constructor) {
      const constructorPattern = new RegExp(
        `^\\s*${escapeRegex(constructor[1])}\\s*\\.\\s*new(?![A-Za-z0-9_!?=])`
      );
      if (isDirectRubyCallExpression(expression, constructorPattern)) {
        usesDescribedClass = constructor[1] === "described_class";
        constant = usesDescribedClass
          ? findRubyRSpecDescribedConstant(lines, index)
          : constructor[1].replace(/^::/, "");
      }
    }
    declarations.push({
      constant,
      depth: declarationGroups.length,
      groups: declarationGroups,
      index,
      name: helper[2],
      usesDescribedClass
    });
  }
  return declarations;
}

function collectRubyRSpecHelperReceivers(
  exampleIndex,
  describedConstant,
  groups,
  sharedGroups,
  declarations
) {
  if (sharedGroups.some((group) => rubyRangeContains(group, exampleIndex))) return new Map();
  const exampleGroups = groups.filter((group) => rubyRangeContains(group, exampleIndex));
  const winners = new Map();
  for (const declaration of declarations) {
    if (declaration.groups.some((group) => !exampleGroups.includes(group))) continue;
    const current = winners.get(declaration.name);
    if (!current || declaration.depth > current.depth || (
      declaration.depth === current.depth && declaration.index > current.index
    )) {
      winners.set(declaration.name, declaration);
    }
  }

  const receiversByConstant = new Map();
  for (const [receiver, winner] of winners) {
    if (!winner.constant || (winner.usesDescribedClass && winner.constant !== describedConstant)) continue;
    const receivers = receiversByConstant.get(winner.constant) ?? new Set();
    receivers.add(receiver);
    receiversByConstant.set(winner.constant, receivers);
  }
  return receiversByConstant;
}

function rubyRangeContains(range, index) {
  return range.start < index && range.close > index;
}

function findRubyRSpecDescribedConstant(lines, exampleIndex) {
  for (let index = 0; index < exampleIndex; index += 1) {
    const shared = lines[index].match(
      /^( *)\s*(?:RSpec\.)?shared_(?:examples(?:_for)?|context)\b.*\bdo\b/
    );
    if (!shared) continue;
    const close = findRubyIndentedEnd(lines, index, shared[1].length);
    if (close > exampleIndex) return undefined;
  }

  let describedConstant;
  for (let index = 0; index < exampleIndex; index += 1) {
    const group = lines[index].match(
      /^( *)\s*(?:RSpec\.)?describe\s+(?:::)?([A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*)(?:\s*,[^\n]*)?\s+do\s*$/
    );
    if (!group) continue;
    const close = findRubyIndentedEnd(lines, index, group[1].length);
    if (close > exampleIndex) describedConstant = group[2];
  }
  return describedConstant;
}

function findRubyIndentedEnd(lines, startIndex, indent) {
  const endPattern = new RegExp(`^ {${indent}}end\\b`);
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (endPattern.test(lines[index])) return index;
  }
  return -1;
}

function findRubyConstantUsage(runnableBodies, constant, declarations, framework) {
  if (declarations.singletonMethods.size === 0 && declarations.instanceMethods.size === 0) return undefined;
  const escapedConstant = escapeRegex(constant);
  let usage;
  for (const body of runnableBodies) {
    const lines = body.content.split(/\r?\n/);
    const deferredLines = collectDeferredRubyLines(lines);
    const receiverPattern = framework === "rspec" && body.describedConstant === constant
      ? `(?:(?:::)?${escapedConstant}|described_class)`
      : `(?:::)?${escapedConstant}`;
    for (const method of declarations.singletonMethods) {
      const callPattern = new RegExp(
        `(?:^|[^A-Za-z0-9_:])${receiverPattern}\\s*\\.\\s*${escapeRegex(method)}(?![A-Za-z0-9_!?=])`
      );
      const directCallPattern = new RegExp(
        `^\\s*${receiverPattern}\\s*\\.\\s*${escapeRegex(method)}(?![A-Za-z0-9_!?=])`
      );
      const callLines = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line, index }) => !deferredLines.has(index) && callPattern.test(line));
      if (callLines.length === 0) continue;
      usage = strongerRubyUsage(usage, "called");
      if (method === "new") {
        if (callLines.some(({ line }) => isUnchainedRubyCallOnAssertion(line, callPattern, framework))) {
          return "asserted";
        }
        if (hasStableAssertedRubyConstructorResult(lines, directCallPattern, framework, deferredLines)) {
          return "asserted";
        }
      } else {
        if (callLines.some(({ line }) => isRubyAssertionLine(line, framework))) return "asserted";
        if (hasStableAssertedRubyResult(lines, directCallPattern, framework, deferredLines)) return "asserted";
      }
    }
    usage = strongerRubyUsage(
      usage,
      findRubyConstructedLocalUsage(
        lines,
        receiverPattern,
        body.helperReceivers?.get(constant) ?? new Set(),
        declarations,
        framework,
        deferredLines
      )
    );
    usage = strongerRubyUsage(
      usage,
      findRubyMemoizedReceiverUsage(
        lines,
        body.memoizedReceivers?.get(constant) ?? new Set(),
        declarations,
        framework,
        deferredLines
      )
    );
    if (usage === "asserted") return usage;
  }
  return usage;
}

function findRubyConstructedLocalUsage(
  lines,
  receiverPattern,
  helperReceivers,
  declarations,
  framework,
  deferredLines
) {
  if (
    !declarations.hasDirectInitializer ||
    declarations.hasDirectSingletonNew ||
    declarations.declarationKinds.size !== 1 ||
    !declarations.declarationKinds.has("class") ||
    declarations.instanceMethods.size === 0
  ) {
    return undefined;
  }

  const constructorMethods = ["new", ...declarations.constructorFactoryMethods]
    .map(escapeRegex)
    .join("|");
  const receiverConstructor = `${receiverPattern}\\s*\\.\\s*(?:${constructorMethods})`;
  const helperConstructor = [...helperReceivers].map(escapeRegex).join("|");
  const constructorPattern = new RegExp(
    `^\\s*(?:${receiverConstructor}${helperConstructor ? `|(?:${helperConstructor})` : ""})(?![A-Za-z0-9_!?=])`
  );
  let usage;
  for (const binding of collectStableRubyConstructorBindings(lines, constructorPattern, deferredLines)) {
    for (const method of declarations.instanceMethods) {
      const receiver = escapeRegex(binding.local);
      const escapedMethod = escapeRegex(method);
      const callPattern = new RegExp(
        `(?:^|[^A-Za-z0-9_])${receiver}\\s*\\.\\s*${escapedMethod}(?![A-Za-z0-9_!?=])`
      );
      const directCallPattern = new RegExp(
        `^\\s*${receiver}\\s*\\.\\s*${escapedMethod}(?![A-Za-z0-9_!?=])`
      );
      const callLines = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line, index }) => index > binding.index && !deferredLines.has(index) && callPattern.test(line));
      if (callLines.length === 0) continue;
      usage = strongerRubyUsage(usage, "called");
      if (callLines.some(({ line }) => isRubyAssertionLine(line, framework))) return "asserted";
      if (hasStableAssertedRubyResult(lines, directCallPattern, framework, deferredLines, binding.index)) {
        return "asserted";
      }
    }
  }
  return usage;
}

function findRubyMemoizedReceiverUsage(lines, receivers, declarations, framework, deferredLines) {
  if (
    receivers.size === 0 ||
    !declarations.hasDirectInitializer ||
    declarations.hasDirectSingletonNew ||
    declarations.declarationKinds.size !== 1 ||
    !declarations.declarationKinds.has("class") ||
    declarations.instanceMethods.size === 0
  ) {
    return undefined;
  }

  let usage;
  for (const memoizedReceiver of receivers) {
    if (lines.some((line) => rubyAssignmentTargets(line).includes(memoizedReceiver))) continue;
    if (hasRubyBlockParameter(lines, memoizedReceiver)) continue;
    const receiver = escapeRegex(memoizedReceiver);
    for (const method of declarations.instanceMethods) {
      const escapedMethod = escapeRegex(method);
      const callPattern = new RegExp(
        `(?:^|[^A-Za-z0-9_])${receiver}\\s*\\.\\s*${escapedMethod}(?![A-Za-z0-9_!?=])`
      );
      const directCallPattern = new RegExp(
        `^\\s*${receiver}\\s*\\.\\s*${escapedMethod}(?![A-Za-z0-9_!?=])`
      );
      const callLines = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line, index }) => !deferredLines.has(index) && callPattern.test(line));
      if (callLines.length === 0) continue;
      usage = strongerRubyUsage(usage, "called");
      if (callLines.some(({ line }) => isRubyAssertionLine(line, framework))) return "asserted";
      if (hasStableAssertedRubyResult(lines, directCallPattern, framework, deferredLines)) {
        return "asserted";
      }
    }
  }
  return usage;
}

function collectStableRubyConstructorBindings(lines, constructorPattern, deferredLines) {
  const bindings = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (deferredLines.has(index)) continue;
    const assignment = lines[index].match(/^\s*([a-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!assignment || !isDirectRubyCallExpression(assignment[2], constructorPattern)) continue;
    const local = assignment[1];
    if (lines.filter((line) => rubyAssignmentTargets(line).includes(local)).length !== 1) continue;
    if (hasRubyBlockParameter(lines, local)) continue;
    bindings.push({ local, index });
  }
  return bindings;
}

function rubyAssignmentTargets(line) {
  const assignment = line.match(
    /^\s*\(?\s*([a-z_][A-Za-z0-9_]*(?:\s*,\s*[a-z_][A-Za-z0-9_]*)*)\s*\)?\s*(?:\|\|=|&&=|[+\-*/%]=|=(?!=|~|>))/
  );
  return assignment ? assignment[1].split(",").map((target) => target.trim()) : [];
}

function hasRubyBlockParameter(lines, local) {
  const blockShadow = new RegExp(
    `\\|[^|]*(?:^|[^A-Za-z0-9_])${escapeRegex(local)}(?![A-Za-z0-9_])[^|]*\\|`
  );
  return lines.some((line) => blockShadow.test(line));
}

function isUnchainedRubyCallOnAssertion(line, callPattern, framework) {
  if (!isRubyAssertionLine(line, framework)) return false;
  const match = line.match(callPattern);
  if (!match) return false;
  let remainder = line.slice((match.index ?? 0) + match[0].length).trimStart();
  if (remainder.startsWith("(")) {
    const close = findClosingRubyParenthesis(remainder);
    if (close === -1) return false;
    remainder = remainder.slice(close + 1).trimStart();
  }
  return !remainder.startsWith(".") && !remainder.startsWith("&.") && !remainder.startsWith("[");
}

function hasStableAssertedRubyConstructorResult(lines, constructorPattern, framework, deferredLines) {
  for (const binding of collectStableRubyConstructorBindings(lines, constructorPattern, deferredLines)) {
    const directReference = new RegExp(
      `(?:^|[^A-Za-z0-9_])${escapeRegex(binding.local)}(?![A-Za-z0-9_]|\\s*(?:\\.|&\\.|\\[))`
    );
    if (lines.some((line, index) => (
      index > binding.index &&
      !deferredLines.has(index) &&
      isRubyAssertionLine(line, framework) &&
      directReference.test(line)
    ))) {
      return true;
    }
  }
  return false;
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

function hasStableAssertedRubyResult(lines, directCallPattern, framework, deferredLines = new Set(), minimumIndex = -1) {
  for (let index = 0; index < lines.length; index += 1) {
    if (index <= minimumIndex || deferredLines.has(index)) continue;
    const assignment = lines[index].match(/^\s*([a-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!assignment || !isDirectRubyCallExpression(assignment[2], directCallPattern)) continue;
    const local = assignment[1];
    const mutation = new RegExp(`^\\s*${escapeRegex(local)}\\s*(?:\\|\\|=|&&=|[+\\-*/%]=|=(?!=|~|>))`);
    if (lines.filter((line) => mutation.test(line)).length !== 1) continue;
    if (hasRubyBlockParameter(lines, local)) continue;
    const reference = new RegExp(`(?:^|[^A-Za-z0-9_])${escapeRegex(local)}(?![A-Za-z0-9_])`);
    if (lines.some((line, current) => (
      current > index &&
      !deferredLines.has(current) &&
      isRubyAssertionLine(line, framework) &&
      reference.test(line)
    ))) {
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
