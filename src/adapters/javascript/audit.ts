import type { AuditResult, AuditTarget, RepoProfile, SkippedTarget } from "../../core/audit-model";

export interface FileSnapshot {
  path: string;
  content: string;
}

export interface JavaScriptRepoSnapshot {
  root: string;
  files: FileSnapshot[];
}

export function auditJavaScriptRepo(snapshot: JavaScriptRepoSnapshot): AuditResult {
  const profile = buildProfile(snapshot);
  const sourceFiles = snapshot.files.filter((file) => isSourceFile(file.path));
  const testFiles = snapshot.files.filter((file) => isTestFile(file.path)).map((file) => normalizePath(file.path));
  const untestedCandidates: AuditTarget[] = [];
  const coveredButRisky: AuditTarget[] = [];
  const skipped: SkippedTarget[] = [];
  const risks: string[] = [];

  for (const file of sourceFiles) {
    const name = basenameWithoutExtension(file.path);
    const classification = classifySourceFile(file, profile);
    const existingTestPaths = findExistingTests(file.path, testFiles);

    if (classification.skipReason) {
      skipped.push({
        name,
        path: file.path,
        kind: classification.kind,
        riskReductionScore: classification.riskReductionScore,
        maintenanceCost: classification.maintenanceCost,
        reason: classification.skipReason,
        preferredCoveragePath: classification.preferredCoveragePath
      });
      continue;
    }

    const target: AuditTarget = {
      name,
      path: file.path,
      kind: classification.kind,
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
    profile,
    untestedCandidates: untestedCandidates.sort(byRiskThenName),
    coveredButRisky: coveredButRisky.sort(byRiskThenName),
    recommended,
    skipped: skipped.sort((a, b) => a.name.localeCompare(b.name)),
    risks
  };
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

function classifySourceFile(file: FileSnapshot, profile: RepoProfile): {
  kind: string;
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

  if (lowerPath.includes("generated") || lowerPath.includes("/dist/") || lowerPath.includes("/build/")) {
    return skipped("generated", 1, 8, "Generated or build output should not be test-authored directly.");
  }

  if (lowerPath.endsWith(".d.ts") || lowerPath.includes("/types/")) {
    return skipped("types", 1, 2, "Type-only files do not need runtime tests.");
  }

  if (lowerPath.includes("index.") && /export\s+\*/.test(content)) {
    return skipped("barrel", 1, 2, "Barrel export files are low-value test targets.");
  }

  if (isDtoLike(lowerPath, content)) {
    return skipped(
      "dto",
      2,
      4,
      "DTO-only models are usually better covered through boundary parsing or mapper tests.",
      "Cover through API/client parsing, mapper tests, or route integration tests."
    );
  }

  if (isConstantsOnly(content)) {
    return skipped(
      "constants",
      1,
      3,
      "Constants-only files are better covered by behavior that consumes the constants.",
      "Cover through tests for the service, parser, or component that uses these constants."
    );
  }

  if (isAppWiring(lowerPath, content)) {
    return skipped(
      "app-wiring",
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
        2,
        5,
        "Presentational components with no branching or interaction are low-value direct test targets.",
        "Cover through parent component or user-flow tests when behavior depends on this rendering."
      );
    }

    if (profile.testFrameworks.includes("react-testing-library")) {
      return recommended("component", "medium", "medium", "component", 5, 5, ["React component behavior"]);
    }

    return {
      kind: "component",
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
    return recommended("pure-logic", "high", "high", "unit", 9, 2, ["Pure transformation logic", "edge-case surface"]);
  }

  if (matchesAny(lowerPath, ["service", "client", "repository"])) {
    const reasons = ["Service boundary"];
    let risk: "medium" | "high" = "medium";

    if (hasExternalBoundary(content)) {
      risk = "high";
      reasons.push("external dependency boundary");
    }

    if (hasAuthSignal(content)) {
      risk = "high";
      reasons.push("auth or permission branches");
    }

    return recommended("service", risk, "medium", "unit", risk === "high" ? 8 : 6, 4, reasons);
  }

  if (lowerPath.includes("/routes/") || lowerPath.includes("controller")) {
    return recommended("http-route", "high", "medium", "integration", 8, 5, ["HTTP behavior", "status code and error handling"]);
  }

  if (hasBranching(content)) {
    return recommended("utility", "medium", "high", "unit", 5, 2, ["Branching logic"]);
  }

  return skipped("low-value", 1, 3, "No meaningful runtime behavior detected by current heuristics.");
}

function recommended(
  kind: string,
  risk: "low" | "medium" | "high",
  testability: "low" | "medium" | "high",
  testLevel: "unit" | "integration" | "component",
  riskReductionScore: number,
  maintenanceCost: number,
  reasons: string[]
) {
  return { kind, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons };
}

function skipped(
  kind: string,
  riskReductionScore: number,
  maintenanceCost: number,
  skipReason: string,
  preferredCoveragePath?: string
) {
  return {
    kind,
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

function isTestFile(path: string): boolean {
  const normalized = normalizePath(path);
  return (
    normalized.includes("__tests__/") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function findExistingTests(sourcePath: string, testPaths: string[]): string[] {
  const normalized = normalizePath(sourcePath);
  const sourceBase = basenameWithoutExtension(normalized);
  const sourceDir = normalized.split("/").slice(0, -1).join("/");

  return testPaths.filter((testPath) => {
    const testBase = basenameWithoutExtension(testPath).replace(/\.(test|spec)$/, "");
    return testBase === sourceBase || testPath.startsWith(`${sourceDir}/__tests__/${sourceBase}.`);
  });
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
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
