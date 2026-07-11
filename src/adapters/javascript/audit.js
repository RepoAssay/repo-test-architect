import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = [".js", ".jsx", ".mjs", ".ts", ".tsx"];
const GENERIC_SOURCE_BASENAMES = new Set(["handler", "index", "types", "utils"]);
const MAX_TRANSITIVE_SOURCE_DEPTH = 2;

export function auditJavaScriptRepo(root, options = {}) {
  const files = readRepoFiles(root);
  const profile = buildProfile(root, files);
  const changedPaths = options.changedPaths ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(root, currentPath))) : undefined;
  const testFiles = files
    .filter((file) => isTestFile(file.path))
    .map((file) => ({ ...file, path: normalizePath(file.path) }));
  const moduleFiles = files.map((file) => ({ ...file, path: normalizePath(file.path) }));
  const tsconfigData = parseJsonConfig(files.find((file) => normalizePath(file.path) === "tsconfig.json")?.content ?? "");
  const pathAliasEntries = findTsconfigPathAliasEntries(tsconfigData, moduleFiles);
  const boundedTransitiveImports = collectBoundedTransitiveImports(testFiles, moduleFiles, pathAliasEntries);
  const packageData = parsePackageJson(files.find((file) => normalizePath(file.path) === "package.json")?.content ?? "");
  const packageEntryFile = findSourcePackageEntry(packageData, moduleFiles);
  const packageSubpathEntries = findSourcePackageSubpathEntries(packageData, moduleFiles);
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];
  const runtimeSourcePaths = new Set(files.map((file) => normalizePath(file.path)).filter(isRuntimeJavaScriptSource));
  const sourceJavaScriptRuntime = hasSourceJavaScriptRuntimeEntrypoint(files);

  for (const file of files.filter((candidate) => isSourceFile(candidate.path) && isIncludedByChangedPaths(candidate.path, changedPaths))) {
    const name = basenameWithoutExtension(file.path);
    const classification = classifySourceFile(file, profile, {
      runtimeSourcePaths,
      sourceJavaScriptRuntime
    });
    const existingTestPaths = findExistingTests(file.path, testFiles, moduleFiles, boundedTransitiveImports, {
      packageName: packageData.name,
      packageEntryFile,
      packageSubpathEntries,
      pathAliasEntries
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

    const target = {
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

function isIncludedByChangedPaths(currentPath, changedPaths) {
  if (!changedPaths) return true;
  return changedPaths.has(normalizePath(currentPath));
}

function readRepoFiles(root) {
  const ignored = new Set([".git", "node_modules", "dist", "build", "coverage"]);
  const files = [];

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;

      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute).replaceAll(path.sep, "/");

      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }

      if (shouldRead(relative)) {
        files.push({
          path: relative,
          content: fs.readFileSync(absolute, "utf8")
        });
      }
    }
  }

  visit(root);
  return files;
}

function shouldRead(relative) {
  return (
    SOURCE_EXTENSIONS.some((extension) => relative.endsWith(extension)) ||
    [
      "package.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "tsconfig.json",
      "vitest.config.ts",
      "vitest.config.js",
      "jest.config.ts",
      "jest.config.js"
    ].includes(relative)
  );
}

