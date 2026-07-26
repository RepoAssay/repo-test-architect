import fs from "node:fs";
import path from "node:path";

const GO_SOURCE_EXTENSION = ".go";
const BUILD_FILES = new Set(["go.mod", "go.sum", "go.work"]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".idea",
  ".vscode",
  "bin",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "testdata",
  "tmp",
  "vendor"
]);

export function auditGoRepo(root, options = {}) {
  const files = readRepoFiles(root);
  const workspaceContext = findNearestGoWorkspace(root);
  const profile = buildProfile(root, files, workspaceContext);
  const changedPaths = options.changedPaths
    ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(root, currentPath)))
    : undefined;
  const testFiles = files
    .filter((file) => isRunnableTestFile(file))
    .map((file) => analyzeTestFile(file))
    .sort((left, right) => left.path.localeCompare(right.path));
  const sourceFiles = files.filter((file) => isSourceFile(file.path));
  const sourceSymbols = collectSourceSymbols(sourceFiles);
  const testEvidenceBySourcePath = collectGoTestEvidence(sourceFiles, sourceSymbols, testFiles, profile.modulePath);
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];

  for (const file of sourceFiles.filter((candidate) => isIncludedByChangedPaths(candidate.path, changedPaths))) {
    const name = basenameWithoutExtension(file.path);
    const classification = classifySourceFile(file);
    const existingTestEvidence = testEvidenceBySourcePath.get(normalizePath(file.path)) ?? [];
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
        ? [...classification.reasons, "Existing Go test evidence detected; review missing edge cases"]
        : classification.reasons,
      existingTestPaths,
      ...(existingTestEvidence.length > 0 ? { existingTestEvidence } : {})
    };

    if (existingTestPaths.length > 0) coveredButRisky.push(target);
    else untestedCandidates.push(target);

    if (classification.risk === "high") {
      const coverageState = existingTestPaths.length > 0
        ? "needs edge-case review"
        : "has no matching Go test evidence";
      risks.push(`${name} has ${classification.reasons.join(", ").toLowerCase()} and ${coverageState}.`);
    }
  }

  const recommendedTargets = [...untestedCandidates, ...coveredButRisky].sort(byRiskThenName);
  const { modulePath: _modulePath, ...publicProfile } = profile;

  return {
    schemaVersion: "audit/v1",
    profile: publicProfile,
    untestedCandidates: untestedCandidates.sort(byRiskThenName),
    coveredButRisky: coveredButRisky.sort(byRiskThenName),
    recommended: recommendedTargets,
    skipped: skipped.sort((left, right) => left.path.localeCompare(right.path)),
    risks
  };
}

function readRepoFiles(root) {
  const files = [];

  function visit(current) {
    if (current !== root && fs.existsSync(path.join(current, "go.mod"))) return;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      const relative = normalizePath(path.relative(root, absolute));

      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (shouldRead(relative)) {
        files.push({ path: relative, content: fs.readFileSync(absolute, "utf8") });
      }
    }
  }

  visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function shouldRead(currentPath) {
  const normalized = normalizePath(currentPath);
  return normalized.endsWith(GO_SOURCE_EXTENSION) || BUILD_FILES.has(normalized);
}

