import fs from "node:fs";
import path from "node:path";

const IGNORED_DIRECTORIES = new Set([
  ".git", ".idea", ".vscode", "build", "cache", "coverage", "dist", "node_modules", "vendor"
]);

export function auditPhpRepo(root, options = {}) {
  const absoluteRoot = path.resolve(root);
  const files = readRepoFiles(absoluteRoot);
  const composerFile = files.find((file) => file.path === "composer.json");
  const metadata = parseComposer(composerFile?.content);
  const ownership = analyzeOwnership(absoluteRoot, metadata.value);
  const sourceFiles = files.filter((file) =>
    ownership.sourceRoots.some((sourceRoot) => isUnderRoot(file.path, sourceRoot)) ||
    ownership.functionFiles.includes(file.path)
  );
  const testFiles = files.filter((file) => ownership.testRoots.some((testRoot) => isUnderRoot(file.path, testRoot)));
  const runnableTests = collectRunnablePhpUnitTests(
    testFiles,
    ownership.testMappings,
    sourceFiles,
    ownership.sourceMappings
  );
  const bootstrap = analyzePhpUnitBootstrap(files);
  const composerTest = analyzeComposerTestScript(metadata.value?.scripts);
  const makeWorkflow = composerTest.absent
    ? analyzeMakeTestWorkflow(files)
    : { blockers: [] };
  const blockers = buildBlockers({ composerFile, metadata, ownership, sourceFiles, runnableTests, bootstrap, composerTest, makeWorkflow });
  const profile = buildProfile(absoluteRoot, files, composerFile, metadata.value, ownership, runnableTests, bootstrap, composerTest, makeWorkflow, blockers);
  const evidenceBySource = collectEvidence(sourceFiles, runnableTests, ownership);
  const changedPaths = options.changedPaths
    ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(absoluteRoot, currentPath)))
    : undefined;
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];

  for (const file of sourceFiles.filter((candidate) => !changedPaths || changedPaths.has(candidate.path))) {
    const classification = classifySourceFile(file);
    const name = path.basename(file.path, ".php");
    if (classification.skipReason) {
      skipped.push({
        id: file.path,
        name,
        path: file.path,
        kind: classification.kind,
        signals: classification.signals,
        riskReductionScore: classification.riskReductionScore,
        maintenanceCost: classification.maintenanceCost,
        reason: classification.skipReason
      });
      continue;
    }

    const existingTestEvidence = evidenceBySource.get(file.path) ?? [];
    const existingTestPaths = [...new Set(existingTestEvidence.map((evidence) => evidence.testPath))];
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
        ? [...classification.reasons, "A runnable PHPUnit test directly references this PSR-4-owned class."]
        : classification.reasons,
      existingTestPaths,
      ...(existingTestEvidence.length > 0 ? { existingTestEvidence } : {})
    };
    if (existingTestPaths.length > 0) coveredButRisky.push(target);
    else untestedCandidates.push(target);
    if (classification.risk === "high") {
      risks.push(`${name} has ${classification.reasons.join(", ").toLowerCase()} and ${existingTestPaths.length > 0 ? "bounded PHPUnit evidence" : "no bounded PHPUnit evidence"}.`);
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
    if (current !== root && fs.existsSync(path.join(current, "composer.json"))) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (IGNORED_DIRECTORIES.has(entry.name) || entry.isSymbolicLink()) continue;
      const absolute = path.join(current, entry.name);
      const relative = normalizePath(path.relative(root, absolute));
      if (entry.isDirectory()) visit(absolute);
      else if (relative.endsWith(".php") || relative === "composer.json" || relative === "composer.lock" || relative === "phpunit.xml" || relative === "phpunit.xml.dist" || relative === "Makefile") {
        files.push({ path: relative, content: fs.readFileSync(absolute, "utf8") });
      }
    }
  }
  visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function parseComposer(content) {
  if (content === undefined) return { value: undefined };
  try {
    const value = JSON.parse(content);
    return value && typeof value === "object" && !Array.isArray(value)
      ? { value }
      : { error: "Root composer.json must contain a JSON object." };
  } catch {
    return { error: "Root composer.json must contain valid JSON." };
  }
}

