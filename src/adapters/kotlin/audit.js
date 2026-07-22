import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = [".kt", ".java"];
const BUILD_FILE_NAMES = new Set([
  "build.gradle",
  "build.gradle.kts",
  "gradle.properties",
  "gradlew",
  "gradlew.bat",
  "mvnw",
  "mvnw.cmd",
  "pom.xml",
  "settings.gradle",
  "settings.gradle.kts"
]);

export function auditKotlinRepo(root, options = {}) {
  const files = readRepoFiles(root);
  const profile = buildProfile(root, files);
  const changedPaths = options.changedPaths
    ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(root, currentPath)))
    : undefined;
  const testFiles = files
    .filter((file) => isEvidenceTestFile(file))
    .map((file) => ({ ...file, path: normalizePath(file.path), analysis: analyzeJvmFile(file.content, file.path) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const sourceFiles = files.filter((candidate) => isSourceFile(candidate.path));
  const sourceSymbols = collectSourceSymbols(sourceFiles);
  const testEvidenceBySourcePath = collectJvmTestEvidence(sourceSymbols, testFiles);
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];

  for (const file of sourceFiles.filter((candidate) => isIncludedByChangedPaths(candidate.path, changedPaths))) {
    const name = basenameWithoutExtension(file.path);
    const classification = classifySourceFile(file);
    const existingTestEvidence = testEvidenceBySourcePath.get(normalizePath(file.path)) ?? [];
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
      signals: existingTestPaths.length > 0 ? [...classification.signals, "matching-test"] : classification.signals,
      risk: classification.risk,
      testability: classification.testability,
      recommendedTestLevel: classification.testLevel,
      riskReductionScore: classification.riskReductionScore,
      maintenanceCost: classification.maintenanceCost,
      reasons:
        existingTestPaths.length > 0
          ? [...classification.reasons, "Existing test evidence detected; review missing edge cases"]
          : classification.reasons,
      existingTestPaths,
      ...(existingTestEvidence.length > 0 ? { existingTestEvidence } : {})
    };

    if (existingTestPaths.length > 0) coveredButRisky.push(target);
    else untestedCandidates.push(target);

    if (classification.risk === "high") {
      const coverageState = existingTestPaths.length > 0 ? "needs edge-case review" : "has no matching test evidence";
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
  return !changedPaths || changedPaths.has(normalizePath(currentPath));
}

function readRepoFiles(root) {
  const ignored = new Set([".git", ".gradle", ".idea", "build", "generated", "out", "target"]);
  const files = [];

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      const relative = normalizePath(path.relative(root, absolute));

      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (entry.isSymbolicLink()) continue;
      if (shouldRead(relative)) files.push({ path: relative, content: fs.readFileSync(absolute, "utf8") });
    }
  }

  visit(root);
  return files;
}

function shouldRead(relative) {
  return SOURCE_EXTENSIONS.some((extension) => relative.endsWith(extension)) || BUILD_FILE_NAMES.has(relative);
}

