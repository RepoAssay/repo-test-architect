import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = [".py"];

export function auditPythonRepo(root, options = {}) {
  const files = readRepoFiles(root);
  const profile = buildProfile(root, files);
  const changedPaths = options.changedPaths ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(root, currentPath))) : undefined;
  const testFiles = files.filter((file) => isTestFile(file.path)).map((file) => normalizePath(file.path));
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];

  for (const file of files.filter((candidate) => isSourceFile(candidate.path) && isIncludedByChangedPaths(candidate.path, changedPaths))) {
    const name = basenameWithoutExtension(file.path);
    const classification = classifySourceFile(file);
    const existingTestPaths = findExistingTests(file.path, testFiles);

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
  const ignored = new Set([".git", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox", ".venv", "__pycache__", "build", "dist", "htmlcov"]);
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
    ["pyproject.toml", "requirements.txt", "setup.cfg", "setup.py", "tox.ini"].includes(relative)
  );
}

function buildProfile(root, files) {
  const paths = files.map((file) => normalizePath(file.path));
  const configText = files
    .filter((file) => ["pyproject.toml", "requirements.txt", "setup.cfg", "setup.py", "tox.ini"].includes(normalizePath(file.path)))
    .map((file) => file.content)
    .join("\n");
  const testFrameworks = detectTestFrameworks(paths, configText);
  const testCommand = detectTestCommand(testFrameworks);
  const existingTestLocations = detectExistingTestLocations(paths);
  const blockers = detectBlockers(testCommand, testFrameworks);

  return {
    root,
    languages: ["python"],
    packageManagers: detectPackageManagers(paths),
    testFrameworks,
    architectures: detectArchitectures(paths, files),
    testCommand,
    detectedConventions: detectConventions(paths),
    existingTestLocations,
    setupSignals: detectSetupSignals(paths, configText),
    confidence: scoreProfileConfidence(testFrameworks, existingTestLocations, blockers),
    blockers
  };
}

function detectPackageManagers(paths) {
  const managers = new Set();
  if (paths.includes("pyproject.toml")) managers.add("pyproject");
  if (paths.includes("requirements.txt")) managers.add("pip");
  if (paths.includes("setup.py") || paths.includes("setup.cfg")) managers.add("setuptools");
  return [...managers].sort();
}

function detectTestFrameworks(paths, configText) {
  const frameworks = new Set();
  if (/\bpytest\b/i.test(configText) || paths.some((item) => isTestFile(item) && /^tests\/test_.*\.py$/.test(item))) frameworks.add("pytest");
  if (/\bunittest\b/i.test(configText) || paths.some((item) => isTestFile(item) && /_test\.py$/.test(item))) frameworks.add("unittest");
  return [...frameworks].sort();
}

function detectTestCommand(frameworks) {
  if (frameworks.includes("pytest")) return "pytest";
  if (frameworks.includes("unittest")) return "python -m unittest";
  return undefined;
}

function detectExistingTestLocations(paths) {
  const locations = new Set();
  if (paths.some((item) => item.startsWith("tests/"))) locations.add("tests");
  if (paths.some((item) => item.includes("/tests/"))) locations.add("package-local tests");
  return [...locations];
}

function detectArchitectures(paths, files) {
  const architectures = new Set();
  if (files.some((file) => /\bfrom\s+fastapi\s+import\b|\bimport\s+fastapi\b|\bFastAPI\b|\bAPIRouter\b/.test(file.content))) architectures.add("fastapi");
  if (paths.some((item) => item.includes("/repositories/") || item.includes("/services/"))) architectures.add("service-layer");
  return [...architectures].sort();
}

function detectConventions(paths) {
  const conventions = new Set();
  if (paths.some((item) => /^tests\/test_.*\.py$/.test(item))) conventions.add("tests/test_*.py");
  if (paths.some((item) => /_test\.py$/.test(item))) conventions.add("*_test.py");
  return [...conventions];
}

function detectSetupSignals(paths, configText) {
  const signals = new Set();
  if (paths.includes("pyproject.toml")) signals.add("pyproject");
  if (paths.includes("requirements.txt")) signals.add("requirements");
  if (/\bpytest\b/i.test(configText)) signals.add("pytest dependency");
  if (/\bfastapi\b/i.test(configText)) signals.add("fastapi dependency");
  return [...signals];
}

function detectBlockers(testCommand, frameworks) {
  const blockers = [];
  if (frameworks.length === 0) blockers.push("No supported Python test framework detected.");
  if (!testCommand) blockers.push("No runnable Python test command detected from project markers.");
  return blockers;
}

function scoreProfileConfidence(testFrameworks, existingTestLocations, blockers) {
  if (blockers.length > 1) return "low";
  if (testFrameworks.length > 0 && existingTestLocations.length > 0) return "high";
  if (testFrameworks.length > 0) return "medium";
  return "low";
}

function classifySourceFile(file) {
  const currentPath = normalizePath(file.path);
  const content = file.content;
  const lowerPath = currentPath.toLowerCase();

  if (isAppWiring(lowerPath, content)) {
    return skipped(
      "app-wiring",
      ["app-wiring"],
      3,
      5,
      "Application wiring is usually better covered through route or integration tests.",
      "Cover through FastAPI route tests or service integration tests that boot the app."
    );
  }

  if (isDtoLike(lowerPath, content)) {
    return skipped(
      "dto",
      ["dto-only"],
      2,
      4,
      "DTO-only models are usually better covered through route, parser, or service tests.",
      "Cover through parser, mapper, repository, or route integration tests that consume the model."
    );
  }

  if (isHttpRoute(lowerPath, content)) {
    return recommended("http-route", ["http-route", "status-handling"], "high", "medium", "integration", 8, 5, ["HTTP route behavior", "request or status handling"]);
  }

  if (matchesAny(lowerPath, ["parser", "mapper", "validator", "formatter"]) || /\bdef\s+(parse|map|validate|format)_/.test(content)) {
    return recommended("pure-logic", ["pure-logic", "edge-case-surface"], "high", "high", "unit", 9, 2, ["Pure transformation logic", "edge-case surface"]);
  }

  if (matchesAny(lowerPath, ["service", "client", "repository"])) {
    const signals = ["service-boundary"];
    const reasons = ["Service boundary"];
    let risk = "medium";
    let riskReductionScore = 6;

    if (/\basync\s+def\b|\bawait\b/.test(content)) {
      signals.push("async-or-concurrency");
      reasons.push("async or concurrency behavior");
      risk = "high";
      riskReductionScore = 8;
    }
    if (/\b(requests|httpx|aiohttp|open|Path|sqlite3|psycopg|pymongo)\b/.test(content)) {
      signals.push("external-boundary");
      reasons.push("external boundary");
      risk = "high";
      riskReductionScore = Math.max(riskReductionScore, 8);
    }

    return recommended("service", signals, risk, "medium", "unit", riskReductionScore, 4, reasons);
  }

  if (hasBranching(content)) {
    return recommended("utility", ["branching-logic"], "medium", "high", "unit", 5, 2, ["Branching logic"]);
  }

  return skipped("low-value", ["low-runtime-behavior"], 1, 3, "No meaningful runtime behavior detected by current Python heuristics.");
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

function isSourceFile(currentPath) {
  const normalized = normalizePath(currentPath);
  return SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension)) && !isTestFile(normalized) && !basenameWithoutExtension(normalized).startsWith("__init__");
}

