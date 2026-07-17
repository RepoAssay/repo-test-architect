import type { AuditResult, AuditTarget, RepoProfile, SkippedTarget } from "../../core/audit-model";

const GENERIC_SOURCE_BASENAMES = new Set(["handler", "index", "types", "utils"]);
const MAX_TRANSITIVE_SOURCE_DEPTH = 2;
const SOURCE_EXTENSIONS = [".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"];
const SOURCE_ROOTS = ["src/", "source/", "lib/"];
const AVA_ASSERTION_METHODS = ["assert", "deepEqual", "false", "falsy", "is", "like", "not", "notDeepEqual", "notRegex", "notThrows", "notThrowsAsync", "regex", "snapshot", "throws", "throwsAsync", "true", "truthy"];

export interface FileSnapshot {
  path: string;
  content: string;
}

export interface JavaScriptRepoSnapshot {
  root: string;
  files: FileSnapshot[];
  changedPaths?: string[];
}

interface PackageJsonData extends Record<string, unknown> {
  name?: string;
  scripts?: Record<string, string>;
}

export function auditJavaScriptRepo(snapshot: JavaScriptRepoSnapshot): AuditResult {
  const files = scopeToPackageRoot(snapshot.files);
  const profile = buildProfile({ ...snapshot, files });
  const changedPaths = snapshot.changedPaths ? new Set(snapshot.changedPaths.map(normalizePath)) : undefined;
  const sourceFiles = files.filter((file) => isSourceFile(file.path) && isIncludedByChangedPaths(file.path, changedPaths));
  const moduleFiles = files.map((file) => analyzeModuleFile({ ...file, path: normalizePath(file.path) }));
  const testFiles = moduleFiles.filter((file) => isTestFile(file.path));
  const tsconfigData = resolveTsconfigData("tsconfig.json", files);
  const pathAliasEntries = findTsconfigPathAliasEntries(tsconfigData, moduleFiles);
  const boundedTransitiveImports = collectBoundedTransitiveImports(testFiles, moduleFiles, pathAliasEntries);
  const packageData = parsePackageJson(files.find((file) => normalizePath(file.path) === "package.json")?.content ?? "");
  const packageEntryFile = findSourcePackageEntry(packageData, moduleFiles);
  const packageSubpathEntries = findSourcePackageSubpathEntries(packageData, moduleFiles);
  const untestedCandidates: AuditTarget[] = [];
  const coveredButRisky: AuditTarget[] = [];
  const skipped: SkippedTarget[] = [];
  const risks: string[] = [];
  const runtimeSourcePaths = new Set(files.map((file) => normalizePath(file.path)).filter(isRuntimeJavaScriptSource));
  const sourceJavaScriptRuntime = hasSourceJavaScriptRuntimeEntrypoint(files);

  for (const file of sourceFiles) {
    const name = basenameWithoutExtension(file.path);
    const classification = classifySourceFile(file, profile, {
      runtimeSourcePaths,
      sourceJavaScriptRuntime
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

    const existingTestEvidence = findExistingTestEvidence(file.path, testFiles, moduleFiles, boundedTransitiveImports, {
      packageName: typeof packageData.name === "string" ? packageData.name : undefined,
      packageEntryFile,
      packageSubpathEntries,
      pathAliasEntries
    });
    const existingTestPaths = existingTestEvidence.map((evidence) => evidence.testPath);

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
      existingTestPaths,
      ...(existingTestEvidence.length > 0 ? { existingTestEvidence } : {})
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

function scopeToPackageRoot(files: FileSnapshot[]): FileSnapshot[] {
  const nestedPackageRoots = files
    .map((file) => normalizePath(file.path))
    .filter((path) => path.endsWith("/package.json"))
    .map((path) => path.slice(0, -"/package.json".length));

  if (nestedPackageRoots.length === 0) return files;

  return files.filter((file) => {
    const path = normalizePath(file.path);
    return !nestedPackageRoots.some((nestedRoot) => path === nestedRoot || path.startsWith(`${nestedRoot}/`));
  });
}

function buildProfile(snapshot: JavaScriptRepoSnapshot): RepoProfile {
  const paths = snapshot.files.map((file) => normalizePath(file.path));
  const packageJson = snapshot.files.find((file) => normalizePath(file.path) === "package.json");
  const packageText = packageJson?.content ?? "";
  const packageData = parsePackageJson(packageText);
  const testFrameworks = detectTestFrameworks(snapshot.files, packageData);
  const testCommand = detectTestCommand(packageData, testFrameworks);
  const existingTestLocations = detectExistingTestLocations(paths);
  const detectedConventions = detectConventions(paths);
  const setupSignals = detectSetupSignals(paths, packageData);
  const blockers = detectBlockers(packageJson !== undefined, testCommand, testFrameworks);

  return {
    root: snapshot.root,
    languages: detectLanguages(paths),
    packageManagers: detectPackageManagers(paths),
    testFrameworks,
    architectures: detectArchitectures(paths, packageData),
    testCommand,
    detectedConventions,
    existingTestLocations,
    setupSignals,
    confidence: scoreProfileConfidence(testFrameworks, existingTestLocations, blockers),
    blockers
  };
}

function parsePackageJson(packageText: string): PackageJsonData {
  if (!packageText.trim()) return {};

  try {
    return JSON.parse(packageText) as PackageJsonData;
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

function detectTestFrameworks(files: FileSnapshot[], packageData: PackageJsonData): string[] {
  const paths = files.map((file) => normalizePath(file.path));
  const frameworks = new Set<string>();

  if (paths.some((path) => path.includes("ava.config")) || hasPackageDependency(packageData, "ava")) {
    frameworks.add("ava");
  }

  if (paths.some((path) => path.includes(".mocharc")) || hasPackageDependency(packageData, "mocha")) {
    frameworks.add("mocha");
  }

  if (paths.some((path) => path.includes("vitest.config")) || hasPackageDependency(packageData, "vitest")) {
    frameworks.add("vitest");
  }

  if (paths.some((path) => path.includes("jest.config")) || hasPackageDependency(packageData, "jest")) {
    frameworks.add("jest");
  }

  if (files.some((file) => isTestFile(file.path) && usesNodeTest(file.content))) {
    frameworks.add("node-test");
  }

  if (hasPackageDependency(packageData, "@testing-library/react")) {
    frameworks.add("react-testing-library");
  }

  if (hasPackageDependency(packageData, "supertest")) {
    frameworks.add("supertest");
  }

  return [...frameworks];
}

function hasPackageDependency(packageData: PackageJsonData, dependencyName: string): boolean {
  return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].some((field) => {
    const dependencies = packageData[field];
    return dependencies !== null && typeof dependencies === "object" && Object.hasOwn(dependencies, dependencyName);
  });
}

function usesNodeTest(content: string): boolean {
  return /(?:from\s+|import\s+|require\(\s*)["']node:test["']/.test(content);
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
  if (frameworks.includes("node-test")) return "node --test";
  if (frameworks.includes("ava")) return "npx ava";
  if (frameworks.includes("mocha")) return "npx mocha";

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

function detectSetupSignals(paths: string[], packageData: PackageJsonData): string[] {
  const signals = new Set<string>();

  if (paths.includes("tsconfig.json")) signals.add("tsconfig");
  if (paths.some((path) => path.includes("ava.config"))) signals.add("ava config");
  if (paths.some((path) => path.includes(".mocharc"))) signals.add("mocha config");
  if (paths.some((path) => path.includes("vitest.config"))) signals.add("vitest config");
  if (paths.some((path) => path.includes("jest.config"))) signals.add("jest config");
  if (hasPackageDependency(packageData, "msw")) signals.add("msw");
  if (hasPackageDependency(packageData, "nock")) signals.add("nock");
  if (hasPackageDependency(packageData, "supertest")) signals.add("supertest");

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

function detectArchitectures(paths: string[], packageData: PackageJsonData): string[] {
  const architectures = new Set<string>();

  if (hasPackageDependency(packageData, "react") || paths.some((path) => path.endsWith(".tsx") || path.endsWith(".jsx"))) {
    architectures.add("react");
  }

  if (hasPackageDependency(packageData, "express") || paths.some((path) => path.includes("/routes/"))) {
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
  const branchHeavy = hasBranching(content);
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

  if (isReactHook(currentPath, content, profile)) {
    const signals = ["react-hook"];
    if (profile.testFrameworks.includes("react-testing-library")) signals.push("rtl-convention");
    return recommended("react-hook", signals, "medium", "high", "component", 6, 3, ["React hook state and lifecycle behavior"]);
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

  if (branchHeavy && (lowerPath.includes("/router/") || lowerPath.includes("/routing/"))) {
    return recommended("http-router", ["http-routing", "route-precedence"], "medium", "high", "unit", 5, 2, ["Route matching and precedence behavior", "parameter and fallback edge cases"]);
  }

  if (branchHeavy && lowerPath.includes("/middleware/")) {
    if (matchesAny(lowerPath, ["auth", "csrf", "cors", "jwt", "jwk", "secure", "ip-restriction", "permission"])) {
      return recommended("security-middleware", ["http-middleware", "security-boundary"], "high", "medium", "integration", 8, 5, ["Security-sensitive middleware behavior", "allow, reject, and error response branches"]);
    }
    return recommended("http-middleware", ["http-middleware", "request-response-boundary"], "medium", "medium", "integration", 5, 4, ["HTTP middleware request and response behavior", "continuation and error propagation"]);
  }

  if (branchHeavy && !lowerPath.includes("/adapter/") && hasHttpBoundary(content)) {
    if (matchesAny(lowerPath, ["auth", "cors", "csrf", "jwt", "jwk", "secure", "permission"])) {
      return recommended("security-middleware", ["http-security", "security-boundary"], "high", "medium", "integration", 8, 5, ["Security-sensitive HTTP boundary behavior", "allow, reject, and challenge response branches"]);
    }
    if (matchesAny(lowerPath, ["body", "form-data", "multipart"])) {
      return recommended("request-body", ["request-body", "content-type-boundary"], "medium", "high", "unit", 5, 2, ["Request body parsing and content-type behavior", "empty, malformed, and size boundary cases"]);
    }
    if (lowerPath.includes("cookie")) {
      return recommended("cookie-boundary", ["cookie-boundary", "header-serialization"], "medium", "high", "unit", 5, 2, ["Cookie parsing and serialization behavior", "attribute, chunking, and malformed header cases"]);
    }
    if (lowerPath.includes("cache")) {
      return recommended("http-cache", ["http-cache", "conditional-request"], "medium", "high", "unit", 5, 2, ["HTTP cache policy and conditional request behavior", "ETag, freshness, and response header branches"]);
    }
    if (lowerPath.includes("proxy")) {
      return recommended("http-proxy", ["http-proxy", "external-boundary"], "high", "medium", "integration", 8, 5, ["HTTP proxy request and response translation", "abort, header filtering, and upstream failure branches"]);
    }
    if (lowerPath.includes("session")) {
      return recommended("session-management", ["session-boundary", "security-sensitive-state"], "high", "medium", "integration", 8, 5, ["Session lifecycle and protected state behavior", "creation, expiry, rotation, and tamper failure branches"]);
    }
    if (lowerPath.includes("response")) {
      return recommended("response-construction", ["response-construction", "status-header-boundary"], "medium", "high", "unit", 5, 2, ["HTTP response construction and normalization", "status, header, body, and error conversion branches"]);
    }
    if (lowerPath.includes("event")) {
      return recommended("request-event", ["request-event", "lifecycle-boundary"], "medium", "high", "unit", 5, 2, ["Request event lifecycle and context behavior", "lazy state, malformed input, and cleanup branches"]);
    }
    if (matchesAny(lowerPath, ["websocket", "/ws.", "/ws/"])) {
      return recommended("websocket", ["websocket", "upgrade-lifecycle"], "high", "medium", "integration", 8, 5, ["WebSocket upgrade and connection lifecycle behavior", "open, message, close, and failure branches"]);
    }
    if (lowerPath.includes("handler")) {
      return recommended("http-handler", ["http-handler", "request-response-boundary"], "medium", "medium", "integration", 5, 4, ["HTTP handler dispatch and response conversion", "middleware, validation, and thrown error branches"]);
    }
    if (lowerPath.includes("route")) {
      return recommended("http-route", ["http-route", "route-registration"], "medium", "medium", "integration", 5, 4, ["HTTP route registration and dispatch behavior", "method, pattern, middleware, and validation branches"]);
    }
    if (lowerPath.includes("query")) {
      return recommended("query-boundary", ["query-boundary", "structured-input"], "medium", "high", "unit", 5, 2, ["HTTP query parsing and serialization behavior", "media type, repeated value, and malformed input branches"]);
    }
    if (lowerPath.includes("request")) {
      return recommended("request-access", ["request-access", "url-header-boundary"], "medium", "high", "unit", 5, 2, ["HTTP request URL, header, and context access", "proxy, validation, and malformed input branches"]);
    }
  }

  if (branchHeavy && (lowerPath.includes("validator") || lowerPath.includes("/validation/"))) {
    return recommended("request-validation", ["request-validation", "failure-mapping"], "high", "high", "unit", 9, 3, ["Request validation and failure mapping", "accepted, rejected, and malformed input boundaries"]);
  }

  if (branchHeavy && matchesAny(lowerPath, ["stream", "sse"])) {
    return recommended("streaming", ["streaming-boundary", "async-lifecycle"], "medium", "medium", "integration", 5, 4, ["Streaming lifecycle and backpressure behavior", "cancellation, cleanup, and error propagation"]);
  }

  if (branchHeavy && lowerPath.includes("/adapter/")) {
    return recommended("runtime-adapter", ["runtime-adapter", "platform-boundary"], "medium", "medium", "integration", 5, 4, ["Runtime adapter request and response translation", "platform-specific lifecycle and error behavior"]);
  }

  if (branchHeavy && lowerPath.includes("/client/") && matchesAny(lowerPath, ["fetch", "result", "response", "parse"])) {
    return recommended("response-parser", ["response-parsing", "external-boundary"], "high", "high", "unit", 9, 3, ["Client response parsing and error translation", "success, malformed payload, and failure response boundaries"]);
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

  if (branchHeavy) {
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

function hasHttpBoundary(content: string): boolean {
  return /\b(?:HTTPEvent|H3Event|HTTPMethod|EventHandler|H3Route|Request|Response|Headers)\b|\.req\b|\.res\b/.test(content);
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
  return isInSourceRoot(normalized) && isJavaScriptModuleFile(normalized);
}

function isJavaScriptModuleFile(path: string): boolean {
  const normalized = normalizePath(path);
  return SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension)) && !isTestFile(normalized);
}

function isRuntimeJavaScriptSource(path: string): boolean {
  const normalized = normalizePath(path);
  return isInSourceRoot(normalized) && /\.(cjs|mjs|js|jsx)$/.test(normalized) && !isTestFile(normalized);
}

function isInSourceRoot(path: string): boolean {
  return SOURCE_ROOTS.some((root) => path.startsWith(root));
}

function hasSourceJavaScriptRuntimeEntrypoint(files: FileSnapshot[]): boolean {
  const packageJson = files.find((file) => normalizePath(file.path) === "package.json");
  const packageData = parsePackageJson(packageJson?.content ?? "");
  const entrypoints = collectPackageEntrypoints(packageData);

  return entrypoints.some((entrypoint) => {
    const normalized = stripCurrentDirectoryPrefix(normalizePath(entrypoint));
    return isInSourceRoot(normalized) && /\.(cjs|mjs|js|jsx)$/.test(normalized);
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
    ((normalized.startsWith("test/") || normalized.startsWith("tests/")) && SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension))) ||
    normalized.includes("__tests__/") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function findExistingTestEvidence(
  sourcePath: string,
  testFiles: FileSnapshot[],
  moduleFiles: FileSnapshot[],
  boundedTransitiveImports: Map<string, Map<string, "called" | "asserted" | undefined>>,
  packageEntry: { packageName?: string; packageEntryFile?: FileSnapshot; packageSubpathEntries: Map<string, FileSnapshot>; pathAliasEntries: Map<string, FileSnapshot> }
): Array<{ testPath: string; kind: string; strength: "naming" | "direct" | "referenced" | "indirect"; usage?: "called" | "asserted"; viaUsage?: "called" | "asserted" }> {
  const normalized = normalizePath(sourcePath);
  const sourceBase = basenameWithoutExtension(normalized);
  const sourceSegments = normalized.split("/");
  const sourceDir = sourceSegments.slice(0, -1).join("/");
  const parentBase = sourceSegments.length > 1 ? sourceSegments.at(-2) : undefined;
  const baseNameCandidates = new Set([sourceBase, ...pluralizeBaseName(sourceBase)]);
  const sourceBaseCandidates = new Set(baseNameCandidates);
  const qualifiedBaseCandidates = new Set<string>();
  if (parentBase) {
    for (const candidate of baseNameCandidates) {
      const qualifiedCandidate = `${parentBase}-${candidate}`;
      sourceBaseCandidates.add(qualifiedCandidate);
      qualifiedBaseCandidates.add(qualifiedCandidate);
    }
    if (sourceBase === "index") {
      sourceBaseCandidates.add(parentBase);
      qualifiedBaseCandidates.add(parentBase);
    }
  }

  return testFiles.flatMap((testFile) => {
      const testBase = basenameWithoutExtension(testFile.path).replace(/\.(test|spec)$/, "");
      const filenameMatch =
        hasFilenameMatch(testFile.path, testBase, sourceBase, sourceDir, baseNameCandidates, sourceBaseCandidates, qualifiedBaseCandidates) ||
        testFile.path.startsWith(`${sourceDir}/__tests__/${sourceBase}.`);
      const directImportUsage = getDirectRelativeImportUsage(testFile, normalized);
      if (directImportUsage) return [{ testPath: testFile.path, kind: "direct-relative-import", strength: "direct" as const, ...(directImportUsage !== "imported" ? { usage: directImportUsage } : {}) }];
      const barrelUsage = getOneHopBarrelImportUsage(testFile, normalized, moduleFiles);
      if (barrelUsage) return [{ testPath: testFile.path, kind: "referenced-relative-reexport", strength: "referenced" as const, ...(barrelUsage !== "referenced" ? { usage: barrelUsage } : {}) }];
      const pathAliasUsage = getPathAliasImportUsage(testFile, normalized, moduleFiles, packageEntry.pathAliasEntries);
      if (pathAliasUsage) return [{ testPath: testFile.path, kind: "tsconfig-path-import", strength: "direct" as const, ...(pathAliasUsage !== "imported" ? { usage: pathAliasUsage } : {}) }];
      const packageEntryUsage = getPackageEntryImportUsage(testFile, normalized, moduleFiles, packageEntry);
      if (packageEntryUsage) return [{ testPath: testFile.path, kind: "package-entry-import", strength: "referenced" as const, ...(packageEntryUsage !== "referenced" ? { usage: packageEntryUsage } : {}) }];
      const transitiveImports = boundedTransitiveImports.get(testFile.path);
      if (transitiveImports?.has(normalized)) {
        const viaUsage = transitiveImports.get(normalized);
        return [{ testPath: testFile.path, kind: "bounded-dependency", strength: "indirect" as const, ...(viaUsage ? { viaUsage } : {}) }];
      }
      if (filenameMatch) return [{ testPath: testFile.path, kind: "filename-convention", strength: "naming" as const }];
      return [];
    });
}

function hasFilenameMatch(
  testPath: string,
  testBase: string,
  sourceBase: string,
  sourceDir: string,
  baseNameCandidates: Set<string>,
  sourceBaseCandidates: Set<string>,
  qualifiedBaseCandidates: Set<string>
): boolean {
  if (!GENERIC_SOURCE_BASENAMES.has(sourceBase)) return sourceBaseCandidates.has(testBase);
  const testDir = dirname(testPath);
  return qualifiedBaseCandidates.has(testBase) || (testDir === sourceDir && baseNameCandidates.has(testBase));
}

function getDirectRelativeImportUsage(testFile: FileSnapshot, sourcePath: string): "imported" | "called" | "asserted" | undefined {
  const matchingImports = getModuleImports(testFile).filter(({ specifier }) =>
    specifier.startsWith(".") && moduleSpecifierTargetsSource(testFile.path, specifier, sourcePath)
  );
  if (matchingImports.some(({ assertedImportedNames }) => assertedImportedNames.size > 0)) return "asserted";
  if (matchingImports.some(({ calledImportedNames }) => calledImportedNames.size > 0)) return "called";
  return matchingImports.length > 0 || getRelativeModuleSpecifiers(testFile).some((specifier) =>
    moduleSpecifierTargetsSource(testFile.path, specifier, sourcePath)
  ) ? "imported" : undefined;
}

function collectBoundedTransitiveImports(testFiles: FileSnapshot[], moduleFiles: FileSnapshot[], pathAliasEntries: Map<string, FileSnapshot>): Map<string, Map<string, "called" | "asserted" | undefined>> {
  return new Map(
    testFiles.map((testFile) => [testFile.path, collectBoundedTransitiveImportsForTest(testFile, moduleFiles, pathAliasEntries)])
  );
}

function collectBoundedTransitiveImportsForTest(testFile: FileSnapshot, moduleFiles: FileSnapshot[], pathAliasEntries: Map<string, FileSnapshot>): Map<string, "called" | "asserted" | undefined> {
  const queue: Array<{ file: FileSnapshot; depth: number; viaUsage?: "called" | "asserted" }> = [];
  for (const { specifier, usedImportedNames, calledImportedNames, assertedImportedNames } of getModuleImports(testFile)) {
    const file = findImportedModuleFile(testFile.path, specifier, moduleFiles, pathAliasEntries);
    if (!file) continue;
    const viaUsage = assertedImportedNames.size > 0 ? "asserted" : calledImportedNames.size > 0 ? "called" : undefined;
    queue.push({ file, depth: 0, viaUsage });
    for (const reExport of findImportedReExportFiles(file, usedImportedNames, moduleFiles)) {
      queue.push({ file: reExport, depth: 1, viaUsage });
    }
  }
  const visited = new Map<string, "called" | "asserted" | undefined>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const { file, depth, viaUsage } = current;
    if (visited.has(file.path) && usageRank(visited.get(file.path)) >= usageRank(viaUsage)) continue;
    visited.set(file.path, viaUsage);
    if (depth >= MAX_TRANSITIVE_SOURCE_DEPTH) continue;

    for (const specifier of getRuntimeDependencySpecifiers(file)) {
      const dependency = findImportedModuleFile(file.path, specifier, moduleFiles, pathAliasEntries);
      if (dependency) queue.push({ file: dependency, depth: depth + 1, viaUsage });
    }
  }

  return visited;
}

function usageRank(usage: "called" | "asserted" | undefined): number {
  return usage === "asserted" ? 2 : usage === "called" ? 1 : 0;
}

function findImportedModuleFile(
  importerPath: string,
  specifier: string,
  moduleFiles: FileSnapshot[],
  pathAliasEntries: Map<string, FileSnapshot>
): FileSnapshot | undefined {
  return specifier.startsWith(".")
    ? findRelativeModuleFile(importerPath, specifier, moduleFiles)
    : pathAliasEntries.get(specifier);
}

function findImportedReExportFiles(
  barrelFile: FileSnapshot,
  importedNames: Set<string>,
  moduleFiles: FileSnapshot[]
): FileSnapshot[] {
  if (importedNames.size === 0) return [];
  return moduleFiles.filter((sourceFile) =>
    sourceFile.path !== barrelFile.path &&
    isSourceFile(sourceFile.path) &&
    barrelExportsImportedNames(barrelFile, sourceFile, importedNames)
  );
}

function findRelativeModuleFile(
  importerPath: string,
  specifier: string,
  moduleFiles: FileSnapshot[]
): FileSnapshot | undefined {
  return moduleFiles.find(
    (file) => isJavaScriptModuleFile(file.path) && moduleSpecifierTargetsSource(importerPath, specifier, file.path)
  );
}

function getOneHopBarrelImportUsage(testFile: FileSnapshot, sourcePath: string, moduleFiles: FileSnapshot[]): "referenced" | "called" | "asserted" | undefined {
  for (const { specifier, usedImportedNames, calledImportedNames, assertedImportedNames } of getModuleImports(testFile)) {
    if (!specifier.startsWith(".")) continue;
    const barrelFile = moduleFiles.find((file) => moduleSpecifierTargetsSource(testFile.path, specifier, file.path));
    if (!barrelFile || barrelFile.path === sourcePath) continue;
    const sourceFile = moduleFiles.find((file) => file.path === sourcePath);
    if (!sourceFile || !barrelExportsImportedNames(barrelFile, sourceFile, usedImportedNames)) continue;
    if (barrelExportsImportedNames(barrelFile, sourceFile, assertedImportedNames)) return "asserted";
    if (barrelExportsImportedNames(barrelFile, sourceFile, calledImportedNames)) return "called";
    return "referenced";
  }
  return undefined;
}

function getPathAliasImportUsage(
  testFile: FileSnapshot,
  sourcePath: string,
  moduleFiles: FileSnapshot[],
  pathAliasEntries: Map<string, FileSnapshot>
): "imported" | "called" | "asserted" | undefined {
  for (const moduleImport of getModuleImports(testFile)) {
    const { specifier } = moduleImport;
    const entryFile = pathAliasEntries.get(specifier);
    if (!entryFile) continue;
    const sourceFile = moduleFiles.find((file) => file.path === sourcePath);
    const usage = sourceFile ? getEntrypointImportUsage(moduleImport, entryFile, sourceFile, "imported") : undefined;
    if (usage) return usage;
  }
  return undefined;
}

function getPackageEntryImportUsage(
  testFile: FileSnapshot,
  sourcePath: string,
  moduleFiles: FileSnapshot[],
  {
    packageName,
    packageEntryFile,
    packageSubpathEntries
  }: { packageName?: string; packageEntryFile?: FileSnapshot; packageSubpathEntries: Map<string, FileSnapshot> }
): "referenced" | "called" | "asserted" | undefined {
  if (!packageName) return undefined;

  for (const moduleImport of getModuleImports(testFile)) {
    const { specifier } = moduleImport;
    const entryFile = specifier === packageName ? packageEntryFile : packageSubpathEntries.get(specifier);
    if (!entryFile) continue;
    const sourceFile = moduleFiles.find((file) => file.path === sourcePath);
    const usage = sourceFile ? getEntrypointImportUsage(moduleImport, entryFile, sourceFile, "referenced") : undefined;
    if (usage) return usage;
  }
  return undefined;
}

function getEntrypointImportUsage(
  moduleImport: ModuleImport,
  entryFile: FileSnapshot,
  sourceFile: FileSnapshot,
  structuralUsage: "imported" | "referenced"
): "imported" | "referenced" | "called" | "asserted" | undefined {
  if (entryFile.path === sourceFile.path) {
    if (moduleImport.assertedImportedNames.size > 0) return "asserted";
    if (moduleImport.calledImportedNames.size > 0) return "called";
    return structuralUsage;
  }
  if (!barrelExportsImportedNames(entryFile, sourceFile, moduleImport.usedImportedNames)) return undefined;
  if (barrelExportsImportedNames(entryFile, sourceFile, moduleImport.assertedImportedNames)) return "asserted";
  if (barrelExportsImportedNames(entryFile, sourceFile, moduleImport.calledImportedNames)) return "called";
  return structuralUsage;
}

function barrelExportsImportedNames(barrelFile: FileSnapshot, sourceFile: FileSnapshot, importedNames: Set<string>): boolean {
  if (importedNames.size === 0) return false;
  return collectRelativeReExports(barrelFile.content).some(({ specifier, exportedNames, exportAll }) => {
    if (!moduleSpecifierTargetsSource(barrelFile.path, specifier, sourceFile.path)) return false;
    const availableNames = exportAll ? collectDeclaredExportNames(sourceFile.content) : exportedNames;
    return [...importedNames].some((name) => availableNames.has(name));
  });
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

function findSourcePackageSubpathEntries(
  packageData: Record<string, unknown>,
  moduleFiles: FileSnapshot[]
): Map<string, FileSnapshot> {
  const entries = new Map<string, FileSnapshot>();
  if (typeof packageData.name !== "string" || !packageData.exports || typeof packageData.exports !== "object") {
    return entries;
  }

  for (const [subpath, value] of Object.entries(packageData.exports)) {
    if (!subpath.startsWith("./")) continue;
    const relativeSubpath = subpath.slice(2);
    const declaredPaths = collectStringValues(value).map((candidate) => candidate.replace(/^\.\//, ""));
    const candidates = [
      ...declaredPaths,
      ...declaredPaths.filter((candidate) => candidate.startsWith("dist/")).map((candidate) => candidate.replace(/^dist\//, "src/")),
      `src/${relativeSubpath}`,
      relativeSubpath
    ];
    if (relativeSubpath.includes("*")) {
      addWildcardPackageEntries(entries, packageData.name, relativeSubpath, candidates, moduleFiles);
      continue;
    }
    const entryFile = findSourceFileForCandidates(candidates, moduleFiles);
    if (entryFile) entries.set(`${packageData.name}/${relativeSubpath}`, entryFile);
  }

  return entries;
}

function parseJsonConfig(content: string): Record<string, unknown> {
  if (!content.trim()) return {};
  try {
    const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    return JSON.parse(withoutComments.replace(/,\s*([}\]])/g, "$1"));
  } catch {
    return {};
  }
}

function resolveTsconfigData(
  configPath: string,
  files: FileSnapshot[],
  visited = new Set<string>()
): Record<string, unknown> {
  const normalizedPath = normalizePath(configPath);
  if (visited.has(normalizedPath)) return {};
  visited.add(normalizedPath);
  const file = files.find((candidate) => normalizePath(candidate.path) === normalizedPath);
  if (!file) return {};
  const current = parseJsonConfig(file.content);
  const extendedPath = resolveLocalTsconfigExtends(normalizedPath, current.extends);
  const inherited = extendedPath ? resolveTsconfigData(extendedPath, files, visited) : {};
  const inheritedCompilerOptions = inherited.compilerOptions && typeof inherited.compilerOptions === "object"
    ? inherited.compilerOptions as Record<string, unknown>
    : {};
  const currentCompilerOptions = current.compilerOptions && typeof current.compilerOptions === "object"
    ? current.compilerOptions as Record<string, unknown>
    : {};
  const compilerOptions: Record<string, unknown> = { ...inheritedCompilerOptions, ...currentCompilerOptions };
  if (typeof currentCompilerOptions.baseUrl === "string") {
    compilerOptions.baseUrl = normalizePathSegments(joinPath(dirname(normalizedPath), currentCompilerOptions.baseUrl));
  } else if (currentCompilerOptions.paths && typeof compilerOptions.baseUrl !== "string") {
    compilerOptions.baseUrl = dirname(normalizedPath) || ".";
  }
  return { ...inherited, ...current, compilerOptions };
}

function resolveLocalTsconfigExtends(configPath: string, extendsValue: unknown): string | undefined {
  if (typeof extendsValue !== "string" || !extendsValue.startsWith(".")) return undefined;
  const resolved = normalizePathSegments(joinPath(dirname(configPath), extendsValue));
  return resolved.endsWith(".json") ? resolved : `${resolved}.json`;
}

function findTsconfigPathAliasEntries(
  tsconfigData: Record<string, unknown>,
  moduleFiles: FileSnapshot[]
): Map<string, FileSnapshot> {
  const entries = new Map<string, FileSnapshot>();
  const compilerOptions = tsconfigData.compilerOptions;
  if (!compilerOptions || typeof compilerOptions !== "object") return entries;
  const { paths, baseUrl: rawBaseUrl } = compilerOptions as { paths?: unknown; baseUrl?: unknown };
  if (!paths || typeof paths !== "object") return entries;
  const baseUrl = typeof rawBaseUrl === "string" ? rawBaseUrl.replace(/^\.\//, "") : ".";

  for (const [aliasPattern, targetValues] of Object.entries(paths)) {
    if (!Array.isArray(targetValues)) continue;
    const targetPatterns = targetValues
      .filter((value): value is string => typeof value === "string")
      .map((value) => normalizePathSegments(joinPath(baseUrl, value)));
    if (!aliasPattern.includes("*")) {
      const entryFile = findSourceFileForCandidates(targetPatterns, moduleFiles);
      if (entryFile) entries.set(aliasPattern, entryFile);
      continue;
    }
    if (aliasPattern.split("*").length !== 2) continue;
    for (const file of moduleFiles.filter((candidate) => isSourceFile(candidate.path))) {
      for (const targetPattern of targetPatterns.filter((candidate) => candidate.split("*").length === 2)) {
        const wildcardValue = matchWildcardSourcePath(targetPattern, file.path);
        if (wildcardValue === undefined) continue;
        entries.set(aliasPattern.replace("*", wildcardValue), file);
        break;
      }
    }
  }
  return entries;
}

function addWildcardPackageEntries(
  entries: Map<string, FileSnapshot>,
  packageName: string,
  relativeSubpath: string,
  candidatePatterns: string[],
  moduleFiles: FileSnapshot[]
): void {
  for (const file of moduleFiles.filter((candidate) => isSourceFile(candidate.path))) {
    for (const pattern of candidatePatterns.filter((candidate) => candidate.includes("*"))) {
      const wildcardValue = matchWildcardSourcePath(pattern, file.path);
      if (wildcardValue === undefined) continue;
      entries.set(`${packageName}/${relativeSubpath.replace("*", wildcardValue)}`, file);
      break;
    }
  }
}

function matchWildcardSourcePath(pattern: string, sourcePath: string): string | undefined {
  const normalizedPattern = removeJavaScriptExtension(pattern.replace(/^\.\//, ""));
  const normalizedSource = removeJavaScriptExtension(sourcePath);
  const [prefix, suffix, ...extra] = normalizedPattern.split("*");
  if (extra.length > 0) return undefined;
  if (!normalizedSource.startsWith(prefix) || !normalizedSource.endsWith(suffix)) return undefined;
  const wildcardValue = normalizedSource.slice(prefix.length, normalizedSource.length - suffix.length);
  return wildcardValue || undefined;
}

function findSourceFileForCandidates(candidates: string[], moduleFiles: FileSnapshot[]): FileSnapshot | undefined {
  for (const candidate of candidates) {
    const entryFile = moduleFiles.find(
      (file) => isSourceFile(file.path) && moduleSpecifierTargetsSource("package.json", candidate, file.path)
    );
    if (entryFile) return entryFile;
  }
  return undefined;
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectStringValues);
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

interface ModuleImport {
  specifier: string;
  importedNames: Set<string>;
  usedImportedNames: Set<string>;
  calledImportedNames: Set<string>;
  assertedImportedNames: Set<string>;
}

interface RelativeReExport {
  specifier: string;
  exportedNames: Set<string>;
  exportAll: boolean;
}

type AnalyzedFileSnapshot = FileSnapshot & {
  moduleImports?: ModuleImport[];
  relativeModuleSpecifiers?: string[];
  runtimeDependencySpecifiers?: string[];
};

function analyzeModuleFile(file: FileSnapshot): AnalyzedFileSnapshot {
  if (!SOURCE_EXTENSIONS.some((extension) => file.path.endsWith(extension))) return file;
  const moduleImports = collectModuleImports(file.content);
  return {
    ...file,
    moduleImports,
    relativeModuleSpecifiers: collectRelativeModuleSpecifiers(file.content),
    runtimeDependencySpecifiers: moduleImports.map(({ specifier }) => specifier)
  };
}

function getModuleImports(file: FileSnapshot): ModuleImport[] {
  return (file as AnalyzedFileSnapshot).moduleImports ?? collectModuleImports(file.content);
}

function getRelativeModuleSpecifiers(file: FileSnapshot): string[] {
  return (file as AnalyzedFileSnapshot).relativeModuleSpecifiers ?? collectRelativeModuleSpecifiers(file.content);
}

function getRuntimeDependencySpecifiers(file: FileSnapshot): string[] {
  return (file as AnalyzedFileSnapshot).runtimeDependencySpecifiers ?? collectRuntimeDependencySpecifiers(file.content);
}

function collectRuntimeDependencySpecifiers(content: string): string[] {
  return collectModuleImports(content)
    .map(({ specifier }) => specifier);
}

function collectModuleImports(content: string): ModuleImport[] {
  const imports: ModuleImport[] = [];
  const contentWithoutImports = content
    .replace(/\bimport\s+[^;"']*?\s+from\s+["'][^"']+["']\s*;?/g, "")
    .replace(/\b(?:const|let|var)\s+\{[^}]+\}\s*=\s*require\s*\(\s*["'][^"']+["']\s*\)\s*;?/g, "")
    .replace(/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*require\s*\(\s*["'][^"']+["']\s*\)\s*;?/g, "");
  const importPattern = /\bimport\s+([^;"']*?)\s+from\s+["']([^"']+)["']/g;
  for (const match of content.matchAll(importPattern)) {
    const clause = match[1];
    const specifier = match[2];
    if (clause && specifier) imports.push({
      specifier,
      importedNames: collectImportClauseNames(clause, content),
      usedImportedNames: collectUsedImportClauseNames(clause, contentWithoutImports),
      calledImportedNames: collectCalledImportClauseNames(clause, contentWithoutImports),
      assertedImportedNames: collectAssertedImportClauseNames(clause, contentWithoutImports)
    });
  }
  const requirePattern = /\b(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of content.matchAll(requirePattern)) {
    const names = match[1];
    const specifier = match[2];
    if (names && specifier) imports.push({
      specifier,
      importedNames: collectAliasedNames(names, ":"),
      usedImportedNames: collectUsedRequireNames(names, contentWithoutImports),
      calledImportedNames: collectCalledRequireNames(names, contentWithoutImports),
      assertedImportedNames: collectAssertedRequireNames(names, contentWithoutImports)
    });
  }
  const namespaceRequirePattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of content.matchAll(namespaceRequirePattern)) {
    const namespace = match[1];
    const specifier = match[2];
    if (namespace && specifier) {
      const calledImportedNames = collectNamespaceMemberNames(namespace, contentWithoutImports, isIdentifierCalled);
      const assertedImportedNames = collectNamespaceMemberNames(namespace, contentWithoutImports, isIdentifierAsserted);
      if (isIdentifierCalled(contentWithoutImports, namespace)) calledImportedNames.add("default");
      if (isIdentifierAsserted(contentWithoutImports, namespace)) assertedImportedNames.add("default");
      imports.push({
        specifier,
        importedNames: collectNamespaceMemberNames(namespace, contentWithoutImports),
        usedImportedNames: collectNamespaceMemberNames(namespace, contentWithoutImports),
        calledImportedNames,
        assertedImportedNames
      });
    }
  }
  const plainRequirePattern = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of content.matchAll(plainRequirePattern)) {
    const specifier = match[1];
    if (specifier && !imports.some((current) => current.specifier === specifier)) {
      imports.push({ specifier, importedNames: new Set(), usedImportedNames: new Set(), calledImportedNames: new Set(), assertedImportedNames: new Set() });
    }
  }
  return imports;
}

function collectCalledImportClauseNames(clause: string, contentWithoutImports: string): Set<string> {
  const names = new Set<string>();
  const named = clause.match(/\{([^}]+)\}/)?.[1];
  if (named) {
    for (const part of named.split(",")) {
      const [imported, local = imported] = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      if (imported && local && isIdentifierCalled(contentWithoutImports, local)) names.add(imported);
    }
  }
  const defaultImport = clause.split(",", 1)[0]?.trim();
  if (defaultImport && !defaultImport.startsWith("{") && !defaultImport.startsWith("*") && isIdentifierCalled(contentWithoutImports, defaultImport)) names.add("default");
  collectNamespaceUsageNames(clause, contentWithoutImports, isIdentifierCalled, names);
  return names;
}

function collectCalledRequireNames(clause: string, contentWithoutImports: string): Set<string> {
  const names = new Set<string>();
  for (const part of clause.split(",")) {
    const [imported, local = imported] = part.trim().split(/\s*:\s*/);
    if (imported && local && isIdentifierCalled(contentWithoutImports, local)) names.add(imported);
  }
  return names;
}

function collectAssertedImportClauseNames(clause: string, contentWithoutImports: string): Set<string> {
  const names = new Set<string>();
  const named = clause.match(/\{([^}]+)\}/)?.[1];
  if (named) {
    for (const part of named.split(",")) {
      const [imported, local = imported] = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      if (imported && local && isIdentifierAsserted(contentWithoutImports, local)) names.add(imported);
    }
  }
  const defaultImport = clause.split(",", 1)[0]?.trim();
  if (defaultImport && !defaultImport.startsWith("{") && !defaultImport.startsWith("*") && isIdentifierAsserted(contentWithoutImports, defaultImport)) names.add("default");
  collectNamespaceUsageNames(clause, contentWithoutImports, isIdentifierAsserted, names);
  return names;
}

function collectNamespaceUsageNames(
  clause: string,
  content: string,
  predicate: (content: string, identifier: string) => boolean,
  names: Set<string>
): void {
  const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)?.[1];
  if (!namespace) return;
  for (const name of collectNamespaceMemberNames(namespace, content, predicate)) names.add(name);
}

function collectNamespaceMemberNames(
  namespace: string,
  content: string,
  predicate: (content: string, identifier: string) => boolean = isIdentifierReferenced
): Set<string> {
  const names = new Set<string>();
  const propertyPattern = new RegExp(`\\b${escapeRegExp(namespace)}\\.([A-Za-z_$][\\w$]*)`, "g");
  for (const match of content.matchAll(propertyPattern)) {
    const property = match[1];
    if (property && predicate(content, `${namespace}.${property}`)) names.add(property);
  }
  return names;
}

function collectAssertedRequireNames(clause: string, contentWithoutImports: string): Set<string> {
  const names = new Set<string>();
  for (const part of clause.split(",")) {
    const [imported, local = imported] = part.trim().split(/\s*:\s*/);
    if (imported && local && isIdentifierAsserted(contentWithoutImports, local)) names.add(imported);
  }
  return names;
}

function isIdentifierAsserted(content: string, identifier: string): boolean {
  const escaped = escapeRegExp(identifier);
  const assertionCall = assertionCallPattern(content);
  if (new RegExp(`\\b${assertionCall}\\s*\\(\\s*(?:(?:async\\s+)?\\(\\s*\\)\\s*=>\\s*)?(?:await\\s+)?(?:new\\s+)?${escaped}\\s*\\(`).test(content)) return true;
  const assignmentPattern = new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:await\\s+)?(?:new\\s+)?${escaped}\\s*\\(`, "g");
  for (const match of content.matchAll(assignmentPattern)) {
    const resultName = match[1];
    if (resultName && isResultIdentifierAsserted(content, resultName)) return true;
  }
  const destructuredAssignmentPattern = new RegExp(`\\b(?:const|let|var)\\s+\\{([^}]+)\\}\\s*=\\s*(?:await\\s+)?${escaped}\\s*\\(`, "g");
  for (const match of content.matchAll(destructuredAssignmentPattern)) {
    const bindingList = match[1];
    if (!bindingList) continue;
    for (const part of bindingList.split(",")) {
      const local = part.trim().split(/\s*:\s*/).at(-1)?.trim();
      if (local && isResultIdentifierAsserted(content, local)) return true;
    }
  }
  return false;
}

function isResultIdentifierAsserted(content: string, identifier: string): boolean {
  return new RegExp(`\\b${assertionCallPattern(content)}\\s*\\(\\s*${escapeRegExp(identifier)}\\b`).test(content);
}

function assertionCallPattern(content: string): string {
  const avaContexts = collectAvaExecutionContextNames(content);
  const avaAssertions = avaContexts.length > 0
    ? `|(?:${avaContexts.map(escapeRegExp).join("|")})\\.(?:${AVA_ASSERTION_METHODS.join("|")})`
    : "";
  return `(?:expect|assert(?:\\.[A-Za-z_$][\\w$]*)?${avaAssertions})`;
}

function collectAvaExecutionContextNames(content: string): string[] {
  const names = new Set<string>();
  const pattern = /\btest(?:\.(?:failing|only|serial|skip))?\s*\(\s*["'`][\s\S]*?["'`]\s*,\s*(?:async\s+)?(?:\(\s*)?([A-Za-z_$][\w$]*)\s*(?:\))?\s*=>/g;
  for (const match of content.matchAll(pattern)) names.add(match[1]);
  return [...names];
}

function isIdentifierCalled(content: string, identifier: string): boolean {
  return new RegExp(`\\b(?:new\\s+)?${escapeRegExp(identifier)}\\s*\\(`).test(content);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectUsedImportClauseNames(clause: string, contentWithoutImports: string): Set<string> {
  const names = new Set<string>();
  const named = clause.match(/\{([^}]+)\}/)?.[1];
  if (named) {
    for (const part of named.split(",")) {
      const [imported, local = imported] = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      if (imported && local && isIdentifierReferenced(contentWithoutImports, local)) names.add(imported);
    }
  }
  const defaultImport = clause.split(",", 1)[0]?.trim();
  if (defaultImport && !defaultImport.startsWith("{") && !defaultImport.startsWith("*") && isIdentifierReferenced(contentWithoutImports, defaultImport)) {
    names.add("default");
  }
  const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)?.[1];
  if (namespace) {
    const propertyPattern = new RegExp(`\\b${namespace}\\.([A-Za-z_$][\\w$]*)`, "g");
    for (const match of contentWithoutImports.matchAll(propertyPattern)) {
      const property = match[1];
      if (property) names.add(property);
    }
  }
  return names;
}

function collectUsedRequireNames(clause: string, contentWithoutImports: string): Set<string> {
  const names = new Set<string>();
  for (const part of clause.split(",")) {
    const [imported, local = imported] = part.trim().split(/\s*:\s*/);
    if (imported && local && isIdentifierReferenced(contentWithoutImports, local)) names.add(imported);
  }
  return names;
}

function isIdentifierReferenced(content: string, identifier: string): boolean {
  return new RegExp(`\\b${identifier.replace(/[$]/g, "\\$")}\\b`).test(content);
}

function collectImportClauseNames(clause: string, content: string): Set<string> {
  const names = new Set<string>();
  const named = clause.match(/\{([^}]+)\}/)?.[1];
  if (named) for (const name of collectAliasedNames(named, "as")) names.add(name);
  const defaultImport = clause.split(",", 1)[0]?.trim();
  if (defaultImport && !defaultImport.startsWith("{") && !defaultImport.startsWith("*")) names.add("default");
  const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)?.[1];
  if (namespace) {
    const propertyPattern = new RegExp(`\\b${namespace}\\.([A-Za-z_$][\\w$]*)`, "g");
    for (const match of content.matchAll(propertyPattern)) {
      const property = match[1];
      if (property) names.add(property);
    }
  }
  return names;
}

function collectAliasedNames(value: string, aliasToken: string): Set<string> {
  return new Set(
    value.split(",")
      .map((part) => part.trim().split(new RegExp(`\\s+${aliasToken}\\s+|\\s*${aliasToken}\\s*`))[0]?.trim())
      .filter((name): name is string => Boolean(name))
  );
}

function collectRelativeReExports(content: string): RelativeReExport[] {
  const exports: RelativeReExport[] = [];
  const namedPattern = /\bexport\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(namedPattern)) {
    const names = match[1];
    const specifier = match[2];
    if (names && specifier?.startsWith(".")) {
      exports.push({ specifier, exportedNames: collectPublicExportNames(names), exportAll: false });
    }
  }
  const allPattern = /\bexport\s*\*\s*from\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(allPattern)) {
    const specifier = match[1];
    if (specifier?.startsWith(".")) exports.push({ specifier, exportedNames: new Set(), exportAll: true });
  }
  return exports;
}

function collectPublicExportNames(value: string): Set<string> {
  return new Set(
    value.split(",")
      .map((part) => part.trim().split(/\s+as\s+/).at(-1)?.trim())
      .filter((name): name is string => Boolean(name))
  );
}

function collectDeclaredExportNames(content: string): Set<string> {
  const names = new Set<string>();
  const declarationPattern = /\bexport\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of content.matchAll(declarationPattern)) {
    const name = match[1];
    if (name) names.add(name);
  }
  if (/\bexport\s+default\b/.test(content)) names.add("default");
  const localExportPattern = /\bexport\s*\{([^}]+)\}(?!\s*from)/g;
  for (const match of content.matchAll(localExportPattern)) {
    const exports = match[1];
    if (exports) for (const name of collectPublicExportNames(exports)) names.add(name);
  }
  return names;
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

function isReactHook(currentPath: string, content: string, profile: RepoProfile): boolean {
  if (!profile.architectures.includes("react")) return false;
  const name = basenameWithoutExtension(currentPath);
  if (!/^use[A-Z0-9]/.test(name)) return false;
  return new RegExp(`\\b(?:function\\s+${escapeRegExp(name)}|(?:const|let|var)\\s+${escapeRegExp(name)}\\b)`).test(content);
}

function byRiskThenName(a: AuditTarget, b: AuditTarget): number {
  const order = { high: 0, medium: 1, low: 2 };
  return order[a.risk] - order[b.risk] || a.name.localeCompare(b.name);
}
