import fs from "node:fs";
import path from "node:path";
import {
  cargoSectionString,
  findNearestCargoWorkspace,
  hasCargoSection
} from "./cargo-workspace.js";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".idea",
  ".vscode",
  "benches",
  "examples",
  "fixtures",
  "target",
  "testdata",
  "vendor"
]);

export function auditRustRepo(root, options = {}) {
  const files = readRepoFiles(root);
  const manifest = files.find((file) => file.path === "Cargo.toml");
  const sourceTargets = collectCargoSourceTargets(manifest?.content ?? "", files);
  const crateRootPaths = collectCargoCrateRootPaths(files, sourceTargets);
  const moduleGraph = collectRustModuleGraph(files, crateRootPaths);
  const sourcePaths = new Set([
    ...files.filter((file) => isSourceFile(file.path)).map((file) => file.path),
    ...moduleGraph.paths
  ]);
  const sourceFiles = files.filter((file) => sourcePaths.has(file.path));
  const integrationTests = files.filter((file) => isIntegrationTestFile(file.path) && hasRunnableRustTest(file.content));
  const inlineTestFiles = sourceFiles.filter((file) => hasInlineRustTests(file.content));
  const explicitTestTargets = collectCargoExplicitTestTargets(manifest?.content ?? "", files);
  const workspaceContext = findNearestCargoWorkspace(root);
  const profile = buildProfile(
    root,
    manifest,
    sourceFiles,
    integrationTests,
    inlineTestFiles,
    explicitTestTargets,
    sourceTargets,
    moduleGraph,
    workspaceContext
  );
  const changedPaths = options.changedPaths
    ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(root, currentPath)))
    : undefined;
  const testEvidenceBySourcePath = collectRustTestEvidence(
    profile.crateImportName,
    sourceFiles,
    integrationTests,
    inlineTestFiles
  );
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];

  for (const file of sourceFiles.filter((candidate) => isIncludedByChangedPaths(candidate.path, changedPaths))) {
    const classification = classifySourceFile(file);
    const name = basenameWithoutExtension(file.path);
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
        ? [...classification.reasons, "Existing Rust test evidence detected; review missing edge cases"]
        : classification.reasons,
      existingTestPaths,
      ...(existingTestEvidence.length > 0 ? { existingTestEvidence } : {})
    };

    if (existingTestPaths.length > 0) coveredButRisky.push(target);
    else untestedCandidates.push(target);

    if (classification.risk === "high") {
      const coverageState = existingTestPaths.length > 0
        ? "needs edge-case review"
        : "has no matching Rust test evidence";
      risks.push(`${name} has ${classification.reasons.join(", ").toLowerCase()} and ${coverageState}.`);
    }
  }

  const recommended = [...untestedCandidates, ...coveredButRisky].sort(byRiskThenName);
  const { crateImportName: _crateImportName, ...publicProfile } = profile;
  return {
    schemaVersion: "audit/v1",
    profile: publicProfile,
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
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      const relative = normalizePath(path.relative(root, absolute));
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (current !== root && fs.existsSync(path.join(absolute, "Cargo.toml"))) continue;
        visit(absolute);
      } else if (relative.endsWith(".rs") || relative === "Cargo.toml") {
        files.push({ path: relative, content: fs.readFileSync(absolute, "utf8") });
      }
    }
  }

  visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function buildProfile(
  root,
  manifest,
  sourceFiles,
  integrationTests,
  inlineTestFiles,
  explicitTestTargets,
  sourceTargets,
  moduleGraph,
  workspaceContext
) {
  const manifestContent = manifest?.content ?? "";
  const hasPackage = hasCargoSection(manifestContent, "package");
  const hasWorkspace = hasCargoSection(manifestContent, "workspace");
  const packageName = cargoSectionString(manifestContent, "package", "name");
  const edition = cargoSectionString(manifestContent, "package", "edition");
  const hasRunnableTests = integrationTests.length > 0 || inlineTestFiles.length > 0;
  const hasBuiltInTestHarness = hasRunnableTests || explicitTestTargets.length > 0;
  const blockers = [];
  if (!manifest) blockers.push("No root Cargo.toml detected for the bounded Rust package adapter.");
  if (manifest && !hasPackage) blockers.push(workspaceContext?.local
    ? "Cargo workspace roots must be audited through their declared package projects."
    : "No root Cargo package detected for the bounded Rust package adapter.");
  if (workspaceContext && !workspaceContext.complete) {
    blockers.push("Cargo workspace members and default-members must resolve to literal repository-contained packages before command ownership is complete.");
  } else if (workspaceContext && !workspaceContext.declared && hasPackage) {
    blockers.push("The package is not literally declared by the nearest Cargo workspace, so command ownership is incomplete.");
  }
  if (hasPackage && !packageName) blockers.push("Cargo package.name must be a static string for Rust import ownership.");
  if (/^\s*harness\s*=\s*false\s*$/m.test(manifestContent)) {
    blockers.push("Custom Rust test harnesses are outside the bounded built-in test support matrix.");
  }
  if (!sourceTargets.complete) {
    blockers.push("Cargo lib and bin target paths must resolve to static repository-contained Rust files.");
  }
  if (!hasBuiltInTestHarness) blockers.push("No runnable built-in Rust #[test] detected.");

  const existingTestLocations = [];
  if (inlineTestFiles.length > 0) existingTestLocations.push("inline #[cfg(test)] modules");
  if (integrationTests.length > 0) existingTestLocations.push("tests/ integration tests");
  if (explicitTestTargets.length > 0) existingTestLocations.push("Cargo explicit test targets");
  const architectures = [];
  if (hasPackage) architectures.push("cargo-package");
  if (hasPackage && workspaceContext?.declared) architectures.push("cargo-workspace-package");
  else if (hasWorkspace) architectures.push("cargo-workspace");
  if (sourceFiles.some((file) => file.path === "src/lib.rs") || sourceTargets.libraryPaths.length > 0) architectures.push("library");
  if (
    sourceFiles.some((file) => file.path === "src/main.rs" || file.path.startsWith("src/bin/")) ||
    sourceTargets.binaryPaths.length > 0
  ) architectures.push("binary");
  const detectedConventions = [];
  if (sourceTargets.paths.length > 0) detectedConventions.push("explicit Cargo source target");
  if (moduleGraph.modulePaths.length > 0) detectedConventions.push("literal Rust module graph");
  if (inlineTestFiles.length > 0) detectedConventions.push("inline cfg(test) modules");
  if (integrationTests.length > 0) detectedConventions.push("Cargo integration tests");
  if (explicitTestTargets.length > 0) detectedConventions.push("explicit Cargo test target");
  const setupSignals = [];
  if (manifest) setupSignals.push("Cargo.toml");
  if (workspaceContext?.local) setupSignals.push("Cargo workspace");
  else if (workspaceContext) setupSignals.push("Cargo.toml (nearest workspace)");
  if (edition) setupSignals.push(`Rust ${edition} edition`);
  if (workspaceContext?.declared) setupSignals.push("Cargo workspace member");
  if (workspaceContext?.defaultMember) setupSignals.push("Cargo workspace default member");

  const testCommand = manifest && hasPackage && blockers.length === 0
    ? workspaceContext?.declared
      ? `cargo test -p ${packageName}`
      : "cargo test"
    : undefined;

  return {
    root,
    languages: ["rust"],
    packageManagers: manifest ? ["cargo"] : [],
    testFrameworks: hasBuiltInTestHarness ? ["rust-test"] : [],
    architectures,
    ...(testCommand ? { testCommand } : {}),
    detectedConventions,
    existingTestLocations,
    setupSignals,
    confidence: scoreProfileConfidence(manifest, hasPackage, hasBuiltInTestHarness, existingTestLocations, blockers),
    blockers,
    crateImportName: packageName?.replaceAll("-", "_")
  };
}

