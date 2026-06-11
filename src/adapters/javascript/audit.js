import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = [".js", ".jsx", ".mjs", ".ts", ".tsx"];

export function auditJavaScriptRepo(root) {
  const files = readRepoFiles(root);
  const profile = buildProfile(root, files);
  const testFiles = files.filter((file) => isTestFile(file.path)).map((file) => normalizePath(file.path));
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];

  for (const file of files.filter((candidate) => isSourceFile(candidate.path))) {
    const name = basenameWithoutExtension(file.path);
    const classification = classifySourceFile(file);
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

    const target = {
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

function classifySourceFile(file) {
  const currentPath = normalizePath(file.path);
  const content = file.content;
  const lowerPath = currentPath.toLowerCase();

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

  if (lowerPath.includes("component") || lowerPath.endsWith(".tsx") || content.includes("jsx")) {
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
    let risk = "medium";

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

function recommended(kind, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons) {
  return { kind, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons };
}

function skipped(kind, riskReductionScore, maintenanceCost, skipReason, preferredCoveragePath) {
  return {
    kind,
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
    !normalized.endsWith(".test.ts") &&
    !normalized.endsWith(".spec.ts") &&
    !normalized.endsWith(".test.js") &&
    !normalized.endsWith(".spec.js")
  );
}

function isTestFile(currentPath) {
  const normalized = normalizePath(currentPath);
  return (
    normalized.includes("__tests__/") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".spec.ts") ||
    normalized.endsWith(".test.js") ||
    normalized.endsWith(".spec.js")
  );
}

function findExistingTests(sourcePath, testPaths) {
  const normalized = normalizePath(sourcePath);
  const sourceBase = basenameWithoutExtension(normalized);
  const sourceDir = normalized.split("/").slice(0, -1).join("/");

  return testPaths.filter((testPath) => {
    const testBase = basenameWithoutExtension(testPath).replace(/\.(test|spec)$/, "");
    return testBase === sourceBase || testPath.startsWith(`${sourceDir}/__tests__/${sourceBase}.`);
  });
}

function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/");
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

function byRiskThenName(a, b) {
  const order = { high: 0, medium: 1, low: 2 };
  return order[a.risk] - order[b.risk] || a.name.localeCompare(b.name);
}
