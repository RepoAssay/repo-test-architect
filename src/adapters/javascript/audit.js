import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = [".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"];
const SOURCE_ROOTS = ["src/", "source/"];
const GENERIC_SOURCE_BASENAMES = new Set(["handler", "index", "types", "utils"]);
const MAX_TRANSITIVE_SOURCE_DEPTH = 2;
const AVA_ASSERTION_METHODS = ["assert", "deepEqual", "false", "falsy", "is", "like", "not", "notDeepEqual", "notRegex", "notThrows", "notThrowsAsync", "regex", "snapshot", "throws", "throwsAsync", "true", "truthy"];

export function auditJavaScriptRepo(root, options = {}) {
  const files = scopeToPackageRoot(readRepoFiles(root));
  const profile = buildProfile(root, files);
  const changedPaths = options.changedPaths ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(root, currentPath))) : undefined;
  const testFiles = files
    .filter((file) => isTestFile(file.path))
    .map((file) => ({ ...file, path: normalizePath(file.path) }));
  const moduleFiles = files.map((file) => ({ ...file, path: normalizePath(file.path) }));
  const tsconfigData = resolveTsconfigData("tsconfig.json", files);
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
    const existingTestEvidence = findExistingTestEvidence(file.path, testFiles, moduleFiles, boundedTransitiveImports, {
      packageName: packageData.name,
      packageEntryFile,
      packageSubpathEntries,
      pathAliasEntries
    });
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
    relative === "package.json" ||
    relative.endsWith("/package.json") ||
    [
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "vitest.config.ts",
      "vitest.config.js",
      "jest.config.ts",
      "jest.config.js",
      "ava.config.json"
    ].includes(relative) || /(^|\/)tsconfig(?:\.[^/]+)?\.json$/.test(relative)
  );
}

function scopeToPackageRoot(files) {
  const nestedPackageRoots = files
    .map((file) => normalizePath(file.path))
    .filter((currentPath) => currentPath.endsWith("/package.json"))
    .map((currentPath) => currentPath.slice(0, -"/package.json".length));

  if (nestedPackageRoots.length === 0) return files;

  return files.filter((file) => {
    const currentPath = normalizePath(file.path);
    return !nestedPackageRoots.some((nestedRoot) => currentPath === nestedRoot || currentPath.startsWith(`${nestedRoot}/`));
  });
}