function analyzeOwnership(root, composer) {
  const source = analyzePsr4Map(root, composer?.autoload?.["psr-4"]);
  const tests = analyzePsr4Map(root, composer?.["autoload-dev"]?.["psr-4"]);
  const functions = analyzeAutoloadFiles(root, composer?.autoload?.files);
  return {
    sourceRoots: source.roots,
    testRoots: tests.roots,
    sourceMappings: source.mappings,
    testMappings: tests.mappings,
    functionFiles: functions.paths,
    sourceValid: source.valid,
    testsValid: tests.valid,
    functionFilesValid: functions.valid
  };
}

function analyzeAutoloadFiles(root, value) {
  if (value === undefined) return { valid: true, paths: [] };
  if (!Array.isArray(value) || value.length === 0) return { valid: false, paths: [] };
  const paths = [];
  for (const entry of value) {
    if (typeof entry !== "string") return { valid: false, paths: [] };
    const normalized = normalizePath(entry).replace(/^(?:\.\/)+/, "");
    const canonical = path.posix.normalize(normalized);
    if (
      !normalized ||
      canonical !== normalized ||
      !normalized.endsWith(".php") ||
      path.posix.isAbsolute(normalized) ||
      /^[A-Za-z]:\//.test(normalized) ||
      normalized.split("/").some((part) => part === "" || part === "." || part === "..")
    ) {
      return { valid: false, paths: [] };
    }
    const absolute = path.resolve(root, normalized);
    const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
    if (!isWithin(root, absolute) || !stat?.isFile() || stat.isSymbolicLink() || hasNestedComposerOwner(root, absolute)) {
      return { valid: false, paths: [] };
    }
    paths.push(normalized);
  }
  return new Set(paths).size === paths.length
    ? { valid: true, paths }
    : { valid: false, paths: [] };
}

function hasNestedComposerOwner(root, file) {
  let current = path.dirname(file);
  while (current !== root && isWithin(root, current)) {
    if (fs.existsSync(path.join(current, "composer.json"))) return true;
    current = path.dirname(current);
  }
  return false;
}

function analyzePsr4Map(root, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, roots: [], mappings: [] };
  }
  const mappings = [];
  let valid = Object.keys(value).length > 0;
  for (const [namespace, directory] of Object.entries(value)) {
    if (typeof directory !== "string" || !namespace.endsWith("\\")) {
      valid = false;
      continue;
    }
    const normalized = normalizeDirectory(directory);
    const absolute = path.resolve(root, normalized);
    if (!normalized || !isWithin(root, absolute) || !fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
      valid = false;
      continue;
    }
    mappings.push({ namespace, root: normalized });
  }
  return { valid: valid && mappings.length === Object.keys(value).length, roots: mappings.map((mapping) => mapping.root), mappings };
}

function buildBlockers({ composerFile, metadata, ownership, sourceFiles, runnableTests, bootstrap, composerTest, makeWorkflow }) {
  const blockers = [];
  if (!composerFile) blockers.push("No root composer.json detected for the bounded PHP Composer adapter.");
  if (metadata.error) blockers.push(metadata.error);
  if (!metadata.error && !ownership.sourceValid) blockers.push("A complete literal string-valued autoload.psr-4 map is required for source ownership.");
  if (!metadata.error && !ownership.testsValid) blockers.push("A complete literal string-valued autoload-dev.psr-4 map is required for test ownership.");
  if (!metadata.error && !ownership.functionFilesValid) {
    blockers.push("autoload.files must contain unique literal repository-contained PHP file paths outside nested Composer roots.");
  }
  if (!metadata.error && !Object.hasOwn(metadata.value?.["require-dev"] ?? {}, "phpunit/phpunit")) {
    blockers.push("phpunit/phpunit must be statically declared in require-dev.");
  }
  if (runnableTests.length === 0) blockers.push("No runnable conventional PHPUnit *Test.php class was detected under the owned test roots.");
  if (sourceFiles.some((file) => !ownedClass(file, ownership.sourceMappings) && !ownedFunctionFile(file, ownership))) {
    blockers.push("Each owned source file must contain one declared PSR-4 class or namespaced autoload.files functions matching its literal ownership.");
  }
  if (!composerTest.supported) {
    blockers.push("The Composer test script must be one exact PHPUnit command or a bounded literal quality-script alias graph ending in PHPUnit.");
  }
  blockers.push(...bootstrap.blockers);
  blockers.push(...makeWorkflow.blockers);
  return blockers;
}

