import type { AuditResult, AuditTarget, RepoProfile, SkippedTarget } from "../../core/audit-model";

export interface FileSnapshot {
  path: string;
  content: string;
}

export interface JavaScriptRepoSnapshot {
  root: string;
  files: FileSnapshot[];
  changedPaths?: string[];
}

export function auditJavaScriptRepo(snapshot: JavaScriptRepoSnapshot): AuditResult {
  const profile = buildProfile(snapshot);
  const changedPaths = snapshot.changedPaths ? new Set(snapshot.changedPaths.map(normalizePath)) : undefined;
  const sourceFiles = snapshot.files.filter((file) => isSourceFile(file.path) && isIncludedByChangedPaths(file.path, changedPaths));
  const testFiles = snapshot.files
    .filter((file) => isTestFile(file.path))
    .map((file) => ({ ...file, path: normalizePath(file.path) }));
  const moduleFiles = snapshot.files.map((file) => ({ ...file, path: normalizePath(file.path) }));
  const packageData = parsePackageJson(snapshot.files.find((file) => normalizePath(file.path) === "package.json")?.content ?? "");
  const packageEntryFile = findSourcePackageEntry(packageData, moduleFiles);
  const untestedCandidates: AuditTarget[] = [];
  const coveredButRisky: AuditTarget[] = [];
  const skipped: SkippedTarget[] = [];
  const risks: string[] = [];
  const runtimeSourcePaths = new Set(snapshot.files.map((file) => normalizePath(file.path)).filter(isRuntimeJavaScriptSource));
  const sourceJavaScriptRuntime = hasSourceJavaScriptRuntimeEntrypoint(snapshot.files);

  for (const file of sourceFiles) {
    const name = basenameWithoutExtension(file.path);
    const classification = classifySourceFile(file, profile, {
      runtimeSourcePaths,
      sourceJavaScriptRuntime
    });
    const existingTestPaths = findExistingTests(file.path, testFiles, moduleFiles, {
      packageName: typeof packageData.name === "string" ? packageData.name : undefined,
      packageEntryFile
    });

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

    const target: AuditTarget = {
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

function isIncludedByChangedPaths(path: string, changedPaths?: Set<string>): boolean {
  if (!changedPaths) return true;
  return changedPaths.has(normalizePath(path));
}

function buildProfile(snapshot: JavaScriptRepoSnapshot): RepoProfile {
  const paths = snapshot.files.map((file) => normalizePath(file.path));
  const packageJson = snapshot.files.find((file) => normalizePath(file.path) === "package.json");
  const packageText = packageJson?.content ?? "";
  const packageData = parsePackageJson(packageText);
  const testFrameworks = detectTestFrameworks(paths, packageText);
  const testCommand = detectTestCommand(packageData, testFrameworks);
  const existingTestLocations = detectExistingTestLocations(paths);
  const detectedConventions = detectConventions(paths);
  const setupSignals = detectSetupSignals(paths, packageText);
  const blockers = detectBlockers(packageJson !== undefined, testCommand, testFrameworks);

  return {
    root: snapshot.root,
    languages: detectLanguages(paths),
    packageManagers: detectPackageManagers(paths),
    testFrameworks,
    architectures: detectArchitectures(paths, packageText),
    testCommand,
    detectedConventions,
    existingTestLocations,
    setupSignals,
    confidence: scoreProfileConfidence(testFrameworks, existingTestLocations, blockers),
    blockers
  };
}

function parsePackageJson(packageText: string): { scripts?: Record<string, string> } {
  if (!packageText.trim()) return {};

  try {
    return JSON.parse(packageText) as { scripts?: Record<string, string> };
  } catch {
    return {};
  }
}

function detectLanguages(paths: string[]): string[] {
  const languages = new Set<string>();

  if (paths.some((path) => path.endsWith(".ts") || path.endsWith(".tsx"))) {
    languages.add("typescript");
  }

  if (paths.some((path) => path.endsWith(".js") || path.endsWith(".jsx") || path.endsWith(".mjs"))) {
    languages.add("javascript");
  }

  return [...languages];
}

function detectPackageManagers(paths: string[]): string[] {
  const managers = new Set<string>();

  if (paths.includes("package-lock.json")) managers.add("npm");
  if (paths.includes("pnpm-lock.yaml")) managers.add("pnpm");
  if (paths.includes("yarn.lock")) managers.add("yarn");
  if (paths.includes("package.json") && managers.size === 0) managers.add("npm");

  return [...managers];
}

function detectTestFrameworks(paths: string[], packageText: string): string[] {
  const frameworks = new Set<string>();

  if (paths.some((path) => path.includes("vitest.config")) || packageText.includes("vitest")) {
    frameworks.add("vitest");
  }

  if (paths.some((path) => path.includes("jest.config")) || packageText.includes("jest")) {
    frameworks.add("jest");
  }

  if (packageText.includes("@testing-library/react")) {
    frameworks.add("react-testing-library");
  }

  if (packageText.includes("supertest")) {
    frameworks.add("supertest");
  }

  return [...frameworks];
}

function detectTestCommand(packageData: { scripts?: Record<string, string> }, frameworks: string[]): string | undefined {
  const scripts = packageData.scripts ?? {};

  for (const key of ["test", "test:unit", "vitest", "jest"]) {
    const command = scripts[key];
    if (command && !isPlaceholderTestScript(command)) {
      return `npm run ${key}`;
    }
  }

  if (frameworks.includes("vitest")) return "npx vitest run";
  if (frameworks.includes("jest")) return "npx jest";

  return undefined;
}

function isPlaceholderTestScript(command: string): boolean {
  return command.includes("no test specified") || command.includes("exit 1");
}

function detectExistingTestLocations(paths: string[]): string[] {
  const locations = new Set<string>();

  for (const path of paths) {
    if (!isTestFile(path)) continue;

    const segments = path.split("/");
    if (segments.includes("__tests__")) {
      locations.add("__tests__ directories");
    } else if (segments[0] === "test" || segments[0] === "tests") {
      locations.add(`${segments[0]}/`);
    } else if (path.startsWith("src/")) {
      locations.add("colocated with source");
    } else {
      locations.add("custom test location");
    }
  }

  return [...locations];
}

function detectConventions(paths: string[]): string[] {
  const conventions = new Set<string>();

  if (paths.some((path) => path.endsWith(".test.ts") || path.endsWith(".test.js"))) {
    conventions.add("*.test files");
  }

  if (paths.some((path) => path.endsWith(".spec.ts") || path.endsWith(".spec.js"))) {
    conventions.add("*.spec files");
  }

  if (paths.some((path) => path.includes("__tests__/"))) {
    conventions.add("__tests__ folders");
  }

  if (paths.some((path) => path.includes("__mocks__/") || path.includes("/mocks/"))) {
    conventions.add("mock folders");
  }

  if (paths.some((path) => path.includes("/fixtures/") || path.includes("__fixtures__/"))) {
    conventions.add("fixture folders");
  }

  return [...conventions];
}

function detectSetupSignals(paths: string[], packageText: string): string[] {
  const signals = new Set<string>();

  if (paths.includes("tsconfig.json")) signals.add("tsconfig");
  if (paths.some((path) => path.includes("vitest.config"))) signals.add("vitest config");
  if (paths.some((path) => path.includes("jest.config"))) signals.add("jest config");
  if (packageText.includes("msw")) signals.add("msw");
  if (packageText.includes("nock")) signals.add("nock");
  if (packageText.includes("supertest")) signals.add("supertest");

  return [...signals];
}

function detectBlockers(hasPackageJson: boolean, testCommand: string | undefined, frameworks: string[]): string[] {
  const blockers: string[] = [];

  if (!hasPackageJson) {
    blockers.push("No package.json found, so JavaScript package conventions are uncertain.");
  }

  if (frameworks.length === 0) {
    blockers.push("No supported JS test framework detected.");
  }

  if (!testCommand) {
    blockers.push("No runnable test command detected from package scripts or framework config.");
  }

  return blockers;
}

function scoreProfileConfidence(testFrameworks: string[], existingTestLocations: string[], blockers: string[]): "low" | "medium" | "high" {
  if (blockers.length > 1) return "low";
  if (testFrameworks.length > 0 && existingTestLocations.length > 0) return "high";
  if (testFrameworks.length > 0) return "medium";
  return "low";
}

function detectArchitectures(paths: string[], packageText: string): string[] {
  const architectures = new Set<string>();

  if (packageText.includes("react") || paths.some((path) => path.endsWith(".tsx") || path.endsWith(".jsx"))) {
    architectures.add("react");
  }

  if (packageText.includes("express") || paths.some((path) => path.includes("/routes/"))) {
    architectures.add("http-routes");
  }

  if (paths.some((path) => path.includes("/services/"))) {
    architectures.add("service-layer");
  }

  return [...architectures];
}

function classifySourceFile(file: FileSnapshot, profile: RepoProfile, mirrorContext: {
  runtimeSourcePaths?: Set<string>;
  sourceJavaScriptRuntime?: boolean;
} = {}): {
  kind: string;
  signals: string[];
  risk: "low" | "medium" | "high";
  testability: "low" | "medium" | "high";
  testLevel: "unit" | "integration" | "component" | "none";
  riskReductionScore: number;
  maintenanceCost: number;
  reasons: string[];
  skipReason?: string;
  preferredCoveragePath?: string;
} {
  const path = normalizePath(file.path);
  const content = file.content;
  const lowerPath = path.toLowerCase();
  const runtimeSourcePaths = mirrorContext.runtimeSourcePaths ?? new Set<string>();

  if (lowerPath.includes("generated") || lowerPath.includes("/dist/") || lowerPath.includes("/build/")) {
    return skipped("generated", ["generated-code"], 1, 8, "Generated or build output should not be test-authored directly.");
  }

  if (lowerPath.endsWith(".d.ts") || lowerPath.includes("/types/")) {
    return skipped("types", ["type-only"], 1, 2, "Type-only files do not need runtime tests.");
  }

  if (isReferenceTypeScriptMirror(path, content, runtimeSourcePaths)) {
    return skipped(
      "reference-mirror",
      ["type-reference-mirror"],
      1,
      2,
      "Reference TypeScript mirrors a runtime JavaScript module and should not be test-authored directly.",
      "Cover through tests for the matching runtime JavaScript module."
    );
  }

  if (isReferenceImplementationMirror(path, runtimeSourcePaths, mirrorContext.sourceJavaScriptRuntime)) {
    return skipped(
      "reference-mirror",
      ["reference-implementation-mirror"],
      1,
      2,
      "Reference TypeScript mirrors a runtime JavaScript implementation and should not be test-authored directly.",
      "Cover through tests for the matching runtime JavaScript module."
    );
  }

  if (lowerPath.includes("index.") && /export\s+\*/.test(content)) {
    return skipped("barrel", ["barrel-export"], 1, 2, "Barrel export files are low-value test targets.");
  }

  if (isDtoLike(lowerPath, content)) {
    return skipped(
      "dto",
      ["dto-only"],
      2,
      4,
      "DTO-only models are usually better covered through boundary parsing or mapper tests.",
      "Cover through API/client parsing, mapper tests, or route integration tests."
    );
  }

  if (isConstantsOnly(content)) {
    return skipped(
      "constants",
      ["constants-only"],
      1,
      3,
      "Constants-only files are better covered by behavior that consumes the constants.",
      "Cover through tests for the service, parser, or component that uses these constants."
    );
  }

  if (isAppWiring(lowerPath, content)) {
    return skipped(
      "app-wiring",
      ["app-wiring"],
      2,
      4,
      "Application wiring is better covered through route or integration tests.",
      "Cover through Supertest or API-level integration tests."
    );
  }

  if (lowerPath.includes("component") || lowerPath.endsWith(".tsx") || content.includes("jsx")) {
    if (isPresentationalComponent(content)) {
      return skipped(
        "presentational-component",
        ["presentational-component"],
        2,
        5,
        "Presentational components with no branching or interaction are low-value direct test targets.",
        "Cover through parent component or user-flow tests when behavior depends on this rendering."
      );
    }

    if (profile.testFrameworks.includes("react-testing-library")) {
      return recommended("component", ["react-component", "rtl-convention"], "medium", "medium", "component", 5, 5, ["React component behavior"]);
    }

    return {
      kind: "component",
      signals: ["react-component", "missing-component-test-convention"],
      risk: "medium",
      testability: "medium",
      testLevel: "component",
      riskReductionScore: 4,
      maintenanceCost: 6,
      reasons: ["UI component behavior"],
      skipReason: "Component tests should follow an existing React Testing Library convention first."
    };
  }

  if (matchesAny(lowerPath, ["parser", "mapper", "validator", "formatter"])) {
    return recommended("pure-logic", ["pure-logic", "edge-case-surface"], "high", "high", "unit", 9, 2, ["Pure transformation logic", "edge-case surface"]);
  }

  if (matchesAny(lowerPath, ["service", "client", "repository"])) {
    const reasons = ["Service boundary"];
    const signals = ["service-name"];
    let risk: "medium" | "high" = "medium";

    if (hasExternalBoundary(content)) {
      risk = "high";
      reasons.push("external dependency boundary");
      signals.push("external-boundary");
    }

    if (hasAuthSignal(content)) {
      risk = "high";
      reasons.push("auth or permission branches");
      signals.push("auth-branch");
    }

    return recommended("service", signals, risk, "medium", "unit", risk === "high" ? 8 : 6, 4, reasons);
  }

  if (lowerPath.includes("/routes/") || lowerPath.includes("controller")) {
    return recommended("http-route", ["http-route", "status-handling"], "high", "medium", "integration", 8, 5, ["HTTP behavior", "status code and error handling"]);
  }

  if (hasBranching(content)) {
    return recommended("utility", ["branching-logic"], "medium", "high", "unit", 5, 2, ["Branching logic"]);
  }

  return skipped("low-value", ["low-runtime-behavior"], 1, 3, "No meaningful runtime behavior detected by current heuristics.");
}

function recommended(
  kind: string,
  signals: string[],
  risk: "low" | "medium" | "high",
  testability: "low" | "medium" | "high",
  testLevel: "unit" | "integration" | "component",
  riskReductionScore: number,
  maintenanceCost: number,
  reasons: string[]
) {
  return { kind, signals, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons };
}

function skipped(
  kind: string,
  signals: string[],
  riskReductionScore: number,
  maintenanceCost: number,
  skipReason: string,
  preferredCoveragePath?: string
) {
  return {
    kind,
    signals,
    risk: "low" as const,
    testability: "low" as const,
    testLevel: "none" as const,
    riskReductionScore,
    maintenanceCost,
    reasons: [],
    skipReason,
    preferredCoveragePath
  };
}

function isSourceFile(path: string): boolean {
  const normalized = normalizePath(path);
  return (
    normalized.startsWith("src/") &&
    [".js", ".jsx", ".mjs", ".ts", ".tsx"].some((extension) => normalized.endsWith(extension)) &&
    !isTestFile(normalized)
  );
}

function isRuntimeJavaScriptSource(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized.startsWith("src/") && /\.(cjs|mjs|js|jsx)$/.test(normalized) && !isTestFile(normalized);
}

function hasSourceJavaScriptRuntimeEntrypoint(files: FileSnapshot[]): boolean {
  const packageJson = files.find((file) => normalizePath(file.path) === "package.json");
  const packageData = parsePackageJson(packageJson?.content ?? "");
  const entrypoints = collectPackageEntrypoints(packageData);

  return entrypoints.some((entrypoint) => {
    const normalized = stripCurrentDirectoryPrefix(normalizePath(entrypoint));
    return normalized.startsWith("src/") && /\.(cjs|mjs|js|jsx)$/.test(normalized);
  });
}

function collectPackageEntrypoints(packageData: Record<string, unknown>): string[] {
  const entrypoints: string[] = [];

  collectEntrypointValue(packageData.bin, entrypoints);
  collectEntrypointValue(packageData.main, entrypoints);
  collectEntrypointValue(packageData.module, entrypoints);
  collectEntrypointValue(packageData.exports, entrypoints);

  return entrypoints;
}

function collectEntrypointValue(value: unknown, entrypoints: string[]): void {
  if (typeof value === "string") {
    entrypoints.push(value);
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const nested of Object.values(value)) {
    collectEntrypointValue(nested, entrypoints);
  }
}

function isTestFile(path: string): boolean {
  const normalized = normalizePath(path);
  return (
    normalized.includes("__tests__/") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function findExistingTests(
  sourcePath: string,
  testFiles: FileSnapshot[],
  moduleFiles: FileSnapshot[],
  packageEntry: { packageName?: string; packageEntryFile?: FileSnapshot }
): string[] {
  const normalized = normalizePath(sourcePath);
  const sourceBase = basenameWithoutExtension(normalized);
  const sourceSegments = normalized.split("/");
  const sourceDir = sourceSegments.slice(0, -1).join("/");
  const parentBase = sourceSegments.length > 1 ? sourceSegments.at(-2) : undefined;
  const sourceBaseCandidates = new Set([sourceBase, ...pluralizeBaseName(sourceBase)]);
  if (parentBase) {
    sourceBaseCandidates.add(`${parentBase}-${sourceBase}`);
    if (sourceBase === "index") {
      sourceBaseCandidates.add(parentBase);
    }
  }

  return testFiles
    .filter((testFile) => {
      const testBase = basenameWithoutExtension(testFile.path).replace(/\.(test|spec)$/, "");
      return (
        sourceBaseCandidates.has(testBase) ||
        testFile.path.startsWith(`${sourceDir}/__tests__/${sourceBase}.`) ||
        hasDirectRelativeImport(testFile, normalized) ||
        hasOneHopBarrelImport(testFile, normalized, moduleFiles) ||
        hasPackageEntryImport(testFile, normalized, packageEntry)
      );
    })
    .map((testFile) => testFile.path);
}

function hasDirectRelativeImport(testFile: FileSnapshot, sourcePath: string): boolean {
  return collectRelativeModuleSpecifiers(testFile.content).some((specifier) =>
    moduleSpecifierTargetsSource(testFile.path, specifier, sourcePath)
  );
}

function hasOneHopBarrelImport(testFile: FileSnapshot, sourcePath: string, moduleFiles: FileSnapshot[]): boolean {
  return collectRelativeModuleSpecifiers(testFile.content).some((specifier) => {
    const barrelFile = moduleFiles.find((file) => moduleSpecifierTargetsSource(testFile.path, specifier, file.path));
    if (!barrelFile || barrelFile.path === sourcePath) return false;

    return collectRelativeExportSpecifiers(barrelFile.content).some((exportSpecifier) =>
      moduleSpecifierTargetsSource(barrelFile.path, exportSpecifier, sourcePath)
    );
  });
}

function hasPackageEntryImport(
  testFile: FileSnapshot,
  sourcePath: string,
  { packageName, packageEntryFile }: { packageName?: string; packageEntryFile?: FileSnapshot }
): boolean {
  if (!packageName || !packageEntryFile) return false;
  if (!collectModuleSpecifiers(testFile.content).includes(packageName)) return false;
  if (packageEntryFile.path === sourcePath) return true;

  return collectRelativeExportSpecifiers(packageEntryFile.content).some((exportSpecifier) =>
    moduleSpecifierTargetsSource(packageEntryFile.path, exportSpecifier, sourcePath)
  );
}

function findSourcePackageEntry(packageData: Record<string, unknown>, moduleFiles: FileSnapshot[]): FileSnapshot | undefined {
  const candidates = [packageData.source, packageData.module, packageData.main, "src/index", "index"]
    .filter((candidate): candidate is string => typeof candidate === "string")
    .map((candidate) => candidate.replace(/^\.\//, ""));

  for (const candidate of candidates) {
    const entryFile = moduleFiles.find(
      (file) => isSourceFile(file.path) && moduleSpecifierTargetsSource("package.json", candidate, file.path)
    );
    if (entryFile) return entryFile;
  }

  return undefined;
}

function moduleSpecifierTargetsSource(importerPath: string, specifier: string, sourcePath: string): boolean {
  const resolved = normalizePathSegments(joinPath(dirname(importerPath), specifier));
  const resolvedWithoutExtension = removeJavaScriptExtension(resolved);
  const sourceWithoutExtension = removeJavaScriptExtension(sourcePath);
  return (
    resolved === sourcePath ||
    resolvedWithoutExtension === sourceWithoutExtension ||
    (basenameWithoutExtension(sourcePath) === "index" && resolvedWithoutExtension === dirname(sourcePath))
  );
}

function collectRelativeModuleSpecifiers(content: string): string[] {
  return collectModuleSpecifiers(content).filter((specifier) => specifier.startsWith("."));
}

function collectModuleSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) specifiers.push(specifier);
    }
  }

  return specifiers;
}

function collectRelativeExportSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  const pattern = /\bexport\s+(?:[^"']*?\s+from\s+)["']([^"']+)["']/g;

  for (const match of content.matchAll(pattern)) {
    const specifier = match[1];
    if (specifier?.startsWith(".")) specifiers.push(specifier);
  }

  return specifiers;
}

function removeJavaScriptExtension(currentPath: string): string {
  return currentPath.replace(/\.[cm]?[jt]sx?$/, "");
}

function dirname(currentPath: string): string {
  return normalizePath(currentPath).split("/").slice(0, -1).join("/");
}

function joinPath(left: string, right: string): string {
  return [left, right].filter(Boolean).join("/");
}

function normalizePathSegments(currentPath: string): string {
  const segments: string[] = [];
  for (const segment of normalizePath(currentPath).split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

function pluralizeBaseName(baseName: string): string[] {
  if (/[^aeiou]y$/i.test(baseName)) {
    return [`${baseName.slice(0, -1)}ies`];
  }

  if (/(s|x|z|ch|sh)$/i.test(baseName)) {
    return [`${baseName}es`];
  }

  return [`${baseName}s`];
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function stripCurrentDirectoryPrefix(path: string): string {
  return path.replace(/^\.\//, "");
}

function basenameWithoutExtension(path: string): string {
  const fileName = normalizePath(path).split("/").at(-1) ?? path;
  return fileName.replace(/\.[^.]+$/, "");
}

function matchesAny(value: string, fragments: string[]): boolean {
  return fragments.some((fragment) => value.includes(fragment));
}

function hasExternalBoundary(content: string): boolean {
  return /\b(fetch|axios|prisma|mongoose|mongodb|fs\.|readFile|writeFile)\b/.test(content);
}

function hasAuthSignal(content: string): boolean {
  return /\b(auth|permission|role|token|session)\b/i.test(content);
}

function hasBranching(content: string): boolean {
  return /\b(if|switch|catch|\?\s*[^:]+:)\b/.test(content);
}

function isDtoLike(path: string, content: string): boolean {
  const hasDtoName = /(dto|model|schema|response|request)/i.test(path);
  const typeOnlyShape = /^\s*(export\s+)?(interface|type)\s+/m.test(content) && !/\bfunction\b|=>|\bclass\b/.test(content);
  return hasDtoName && typeOnlyShape;
}

function isReferenceTypeScriptMirror(path: string, content: string, runtimeSourcePaths: Set<string>): boolean {
  if (!path.endsWith(".ts") || path.endsWith(".d.ts")) return false;
  if (!isTypeOnlyContent(content)) return false;

  return hasSiblingRuntimeJavaScript(path, runtimeSourcePaths);
}

function isReferenceImplementationMirror(path: string, runtimeSourcePaths: Set<string>, sourceJavaScriptRuntime?: boolean): boolean {
  if (!sourceJavaScriptRuntime) return false;
  if (!path.endsWith(".ts") || path.endsWith(".d.ts")) return false;
  return hasSiblingRuntimeJavaScript(path, runtimeSourcePaths);
}

function hasSiblingRuntimeJavaScript(path: string, runtimeSourcePaths: Set<string>): boolean {
  const runtimePath = path.replace(/\.ts$/, ".js");
  const modulePath = path.replace(/\.ts$/, ".mjs");
  const commonJsPath = path.replace(/\.ts$/, ".cjs");
  return runtimeSourcePaths.has(runtimePath) || runtimeSourcePaths.has(modulePath) || runtimeSourcePaths.has(commonJsPath);
}

function isTypeOnlyContent(content: string): boolean {
  const withoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .trim();

  if (!withoutComments) return false;

  const withoutInterfaces = withoutComments.replace(/(?:export\s+)?interface\s+\w+\s*\{[\s\S]*?\}/g, "");
  const withoutObjectTypes = withoutInterfaces.replace(/(?:export\s+)?type\s+\w+\s*=\s*\{[\s\S]*?\};?/g, "");
  const withoutTypes = withoutObjectTypes.replace(/(?:export\s+)?type\s+\w+\s*=\s*[^;]+;/g, "");
  return withoutTypes.trim().length === 0;
}

function isConstantsOnly(content: string): boolean {
  const withoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .trim();

  if (!withoutComments) return false;

  const lines = withoutComments
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.every((line) => /^export\s+const\s+\w+\s*=/.test(line) || /^const\s+\w+\s*=/.test(line));
}

function isAppWiring(path: string, content: string): boolean {
  return (
    /(^|\/)(app|server|main)\.[cm]?[jt]sx?$/.test(path) &&
    (content.includes("express()") || content.includes(".use(")) &&
    !/\b(app|get|post|put|patch|delete)\s*\(/.test(content)
  );
}

function isPresentationalComponent(content: string): boolean {
  const hasJsxReturn = /return\s*\(?\s*</.test(content);
  const hasInteraction = /\bon[A-Z]\w+\s*=|useState|useReducer|useEffect|if\s*\(|\?\s*[^:]+:/.test(content);
  return hasJsxReturn && !hasInteraction;
}

function byRiskThenName(a: AuditTarget, b: AuditTarget): number {
  const order = { high: 0, medium: 1, low: 2 };
  return order[a.risk] - order[b.risk] || a.name.localeCompare(b.name);
}