function collectCargoCrateRootPaths(files, sourceTargets) {
  const roots = new Set(sourceTargets.paths);
  for (const file of files) {
    const currentPath = normalizePath(file.path);
    if (
      currentPath === "src/lib.rs" ||
      currentPath === "src/main.rs" ||
      /^src\/bin\/[^/]+\.rs$/.test(currentPath) ||
      /^src\/bin\/[^/]+\/main\.rs$/.test(currentPath)
    ) roots.add(currentPath);
  }
  return [...roots].sort();
}

function collectRustModuleGraph(files, crateRootPaths) {
  const filesByPath = new Map(files.map((file) => [normalizePath(file.path), file]));
  const roots = new Set(crateRootPaths.filter((currentPath) => filesByPath.has(currentPath)));
  const owned = new Set(roots);
  const modulePaths = new Set();
  const queue = [...roots].sort();
  for (let index = 0; index < queue.length; index += 1) {
    const sourcePath = queue[index];
    const file = filesByPath.get(sourcePath);
    for (const modulePath of collectRustModulePaths(file, roots.has(sourcePath), filesByPath)) {
      if (owned.has(modulePath)) continue;
      owned.add(modulePath);
      modulePaths.add(modulePath);
      queue.push(modulePath);
    }
  }
  return {
    paths: [...owned].sort(),
    modulePaths: [...modulePaths].sort()
  };
}