function buildProfile(root, files) {
  const paths = files.map((file) => normalizePath(file.path));
  const packageJson = files.find((file) => normalizePath(file.path) === "package.json");
  const packageText = packageJson?.content ?? "";
  const packageData = parsePackageJson(packageText);
  const testFrameworks = detectTestFrameworks(files, packageData);
  const testCommand = detectTestCommand(packageData, testFrameworks);
  const existingTestLocations = detectExistingTestLocations(paths);
  const detectedConventions = detectConventions(paths);
  const setupSignals = detectSetupSignals(paths, packageData);
  const blockers = detectBlockers(packageJson !== undefined, testCommand, testFrameworks);

  return {
    root,
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

function detectTestFrameworks(files, packageData) {
  const paths = files.map((file) => normalizePath(file.path));
  const frameworks = new Set();
  if (paths.some((item) => item.includes("ava.config")) || hasPackageDependency(packageData, "ava")) frameworks.add("ava");
  if (paths.some((item) => item.includes("vitest.config")) || hasPackageDependency(packageData, "vitest")) frameworks.add("vitest");
  if (paths.some((item) => item.includes("jest.config")) || hasPackageDependency(packageData, "jest")) frameworks.add("jest");
  if (files.some((file) => isTestFile(file.path) && usesNodeTest(file.content))) frameworks.add("node-test");
  if (hasPackageDependency(packageData, "@testing-library/react")) frameworks.add("react-testing-library");
  if (hasPackageDependency(packageData, "supertest")) frameworks.add("supertest");
  return [...frameworks];
}

function hasPackageDependency(packageData, dependencyName) {
  return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].some((field) => {
    const dependencies = packageData[field];
    return dependencies && typeof dependencies === "object" && Object.hasOwn(dependencies, dependencyName);
  });
}

function usesNodeTest(content) {
  return /(?:from\s+|import\s+|require\(\s*)["']node:test["']/.test(content);
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
  if (frameworks.includes("node-test")) return "node --test";
  if (frameworks.includes("ava")) return "npx ava";

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

function detectSetupSignals(paths, packageData) {
  const signals = new Set();

  if (paths.includes("tsconfig.json")) signals.add("tsconfig");
  if (paths.some((currentPath) => currentPath.includes("ava.config"))) signals.add("ava config");
  if (paths.some((currentPath) => currentPath.includes("vitest.config"))) signals.add("vitest config");
  if (paths.some((currentPath) => currentPath.includes("jest.config"))) signals.add("jest config");
  if (hasPackageDependency(packageData, "msw")) signals.add("msw");
  if (hasPackageDependency(packageData, "nock")) signals.add("nock");
  if (hasPackageDependency(packageData, "supertest")) signals.add("supertest");

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

function detectArchitectures(paths, packageData) {
  const architectures = new Set();
  if (hasPackageDependency(packageData, "react") || paths.some((item) => item.endsWith(".tsx") || item.endsWith(".jsx"))) architectures.add("react");
  if (hasPackageDependency(packageData, "express") || paths.some((item) => item.includes("/routes/"))) architectures.add("http-routes");
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
    isInSourceRoot(normalized) &&
    SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension)) &&
    !isTestFile(normalized)
  );
}

function isRuntimeJavaScriptSource(currentPath) {
  const normalized = normalizePath(currentPath);
  return isInSourceRoot(normalized) && /\.(cjs|mjs|js|jsx)$/.test(normalized) && !isTestFile(normalized);
}

function isInSourceRoot(currentPath) {
  return SOURCE_ROOTS.some((root) => currentPath.startsWith(root));
}

function hasSourceJavaScriptRuntimeEntrypoint(files) {
  const packageJson = files.find((file) => normalizePath(file.path) === "package.json");
  const packageData = parsePackageJson(packageJson?.content ?? "");
  const entrypoints = collectPackageEntrypoints(packageData);

  return entrypoints.some((entrypoint) => {
    const normalized = stripCurrentDirectoryPrefix(normalizePath(entrypoint));
    return isInSourceRoot(normalized) && /\.(cjs|mjs|js|jsx)$/.test(normalized);
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
    ((normalized.startsWith("test/") || normalized.startsWith("tests/")) && SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension))) ||
    normalized.includes("__tests__/") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function findExistingTestEvidence(sourcePath, testFiles, moduleFiles, boundedTransitiveImports, packageEntry) {
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

  return testFiles.flatMap((testFile) => {
      const testBase = basenameWithoutExtension(testFile.path).replace(/\.(test|spec)$/, "");
      const filenameMatch =
        hasFilenameMatch(testFile.path, testBase, sourceBase, sourceDir, baseNameCandidates, sourceBaseCandidates, qualifiedBaseCandidates) ||
        testFile.path.startsWith(`${sourceDir}/__tests__/${sourceBase}.`);
      const directImportUsage = getDirectRelativeImportUsage(testFile, normalized);
      if (directImportUsage) return [{ testPath: testFile.path, kind: "direct-relative-import", strength: "direct", ...(directImportUsage !== "imported" ? { usage: directImportUsage } : {}) }];
      const barrelUsage = getOneHopBarrelImportUsage(testFile, normalized, moduleFiles);
      if (barrelUsage) return [{ testPath: testFile.path, kind: "referenced-relative-reexport", strength: "referenced", ...(barrelUsage !== "referenced" ? { usage: barrelUsage } : {}) }];
      const pathAliasUsage = getPathAliasImportUsage(testFile, normalized, moduleFiles, packageEntry.pathAliasEntries);
      if (pathAliasUsage) return [{ testPath: testFile.path, kind: "tsconfig-path-import", strength: "direct", ...(pathAliasUsage !== "imported" ? { usage: pathAliasUsage } : {}) }];
      const packageEntryUsage = getPackageEntryImportUsage(testFile, normalized, moduleFiles, packageEntry);
      if (packageEntryUsage) return [{ testPath: testFile.path, kind: "package-entry-import", strength: "referenced", ...(packageEntryUsage !== "referenced" ? { usage: packageEntryUsage } : {}) }];
      const transitiveImports = boundedTransitiveImports.get(testFile.path);
      if (transitiveImports?.has(normalized)) {
        const viaUsage = transitiveImports.get(normalized);
        return [{ testPath: testFile.path, kind: "bounded-dependency", strength: "indirect", ...(viaUsage ? { viaUsage } : {}) }];
      }
      if (filenameMatch) return [{ testPath: testFile.path, kind: "filename-convention", strength: "naming" }];
      return [];
    });
}

function hasFilenameMatch(testPath, testBase, sourceBase, sourceDir, baseNameCandidates, sourceBaseCandidates, qualifiedBaseCandidates) {
  if (!GENERIC_SOURCE_BASENAMES.has(sourceBase)) return sourceBaseCandidates.has(testBase);
  const testDir = path.posix.dirname(testPath);
  return qualifiedBaseCandidates.has(testBase) || (testDir === sourceDir && baseNameCandidates.has(testBase));
}

function getDirectRelativeImportUsage(testFile, sourcePath) {
  const matchingImports = collectModuleImports(testFile.content).filter(({ specifier }) =>
    specifier.startsWith(".") && moduleSpecifierTargetsSource(testFile.path, specifier, sourcePath)
  );
  if (matchingImports.some(({ assertedImportedNames }) => assertedImportedNames.size > 0)) return "asserted";
  if (matchingImports.some(({ calledImportedNames }) => calledImportedNames.size > 0)) return "called";
  return matchingImports.length > 0 || collectRelativeModuleSpecifiers(testFile.content).some((specifier) =>
    moduleSpecifierTargetsSource(testFile.path, specifier, sourcePath)
  ) ? "imported" : undefined;
}

function collectBoundedTransitiveImports(testFiles, moduleFiles, pathAliasEntries) {
  return new Map(testFiles.map((testFile) => [testFile.path, collectBoundedTransitiveImportsForTest(testFile, moduleFiles, pathAliasEntries)]));
}

function collectBoundedTransitiveImportsForTest(testFile, moduleFiles, pathAliasEntries) {
  const queue = [];
  for (const { specifier, usedImportedNames, calledImportedNames, assertedImportedNames } of collectModuleImports(testFile.content)) {
    const file = findImportedModuleFile(testFile.path, specifier, moduleFiles, pathAliasEntries);
    if (!file) continue;
    const viaUsage = assertedImportedNames.size > 0 ? "asserted" : calledImportedNames.size > 0 ? "called" : undefined;
    queue.push({ file, depth: 0, viaUsage });
    for (const reExport of findImportedReExportFiles(file, usedImportedNames, moduleFiles)) {
      queue.push({ file: reExport, depth: 1, viaUsage });
    }
  }
  const visited = new Map();

  while (queue.length > 0) {
    const { file, depth, viaUsage } = queue.shift();
    if (visited.has(file.path) && usageRank(visited.get(file.path)) >= usageRank(viaUsage)) continue;
    visited.set(file.path, viaUsage);
    if (depth >= MAX_TRANSITIVE_SOURCE_DEPTH) continue;

    for (const specifier of collectRuntimeDependencySpecifiers(file.content)) {
      const dependency = findImportedModuleFile(file.path, specifier, moduleFiles, pathAliasEntries);
      if (dependency) queue.push({ file: dependency, depth: depth + 1, viaUsage });
    }
  }

  return visited;
}

function usageRank(usage) {
  return usage === "asserted" ? 2 : usage === "called" ? 1 : 0;
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

function getOneHopBarrelImportUsage(testFile, sourcePath, moduleFiles) {
  for (const { specifier, usedImportedNames, calledImportedNames, assertedImportedNames } of collectModuleImports(testFile.content)) {
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

function getPathAliasImportUsage(testFile, sourcePath, moduleFiles, pathAliasEntries) {
  for (const moduleImport of collectModuleImports(testFile.content)) {
    const { specifier } = moduleImport;
    const entryFile = pathAliasEntries.get(specifier);
    if (!entryFile) continue;
    const sourceFile = moduleFiles.find((file) => file.path === sourcePath);
    const usage = sourceFile ? getEntrypointImportUsage(moduleImport, entryFile, sourceFile, "imported") : undefined;
    if (usage) return usage;
  }
  return undefined;
}

function getPackageEntryImportUsage(testFile, sourcePath, moduleFiles, { packageName, packageEntryFile, packageSubpathEntries }) {
  if (typeof packageName !== "string") return undefined;

  for (const moduleImport of collectModuleImports(testFile.content)) {
    const { specifier } = moduleImport;
    const entryFile = specifier === packageName ? packageEntryFile : packageSubpathEntries.get(specifier);
    if (!entryFile) continue;
    const sourceFile = moduleFiles.find((file) => file.path === sourcePath);
    const usage = sourceFile ? getEntrypointImportUsage(moduleImport, entryFile, sourceFile, "referenced") : undefined;
    if (usage) return usage;
  }
  return undefined;
}

function getEntrypointImportUsage(moduleImport, entryFile, sourceFile, structuralUsage) {
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

function resolveTsconfigData(configPath, files, visited = new Set()) {
  const normalizedPath = normalizePath(configPath);
  if (visited.has(normalizedPath)) return {};
  visited.add(normalizedPath);
  const file = files.find((candidate) => normalizePath(candidate.path) === normalizedPath);
  if (!file) return {};
  const current = parseJsonConfig(file.content);
  const extendedPath = resolveLocalTsconfigExtends(normalizedPath, current.extends);
  const inherited = extendedPath ? resolveTsconfigData(extendedPath, files, visited) : {};
  const inheritedCompilerOptions = inherited.compilerOptions && typeof inherited.compilerOptions === "object"
    ? inherited.compilerOptions
    : {};
  const currentCompilerOptions = current.compilerOptions && typeof current.compilerOptions === "object"
    ? current.compilerOptions
    : {};
  const compilerOptions = { ...inheritedCompilerOptions, ...currentCompilerOptions };
  if (typeof currentCompilerOptions.baseUrl === "string") {
    compilerOptions.baseUrl = path.posix.normalize(path.posix.join(path.posix.dirname(normalizedPath), currentCompilerOptions.baseUrl));
  } else if (currentCompilerOptions.paths && typeof compilerOptions.baseUrl !== "string") {
    compilerOptions.baseUrl = path.posix.dirname(normalizedPath) || ".";
  }
  return { ...inherited, ...current, compilerOptions };
}

function resolveLocalTsconfigExtends(configPath, extendsValue) {
  if (typeof extendsValue !== "string" || !extendsValue.startsWith(".")) return undefined;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(configPath), extendsValue));
  return resolved.endsWith(".json") ? resolved : `${resolved}.json`;
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
  const contentWithoutImports = content
    .replace(/\bimport\s+[^;"']*?\s+from\s+["'][^"']+["']\s*;?/g, "")
    .replace(/\b(?:const|let|var)\s+\{[^}]+\}\s*=\s*require\s*\(\s*["'][^"']+["']\s*\)\s*;?/g, "")
    .replace(/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*require\s*\(\s*["'][^"']+["']\s*\)\s*;?/g, "");
  const importPattern = /\bimport\s+([^;"']*?)\s+from\s+["']([^"']+)["']/g;
  for (const match of content.matchAll(importPattern)) {
    imports.push({
      specifier: match[2],
      importedNames: collectImportClauseNames(match[1], content),
      usedImportedNames: collectUsedImportClauseNames(match[1], contentWithoutImports),
      calledImportedNames: collectCalledImportClauseNames(match[1], contentWithoutImports),
      assertedImportedNames: collectAssertedImportClauseNames(match[1], contentWithoutImports)
    });
  }
  const requirePattern = /\b(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of content.matchAll(requirePattern)) {
    const importedNames = collectAliasedNames(match[1], ":");
    imports.push({ specifier: match[2], importedNames, usedImportedNames: collectUsedRequireNames(match[1], contentWithoutImports), calledImportedNames: collectCalledRequireNames(match[1], contentWithoutImports), assertedImportedNames: collectAssertedRequireNames(match[1], contentWithoutImports) });
  }
  const namespaceRequirePattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of content.matchAll(namespaceRequirePattern)) {
    imports.push({
      specifier: match[2],
      importedNames: collectNamespaceMemberNames(match[1], contentWithoutImports),
      usedImportedNames: collectNamespaceMemberNames(match[1], contentWithoutImports),
      calledImportedNames: collectNamespaceMemberNames(match[1], contentWithoutImports, isIdentifierCalled),
      assertedImportedNames: collectNamespaceMemberNames(match[1], contentWithoutImports, isIdentifierAsserted)
    });
  }
  const plainRequirePattern = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of content.matchAll(plainRequirePattern)) {
    if (!imports.some((current) => current.specifier === match[1])) {
      imports.push({ specifier: match[1], importedNames: new Set(), usedImportedNames: new Set(), calledImportedNames: new Set(), assertedImportedNames: new Set() });
    }
  }
  return imports;
}

function collectCalledImportClauseNames(clause, contentWithoutImports) {
  const names = new Set();
  const named = clause.match(/\{([^}]+)\}/)?.[1];
  if (named) {
    for (const part of named.split(",")) {
      const [imported, local = imported] = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      if (imported && isIdentifierCalled(contentWithoutImports, local)) names.add(imported);
    }
  }
  const defaultImport = clause.split(",", 1)[0].trim();
  if (defaultImport && !defaultImport.startsWith("{") && !defaultImport.startsWith("*") && isIdentifierCalled(contentWithoutImports, defaultImport)) names.add("default");
  collectNamespaceUsageNames(clause, contentWithoutImports, isIdentifierCalled, names);
  return names;
}

function collectCalledRequireNames(clause, contentWithoutImports) {
  const names = new Set();
  for (const part of clause.split(",")) {
    const [imported, local = imported] = part.trim().split(/\s*:\s*/);
    if (imported && isIdentifierCalled(contentWithoutImports, local)) names.add(imported);
  }
  return names;
}

function collectAssertedImportClauseNames(clause, contentWithoutImports) {
  const names = new Set();
  const named = clause.match(/\{([^}]+)\}/)?.[1];
  if (named) {
    for (const part of named.split(",")) {
      const [imported, local = imported] = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      if (imported && isIdentifierAsserted(contentWithoutImports, local)) names.add(imported);
    }
  }
  const defaultImport = clause.split(",", 1)[0].trim();
  if (defaultImport && !defaultImport.startsWith("{") && !defaultImport.startsWith("*") && isIdentifierAsserted(contentWithoutImports, defaultImport)) names.add("default");
  collectNamespaceUsageNames(clause, contentWithoutImports, isIdentifierAsserted, names);
  return names;
}

function collectNamespaceUsageNames(clause, content, predicate, names) {
  const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)?.[1];
  if (!namespace) return;
  for (const name of collectNamespaceMemberNames(namespace, content, predicate)) names.add(name);
}

function collectNamespaceMemberNames(namespace, content, predicate = isIdentifierReferenced) {
  const names = new Set();
  const propertyPattern = new RegExp(`\\b${escapeRegExp(namespace)}\\.([A-Za-z_$][\\w$]*)`, "g");
  for (const match of content.matchAll(propertyPattern)) {
    if (predicate(content, `${namespace}.${match[1]}`)) names.add(match[1]);
  }
  return names;
}

function collectAssertedRequireNames(clause, contentWithoutImports) {
  const names = new Set();
  for (const part of clause.split(",")) {
    const [imported, local = imported] = part.trim().split(/\s*:\s*/);
    if (imported && isIdentifierAsserted(contentWithoutImports, local)) names.add(imported);
  }
  return names;
}

function isIdentifierAsserted(content, identifier) {
  const escaped = escapeRegExp(identifier);
  const assertionCall = assertionCallPattern(content);
  if (new RegExp(`\\b${assertionCall}\\s*\\(\\s*(?:(?:async\\s+)?\\(\\s*\\)\\s*=>\\s*)?(?:await\\s+)?(?:new\\s+)?${escaped}\\s*\\(`).test(content)) return true;
  const assignmentPattern = new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:await\\s+)?(?:new\\s+)?${escaped}\\s*\\(`, "g");
  for (const match of content.matchAll(assignmentPattern)) {
    if (isResultIdentifierAsserted(content, match[1])) return true;
  }
  const destructuredAssignmentPattern = new RegExp(`\\b(?:const|let|var)\\s+\\{([^}]+)\\}\\s*=\\s*(?:await\\s+)?${escaped}\\s*\\(`, "g");
  for (const match of content.matchAll(destructuredAssignmentPattern)) {
    for (const part of match[1].split(",")) {
      const local = part.trim().split(/\s*:\s*/).at(-1)?.trim();
      if (local && isResultIdentifierAsserted(content, local)) return true;
    }
  }
  return false;
}

function isResultIdentifierAsserted(content, identifier) {
  return new RegExp(`\\b${assertionCallPattern(content)}\\s*\\(\\s*${escapeRegExp(identifier)}\\b`).test(content);
}

function assertionCallPattern(content) {
  const avaContexts = collectAvaExecutionContextNames(content);
  const avaAssertions = avaContexts.length > 0
    ? `|(?:${avaContexts.map(escapeRegExp).join("|")})\\.(?:${AVA_ASSERTION_METHODS.join("|")})`
    : "";
  return `(?:expect|assert(?:\\.[A-Za-z_$][\\w$]*)?${avaAssertions})`;
}

function collectAvaExecutionContextNames(content) {
  const names = new Set();
  const pattern = /\btest(?:\.(?:failing|only|serial|skip))?\s*\(\s*["'`][\s\S]*?["'`]\s*,\s*(?:async\s+)?(?:\(\s*)?([A-Za-z_$][\w$]*)\s*(?:\))?\s*=>/g;
  for (const match of content.matchAll(pattern)) names.add(match[1]);
  return [...names];
}

function isIdentifierCalled(content, identifier) {
  return new RegExp(`\\b(?:new\\s+)?${escapeRegExp(identifier)}\\s*\\(`).test(content);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectUsedImportClauseNames(clause, contentWithoutImports) {
  const names = new Set();
  const named = clause.match(/\{([^}]+)\}/)?.[1];
  if (named) {
    for (const part of named.split(",")) {
      const [imported, local = imported] = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      if (imported && isIdentifierReferenced(contentWithoutImports, local)) names.add(imported);
    }
  }
  const defaultImport = clause.split(",", 1)[0].trim();
  if (defaultImport && !defaultImport.startsWith("{") && !defaultImport.startsWith("*") && isIdentifierReferenced(contentWithoutImports, defaultImport)) {
    names.add("default");
  }
  const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)?.[1];
  if (namespace) {
    const propertyPattern = new RegExp(`\\b${namespace}\\.([A-Za-z_$][\\w$]*)`, "g");
    for (const match of contentWithoutImports.matchAll(propertyPattern)) names.add(match[1]);
  }
  return names;
}

function collectUsedRequireNames(clause, contentWithoutImports) {
  const names = new Set();
  for (const part of clause.split(",")) {
    const [imported, local = imported] = part.trim().split(/\s*:\s*/);
    if (imported && isIdentifierReferenced(contentWithoutImports, local)) names.add(imported);
  }
  return names;
}

function isIdentifierReferenced(content, identifier) {
  return new RegExp(`\\b${identifier.replace(/[$]/g, "\\$")}\\b`).test(content);
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