function buildProfile(root, files, composerFile, composer, ownership, runnableTests, bootstrap, composerTest, makeWorkflow, blockers) {
  const testCommand = blockers.length === 0
    ? (composerTest.absent ? "vendor/bin/phpunit" : "composer test")
    : undefined;
  return {
    root,
    languages: ["php"],
    packageManagers: composerFile ? ["composer"] : [],
    testFrameworks: runnableTests.length > 0 ? ["phpunit"] : [],
    architectures: ownership.sourceValid ? ["composer-psr4"] : [],
    ...(testCommand ? { testCommand } : {}),
    detectedConventions: [
      ...(ownership.sourceValid ? ["literal PSR-4 source ownership"] : []),
      ...(ownership.testsValid ? ["literal PSR-4 test ownership"] : []),
      ...(ownership.functionFiles.length > 0 ? ["literal Composer autoload.files function ownership"] : []),
      ...(runnableTests.length > 0 ? ["*Test.php PHPUnit classes"] : []),
      ...(composerTest.graph ? ["bounded Composer quality-script graph"] : [])
    ],
    existingTestLocations: [...new Set(runnableTests.map((file) => `${firstDirectory(file.path)}/ PHPUnit files`))],
    setupSignals: [
      ...(composerFile ? ["composer.json"] : []),
      ...(files.some((file) => file.path === "composer.lock") ? ["composer.lock"] : []),
      ...(files.some((file) => file.path === "phpunit.xml.dist") ? ["phpunit.xml.dist"] : []),
      ...(files.some((file) => file.path === "phpunit.xml") ? ["phpunit.xml"] : []),
      ...(bootstrap.path ? [bootstrap.path] : []),
      ...(makeWorkflow.path ? [makeWorkflow.path] : [])
    ],
    confidence: blockers.length === 0 ? "high" : metadataIsMalformed(composerFile, composer) || blockers.length > 2 ? "low" : "medium",
    blockers
  };
}

function analyzeComposerTestScript(scripts) {
  if (scripts !== undefined && (!scripts || typeof scripts !== "object" || Array.isArray(scripts))) {
    return { absent: false, supported: false, graph: false };
  }
  const testScript = scripts?.test;
  if (testScript === undefined) return { absent: true, supported: true, graph: false };
  if (isSupportedComposerTestScript(testScript)) return { absent: false, supported: true, graph: false };
  const rootAlias = exactComposerAlias(testScript);
  if (!rootAlias) return { absent: false, supported: false, graph: false };
  const visited = new Set();

  function resolve(name, ancestors, depth) {
    if (depth > 8 || visited.size >= 24 || ancestors.has(name) || !Object.hasOwn(scripts, name)) {
      return { valid: false, phpunit: false };
    }
    visited.add(name);
    const value = scripts[name];
    const nextAncestors = new Set(ancestors).add(name);
    if (Array.isArray(value)) {
      if (value.length === 0) return { valid: false, phpunit: false };
      const results = value.map((entry) => {
        const alias = exactComposerAlias(entry);
        return alias ? resolve(alias, nextAncestors, depth + 1) : { valid: false, phpunit: false };
      });
      return {
        valid: results.every((result) => result.valid),
        phpunit: results.some((result) => result.phpunit)
      };
    }
    const alias = exactComposerAlias(value);
    if (alias) return resolve(alias, nextAncestors, depth + 1);
    return classifyComposerQualityCommand(value);
  }

  const result = resolve(rootAlias, new Set(), 1);
  return {
    absent: false,
    supported: result.valid && result.phpunit,
    graph: result.valid && result.phpunit
  };
}

function exactComposerAlias(value) {
  if (typeof value !== "string") return undefined;
  return /^@[A-Za-z0-9_.:-]+$/.test(value.trim()) ? value.trim().slice(1) : undefined;
}