function collectRustModulePaths(file, isCrateRoot, filesByPath) {
  const masked = maskRustCommentsAndStrings(file.content);
  const pattern = /\b(?:pub(?:\s*\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g;
  const paths = [];
  let cursor = 0;
  let depth = 0;
  for (const match of masked.matchAll(pattern)) {
    while (cursor < match.index) {
      if (masked[cursor] === "{") depth += 1;
      else if (masked[cursor] === "}") depth = Math.max(0, depth - 1);
      cursor += 1;
    }
    if (depth !== 0) continue;
    const attributeStart = rustAttributePrefixStart(masked, match.index);
    const attribute = rustStaticPathAttribute(
      file.content.slice(attributeStart, match.index),
      masked.slice(attributeStart, match.index)
    );
    if (attribute.declared) {
      const targetPath = normalizeRustModuleLink(file.path, attribute.value);
      if (targetPath && filesByPath.has(targetPath)) paths.push(targetPath);
      continue;
    }
    const base = rustModuleBasePath(file.path, isCrateRoot);
    const candidates = [
      path.posix.join(base, `${match[1]}.rs`),
      path.posix.join(base, match[1], "mod.rs")
    ].filter((candidate) => filesByPath.has(candidate));
    if (candidates.length === 1) paths.push(candidates[0]);
  }
  return [...new Set(paths)].sort();
}

function rustAttributePrefixStart(masked, declarationStart) {
  let start = declarationStart;
  while (true) {
    let cursor = start;
    while (cursor > 0 && /\s/.test(masked[cursor - 1])) cursor -= 1;
    if (masked[cursor - 1] !== "]") return start;
    let depth = 1;
    let open = cursor - 2;
    for (; open >= 0; open -= 1) {
      if (masked[open] === "]") depth += 1;
      else if (masked[open] === "[") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    let hash = open;
    while (hash > 0 && /\s/.test(masked[hash - 1])) hash -= 1;
    if (hash < 1 || masked[hash - 1] !== "#") return start;
    start = hash - 1;
  }
}

function rustStaticPathAttribute(attributes, maskedAttributes) {
  const pathAssignments = [...maskedAttributes.matchAll(/\bpath\s*=/g)];
  if (pathAssignments.length === 0) return { declared: false };
  const values = [];
  for (const match of attributes.matchAll(/#\s*\[\s*path\s*=\s*"([^"\\\r\n]*)"\s*\]/g)) values.push(match[1]);
  for (const match of attributes.matchAll(/#\s*\[\s*path\s*=\s*r(#{0,255})"([^"\r\n]*)"\1\s*\]/g)) values.push(match[2]);
  return pathAssignments.length === 1 && values.length === 1
    ? { declared: true, value: values[0] }
    : { declared: true };
}

function normalizeRustModuleLink(sourcePath, value) {
  if (!value || value.includes("\\") || path.isAbsolute(value) || path.win32.isAbsolute(value)) return undefined;
  const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(normalizePath(sourcePath)), value));
  if (!normalized.endsWith(".rs") || normalized === ".." || normalized.startsWith("../")) return undefined;
  return normalized;
}

function rustModuleBasePath(sourcePath, isCrateRoot) {
  const normalized = normalizePath(sourcePath);
  const directory = path.posix.dirname(normalized);
  if (isCrateRoot || path.posix.basename(normalized) === "mod.rs") return directory;
  return path.posix.join(directory, path.posix.basename(normalized, ".rs"));
}

function collectCargoSourceTargets(manifestContent, files) {
  const filePaths = new Set(files.map((file) => normalizePath(file.path)));
  const libraryPaths = [];
  const binaryPaths = [];
  let complete = true;
  const libraryBody = cargoTableBody(manifestContent, "lib");
  if (libraryBody !== undefined) {
    const target = cargoDeclaredTargetPath(libraryBody, filePaths);
    if (!target.complete) complete = false;
    if (target.path) libraryPaths.push(target.path);
  }
  for (const body of cargoArrayTableBodies(manifestContent, "bin")) {
    const target = cargoDeclaredTargetPath(body, filePaths);
    if (!target.complete) complete = false;
    if (target.path) binaryPaths.push(target.path);
  }
  return {
    complete,
    libraryPaths: [...new Set(libraryPaths)].sort(),
    binaryPaths: [...new Set(binaryPaths)].sort(),
    paths: [...new Set([...libraryPaths, ...binaryPaths])].sort()
  };
}

function cargoDeclaredTargetPath(body, filePaths) {
  const assignments = [...body.matchAll(/^\s*path\s*=/gm)];
  if (assignments.length === 0) return { complete: true };
  if (assignments.length !== 1) return { complete: false };
  const targetPath = normalizeCargoTargetPath(cargoTableString(body, "path"));
  if (!targetPath || !filePaths.has(targetPath)) return { complete: false };
  return { complete: true, path: targetPath };
}

function collectCargoExplicitTestTargets(manifestContent, files) {
  const filePaths = new Set(files.map((file) => normalizePath(file.path)));
  const targets = [];
  for (const body of cargoArrayTableBodies(manifestContent, "test")) {
    if (cargoTableBoolean(body, "harness") === false || cargoTableBoolean(body, "test") === false) continue;
    if (/^\s*required-features\s*=/m.test(body)) continue;
    const name = cargoTableString(body, "name");
    const declaredPath = cargoTableString(body, "path");
    const targetPath = normalizeCargoTargetPath(declaredPath ?? (name ? `tests/${name}.rs` : undefined));
    if (!targetPath || !filePaths.has(targetPath)) continue;
    targets.push(targetPath);
  }
  return [...new Set(targets)].sort();
}

function cargoArrayTableBodies(content, table) {
  const pattern = new RegExp(`^\\s*\\[\\[${escapeRegExp(table)}\\]\\]\\s*(?:#.*)?$`, "gm");
  const matches = [...content.matchAll(pattern)];
  return matches.map((match) => {
    const start = match.index + match[0].length;
    const nextTable = content.slice(start).search(/^\s*\[/m);
    return nextTable === -1 ? content.slice(start) : content.slice(start, start + nextTable);
  });
}

function cargoTableBody(content, table) {
  const match = content.match(new RegExp(`^\\s*\\[${escapeRegExp(table)}\\]\\s*(?:#.*)?$`, "m"));
  if (!match) return undefined;
  const start = match.index + match[0].length;
  const nextTable = content.slice(start).search(/^\s*\[/m);
  return nextTable === -1 ? content.slice(start) : content.slice(start, start + nextTable);
}

function cargoTableString(body, key) {
  const raw = body.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*"|'[^'\\r\\n]*')\\s*(?:#.*)?$`, "m"))?.[1];
  if (!raw) return undefined;
  if (raw.startsWith("'")) return raw.slice(1, -1);
  try {
    const value = JSON.parse(raw);
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function cargoTableBoolean(body, key) {
  const value = body.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(true|false)\\s*(?:#.*)?$`, "m"))?.[1];
  return value === undefined ? undefined : value === "true";
}

function normalizeCargoTargetPath(value) {
  if (!value || path.isAbsolute(value) || path.win32.isAbsolute(value)) return undefined;
  const normalized = normalizePath(value).replace(/^\.\//, "").replace(/\/$/, "");
  if (!normalized.endsWith(".rs") || normalized.split("/").includes("..")) return undefined;
  return normalized;
}

function scoreProfileConfidence(manifest, hasPackage, hasRunnableTests, existingTestLocations, blockers) {
  if (manifest && hasPackage && hasRunnableTests && existingTestLocations.length > 0 && blockers.length === 0) return "high";
  if (manifest || hasRunnableTests) return "medium";
  return "low";
}

function collectRustTestEvidence(crateImportName, sourceFiles, integrationTests, inlineTestFiles) {
  const evidenceBySourcePath = new Map();
  for (const sourceFile of inlineTestFiles) {
    const usage = collectInlineRustUsage(sourceFile.content);
    if (usage) addRustEvidence(evidenceBySourcePath, sourceFile.path, sourceFile.path, usage);
  }

  if (!crateImportName) return evidenceBySourcePath;
  const sourcePathsByModule = new Map();
  for (const sourceFile of sourceFiles) {
    const moduleName = rustModuleName(sourceFile.path);
    if (!moduleName) continue;
    const paths = sourcePathsByModule.get(moduleName) ?? [];
    sourcePathsByModule.set(moduleName, [...paths, normalizePath(sourceFile.path)]);
  }

  for (const testFile of integrationTests) {
    const masked = maskRustCommentsAndStrings(testFile.content);
    const testBodies = rustRunnableTestRanges(masked).map((range) => masked.slice(range.start, range.end));
    for (const currentImport of collectRustImports(masked, crateImportName)) {
      const ownedPaths = sourcePathsByModule.get(currentImport.moduleName) ?? [];
      if (ownedPaths.length !== 1) continue;
      let usage;
      for (const testBody of testBodies) usage = strongerRustUsage(usage, rustBindingUsage(testBody, currentImport.binding));
      if (usage) addRustEvidence(evidenceBySourcePath, ownedPaths[0], testFile.path, usage);
    }
  }
  return evidenceBySourcePath;
}

function collectInlineRustUsage(content) {
  const masked = maskRustCommentsAndStrings(content);
  const testModules = rustCfgTestModuleRanges(masked);
  if (testModules.length === 0) return undefined;
  const runtime = maskRanges(masked, testModules);
  const declaredNames = [...runtime.matchAll(/\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>{;]*>)?\s*\(/g)]
    .map((match) => match[1]);
  const uniqueNames = declaredNames.filter((name) => declaredNames.indexOf(name) === declaredNames.lastIndexOf(name));
  let usage;
  for (const range of testModules) {
    const testBody = masked.slice(range.start, range.end);
    for (const testRange of rustRunnableTestRanges(testBody)) {
      const runnableBody = testBody.slice(testRange.start, testRange.end);
      for (const name of uniqueNames) usage = strongerRustUsage(usage, rustBindingUsage(runnableBody, name));
    }
  }
  return usage;
}

function collectRustImports(masked, crateImportName) {
  const imports = [];
  const crate = escapeRegExp(crateImportName);
  const singlePattern = new RegExp(`\\buse\\s+${crate}::([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)::([A-Za-z_][A-Za-z0-9_]*)(?:\\s+as\\s+([A-Za-z_][A-Za-z0-9_]*))?\\s*;`, "g");
  for (const match of masked.matchAll(singlePattern)) {
    imports.push({ moduleName: match[1], binding: match[3] ?? match[2] });
  }
  const groupedPattern = new RegExp(`\\buse\\s+${crate}::([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)::\\{([^{};]+)\\}\\s*;`, "g");
  for (const match of masked.matchAll(groupedPattern)) {
    for (const item of match[2].split(",")) {
      const itemMatch = item.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/);
      if (itemMatch) imports.push({ moduleName: match[1], binding: itemMatch[2] ?? itemMatch[1] });
    }
  }
  return imports;
}

function rustBindingUsage(masked, binding) {
  const name = escapeRegExp(binding);
  const callPattern = new RegExp(`\\b${name}\\s*(?:!|\\()`, "m");
  if (!callPattern.test(masked)) return undefined;
  const assertionPattern = new RegExp(`\\b(?:assert|assert_eq|assert_ne|debug_assert|debug_assert_eq|debug_assert_ne)!\\s*\\([^;]*\\b${name}\\s*(?:!|\\()`, "m");
  return assertionPattern.test(masked) ? "asserted" : "called";
}

function addRustEvidence(evidenceBySourcePath, sourcePath, testPath, usage) {
  if (!usage) return;
  const normalizedSourcePath = normalizePath(sourcePath);
  const normalizedTestPath = normalizePath(testPath);
  const current = evidenceBySourcePath.get(normalizedSourcePath) ?? [];
  const existingIndex = current.findIndex((evidence) => evidence.testPath === normalizedTestPath);
  const evidence = {
    testPath: normalizedTestPath,
    kind: "rust-symbol-reference",
    strength: "direct",
    usage
  };
  if (existingIndex === -1) current.push(evidence);
  else if (strongerRustUsage(current[existingIndex].usage, usage) !== current[existingIndex].usage) current[existingIndex] = evidence;
  current.sort((left, right) => left.testPath.localeCompare(right.testPath));
  evidenceBySourcePath.set(normalizedSourcePath, current);
}

function strongerRustUsage(left, right) {
  if (left === "asserted" || right === "asserted") return "asserted";
  return left ?? right;
}

function rustModuleName(sourcePath) {
  const normalized = normalizePath(sourcePath);
  if (!normalized.startsWith("src/") || !normalized.endsWith(".rs")) return undefined;
  const relative = normalized.slice(4, -3);
  if (relative === "lib" || relative === "main") return undefined;
  return relative.endsWith("/mod") ? relative.slice(0, -4).replaceAll("/", "::") : relative.replaceAll("/", "::");
}

function hasRunnableRustTest(content) {
  const masked = maskRustCommentsAndStrings(content);
  return rustRunnableTestRanges(masked).length > 0;
}

function rustRunnableTestRanges(masked) {
  const ranges = [];
  const pattern = /#\s*\[\s*test\s*\]\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+[A-Za-z_][A-Za-z0-9_]*\s*(?:<[^>{;]*>)?\s*\([^)]*\)\s*(?:->\s*[^;{]+)?\s*\{/g;
  for (const match of masked.matchAll(pattern)) {
    const open = masked.indexOf("{", match.index);
    const close = findMatchingRustBrace(masked, open);
    if (close !== -1) ranges.push({ start: match.index, end: close + 1 });
  }
  return ranges;
}

function hasInlineRustTests(content) {
  const masked = maskRustCommentsAndStrings(content);
  return rustCfgTestModuleRanges(masked).some((range) => hasRunnableRustTest(masked.slice(range.start, range.end)));
}

function rustCfgTestModuleRanges(masked) {
  const ranges = [];
  const pattern = /#\s*\[\s*cfg\s*\(\s*test\s*\)\s*\]\s*mod\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/g;
  for (const match of masked.matchAll(pattern)) {
    const open = masked.indexOf("{", match.index);
    const close = findMatchingRustBrace(masked, open);
    if (close !== -1) ranges.push({ start: match.index, end: close + 1 });
  }
  return ranges;
}

function findMatchingRustBrace(masked, open) {
  let depth = 0;
  for (let index = open; index < masked.length; index += 1) {
    if (masked[index] === "{") depth += 1;
    else if (masked[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function maskRanges(content, ranges) {
  const characters = [...content];
  for (const range of ranges) {
    for (let index = range.start; index < range.end; index += 1) {
      if (characters[index] !== "\n" && characters[index] !== "\r") characters[index] = " ";
    }
  }
  return characters.join("");
}

function classifySourceFile(file) {
  const content = maskRanges(maskRustCommentsAndStrings(file.content), rustCfgTestModuleRanges(maskRustCommentsAndStrings(file.content)));
  const lowerPath = normalizePath(file.path).toLowerCase();
  const lowerName = basenameWithoutExtension(lowerPath);
  if (/(?:\b(?:automatically generated|code generated)\b|@generated\b)/i.test(file.content)) {
    return skipped("generated-code", ["generated-code"], 0, 5, "Generated Rust source should be tested through its generator or consuming behavior.", "generator and consumer tests");
  }

  const hasFunction = /\b(?:async\s+)?fn\s+[A-Za-z_][A-Za-z0-9_]*\s*(?:<[^>{;]*>)?\s*\(/.test(content);
  const hasImpl = /\bimpl(?:\s*<[^>{;]*>)?\s+/.test(content);
  const hasDataType = /\b(?:struct|enum|type)\s+[A-Za-z_][A-Za-z0-9_]*/.test(content);
  if (!hasFunction && !hasImpl) {
    if (hasDataType) {
      return skipped("data-model", ["dto-only"], 1, 3, "Data-only Rust types are better covered through consuming behavior.", "consuming behavior tests");
    }
    return skipped("module-wiring", ["low-runtime-behavior"], 1, 2, "Module declarations and re-exports are better covered through consuming behavior.", "consuming module tests");
  }

  const signals = [];
  if (/\bif\b|\bmatch\b/.test(content)) signals.push("branching-logic");
  if (/\bResult\s*</.test(content) || /\bErr\s*\(/.test(content)) signals.push("edge-case-surface");
  if (/\basync\s+fn\b/.test(content)) signals.push("async-or-concurrency");
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
    return recommended(kind, signals, "high", "high", "unit", 8, 3, ["Branching Rust behavior", "Fallible or edge-case behavior"]);
  }
  return recommended(kind, signals, "medium", "high", "unit", 6, 2, ["Deterministic Rust behavior"]);
}

function recommended(kind, signals, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons) {
  return { kind, signals, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons };
}

function skipped(kind, signals, riskReductionScore, maintenanceCost, skipReason, preferredCoveragePath) {
  return { kind, signals, riskReductionScore, maintenanceCost, skipReason, preferredCoveragePath };
}

function isSourceFile(currentPath) {
  return normalizePath(currentPath).startsWith("src/") && normalizePath(currentPath).endsWith(".rs");
}

function isIntegrationTestFile(currentPath) {
  return normalizePath(currentPath).startsWith("tests/") && normalizePath(currentPath).endsWith(".rs");
}

function isIncludedByChangedPaths(currentPath, changedPaths) {
  return !changedPaths || changedPaths.has(normalizePath(currentPath));
}

function normalizeChangedPath(root, currentPath) {
  const relative = path.isAbsolute(currentPath) ? path.relative(root, currentPath) : currentPath;
  return normalizePath(relative);
}

function basenameWithoutExtension(currentPath) {
  return path.posix.basename(normalizePath(currentPath), path.posix.extname(normalizePath(currentPath)));
}

function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/");
}

function byRiskThenName(left, right) {
  const riskOrder = { high: 0, medium: 1, low: 2 };
  return (riskOrder[left.risk] ?? 3) - (riskOrder[right.risk] ?? 3) || left.name.localeCompare(right.name);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskRustCommentsAndStrings(content) {
  const characters = [...content];
  let index = 0;
  let blockDepth = 0;
  let state = "code";
  let rawHashes = 0;
  while (index < characters.length) {
    const current = characters[index];
    const next = characters[index + 1];
    if (state === "line-comment") {
      if (current === "\n" || current === "\r") state = "code";
      else characters[index] = " ";
      index += 1;
      continue;
    }
    if (state === "block-comment") {
      if (current === "/" && next === "*") {
        characters[index] = characters[index + 1] = " ";
        blockDepth += 1;
        index += 2;
      } else if (current === "*" && next === "/") {
        characters[index] = characters[index + 1] = " ";
        blockDepth -= 1;
        index += 2;
        if (blockDepth === 0) state = "code";
      } else {
        if (current !== "\n" && current !== "\r") characters[index] = " ";
        index += 1;
      }
      continue;
    }
    if (state === "string") {
      if (current === "\\") {
        characters[index] = " ";
        if (index + 1 < characters.length && characters[index + 1] !== "\n" && characters[index + 1] !== "\r") characters[index + 1] = " ";
        index += 2;
      } else {
        if (current !== "\n" && current !== "\r") characters[index] = " ";
        index += 1;
        if (current === '"') state = "code";
      }
      continue;
    }
    if (state === "raw-string") {
      const terminator = `"${"#".repeat(rawHashes)}`;
      if (content.startsWith(terminator, index)) {
        for (let offset = 0; offset < terminator.length; offset += 1) characters[index + offset] = " ";
        index += terminator.length;
        state = "code";
      } else {
        if (current !== "\n" && current !== "\r") characters[index] = " ";
        index += 1;
      }
      continue;
    }
    if (current === "/" && next === "/") {
      characters[index] = characters[index + 1] = " ";
      index += 2;
      state = "line-comment";
      continue;
    }
    if (current === "/" && next === "*") {
      characters[index] = characters[index + 1] = " ";
      index += 2;
      blockDepth = 1;
      state = "block-comment";
      continue;
    }
    const rawMatch = content.slice(index).match(/^r(#{0,255})"/);
    if (rawMatch) {
      rawHashes = rawMatch[1].length;
      for (let offset = 0; offset < rawMatch[0].length; offset += 1) characters[index + offset] = " ";
      index += rawMatch[0].length;
      state = "raw-string";
      continue;
    }
    if (current === '"') {
      characters[index] = " ";
      index += 1;
      state = "string";
      continue;
    }
    if (current === "'") {
      const charLength = rustCharLiteralLength(content, index);
      if (charLength > 0) {
        for (let offset = 0; offset < charLength; offset += 1) characters[index + offset] = " ";
        index += charLength;
        continue;
      }
    }
    index += 1;
  }
  return characters.join("");
}

function rustCharLiteralLength(content, start) {
  let index = start + 1;
  if (content[index] === "\\") {
    index += 1;
    if (content[index] === "u" && content[index + 1] === "{") {
      const close = content.indexOf("}", index + 2);
      if (close === -1) return 0;
      index = close + 1;
    } else {
      index += 1;
    }
  } else {
    const codePoint = content.codePointAt(index);
    if (codePoint === undefined || content[index] === "\n" || content[index] === "\r" || content[index] === "'") return 0;
    index += codePoint > 0xffff ? 2 : 1;
  }
  return content[index] === "'" ? index - start + 1 : 0;
}