function isTestFile(currentPath) {
  const normalized = normalizePath(currentPath);
  return normalized.startsWith("tests/") && (normalized.split("/").at(-1)?.startsWith("test_") || normalized.endsWith("_test.py"));
}

function findExistingTests(sourcePath, testPaths) {
  const sourceBase = basenameWithoutExtension(sourcePath);
  return testPaths.filter((testPath) => {
    const testBase = basenameWithoutExtension(testPath);
    return testBase === `test_${sourceBase}` || testBase === `${sourceBase}_test`;
  });
}

function isAppWiring(currentPath, content) {
  return /(main|app)\.py$/.test(currentPath) && /\bFastAPI\s*\(|\binclude_router\b/.test(content);
}

function isDtoLike(currentPath, content) {
  return (
    /(dto|model|models|schema|schemas|request|response)/i.test(currentPath) &&
    (/\bclass\s+\w+\(BaseModel\)\s*:/.test(content) || /@dataclass\s*\n\s*class\s+/.test(content))
  );
}

function isHttpRoute(currentPath, content) {
  return (
    (currentPath.includes("/routes/") || currentPath.includes("/routers/") || currentPath.includes("/controllers/")) &&
    (/\bAPIRouter\s*\(/.test(content) || /@\w+\.(get|post|put|patch|delete)\s*\(/.test(content))
  );
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

function hasBranching(content) {
  return /\b(if|elif|else|try|except|match|case)\b/.test(content);
}

function byRiskThenName(a, b) {
  const order = { high: 0, medium: 1, low: 2 };
  return order[a.risk] - order[b.risk] || a.name.localeCompare(b.name);
}