function classifyComposerQualityCommand(value) {
  if (typeof value !== "string") return { valid: false, phpunit: false };
  const command = value.trim();
  if (!command || /[\r\n;&|<>`$()]/.test(command)) return { valid: false, phpunit: false };
  const argument = "(?:--?[A-Za-z0-9][A-Za-z0-9_.:-]*(?:=[A-Za-z0-9_./:-]+)?|[A-Za-z0-9_./:-]+)";
  const phpunit = new RegExp(`^(?:phpunit|vendor/bin/phpunit|@php\\s+vendor/bin/phpunit)(?:\\s+${argument})*$`);
  if (phpunit.test(command)) return { valid: true, phpunit: true };
  const quality = new RegExp(`^(?:parallel-lint|phpcs|phpstan|phpbench)(?:\\s+${argument})*$`);
  if (quality.test(command)) return { valid: true, phpunit: false };
  const phpbench = new RegExp(`^@php\\s+-d\\s+'[A-Za-z0-9_.=-]+'\\s+vendor/bin/phpbench\\s+run(?:\\s+${argument})*$`);
  return { valid: phpbench.test(command), phpunit: false };
}

function analyzeMakeTestWorkflow(files) {
  const makefile = files.find((file) => file.path === "Makefile");
  if (!makefile) return { blockers: [] };
  const lines = makefile.content.split(/\r?\n/);
  const targetIndexes = lines
    .map((line, index) => /^test\s*:[^=]*$/.test(line) ? index : -1)
    .filter((index) => index !== -1);
  if (targetIndexes.length !== 1) return { blockers: [] };
  const [targetIndex] = targetIndexes;
  const target = /^test\s*:\s*(.*)$/.exec(lines[targetIndex]);
  const prerequisiteText = target?.[1]?.trim();
  if (!prerequisiteText || prerequisiteText.includes("|") || prerequisiteText.includes("\\")) return { blockers: [] };
  const prerequisites = prerequisiteText.split(/\s+/);
  if (prerequisites.some((name) => !/^[A-Za-z0-9_.-]+$/.test(name))) return { blockers: [] };

  const recipe = [];
  for (let index = targetIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\t/.test(line)) {
      recipe.push(line.slice(1).trim());
      continue;
    }
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;
    break;
  }
  if (!recipe.some((line) => line === "vendor/bin/phpunit" || line === "./vendor/bin/phpunit")) {
    return { blockers: [] };
  }
  const names = [...new Set(prerequisites)].sort();
  return {
    path: "Makefile",
    blockers: [`Root Makefile test target requires prerequisite orchestration (${names.join(", ")}); bare PHPUnit is not a safe default.`]
  };
}

function analyzePhpUnitBootstrap(files) {
  const config = files.find((file) => file.path === "phpunit.xml") ??
    files.find((file) => file.path === "phpunit.xml.dist");
  if (!config) return { blockers: [] };
  const match = /<phpunit\b[^>]*\bbootstrap\s*=\s*(["'])([^"']+)\1/is.exec(config.content);
  if (!match) return { blockers: [] };
  const bootstrapPath = normalizePath(match[2]).replace(/^\.\//, "");
  if (bootstrapPath === "vendor/autoload.php") return { blockers: [] };
  const bootstrap = files.find((file) => file.path === bootstrapPath);
  if (!bootstrap) return { blockers: [] };
  const content = maskComments(bootstrap.content);
  const required = detectRequiredBootstrapEnvironment(content);
  return {
    path: bootstrapPath,
    blockers: required.length > 0
      ? [`PHPUnit bootstrap ${bootstrapPath} requires explicit environment selection for ${required.join(", ")}; no default test command is safe.`]
      : []
  };
}

function detectRequiredBootstrapEnvironment(content) {
  const required = [];
  const failure = "\\b(?:exit|die)\\s*(?:\\(\\s*[1-9][0-9]*\\s*\\)|\\s+[1-9][0-9]*\\s*;)";
  const literalGetenv = "getenv\\s*\\(\\s*[\"']([A-Za-z_][A-Za-z0-9_]*)[\"']\\s*\\)";
  const switchPattern = new RegExp(
    `\\bswitch\\s*\\(\\s*\\$[A-Za-z_][A-Za-z0-9_]*\\s*=\\s*${literalGetenv}\\s*\\)[\\s\\S]{0,4000}?\\bdefault\\s*:[\\s\\S]{0,2000}?${failure}`,
    "g"
  );
  for (const match of content.matchAll(switchPattern)) required.push(match[1]);

  const assignmentPattern = new RegExp(
    `\\$([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*${literalGetenv}\\s*;`,
    "g"
  );
  for (const match of content.matchAll(assignmentPattern)) {
    const variable = escapeRegExp(match[1]);
    const suffix = content.slice(match.index + match[0].length, match.index + match[0].length + 2000);
    const missingBranch = new RegExp(
      `\\bif\\s*\\([^)]*\\$${variable}\\s*={2,3}\\s*false[^)]*\\)\\s*\\{[\\s\\S]{0,1500}?${failure}`
    );
    if (missingBranch.test(suffix)) required.push(match[2]);
  }
  return [...new Set(required)].sort();
}

function metadataIsMalformed(composerFile, composer) {
  return Boolean(composerFile) && composer === undefined;
}

function collectEvidence(sourceFiles, testFiles, ownership) {
  const evidence = new Map();
  const ownedClasses = sourceFiles.flatMap((file) => {
    const owned = ownedClass(file, ownership.sourceMappings);
    return owned ? [{ path: file.path, ...owned }] : [];
  });
  const uniqueFqns = new Map();
  const uniqueShortNames = new Map();
  for (const source of ownedClasses) {
    uniqueFqns.set(source.fqn, uniqueFqns.has(source.fqn) ? undefined : source);
    uniqueShortNames.set(source.shortName, uniqueShortNames.has(source.shortName) ? undefined : source);
  }

  for (const test of testFiles) {
    const imports = collectUseImports(test.content);
    const references = new Map(imports);
    const namespace = declaredNamespace(test.content);
    if (namespace) {
      for (const source of uniqueFqns.values()) {
        if (source && source.fqn === `${namespace}\\${source.shortName}` && !references.has(source.shortName)) {
          references.set(source.shortName, source.fqn);
        }
      }
    }
    const exceptionExpectations = collectDirectExceptionExpectations(test.content);
    const assertedLocalResults = collectAssertedLocalResultClasses(test.content);
    for (const [shortName, fqn] of references) {
      const source = uniqueFqns.get(fqn);
      const exceptionExpectation = exceptionExpectations.has(shortName);
      if (!source || (!hasClassUsage(test.content, shortName) && !exceptionExpectation)) continue;
      addEvidence(evidence, source.path, {
        testPath: test.path,
        kind: exceptionExpectation ? "php-exception-expectation" : "php-symbol-reference",
        strength: "direct",
        usage: exceptionExpectation || hasAssertedUsage(test.content, shortName) || assertedLocalResults.has(shortName)
          ? "asserted"
          : "called"
      });
    }
    const conventionalName = path.basename(test.path, "Test.php");
    const fallback = uniqueShortNames.get(conventionalName);
    if (fallback && !evidence.get(fallback.path)?.some((item) => item.testPath === test.path)) {
      addEvidence(evidence, fallback.path, {
        testPath: test.path,
        kind: "filename-convention",
        strength: "naming"
      });
    }
  }
  return evidence;
}

function classifySourceFile(file) {
  const masked = maskCommentsAndStrings(file.content);
  const methods = [...masked.matchAll(/\b(?:public|protected|private)?\s*(?:static\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)]
    .map((match) => match[1])
    .filter((name) => name !== "__construct");
  if (methods.length === 0) {
    return {
      kind: "data-model",
      signals: ["low-runtime-behavior"],
      riskReductionScore: 1,
      maintenanceCost: 1,
      skipReason: "No owned runtime methods were detected in this class."
    };
  }
  const boundary = /(?:Controller|Repository|Gateway|Client)$/i.test(path.basename(file.path, ".php"));
  const branching = /\b(?:if|elseif|switch|match|catch|throw)\b|\?|&&|\|\|/.test(masked);
  return {
    kind: boundary ? "boundary" : "module",
    signals: [
      boundary ? "external-boundary" : "runtime-behavior",
      ...(branching ? ["branching-logic", "edge-case-surface"] : [])
    ],
    risk: boundary || branching ? "high" : "medium",
    testability: boundary ? "medium" : "high",
    testLevel: boundary ? "integration" : "unit",
    riskReductionScore: boundary || branching ? 8 : 6,
    maintenanceCost: boundary ? 5 : 3,
    reasons: [
      boundary ? "External boundary behavior" : "Owned runtime behavior",
      ...(branching ? ["Branching or error behavior"] : [])
    ]
  };
}

function collectRunnablePhpUnitTests(testFiles, mappings, sourceFiles = [], sourceMappings = []) {
  const testClasses = testFiles.map((file) => {
    const masked = maskCommentsAndStrings(file.content);
    const owned = ownedClass(file, mappings, masked);
    const parentFqn = owned ? resolveDeclaredParentFqn(file.content, owned.shortName, masked) : undefined;
    return { file, masked, owned, parentFqn };
  });
  const sourceClasses = sourceFiles.map((file) => {
    const masked = maskCommentsAndStrings(file.content);
    const owned = ownedClass(file, sourceMappings, masked);
    const parentFqn = owned ? resolveDeclaredParentFqn(file.content, owned.shortName, masked) : undefined;
    return { file, masked, owned, parentFqn };
  });
  const uniqueClasses = new Map();
  for (const localClass of [...testClasses, ...sourceClasses].filter((candidate) => candidate.owned && candidate.parentFqn)) {
    uniqueClasses.set(localClass.owned.fqn, uniqueClasses.has(localClass.owned.fqn) ? undefined : localClass);
  }

  return testClasses.filter(({ file, masked, owned, parentFqn }) => {
    if (!file.path.endsWith("Test.php") || !hasPublicTestMethod(masked)) return false;
    if (directlyExtendsPhpUnitTestCase(masked)) return true;
    if (!owned) return false;
    const localBase = parentFqn ? uniqueClasses.get(parentFqn) : undefined;
    return Boolean(localBase && localBase.parentFqn === "PHPUnit\\Framework\\TestCase");
  }).map(({ file }) => file);
}

function hasPublicTestMethod(masked) {
  return /\bpublic\s+function\s+test[A-Za-z0-9_]*\s*\(/.test(masked);
}

function directlyExtendsPhpUnitTestCase(masked) {
  return /\bclass\s+[A-Za-z_][A-Za-z0-9_]*\s+extends\s+(?:\\?PHPUnit\\Framework\\)?TestCase\b/.test(masked);
}

function resolveDeclaredParentFqn(content, className, masked = maskCommentsAndStrings(content)) {
  const declaration = new RegExp(
    `\\b(?:abstract\\s+|final\\s+)?class\\s+${escapeRegExp(className)}\\s+extends\\s+(\\\\?[A-Za-z_][A-Za-z0-9_\\\\]*)\\b`
  ).exec(masked);
  if (!declaration) return undefined;
  const reference = declaration[1];
  if (reference.startsWith("\\")) return reference.slice(1);
  if (reference.includes("\\")) return undefined;
  const header = content.slice(0, declaration.index);
  const maskedHeader = masked.slice(0, declaration.index);
  const imported = collectUseImports(header).get(reference);
  if (imported) return imported;
  const namespace = /\bnamespace\s+([A-Za-z_\\][A-Za-z0-9_\\]*)\s*;/.exec(maskedHeader)?.[1];
  return namespace ? `${namespace}\\${reference}` : reference;
}

function isSupportedComposerTestScript(script) {
  return typeof script === "string" && ["phpunit", "vendor/bin/phpunit", "@php vendor/bin/phpunit"].includes(script.trim());
}

function collectUseImports(content) {
  const imports = new Map();
  for (const match of content.matchAll(/^\s*use\s+([A-Za-z_\\][A-Za-z0-9_\\]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*;/gm)) {
    const fqn = match[1].replace(/^\\/, "");
    imports.set(match[2] ?? fqn.split("\\").at(-1), fqn);
  }
  return imports;
}

function declaredNamespace(content) {
  return /\bnamespace\s+([A-Za-z_\\][A-Za-z0-9_\\]*)\s*;/.exec(maskCommentsAndStrings(content))?.[1];
}

function hasClassUsage(content, name) {
  return new RegExp(`\\b(?:new\\s+${escapeRegExp(name)}\\b|${escapeRegExp(name)}::[A-Za-z_][A-Za-z0-9_]*\\s*\\()`).test(maskComments(content));
}

function hasAssertedUsage(content, name) {
  const escaped = escapeRegExp(name);
  return new RegExp(`(?:assert[A-Za-z_]*|expect)\\s*\\([^;]*\\b${escaped}::[A-Za-z_][A-Za-z0-9_]*\\s*\\(`, "s").test(maskComments(content));
}

function collectDirectExceptionExpectations(content) {
  const names = new Set();
  const expectation = /\bexpectException\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)::class\s*\)/g;
  for (const line of content.split("\n")) {
    for (const match of maskCommentsAndStrings(line).matchAll(expectation)) names.add(match[1]);
  }
  return names;
}

function collectAssertedLocalResultClasses(content) {
  const classes = new Set();
  const masked = maskCommentsAndStrings(content);
  const assignment = /\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)::[A-Za-z_][A-Za-z0-9_]*\s*\(/g;
  for (const match of masked.matchAll(assignment)) {
    const statementEnd = masked.indexOf(";", match.index + match[0].length);
    if (statementEnd === -1 || statementEnd - match.index > 1500) continue;
    let suffix = masked.slice(statementEnd + 1, statementEnd + 4001);
    const methodBoundary = /\b(?:public|protected|private)\s+(?:static\s+)?function\b/.exec(suffix)?.index;
    if (methodBoundary !== undefined) suffix = suffix.slice(0, methodBoundary);
    const variable = escapeRegExp(match[1]);
    const reassignment = new RegExp(`\\$${variable}\\s*=`).exec(suffix)?.index;
    if (reassignment !== undefined) suffix = suffix.slice(0, reassignment);
    const assertedUse = new RegExp(`\\bassert[A-Za-z_][A-Za-z0-9_]*\\s*\\([^;]{0,1500}\\$${variable}\\b`, "s");
    if (assertedUse.test(suffix)) classes.add(match[2]);
  }
  return classes;
}

function ownedClass(file, mappings, masked = maskCommentsAndStrings(file.content)) {
  const mapping = mappings.find((candidate) => isUnderRoot(file.path, candidate.root));
  const className = /\b(?:class|interface|trait|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(masked)?.[1];
  const namespace = /\bnamespace\s+([A-Za-z_\\][A-Za-z0-9_\\]*)\s*;/.exec(masked)?.[1];
  if (!mapping || !className || !namespace) return undefined;
  const relative = file.path.slice(mapping.root.length).replace(/\.php$/, "").replaceAll("/", "\\");
  const expectedFqn = `${mapping.namespace}${relative}`;
  const declaredFqn = `${namespace}\\${className}`;
  return expectedFqn === declaredFqn ? { fqn: declaredFqn, shortName: className } : undefined;
}

function ownedFunctionFile(file, ownership, masked = maskCommentsAndStrings(file.content)) {
  if (!ownership.functionFiles.includes(file.path)) return undefined;
  const mapping = ownership.sourceMappings.find((candidate) => isUnderRoot(file.path, candidate.root));
  const namespaces = [...masked.matchAll(/\bnamespace\s+([A-Za-z_\\][A-Za-z0-9_\\]*)\s*;/g)].map((match) => match[1]);
  const hasNamedFunction = /\bfunction\s+&?\s*[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(masked);
  const hasClassDeclaration = /\b(?:class|interface|trait|enum)\s+[A-Za-z_][A-Za-z0-9_]*\b/.test(masked);
  if (!mapping || namespaces.length !== 1 || !hasNamedFunction || hasClassDeclaration) return undefined;
  return `${namespaces[0]}\\`.startsWith(mapping.namespace) ? { namespace: namespaces[0] } : undefined;
}

function addEvidence(map, sourcePath, item) {
  if (!map.has(sourcePath)) map.set(sourcePath, []);
  map.get(sourcePath).push(item);
}

function maskCommentsAndStrings(content) {
  return maskComments(content).replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/gs, (value) => " ".repeat(value.length));
}

function maskComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*/g, (value) => " ".repeat(value.length));
}

function isUnderRoot(filePath, root) {
  return filePath.startsWith(root) && filePath.endsWith(".php");
}

function normalizeDirectory(directory) {
  const normalized = normalizePath(directory).replace(/^\.\//, "").replace(/\/+$/, "");
  return normalized ? `${normalized}/` : "";
}

function normalizeChangedPath(root, currentPath) {
  const portable = normalizePath(currentPath);
  if (path.isAbsolute(currentPath)) return normalizePath(path.relative(root, currentPath));
  if (/^[A-Za-z]:\//.test(portable)) {
    const portableRoot = normalizePath(root);
    return portable.startsWith(`${portableRoot}/`) ? portable.slice(portableRoot.length + 1) : portable;
  }
  return portable.replace(/^\.\//, "");
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function firstDirectory(filePath) {
  return filePath.split("/")[0];
}

function byRiskThenName(left, right) {
  const risk = { high: 0, medium: 1, low: 2 };
  return (risk[left.risk] ?? 3) - (risk[right.risk] ?? 3) || left.name.localeCompare(right.name);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