function buildProfile(root, files, workspaceContext) {
  const paths = files.map((file) => normalizePath(file.path));
  const goMod = files.find((file) => file.path === "go.mod");
  const modulePath = goMod?.content.match(/^\s*module\s+([^\s]+)\s*$/m)?.[1];
  const runnableTests = files.filter((file) => isRunnableTestFile(file)).map((file) => analyzeTestFile(file));
  const allTestFiles = files.filter((file) => isTestFile(file.path));
  const hasBuildConstraints = files.some((file) => file.path.endsWith(".go") && hasBuildConstraint(file.content));
  const hasGinkgo = files.some((file) => /github\.com\/onsi\/(?:ginkgo|gomega)/.test(file.content));
  const testFrameworks = runnableTests.length > 0 ? ["go-testing"] : [];
  const existingTestLocations = detectExistingTestLocations(runnableTests);
  const blockers = [];

  if (!goMod) blockers.push("No root go.mod detected for the bounded Go module adapter.");
  if (testFrameworks.length === 0) blockers.push("No runnable standard Go test detected.");
  if (workspaceContext && !workspaceContext.complete) {
    blockers.push("Go workspace use directives must resolve to literal repository-contained modules before command ownership is complete.");
  } else if (workspaceContext && !workspaceContext.declared) {
    blockers.push(workspaceContext.local && !goMod
      ? "Go workspace roots must be audited through their declared module projects."
      : "The module is not declared by the nearest Go workspace, so command ownership is incomplete.");
  }
  if (hasBuildConstraints) blockers.push("Go build constraints require an explicit target configuration before audit ownership is complete.");
  if (hasGinkgo) blockers.push("Ginkgo/Gomega execution is outside the bounded standard-library Go test support matrix.");

  const testCommand = goMod && testFrameworks.length > 0 && blockers.length === 0
    ? "go test ./..."
    : undefined;

  return {
    root,
    languages: ["go"],
    packageManagers: goMod ? ["go-modules"] : [],
    testFrameworks,
    architectures: detectArchitectures(files, Boolean(goMod), Boolean(workspaceContext?.declared)),
    ...(testCommand ? { testCommand } : {}),
    detectedConventions: detectConventions(runnableTests),
    existingTestLocations,
    setupSignals: detectSetupSignals(paths, files, allTestFiles, modulePath, workspaceContext),
    confidence: scoreProfileConfidence(testFrameworks, existingTestLocations, blockers),
    blockers,
    modulePath
  };
}

function detectExistingTestLocations(testFiles) {
  const locations = new Set();
  if (testFiles.some((file) => !normalizePath(file.path).includes("/"))) locations.add("root _test.go");
  if (testFiles.some((file) => normalizePath(file.path).includes("/"))) locations.add("package-local _test.go");
  return [...locations];
}

function detectArchitectures(files, hasGoModule, hasGoWorkspaceOwner) {
  const architectures = new Set(hasGoModule ? ["go-module"] : []);
  if (hasGoWorkspaceOwner) architectures.add("go-workspace-module");
  const sourceText = files.filter((file) => file.path.endsWith(".go")).map((file) => file.content).join("\n");
  if (/^\s*package\s+main\b/m.test(sourceText)) architectures.add("command");
  if (/\bnet\/http\b|github\.com\/(?:gin-gonic\/gin|labstack\/echo)|\bhttp\.(?:Handle|HandleFunc|ListenAndServe)\b/.test(sourceText)) {
    architectures.add("http-service");
  }
  if (/\bgrpc\b|google\.golang\.org\/grpc/.test(sourceText)) architectures.add("grpc-service");
  return [...architectures].sort();
}