function buildProfile(root, files) {
  const paths = files.map((file) => normalizePath(file.path));
  const packageJson = files.find((file) => normalizePath(file.path) === "package.json");
  const packageText = packageJson?.content ?? "";
  const packageData = parsePackageJson(packageText);
  const testFrameworks = detectTestFrameworks(paths, packageText);
  const testCommand = detectTestCommand(packageData, testFrameworks);
  const existingTestLocations = detectExistingTestLocations(paths);
  const detectedConventions = detectConventions(paths);
  const setupSignals = detectSetupSignals(paths, packageText);
  const blockers = detectBlockers(packageJson !== undefined, testCommand, testFrameworks);

  return {
    root,
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

function parsePackageJson(packageText) {
  if (!packageText.trim()) return {};

  try {
    return JSON.parse(packageText);
  } catch {
    return {};
  }
}

function detectLanguages(paths) {
  const languages = new Set();
  if (paths.some((item) => item.endsWith(".ts") || item.endsWith(".tsx"))) languages.add("typescript");
  if (paths.some((item) => item.endsWith(".js") || item.endsWith(".jsx") || item.endsWith(".mjs"))) languages.add("javascript");
  return [...languages];
}

function detectPackageManagers(paths) {
  const managers = new Set();
  if (paths.includes("package-lock.json")) managers.add("npm");
  if (paths.includes("pnpm-lock.yaml")) managers.add("pnpm");
  if (paths.includes("yarn.lock")) managers.add("yarn");
  if (paths.includes("package.json") && managers.size === 0) managers.add("npm");
  return [...managers];
}

function detectTestFrameworks(paths, packageText) {
  const frameworks = new Set();
  if (paths.some((item) => item.includes("vitest.config")) || packageText.includes("vitest")) frameworks.add("vitest");
  if (paths.some((item) => item.includes("jest.config")) || packageText.includes("jest")) frameworks.add("jest");
  if (packageText.includes("@testing-library/react")) frameworks.add("react-testing-library");
  if (packageText.includes("supertest")) frameworks.add("supertest");
  return [...frameworks];
}

function detectTestCommand(packageData, frameworks) {
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

function isPlaceholderTestScript(command) {
  return command.includes("no test specified") || command.includes("exit 1");
}

function detectExistingTestLocations(paths) {
  const locations = new Set();

  for (const currentPath of paths) {
    if (!isTestFile(currentPath)) continue;

    const segments = currentPath.split("/");
    if (segments.includes("__tests__")) {
      locations.add("__tests__ directories");
    } else if (segments[0] === "test" || segments[0] === "tests") {
      locations.add(`${segments[0]}/`);
    } else if (currentPath.startsWith("src/")) {
      locations.add("colocated with source");
    } else {
      locations.add("custom test location");
    }
  }

  return [...locations];
}

function detectConventions(paths) {
  const conventions = new Set();

  if (paths.some((currentPath) => currentPath.endsWith(".test.ts") || currentPath.endsWith(".test.js"))) {
    conventions.add("*.test files");
  }

  if (paths.some((currentPath) => currentPath.endsWith(".spec.ts") || currentPath.endsWith(".spec.js"))) {
    conventions.add("*.spec files");
  }

  if (paths.some((currentPath) => currentPath.includes("__tests__/"))) {
    conventions.add("__tests__ folders");
  }

  if (paths.some((currentPath) => currentPath.includes("__mocks__/") || currentPath.includes("/mocks/"))) {
    conventions.add("mock folders");
  }

  if (paths.some((currentPath) => currentPath.includes("/fixtures/") || currentPath.includes("__fixtures__/"))) {
    conventions.add("fixture folders");
  }

  return [...conventions];
}

function detectSetupSignals(paths, packageText) {
  const signals = new Set();

  if (paths.includes("tsconfig.json")) signals.add("tsconfig");
  if (paths.some((currentPath) => currentPath.includes("vitest.config"))) signals.add("vitest config");
  if (paths.some((currentPath) => currentPath.includes("jest.config"))) signals.add("jest config");
  if (packageText.includes("msw")) signals.add("msw");
  if (packageText.includes("nock")) signals.add("nock");
  if (packageText.includes("supertest")) signals.add("supertest");

  return [...signals];
}

function detectBlockers(hasPackageJson, testCommand, frameworks) {
  const blockers = [];

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

function scoreProfileConfidence(testFrameworks, existingTestLocations, blockers) {
  if (blockers.length > 1) return "low";
  if (testFrameworks.length > 0 && existingTestLocations.length > 0) return "high";
  if (testFrameworks.length > 0) return "medium";
  return "low";
}

function detectArchitectures(paths, packageText) {
  const architectures = new Set();
  if (packageText.includes("react") || paths.some((item) => item.endsWith(".tsx") || item.endsWith(".jsx"))) architectures.add("react");
  if (packageText.includes("express") || paths.some((item) => item.includes("/routes/"))) architectures.add("http-routes");
  if (paths.some((item) => item.includes("/services/"))) architectures.add("service-layer");
  return [...architectures];
}

function classifySourceFile(file, profile, mirrorContext = {}) {
  const currentPath = normalizePath(file.path);
  const content = file.content;
  const lowerPath = currentPath.toLowerCase();
  const branchHeavy = hasBranching(content);
  const runtimeSourcePaths = mirrorContext.runtimeSourcePaths ?? new Set();

  if (lowerPath.includes("generated") || lowerPath.includes("/dist/") || lowerPath.includes("/build/")) {
    return skipped("generated", ["generated-code"], 1, 8, "Generated or build output should not be test-authored directly.");
  }

  if (lowerPath.endsWith(".d.ts") || lowerPath.includes("/types/")) {
    return skipped("types", ["type-only"], 1, 2, "Type-only files do not need runtime tests.");
  }

  if (isReferenceTypeScriptMirror(currentPath, content, runtimeSourcePaths)) {
    return skipped(
      "reference-mirror",
      ["type-reference-mirror"],
      1,
      2,
      "Reference TypeScript mirrors a runtime JavaScript module and should not be test-authored directly.",
      "Cover through tests for the matching runtime JavaScript module."
    );
  }

  if (isReferenceImplementationMirror(currentPath, runtimeSourcePaths, mirrorContext.sourceJavaScriptRuntime)) {
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
    let risk = "medium";

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

function recommended(kind, signals, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons) {
  return { kind, signals, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons };
}

function hasHttpBoundary(content) {
  return /\b(?:HTTPEvent|H3Event|HTTPMethod|EventHandler|H3Route|Request|Response|Headers)\b|\.req\b|\.res\b/.test(content);
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

function isSourceFile(currentPath) {
  const normalized = normalizePath(currentPath);
  return (
    normalized.startsWith("src/") &&
    SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension)) &&
    !isTestFile(normalized)
  );
}

function isRuntimeJavaScriptSource(currentPath) {
  const normalized = normalizePath(currentPath);
  return normalized.startsWith("src/") && /\.(cjs|mjs|js|jsx)$/.test(normalized) && !isTestFile(normalized);
}

function hasSourceJavaScriptRuntimeEntrypoint(files) {
  const packageJson = files.find((file) => normalizePath(file.path) === "package.json");
  const packageData = parsePackageJson(packageJson?.content ?? "");
  const entrypoints = collectPackageEntrypoints(packageData);

  return entrypoints.some((entrypoint) => {
    const normalized = stripCurrentDirectoryPrefix(normalizePath(entrypoint));
    return normalized.startsWith("src/") && /\.(cjs|mjs|js|jsx)$/.test(normalized);
  });
}

function collectPackageEntrypoints(packageData) {
  const entrypoints = [];

  collectEntrypointValue(packageData.bin, entrypoints);
  collectEntrypointValue(packageData.main, entrypoints);
  collectEntrypointValue(packageData.module, entrypoints);
  collectEntrypointValue(packageData.exports, entrypoints);

  return entrypoints;
}

function collectEntrypointValue(value, entrypoints) {
  if (typeof value === "string") {
    entrypoints.push(value);
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const nested of Object.values(value)) {
    collectEntrypointValue(nested, entrypoints);
  }
}

function isTestFile(currentPath) {
  const normalized = normalizePath(currentPath);
  return (
    normalized.includes("__tests__/") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function findExistingTests(sourcePath, testFiles, moduleFiles, boundedTransitiveImports, packageEntry) {
  const normalized = normalizePath(sourcePath);
  const sourceBase = basenameWithoutExtension(normalized);
  const sourceSegments = normalized.split("/");
  const sourceDir = sourceSegments.slice(0, -1).join("/");
  const parentBase = sourceSegments.length > 1 ? sourceSegments.at(-2) : undefined;
  const baseNameCandidates = new Set([sourceBase, ...pluralizeBaseName(sourceBase)]);
  const sourceBaseCandidates = new Set(baseNameCandidates);
  const qualifiedBaseCandidates = new Set();
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

  return testFiles
    .filter((testFile) => {
      const testBase = basenameWithoutExtension(testFile.path).replace(/\.(test|spec)$/, "");
      return (
        hasFilenameMatch(testFile.path, testBase, sourceBase, sourceDir, baseNameCandidates, sourceBaseCandidates, qualifiedBaseCandidates) ||
        testFile.path.startsWith(`${sourceDir}/__tests__/${sourceBase}.`) ||
        hasDirectRelativeImport(testFile, normalized) ||
        boundedTransitiveImports.get(testFile.path)?.has(normalized) ||
        hasOneHopBarrelImport(testFile, normalized, moduleFiles) ||
        hasPathAliasImport(testFile, normalized, moduleFiles, packageEntry.pathAliasEntries) ||
        hasPackageEntryImport(testFile, normalized, moduleFiles, packageEntry)
      );
    })
    .map((testFile) => testFile.path);
}

function hasFilenameMatch(testPath, testBase, sourceBase, sourceDir, baseNameCandidates, sourceBaseCandidates, qualifiedBaseCandidates) {
  if (!GENERIC_SOURCE_BASENAMES.has(sourceBase)) return sourceBaseCandidates.has(testBase);
  const testDir = path.posix.dirname(testPath);
  return qualifiedBaseCandidates.has(testBase) || (testDir === sourceDir && baseNameCandidates.has(testBase));
}

function hasDirectRelativeImport(testFile, sourcePath) {
  return collectRelativeModuleSpecifiers(testFile.content).some((specifier) =>
    moduleSpecifierTargetsSource(testFile.path, specifier, sourcePath)
  );
}

function collectBoundedTransitiveImports(testFiles, moduleFiles, pathAliasEntries) {
  return new Map(testFiles.map((testFile) => [testFile.path, collectBoundedTransitiveImportsForTest(testFile, moduleFiles, pathAliasEntries)]));
}

function collectBoundedTransitiveImportsForTest(testFile, moduleFiles, pathAliasEntries) {
  const queue = [];
  for (const { specifier, importedNames } of collectModuleImports(testFile.content)) {
    const file = findImportedModuleFile(testFile.path, specifier, moduleFiles, pathAliasEntries);
    if (!file) continue;
    queue.push({ file, depth: 0 });
    for (const reExport of findImportedReExportFiles(file, importedNames, moduleFiles)) {
      queue.push({ file: reExport, depth: 1 });
    }
  }
  const visited = new Set();

  while (queue.length > 0) {
    const { file, depth } = queue.shift();
    if (visited.has(file.path)) continue;
    visited.add(file.path);
    if (depth >= MAX_TRANSITIVE_SOURCE_DEPTH) continue;

    for (const specifier of collectRuntimeDependencySpecifiers(file.content)) {
      const dependency = findImportedModuleFile(file.path, specifier, moduleFiles, pathAliasEntries);
      if (dependency && !visited.has(dependency.path)) queue.push({ file: dependency, depth: depth + 1 });
    }
  }

  return visited;
}

function findImportedModuleFile(importerPath, specifier, moduleFiles, pathAliasEntries) {
  return specifier.startsWith(".")
    ? findRelativeModuleFile(importerPath, specifier, moduleFiles)
    : pathAliasEntries.get(specifier);
}

function findImportedReExportFiles(barrelFile, importedNames, moduleFiles) {
  if (importedNames.size === 0) return [];
  return moduleFiles.filter((sourceFile) =>
    sourceFile.path !== barrelFile.path &&
    isSourceFile(sourceFile.path) &&
    barrelExportsImportedNames(barrelFile, sourceFile, importedNames)
  );
}

function findRelativeModuleFile(importerPath, specifier, moduleFiles) {
  return moduleFiles.find(
    (file) => isSourceFile(file.path) && moduleSpecifierTargetsSource(importerPath, specifier, file.path)
  );
}

function hasOneHopBarrelImport(testFile, sourcePath, moduleFiles) {
  return collectModuleImports(testFile.content).some(({ specifier, importedNames }) => {
    if (!specifier.startsWith(".")) return false;
    const barrelFile = moduleFiles.find((file) => moduleSpecifierTargetsSource(testFile.path, specifier, file.path));
    if (!barrelFile || barrelFile.path === sourcePath) return false;
    const sourceFile = moduleFiles.find((file) => file.path === sourcePath);
    return sourceFile ? barrelExportsImportedNames(barrelFile, sourceFile, importedNames) : false;
  });
}

function hasPathAliasImport(testFile, sourcePath, moduleFiles, pathAliasEntries) {
  return collectModuleImports(testFile.content).some(({ specifier, importedNames }) => {
    const entryFile = pathAliasEntries.get(specifier);
    if (!entryFile) return false;
    if (entryFile.path === sourcePath) return true;
    const sourceFile = moduleFiles.find((file) => file.path === sourcePath);
    return sourceFile ? barrelExportsImportedNames(entryFile, sourceFile, importedNames) : false;
  });
}

function hasPackageEntryImport(testFile, sourcePath, moduleFiles, { packageName, packageEntryFile, packageSubpathEntries }) {
  if (typeof packageName !== "string") return false;

  return collectModuleImports(testFile.content).some(({ specifier, importedNames }) => {
    const entryFile = specifier === packageName ? packageEntryFile : packageSubpathEntries.get(specifier);
    if (!entryFile) return false;
    if (entryFile.path === sourcePath) return true;
    const sourceFile = moduleFiles.find((file) => file.path === sourcePath);
    return sourceFile ? barrelExportsImportedNames(entryFile, sourceFile, importedNames) : false;
  });
}

function barrelExportsImportedNames(barrelFile, sourceFile, importedNames) {
  if (importedNames.size === 0) return false;
  return collectRelativeReExports(barrelFile.content).some(({ specifier, exportedNames, exportAll }) => {
    if (!moduleSpecifierTargetsSource(barrelFile.path, specifier, sourceFile.path)) return false;
    const availableNames = exportAll ? collectDeclaredExportNames(sourceFile.content) : exportedNames;
    return [...importedNames].some((name) => availableNames.has(name));
  });
}

function findSourcePackageEntry(packageData, moduleFiles) {
  const candidates = [packageData.source, packageData.module, packageData.main, "src/index", "index"]
    .filter((candidate) => typeof candidate === "string")
    .map((candidate) => candidate.replace(/^\.\//, ""));

  for (const candidate of candidates) {
    const entryFile = moduleFiles.find(
      (file) => isSourceFile(file.path) && moduleSpecifierTargetsSource("package.json", candidate, file.path)
    );
    if (entryFile) return entryFile;
  }

  return undefined;
}

function findSourcePackageSubpathEntries(packageData, moduleFiles) {
  const entries = new Map();
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

function parseJsonConfig(content) {
  if (!content.trim()) return {};
  try {
    const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    return JSON.parse(withoutComments.replace(/,\s*([}\]])/g, "$1"));
  } catch {
    return {};
  }
}

function findTsconfigPathAliasEntries(tsconfigData, moduleFiles) {
  const entries = new Map();
  const compilerOptions = tsconfigData.compilerOptions;
  if (!compilerOptions || typeof compilerOptions !== "object") return entries;
  const paths = compilerOptions.paths;
  if (!paths || typeof paths !== "object") return entries;
  const baseUrl = typeof compilerOptions.baseUrl === "string" ? compilerOptions.baseUrl.replace(/^\.\//, "") : ".";

  for (const [aliasPattern, targetValues] of Object.entries(paths)) {
    if (!Array.isArray(targetValues)) continue;
    const targetPatterns = targetValues
      .filter((value) => typeof value === "string")
      .map((value) => path.posix.normalize(path.posix.join(baseUrl, value)));
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

function addWildcardPackageEntries(entries, packageName, relativeSubpath, candidatePatterns, moduleFiles) {
  for (const file of moduleFiles.filter((candidate) => isSourceFile(candidate.path))) {
    for (const pattern of candidatePatterns.filter((candidate) => candidate.includes("*"))) {
      const wildcardValue = matchWildcardSourcePath(pattern, file.path);
      if (wildcardValue === undefined) continue;
      entries.set(`${packageName}/${relativeSubpath.replace("*", wildcardValue)}`, file);
      break;
    }
  }
}

function matchWildcardSourcePath(pattern, sourcePath) {
  const normalizedPattern = removeJavaScriptExtension(pattern.replace(/^\.\//, ""));
  const normalizedSource = removeJavaScriptExtension(sourcePath);
  const [prefix, suffix, ...extra] = normalizedPattern.split("*");
  if (extra.length > 0) return undefined;
  if (!normalizedSource.startsWith(prefix) || !normalizedSource.endsWith(suffix)) return undefined;
  const wildcardValue = normalizedSource.slice(prefix.length, normalizedSource.length - suffix.length);
  return wildcardValue || undefined;
}

function findSourceFileForCandidates(candidates, moduleFiles) {
  for (const candidate of candidates) {
    const entryFile = moduleFiles.find(
      (file) => isSourceFile(file.path) && moduleSpecifierTargetsSource("package.json", candidate, file.path)
    );
    if (entryFile) return entryFile;
  }
  return undefined;
}

function collectStringValues(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectStringValues);
}

function moduleSpecifierTargetsSource(importerPath, specifier, sourcePath) {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importerPath), specifier));
  const resolvedWithoutExtension = removeJavaScriptExtension(resolved);
  const sourceWithoutExtension = removeJavaScriptExtension(sourcePath);
  return (
    resolved === sourcePath ||
    resolvedWithoutExtension === sourceWithoutExtension ||
    (basenameWithoutExtension(sourcePath) === "index" && resolvedWithoutExtension === path.posix.dirname(sourcePath))
  );
}

function collectRelativeModuleSpecifiers(content) {
  return collectModuleSpecifiers(content).filter((specifier) => specifier.startsWith("."));
}

function collectRuntimeDependencySpecifiers(content) {
  return collectModuleImports(content)
    .map(({ specifier }) => specifier);
}

function collectModuleImports(content) {
  const imports = [];
  const importPattern = /\bimport\s+([^;"']*?)\s+from\s+["']([^"']+)["']/g;
  for (const match of content.matchAll(importPattern)) {
    imports.push({ specifier: match[2], importedNames: collectImportClauseNames(match[1], content) });
  }
  const requirePattern = /\b(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of content.matchAll(requirePattern)) {
    imports.push({ specifier: match[2], importedNames: collectAliasedNames(match[1], ":") });
  }
  const plainRequirePattern = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of content.matchAll(plainRequirePattern)) {
    if (!imports.some((current) => current.specifier === match[1])) {
      imports.push({ specifier: match[1], importedNames: new Set() });
    }
  }
  return imports;
}

function collectImportClauseNames(clause, content) {
  const names = new Set();
  const named = clause.match(/\{([^}]+)\}/)?.[1];
  if (named) for (const name of collectAliasedNames(named, "as")) names.add(name);
  const defaultImport = clause.split(",", 1)[0].trim();
  if (defaultImport && !defaultImport.startsWith("{") && !defaultImport.startsWith("*")) names.add("default");
  const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)?.[1];
  if (namespace) {
    const propertyPattern = new RegExp(`\\b${namespace}\\.([A-Za-z_$][\\w$]*)`, "g");
    for (const match of content.matchAll(propertyPattern)) names.add(match[1]);
  }
  return names;
}

function collectAliasedNames(value, aliasToken) {
  return new Set(value.split(",").map((part) => part.trim().split(new RegExp(`\\s+${aliasToken}\\s+|\\s*${aliasToken}\\s*`))[0].trim()).filter(Boolean));
}

function collectRelativeReExports(content) {
  const exports = [];
  const namedPattern = /\bexport\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(namedPattern)) {
    if (match[2].startsWith(".")) exports.push({ specifier: match[2], exportedNames: collectPublicExportNames(match[1]), exportAll: false });
  }
  const allPattern = /\bexport\s*\*\s*from\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(allPattern)) {
    if (match[1].startsWith(".")) exports.push({ specifier: match[1], exportedNames: new Set(), exportAll: true });
  }
  return exports;
}

function collectPublicExportNames(value) {
  return new Set(value.split(",").map((part) => {
    const names = part.trim().split(/\s+as\s+/);
    return names.at(-1)?.trim();
  }).filter(Boolean));
}

function collectDeclaredExportNames(content) {
  const names = new Set();
  const declarationPattern = /\bexport\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of content.matchAll(declarationPattern)) names.add(match[1]);
  if (/\bexport\s+default\b/.test(content)) names.add("default");
  const localExportPattern = /\bexport\s*\{([^}]+)\}(?!\s*from)/g;
  for (const match of content.matchAll(localExportPattern)) {
    for (const name of collectPublicExportNames(match[1])) names.add(name);
  }
  return names;
}

function collectModuleSpecifiers(content) {
  const specifiers = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function collectRelativeExportSpecifiers(content) {
  const specifiers = [];
  const pattern = /\bexport\s+(?:[^"']*?\s+from\s+)["']([^"']+)["']/g;

  for (const match of content.matchAll(pattern)) {
    if (match[1].startsWith(".")) specifiers.push(match[1]);
  }

  return specifiers;
}

function removeJavaScriptExtension(currentPath) {
  return currentPath.replace(/\.[cm]?[jt]sx?$/, "");
}

function pluralizeBaseName(baseName) {
  if (/[^aeiou]y$/i.test(baseName)) {
    return [`${baseName.slice(0, -1)}ies`];
  }

  if (/(s|x|z|ch|sh)$/i.test(baseName)) {
    return [`${baseName}es`];
  }

  return [`${baseName}s`];
}

function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/");
}

function normalizeChangedPath(root, currentPath) {
  if (path.isAbsolute(currentPath)) {
    return stripCurrentDirectoryPrefix(normalizePath(path.relative(root, currentPath)));
  }

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

function hasExternalBoundary(content) {
  return /\b(fetch|axios|prisma|mongoose|mongodb|fs\.|readFile|writeFile)\b/.test(content);
}

function hasAuthSignal(content) {
  return /\b(auth|permission|role|token|session)\b/i.test(content);
}

function hasBranching(content) {
  return /\b(if|switch|catch|\?\s*[^:]+:)\b/.test(content);
}

function isDtoLike(currentPath, content) {
  const hasDtoName = /(dto|model|schema|response|request)/i.test(currentPath);
  const typeOnlyShape = /^\s*(export\s+)?(interface|type)\s+/m.test(content) && !/\bfunction\b|=>|\bclass\b/.test(content);
  return hasDtoName && typeOnlyShape;
}

function isReferenceTypeScriptMirror(currentPath, content, runtimeSourcePaths) {
  if (!currentPath.endsWith(".ts") || currentPath.endsWith(".d.ts")) return false;
  if (!isTypeOnlyContent(content)) return false;

  return hasSiblingRuntimeJavaScript(currentPath, runtimeSourcePaths);
}

function isReferenceImplementationMirror(currentPath, runtimeSourcePaths, sourceJavaScriptRuntime) {
  if (!sourceJavaScriptRuntime) return false;
  if (!currentPath.endsWith(".ts") || currentPath.endsWith(".d.ts")) return false;
  return hasSiblingRuntimeJavaScript(currentPath, runtimeSourcePaths);
}

function hasSiblingRuntimeJavaScript(currentPath, runtimeSourcePaths) {
  const runtimePath = currentPath.replace(/\.ts$/, ".js");
  const modulePath = currentPath.replace(/\.ts$/, ".mjs");
  const commonJsPath = currentPath.replace(/\.ts$/, ".cjs");
  return runtimeSourcePaths.has(runtimePath) || runtimeSourcePaths.has(modulePath) || runtimeSourcePaths.has(commonJsPath);
}

function isTypeOnlyContent(content) {
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

function isConstantsOnly(content) {
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

function isAppWiring(currentPath, content) {
  return (
    /(^|\/)(app|server|main)\.[cm]?[jt]sx?$/.test(currentPath) &&
    (content.includes("express()") || content.includes(".use(")) &&
    !/\b(app|get|post|put|patch|delete)\s*\(/.test(content)
  );
}

function isPresentationalComponent(content) {
  const hasJsxReturn = /return\s*\(?\s*</.test(content);
  const hasInteraction = /\bon[A-Z]\w+\s*=|useState|useReducer|useEffect|if\s*\(|\?\s*[^:]+:/.test(content);
  return hasJsxReturn && !hasInteraction;
}

function byRiskThenName(a, b) {
  const order = { high: 0, medium: 1, low: 2 };
  return order[a.risk] - order[b.risk] || a.name.localeCompare(b.name);
}