function buildProfile(root, files) {
  const paths = files.map((file) => normalizePath(file.path));
  const buildText = files
    .filter((file) => ["build.gradle", "build.gradle.kts", "pom.xml"].includes(normalizePath(file.path)))
    .map((file) => file.content)
    .join("\n");
  const testText = files.filter((file) => isTestFile(file.path)).map((file) => file.content).join("\n");
  const testFrameworks = detectTestFrameworks(buildText, testText);
  const unsupportedTestFrameworks = detectUnsupportedTestFrameworks(buildText);
  const unsupportedProjectShapes = detectUnsupportedProjectShapes(buildText, paths);
  const testCommand = detectTestCommand(paths, testFrameworks);
  const existingTestLocations = detectExistingTestLocations(paths);
  const blockers = detectBlockers(paths, testCommand, testFrameworks, unsupportedTestFrameworks, unsupportedProjectShapes);

  return {
    root,
    languages: detectLanguages(paths),
    packageManagers: detectPackageManagers(paths),
    testFrameworks,
    architectures: ["jvm"],
    testCommand,
    detectedConventions: detectConventions(paths),
    existingTestLocations,
    setupSignals: detectSetupSignals(paths, buildText, testText),
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
  if (paths.includes("build.gradle") || paths.includes("build.gradle.kts")) managers.add("gradle");
  if (paths.includes("pom.xml")) managers.add("maven");
  return [...managers].sort();
}

function detectTestFrameworks(buildText, testText) {
  const frameworks = new Set();
  if (/kotlin\s*\(\s*["']test["']\s*\)|\bkotlin-test\b|\bkotlin\.test\b/.test(`${buildText}\n${testText}`)) frameworks.add("kotlin-test");
  if (/\b(?:junit|org\.junit|useJUnitPlatform)\b/i.test(`${buildText}\n${testText}`)) frameworks.add("junit");
  return [...frameworks].sort();
}

function detectUnsupportedTestFrameworks(buildText) {
  const frameworks = new Set();
  if (/\bspock(?:framework)?\b/i.test(buildText)) frameworks.add("spock");
  if (/\btestng\b/i.test(buildText)) frameworks.add("testng");
  if (/\b(?:io\.kotest|kotest-runner)\b/i.test(buildText)) frameworks.add("kotest");
  return [...frameworks].sort();
}

function detectUnsupportedProjectShapes(buildText, paths) {
  const shapes = [];
  if (
    /\bcom\.android\.(?:application|library|test)\b|\bid\s*\(?\s*["']com\.android\./i.test(buildText) ||
    paths.some((currentPath) => currentPath.startsWith("src/androidTest/"))
  ) {
    shapes.push("Android unit and instrumentation source sets are outside the supported JVM module boundary.");
  }
  return shapes;
}

function detectTestCommand(paths, frameworks) {
  if (frameworks.length === 0) return undefined;
  if (paths.includes("gradlew") || paths.includes("gradlew.bat")) return "./gradlew test";
  if (paths.includes("build.gradle") || paths.includes("build.gradle.kts")) return "gradle test";
  if (paths.includes("mvnw") || paths.includes("mvnw.cmd")) return "./mvnw test";
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
  if (paths.some((item) => /(?:^|\/)(?:Test[^/]*|[^/]*(?:Test|Tests|TestCase))\.(?:kt|java)$/.test(item))) conventions.add("*Test files");
  if (paths.some((item) => item.startsWith("src/test/kotlin/"))) conventions.add("src/test/kotlin");
  if (paths.some((item) => item.startsWith("src/test/java/"))) conventions.add("src/test/java");
  return [...conventions];
}

function detectSetupSignals(paths, buildText, testText) {
  const signals = new Set();
  if (paths.includes("build.gradle.kts")) signals.add("gradle kotlin dsl");
  if (paths.includes("build.gradle")) signals.add("gradle");
  if (paths.includes("settings.gradle.kts") || paths.includes("settings.gradle")) signals.add("gradle settings");
  if (paths.includes("gradlew") || paths.includes("gradlew.bat")) signals.add("gradle wrapper");
  if (paths.includes("pom.xml")) signals.add("maven");
  if (paths.includes("mvnw") || paths.includes("mvnw.cmd")) signals.add("maven wrapper");
  if (/useJUnitPlatform|org\.junit\.jupiter/i.test(`${buildText}\n${testText}`)) signals.add("junit platform");
  if (/org\.junit(?!\.jupiter)/i.test(`${buildText}\n${testText}`)) signals.add("junit 4");
  return [...signals];
}

function detectBlockers(paths, testCommand, frameworks, unsupportedTestFrameworks, unsupportedProjectShapes) {
  const blockers = [];
  if (frameworks.length === 0) blockers.push("No supported JVM test framework detected.");
  if (!testCommand) blockers.push("No runnable JVM test command detected from Gradle or Maven markers.");
  if (!paths.some((currentPath) => isSourceFile(currentPath))) {
    const hasNestedSourceSet = paths.some((currentPath) => /(?:^|\/)src\/main\/(?:kotlin|java)\/.+\.(?:kt|java)$/.test(currentPath));
    blockers.push(
      hasNestedSourceSet
        ? "No supported root JVM source set detected; audit a Gradle or Maven module root."
        : "No supported src/main/java or src/main/kotlin source set detected."
    );
  }
  if (unsupportedTestFrameworks.length > 0) blockers.push(`Unsupported JVM test frameworks detected: ${unsupportedTestFrameworks.join(", ")}.`);
  blockers.push(...unsupportedProjectShapes);
  return blockers;
}

function scoreProfileConfidence(testFrameworks, existingTestLocations, blockers) {
  if (testFrameworks.length === 0 || blockers.some((blocker) => blocker.startsWith("No supported root") || blocker.startsWith("No supported src/main"))) return "low";
  if (blockers.length > 0) return "medium";
  if (testFrameworks.length > 0 && existingTestLocations.length > 0) return "high";
  if (testFrameworks.length > 0) return "medium";
  return "low";
}

function classifySourceFile(file) {
  const currentPath = normalizePath(file.path);
  const content = stripJvmCommentsAndStrings(file.content);
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

  if (isDeclarationOnly(content)) {
    return skipped(
      "low-value",
      ["low-runtime-behavior"],
      1,
      3,
      "No meaningful runtime behavior detected by current JVM heuristics.",
      "Cover through tests for the behavior that consumes this declaration."
    );
  }

  if (matchesAny(lowerPath, ["calculator", "parser", "mapper", "validator", "formatter", "converter", "normalizer"])) {
    return recommended("pure-logic", ["pure-logic", "edge-case-surface"], "high", "high", "unit", 9, 2, ["Pure transformation logic", "edge-case surface"]);
  }

  if (matchesAny(lowerPath, ["service", "client", "repository", "gateway"])) {
    const external = hasExternalBoundary(content);
    return recommended(
      "service",
      external ? ["service-name", "external-boundary"] : ["service-name"],
      external ? "high" : "medium",
      "medium",
      external ? "integration" : "unit",
      external ? 8 : 6,
      external ? 5 : 4,
      external ? ["Service boundary", "External I/O boundary"] : ["Service boundary"]
    );
  }

  if (hasBranching(content)) {
    return recommended("utility", ["branching-logic"], "medium", "high", "unit", 5, 2, ["Branching logic"]);
  }

  return skipped(
    "low-value",
    ["low-runtime-behavior"],
    1,
    3,
    "No meaningful runtime behavior detected by current JVM heuristics.",
    "Cover through tests for the behavior that consumes this file."
  );
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

function collectSourceSymbols(sourceFiles) {
  const sources = [];
  for (const file of sourceFiles) {
    const analysis = analyzeJvmFile(file.content, file.path);
    const fallbackName = basenameWithoutExtension(file.path);
    const symbols = [...new Set([...analysis.declarations, fallbackName])].sort();
    sources.push({
      path: normalizePath(file.path),
      packageName: analysis.packageName,
      symbols,
      qualifiedSymbols: symbols.map((symbol) => analysis.packageName ? `${analysis.packageName}.${symbol}` : symbol)
    });
  }
  return sources;
}

function collectJvmTestEvidence(sourceSymbols, testFiles) {
  const evidenceBySourcePath = new Map();

  for (const source of sourceSymbols) {
    const evidence = [];
    for (const testFile of testFiles) {
      const match = findJvmTestMatch(source, testFile.analysis);
      if (!match) continue;
      evidence.push({
        testPath: testFile.path,
        kind: "jvm-symbol-reference",
        strength: match.strength,
        ...(match.usage ? { usage: match.usage } : {})
      });
    }
    if (evidence.length > 0) evidenceBySourcePath.set(source.path, evidence.sort((a, b) => a.testPath.localeCompare(b.testPath)));
  }

  return evidenceBySourcePath;
}

function findJvmTestMatch(source, test) {
  for (let index = 0; index < source.symbols.length; index += 1) {
    const symbol = source.symbols[index];
    const qualified = source.qualifiedSymbols[index];
    const exactImport = test.imports.find(
      (currentImport) => currentImport.qualified === qualified || currentImport.qualified.startsWith(`${qualified}.`)
    );
    if (exactImport) {
      const importedName = exactImport.qualified.split(".").at(-1);
      const reference = exactImport.alias ?? (exactImport.qualified === qualified ? symbol : importedName);
      return { strength: "direct", usage: jvmReferenceUsage(test.content, reference) };
    }

    const wildcardImport = source.packageName && test.imports.some((currentImport) => currentImport.qualified === `${source.packageName}.*`);
    if ((test.packageName === source.packageName || wildcardImport) && containsJvmReference(test.content, symbol)) {
      return { strength: "referenced", usage: jvmReferenceUsage(test.content, symbol) };
    }

    if (qualified && qualified !== symbol && containsJvmReference(test.content, qualified)) {
      return { strength: "referenced", usage: jvmReferenceUsage(test.content, qualified) };
    }
  }
  return undefined;
}

function analyzeJvmFile(content, currentPath) {
  const stripped = stripJvmCommentsAndStrings(content);
  const packageName = stripped.match(/^\s*package\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;?/m)?.[1] ?? "";
  const imports = [];
  const importPattern = /^\s*import\s+(static\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$*][\w$*]*)*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*;?/gm;
  for (const match of stripped.matchAll(importPattern)) imports.push({ qualified: match[2], alias: match[3], static: Boolean(match[1]) });

  const declarations = new Set();
  const typePattern = /\b(?:class|interface|object|enum\s+class|enum|record)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of stripped.matchAll(typePattern)) declarations.add(match[1]);
  if (currentPath.endsWith(".kt")) {
    const functionPattern = /^(?:\s*(?:public|internal|private|protected|inline|tailrec|suspend|operator|infix|external|expect|actual|open|final|override)\s+)*\s*fun\s+(?:<[^>]+>\s*)?([A-Za-z_$][\w$]*)\s*\(/gm;
    for (const match of stripped.matchAll(functionPattern)) declarations.add(match[1]);
  }

  return { packageName, imports, declarations: [...declarations], content: stripped };
}

function containsJvmReference(content, reference) {
  const escaped = escapeRegExp(reference);
  return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(content);
}

function jvmReferenceUsage(content, reference) {
  const escaped = escapeRegExp(reference);
  const assertionBodies = jvmAssertionBodies(content);
  if (assertionBodies.some((body) => containsJvmReference(body, reference))) return "asserted";

  const aliases = collectJvmReferenceAliases(content, escaped);
  if (assertionBodies.some((body) => [...aliases].some((alias) => containsJvmReference(body, alias)))) return "asserted";
  if (new RegExp(`(?<![\\w$])${escaped}(?![\\w$])\\s*(?:\\(|\\.)`).test(content)) return "called";
  return undefined;
}

function collectJvmReferenceAliases(content, escapedReference) {
  const aliases = new Set();
  const directCall = new RegExp(`(?:new\\s+)?(?<![\\w$])${escapedReference}(?![\\w$])\\s*(?:<[^>\\n]+>\\s*)?\\(`);

  for (const line of content.split("\n")) {
    const equalsIndex = line.indexOf("=");
    if (equalsIndex < 0) continue;
    const left = line.slice(0, equalsIndex).trim();
    const right = line.slice(equalsIndex + 1);
    if (!directCall.test(right)) continue;
    const alias = left.match(/([A-Za-z_$][\w$]*)\s*(?::[^=]+)?$/)?.[1];
    if (alias) aliases.add(alias);
  }

  let foundNewAlias = true;
  while (foundNewAlias) {
    foundNewAlias = false;
    for (const line of content.split("\n")) {
      const equalsIndex = line.indexOf("=");
      if (equalsIndex < 0) continue;
      const left = line.slice(0, equalsIndex).trim();
      const right = line.slice(equalsIndex + 1);
      if (![...aliases].some((alias) => new RegExp(`(?<![\\w$])${escapeRegExp(alias)}(?![\\w$])\\s*\\.`).test(right))) continue;
      const resultAlias = left.match(/([A-Za-z_$][\w$]*)\s*(?::[^=]+)?$/)?.[1];
      if (resultAlias && !aliases.has(resultAlias)) {
        aliases.add(resultAlias);
        foundNewAlias = true;
      }
    }
  }

  return aliases;
}

function jvmAssertionBodies(content) {
  const bodies = [];
  const matcher = /\b(?:assert[A-Za-z]*|verify|expect)\s*(?:<[^>\n]+>\s*)?([({])/g;
  let match;

  while ((match = matcher.exec(content)) !== null) {
    const opening = match[1];
    const closing = opening === "(" ? ")" : "}";
    let depth = 1;
    let index = matcher.lastIndex;
    for (; index < content.length && depth > 0; index += 1) {
      if (content[index] === opening) depth += 1;
      else if (content[index] === closing) depth -= 1;
    }
    bodies.push(content.slice(matcher.lastIndex, index - 1));
    matcher.lastIndex = index;
  }

  return bodies;
}

function isSourceFile(currentPath) {
  const normalized = normalizePath(currentPath);
  return /^(?:src\/main\/(?:kotlin|java)\/).+\.(?:kt|java)$/.test(normalized);
}

function isTestFile(currentPath) {
  const normalized = normalizePath(currentPath);
  return /^(?:src\/test\/(?:kotlin|java)\/).+\.(?:kt|java)$/.test(normalized);
}

function isEvidenceTestFile(file) {
  if (!isTestFile(file.path)) return false;
  const content = stripJvmCommentsAndStrings(file.content);
  return /@(?:[A-Za-z_$][\w$]*\.)*(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate|RunWith)\b|\bextends\s+(?:junit\.framework\.)?TestCase\b/.test(content);
}

function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/");
}

function normalizeChangedPath(root, currentPath) {
  if (path.isAbsolute(currentPath)) return stripCurrentDirectoryPrefix(normalizePath(path.relative(root, currentPath)));
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

function hasBranching(content) {
  return /\b(if|when|switch|try|catch)\b|\?\s*[^:]+:/.test(content);
}

function hasExternalBoundary(content) {
  return /\b(?:HttpClient|URL|URLConnection|Socket|Files\.|File\(|Path\.|DataSource|Connection|EntityManager|JdbcTemplate|WebClient|RestTemplate)\b|\bjava\.(?:net|nio\.file|sql)\b/.test(content);
}

function isDtoLike(currentPath, content) {
  return (
    /(dto|model|request|response)/i.test(currentPath) &&
    (/\bdata\s+class\s+/.test(content) || /\brecord\s+[A-Za-z_$][\w$]*\s*\(/.test(content))
  );
}

function isDeclarationOnly(content) {
  return /^\s*(?:package\s+[^\n;]+;?\s*)?(?:import\s+[^\n;]+;?\s*)*(?:(?:public\s+)?(?:interface|enum)\b)/.test(content) && !hasBranching(content);
}

function stripJvmCommentsAndStrings(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function byRiskThenName(a, b) {
  const order = { high: 0, medium: 1, low: 2 };
  return order[a.risk] - order[b.risk] || a.name.localeCompare(b.name);
}