function detectConventions(testFiles) {
  const conventions = new Set();
  if (testFiles.length > 0) conventions.add("*_test.go");
  if (testFiles.some((file) => file.runnableKinds.has("test"))) conventions.add("TestXxx");
  if (testFiles.some((file) => file.runnableKinds.has("fuzz"))) conventions.add("FuzzXxx");
  if (testFiles.some((file) => file.runnableKinds.has("example"))) conventions.add("ExampleXxx");
  if (testFiles.some((file) => /\[\]\s*struct\s*\{/.test(maskGoSource(file.content)))) conventions.add("table-driven tests");
  if (testFiles.some((file) => file.packageName.endsWith("_test"))) conventions.add("external test package");
  return [...conventions];
}

function detectSetupSignals(paths, files, testFiles, modulePath, workspaceContext) {
  const signals = new Set();
  if (paths.includes("go.mod")) signals.add("go.mod");
  if (paths.includes("go.sum")) signals.add("go.sum");
  if (paths.includes("go.work")) signals.add("go.work");
  else if (workspaceContext) signals.add("go.work (nearest workspace)");
  if (modulePath) signals.add("module path");
  if (workspaceContext?.declared) signals.add("go.work module");
  if (testFiles.some((file) => /(?:^|\n)\s*(?:import\s+(?:\w+\s+)?["`]testing["`]|["`]testing["`])/m.test(file.content))) {
    signals.add("standard testing package");
  }
  if (files.some((file) => /github\.com\/stretchr\/testify/.test(file.content))) signals.add("testify assertions");
  return [...signals];
}

function findNearestGoWorkspace(root) {
  const moduleRoot = path.resolve(root);
  let current = moduleRoot;

  while (true) {
    const workspacePath = path.join(current, "go.work");
    if (fs.existsSync(workspacePath) && fs.statSync(workspacePath).isFile()) {
      const analysis = analyzeGoWorkspace(current, fs.readFileSync(workspacePath, "utf8"));
      const relativeRoot = normalizePath(path.relative(current, moduleRoot)) || ".";
      return {
        root: current,
        local: current === moduleRoot,
        declared: analysis.moduleDirectories.includes(relativeRoot),
        complete: analysis.complete
      };
    }

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function analyzeGoWorkspace(workspaceRoot, content) {
  const rawDeclarations = [];
  let inUseBlock = false;
  let complete = true;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripGoWorkspaceComment(rawLine).trim();
    if (!line) continue;

    if (inUseBlock) {
      if (line === ")") {
        inUseBlock = false;
        continue;
      }
      if (line.includes("(") || line.includes(")")) {
        complete = false;
        continue;
      }
      rawDeclarations.push(line);
      continue;
    }

    if (/^use\s*\(\s*$/.test(line)) {
      inUseBlock = true;
      continue;
    }
    const singleUse = line.match(/^use\s+(.+)$/);
    if (singleUse) {
      rawDeclarations.push(singleUse[1].trim());
      continue;
    }
    if (/^use\b/.test(line)) complete = false;
  }

  if (inUseBlock) complete = false;

  const moduleDirectories = [];
  for (const rawDeclaration of rawDeclarations) {
    const declaredPath = decodeGoWorkspacePath(rawDeclaration);
    if (!declaredPath || !isRepositoryContainedWorkspacePath(declaredPath)) {
      complete = false;
      continue;
    }

    const absoluteModuleRoot = path.resolve(workspaceRoot, declaredPath);
    const relativeModuleRoot = normalizePath(path.relative(workspaceRoot, absoluteModuleRoot)) || ".";
    if (!fs.existsSync(path.join(absoluteModuleRoot, "go.mod"))) {
      complete = false;
      continue;
    }
    const realWorkspaceRoot = fs.realpathSync(workspaceRoot);
    const realModuleRoot = fs.realpathSync(absoluteModuleRoot);
    const realRelativeRoot = path.relative(realWorkspaceRoot, realModuleRoot);
    if (realRelativeRoot.startsWith(`..${path.sep}`) || realRelativeRoot === ".." || path.isAbsolute(realRelativeRoot)) {
      complete = false;
      continue;
    }
    moduleDirectories.push(relativeModuleRoot);
  }

  return {
    complete,
    moduleDirectories: [...new Set(moduleDirectories)].sort()
  };
}

function stripGoWorkspaceComment(line) {
  let quote;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote === "\"") {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (quote === "`") {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "/" && line[index + 1] === "/") return line.slice(0, index);
  }
  return line;
}

function decodeGoWorkspacePath(raw) {
  if (raw.startsWith("`")) {
    return raw.endsWith("`") && raw.length >= 2 ? raw.slice(1, -1) : undefined;
  }
  if (raw.startsWith("\"")) {
    if (!raw.endsWith("\"")) return undefined;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "string" ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return /[\s()`]/.test(raw) ? undefined : raw;
}

function isRepositoryContainedWorkspacePath(value) {
  const normalized = normalizePath(value);
  if (!normalized || path.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
  return !normalized.split("/").includes("..");
}

function scoreProfileConfidence(testFrameworks, existingTestLocations, blockers) {
  if (blockers.length > 1) return "low";
  if (blockers.length > 0) return testFrameworks.length > 0 ? "medium" : "low";
  if (testFrameworks.length > 0 && existingTestLocations.length > 0) return "high";
  if (testFrameworks.length > 0) return "medium";
  return "low";
}

function analyzeTestFile(file) {
  const packageName = extractPackageName(file.content);
  const runnableKinds = detectRunnableKinds(file.content);
  return {
    ...file,
    path: normalizePath(file.path),
    directory: directoryOf(file.path),
    packageName,
    runnableKinds,
    imports: collectImports(file.content),
    declaredSymbols: new Set(collectDeclaredSymbols(file.content).map((symbol) => symbol.name)),
    maskedContent: maskGoSource(file.content)
  };
}

function isRunnableTestFile(file) {
  return isTestFile(file.path) && detectRunnableKinds(file.content).size > 0;
}

function detectRunnableKinds(content) {
  const masked = maskGoSource(content);
  const kinds = new Set();
  const hasTestingImport = collectImports(content).some((entry) => entry.path === "testing" && entry.alias !== "_");
  if (hasTestingImport && /\bfunc\s+Test(?:[A-Z0-9_][A-Za-z0-9_]*)?\s*\(\s*[A-Za-z_][A-Za-z0-9_]*\s+\*testing\.T\s*\)/.test(masked)) kinds.add("test");
  if (hasTestingImport && /\bfunc\s+Fuzz(?:[A-Z0-9_][A-Za-z0-9_]*)?\s*\(\s*[A-Za-z_][A-Za-z0-9_]*\s+\*testing\.F\s*\)/.test(masked)) kinds.add("fuzz");
  if (/\bfunc\s+Example(?:[A-Z0-9_][A-Za-z0-9_]*)?\s*\(\s*\)/.test(masked)) kinds.add("example");
  return kinds;
}

function collectSourceSymbols(sourceFiles) {
  const symbolsByPath = new Map();
  const symbolCounts = new Map();

  for (const file of sourceFiles) {
    const packageName = extractPackageName(file.content);
    const directory = directoryOf(file.path);
    const symbols = collectDeclaredSymbols(file.content);
    symbolsByPath.set(file.path, { packageName, directory, symbols });
    for (const symbol of symbols) {
      const key = `${directory}\0${symbol.name}`;
      symbolCounts.set(key, (symbolCounts.get(key) ?? 0) + 1);
    }
  }

  return { symbolsByPath, symbolCounts };
}

function collectDeclaredSymbols(content) {
  const masked = maskGoSource(content);
  const symbols = [];
  for (const match of masked.matchAll(/(?:^|\n)\s*func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    symbols.push({ name: match[1], kind: "function" });
  }
  for (const match of masked.matchAll(/(?:^|\n)\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
    symbols.push({ name: match[1], kind: "type" });
  }
  return symbols;
}

function collectGoTestEvidence(sourceFiles, sourceSymbols, testFiles, modulePath) {
  const evidenceByPath = new Map();

  for (const sourceFile of sourceFiles) {
    const normalizedSourcePath = normalizePath(sourceFile.path);
    const source = sourceSymbols.symbolsByPath.get(normalizedSourcePath);
    const evidence = [];

    for (const testFile of testFiles) {
      const sameDirectory = testFile.directory === source.directory;
      const samePackage = sameDirectory && testFile.packageName === source.packageName;
      const externalAlias = sameDirectory && testFile.packageName === `${source.packageName}_test`
        ? importedPackageAlias(testFile.imports, modulePath, source.directory, source.packageName)
        : undefined;
      const expectedTestPath = normalizedSourcePath.replace(/\.go$/, "_test.go");
      if (testFile.path === expectedTestPath && (samePackage || externalAlias)) {
        evidence.push({
          testPath: testFile.path,
          kind: "filename-convention",
          strength: "naming"
        });
      }
      if (!samePackage && !externalAlias) continue;

      for (const symbol of source.symbols) {
        const symbolKey = `${source.directory}\0${symbol.name}`;
        if (sourceSymbols.symbolCounts.get(symbolKey) !== 1) continue;
        if (samePackage && testFile.declaredSymbols.has(symbol.name)) continue;
        const reference = externalAlias ? `${externalAlias}.${symbol.name}` : symbol.name;
        const usage = detectSymbolUsage(testFile.maskedContent, reference, symbol.kind);
        if (!usage) continue;
        evidence.push({
          testPath: testFile.path,
          kind: "go-symbol-reference",
          strength: symbol.kind === "function" ? "direct" : "referenced",
          ...(usage === "called" ? { usage } : {})
        });
      }
    }

    evidenceByPath.set(normalizedSourcePath, deduplicateEvidence(evidence));
  }

  return evidenceByPath;
}

function importedPackageAlias(imports, modulePath, directory, packageName) {
  if (!modulePath) return undefined;
  const importPath = directory === "." ? modulePath : `${modulePath}/${directory}`;
  const declaration = imports.find((entry) => entry.path === importPath);
  if (!declaration || declaration.alias === "_" || declaration.alias === ".") return undefined;
  return declaration.alias ?? packageName;
}

function collectImports(content) {
  const imports = [];
  const withoutComments = maskGoComments(content);
  const block = withoutComments.match(/\bimport\s*\(([\s\S]*?)\)/)?.[1] ?? "";
  for (const match of block.matchAll(/(?:^|\n)\s*(?:(\w+|[._])\s+)?["`]([^"`]+)["`]/g)) {
    imports.push({ alias: match[1], path: match[2] });
  }
  for (const match of withoutComments.matchAll(/(?:^|\n)\s*import\s+(?:(\w+|[._])\s+)?["`]([^"`]+)["`]/g)) {
    imports.push({ alias: match[1], path: match[2] });
  }
  return imports;
}

function detectSymbolUsage(maskedContent, reference, kind) {
  const escaped = escapeRegex(reference);
  if (kind === "function" && new RegExp(`\\b${escaped}\\s*\\(`).test(maskedContent)) return "called";
  if (kind === "type" && new RegExp(`\\b${escaped}\\s*(?:\\{|\\()`).test(maskedContent)) return "referenced";
  return undefined;
}

function deduplicateEvidence(evidence) {
  const unique = new Map();
  for (const item of evidence) {
    const key = `${item.testPath}\0${item.kind}\0${item.strength}\0${item.usage ?? ""}`;
    unique.set(key, item);
  }
  const strengthOrder = { direct: 0, referenced: 1, indirect: 2, naming: 3 };
  return [...unique.values()].sort((left, right) =>
    left.testPath.localeCompare(right.testPath) ||
    strengthOrder[left.strength] - strengthOrder[right.strength] ||
    left.kind.localeCompare(right.kind)
  );
}

function classifySourceFile(file) {
  const currentPath = normalizePath(file.path);
  const lowerPath = currentPath.toLowerCase();
  const content = file.content;
  const masked = maskGoSource(content);

  if (isGeneratedSource(content)) {
    return skipped("generated", ["generated-source"], 1, 5, "Generated Go source should be covered through its generator or consuming behavior.");
  }
  if (hasBuildConstraint(content)) {
    return skipped(
      "build-constrained",
      ["build-constraint"],
      3,
      6,
      "Build-constrained Go source requires an explicit target configuration before direct coverage can be recommended.",
      "Audit again with a future target-aware Go configuration."
    );
  }
  if (/^\s*package\s+main\b/m.test(masked) && /\bfunc\s+main\s*\(/.test(masked)) {
    return skipped(
      "app-wiring",
      ["main-package", "app-wiring"],
      3,
      5,
      "Go command wiring is usually better covered through package behavior or integration tests.",
      "Cover handlers and services directly, then add a bounded command integration test when valuable."
    );
  }
  if (isHttpBoundary(lowerPath, content)) {
    return recommended("http-handler", ["http-boundary", "request-response"], "high", "medium", "integration", 8, 5, ["HTTP boundary behavior", "request or response handling"]);
  }
  if (matchesAny(lowerPath, ["parser", "mapper", "validator", "formatter", "calculator", "codec"])) {
    return recommended("pure-logic", ["pure-logic", "edge-case-surface"], "high", "high", "unit", 9, 2, ["Pure transformation logic", "edge-case surface"]);
  }
  if (hasConcurrency(masked)) {
    return recommended("concurrent-service", ["async-or-concurrency"], "high", "medium", "unit", 8, 5, ["Concurrency or synchronization behavior"]);
  }
  if (matchesAny(lowerPath, ["service", "client", "repository", "store"]) || hasExternalBoundary(content)) {
    const external = hasExternalBoundary(content);
    return recommended(
      "service",
      external ? ["service-boundary", "external-boundary"] : ["service-boundary"],
      external ? "high" : "medium",
      "medium",
      "unit",
      external ? 8 : 6,
      4,
      external ? ["Service boundary", "external boundary"] : ["Service boundary"]
    );
  }
  if (isDtoOnly(masked)) {
    return skipped(
      "dto",
      ["dto-only"],
      2,
      4,
      "Struct-only data shapes are usually better covered through the behavior that consumes them.",
      "Cover through parser, service, repository, or HTTP boundary tests."
    );
  }
  if (hasBranching(masked)) {
    return recommended("utility", ["branching-logic"], "medium", "high", "unit", 6, 2, ["Branching logic"]);
  }
  if (/\bfunc\s+(?:\([^)]*\)\s*)?[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(masked)) {
    return recommended("utility", ["runtime-behavior"], "medium", "high", "unit", 5, 2, ["Runtime function or method behavior"]);
  }
  return skipped("low-value", ["low-runtime-behavior"], 1, 3, "No meaningful runtime behavior detected by current Go heuristics.");
}

function recommended(kind, signals, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons) {
  return { kind, signals, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons };
}

function skipped(kind, signals, riskReductionScore, maintenanceCost, skipReason, preferredCoveragePath) {
  return { kind, signals, riskReductionScore, maintenanceCost, skipReason, preferredCoveragePath };
}

function isHttpBoundary(lowerPath, content) {
  return matchesAny(lowerPath, ["handler", "route", "router", "middleware"]) &&
    (/\bnet\/http\b|github\.com\/(?:gin-gonic\/gin|labstack\/echo)/.test(content) || /\bhttp\.(?:Handler|ResponseWriter|Request)\b/.test(content));
}

function hasExternalBoundary(content) {
  return /\bnet\/http\b|\bdatabase\/sql\b|\bos\.(?:Open|ReadFile|WriteFile)\b|\bgrpc\b/.test(content);
}

function hasConcurrency(masked) {
  return /(?:^|[;{}\n])\s*go\s+[A-Za-z_(]|\bselect\s*\{|\b(?:sync\.(?:Mutex|RWMutex|WaitGroup|Once)|chan\s+)/.test(masked);
}

function isDtoOnly(masked) {
  return /\btype\s+[A-Za-z_][A-Za-z0-9_]*\s+struct\s*\{/.test(masked) &&
    !/\bfunc\s+(?:\([^)]*\)\s*)?[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(masked);
}

function hasBranching(masked) {
  return /\b(?:if|for|switch|select)\b/.test(masked) || /\bcase\b/.test(masked);
}

function isGeneratedSource(content) {
  return content.split(/\r?\n/).slice(0, 12).some((line) => /^\/\/ Code generated .* DO NOT EDIT\.$/.test(line.trim()));
}

function hasBuildConstraint(content) {
  return content.split(/\r?\n/).slice(0, 20).some((line) => /^\/\/(?:go:build| \+build)\b/.test(line.trim()));
}

function isSourceFile(currentPath) {
  const normalized = normalizePath(currentPath);
  return normalized.endsWith(GO_SOURCE_EXTENSION) && !isTestFile(normalized);
}

function isTestFile(currentPath) {
  return normalizePath(currentPath).endsWith("_test.go");
}

function extractPackageName(content) {
  return maskGoComments(content).match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_]*)\b/m)?.[1] ?? "";
}

function maskGoSource(content) {
  return maskGoComments(content)
    .replace(/`[\s\S]*?`/g, (value) => " ".repeat(value.length))
    .replace(/"(?:\\.|[^"\\])*"/g, (value) => " ".repeat(value.length))
    .replace(/'(?:\\.|[^'\\])*'/g, (value) => " ".repeat(value.length));
}

function maskGoComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (value) => value.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (value) => " ".repeat(value.length));
}

function matchesAny(value, terms) {
  return terms.some((term) => value.includes(term));
}

function isIncludedByChangedPaths(currentPath, changedPaths) {
  return !changedPaths || changedPaths.has(normalizePath(currentPath));
}

function normalizeChangedPath(root, currentPath) {
  const resolved = path.resolve(currentPath);
  return path.isAbsolute(currentPath) && isPathInside(root, resolved)
    ? normalizePath(path.relative(root, resolved))
    : normalizePath(currentPath);
}

function isPathInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function directoryOf(currentPath) {
  const directory = path.posix.dirname(normalizePath(currentPath));
  return directory === "" ? "." : directory;
}

function basenameWithoutExtension(currentPath) {
  return path.posix.basename(normalizePath(currentPath), GO_SOURCE_EXTENSION);
}

function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function byRiskThenName(left, right) {
  const weights = { high: 0, medium: 1, low: 2 };
  return weights[left.risk] - weights[right.risk] || left.name.localeCompare(right.name) || left.path.localeCompare(right.path);
}
