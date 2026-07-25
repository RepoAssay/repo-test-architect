import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = [".py"];
const DEFAULT_PYTEST_PYTHON_FILES = ["test_*.py", "*_test.py"];
const EMPTY_PYTEST_DISCOVERY = Object.freeze({
  configPath: undefined,
  testPaths: [],
  pythonFiles: [],
  testPathsDeclared: false,
  pythonFilesDeclared: false,
  hasDiscoveryRules: false
});
const IGNORED_TOP_LEVEL_PACKAGES = new Set([
  "benchmark", "benchmarks", "build", "ci", "dist", "doc", "docs", "docs_src", "example", "examples",
  "htmlcov", "script", "scripts", "test", "tests", "tool", "tools", "util", "utils"
]);

export function auditPythonRepo(root, options = {}) {
  const files = readRepoFiles(root);
  const pytestDiscovery = detectPytestDiscovery(files);
  const profile = buildProfile(root, files, pytestDiscovery);
  const sourceLayout = detectOwnedSourceLayout(files);
  const changedPaths = options.changedPaths ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(root, currentPath))) : undefined;
  const testFiles = files
    .filter((file) => isTestFile(file.path, pytestDiscovery))
    .map((file) => ({ path: normalizePath(file.path), content: file.content, analysis: analyzePythonTestFile(file.content) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const sourceFiles = files.filter((candidate) => isSourceFile(candidate.path, sourceLayout, pytestDiscovery));
  const sourceBasenameCounts = countSourceBasenames(sourceFiles);
  const packageReexports = collectPythonPackageReexports(files, sourceLayout, pytestDiscovery);
  const pytestFixtures = collectPytestFixtures(files, sourceLayout, pytestDiscovery);
  const testEvidenceBySourcePath = collectPythonTestEvidence(sourceFiles, testFiles, sourceLayout, sourceBasenameCounts, packageReexports, pytestFixtures);
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
    [".coveragerc", ".pytest.ini", ".pytest.toml", "pyproject.toml", "pytest.ini", "pytest.toml", "requirements.txt", "setup.cfg", "setup.py", "tox.ini", "uv.lock", "poetry.lock"].includes(relative)
  );
}

function detectPytestDiscovery(files) {
  const candidates = [
    ["pytest.toml", ["pytest"]],
    [".pytest.toml", ["pytest"]],
    ["pytest.ini", ["pytest"]],
    [".pytest.ini", ["pytest"]],
    ["pyproject.toml", ["tool.pytest", "tool.pytest.ini_options"]],
    ["tox.ini", ["pytest"]],
    ["setup.cfg", ["tool:pytest"]]
  ];
  const fileByPath = new Map(files.map((file) => [normalizePath(file.path), file]));

  for (const [configPath, sections] of candidates) {
    const config = fileByPath.get(configPath);
    if (!config || !sections.some((section) => hasStaticConfigSection(config.content, section))) continue;
    const rawTestPaths = extractStaticSectionSetting(config.content, sections, "testpaths");
    const rawPythonFiles = extractStaticSectionSetting(config.content, sections, "python_files");
    const testPaths = parseStaticConfigValues(rawTestPaths)
      .map(normalizeConfiguredTestPath)
      .filter(Boolean);
    const pythonFiles = parseStaticConfigValues(rawPythonFiles)
      .filter((pattern) => isBoundedPythonFilePattern(pattern));
    return {
      configPath,
      testPaths: [...new Set(testPaths)],
      pythonFiles: [...new Set(pythonFiles)],
      testPathsDeclared: rawTestPaths !== undefined,
      pythonFilesDeclared: rawPythonFiles !== undefined,
      hasDiscoveryRules: rawTestPaths !== undefined || rawPythonFiles !== undefined
    };
  }

  return EMPTY_PYTEST_DISCOVERY;
}

function hasStaticConfigSection(content, section) {
  return new RegExp(`^\\s*\\[${escapeRegex(section)}\\]\\s*(?:[#;].*)?$`, "m").test(content);
}

function extractStaticSectionSetting(content, sections, setting) {
  const lines = content.split(/\r?\n/);
  let activeSection;

  for (let index = 0; index < lines.length; index += 1) {
    const section = lines[index].match(/^\s*\[([^\]]+)\]\s*(?:[#;].*)?$/)?.[1];
    if (section) {
      activeSection = section;
      continue;
    }
    if (!sections.includes(activeSection)) continue;
    const assignment = lines[index].match(new RegExp(`^\\s*${escapeRegex(setting)}\\s*=\\s*(.*)$`));
    if (!assignment) continue;

    const values = [assignment[1]];
    let bracketDepth = configBracketDepth(assignment[1]);
    let cursor = index + 1;
    while (cursor < lines.length) {
      const next = lines[cursor];
      if (bracketDepth > 0) {
        values.push(next);
        bracketDepth += configBracketDepth(next);
        cursor += 1;
        continue;
      }
      if (assignment[1].trim() || !/^\s+\S/.test(next) || /^\s*\[/.test(next)) break;
      values.push(next.trim());
      cursor += 1;
    }
    return values.join("\n");
  }

  return undefined;
}

function configBracketDepth(value) {
  let depth = 0;
  let quote;
  let escaped = false;
  for (const character of value) {
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = undefined;
    } else if (character === "'" || character === "\"") quote = character;
    else if (character === "[") depth += 1;
    else if (character === "]") depth -= 1;
  }
  return depth;
}

function parseStaticConfigValues(rawValue) {
  if (rawValue === undefined) return [];
  const withoutComments = rawValue
    .split(/\r?\n/)
    .map(stripConfigLineComment)
    .join("\n");
  const quoted = [...withoutComments.matchAll(/["']([^"']+)["']/g)].map((match) => match[1].trim()).filter(Boolean);
  if (quoted.length > 0) return quoted;
  return withoutComments
    .replace(/[\[\],]/g, " ")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function stripConfigLineComment(line) {
  let quote;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === quote && line[index - 1] !== "\\") quote = undefined;
    } else if (character === "'" || character === "\"") quote = character;
    else if (character === "#" || character === ";") return line.slice(0, index);
  }
  return line;
}

function normalizeConfiguredTestPath(configuredPath) {
  const normalized = normalizePath(configuredPath).replace(/^\.\//, "").replace(/\/+$/, "");
  if (!normalized || normalized === "." || path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//.test(normalized)) return undefined;
  if (normalized.split("/").some((segment) => segment === ".." || /[*?[\]{}]/.test(segment))) return undefined;
  return normalized;
}

function isBoundedPythonFilePattern(pattern) {
  return Boolean(pattern) && !pattern.includes("/") && /^[A-Za-z0-9_.?*-]+$/.test(pattern) && !/[\[\]{}]/.test(pattern);
}

function isConfiguredPytestTestFile(currentPath, pytestDiscovery) {
  if (!pytestDiscovery.hasDiscoveryRules || !normalizePath(currentPath).endsWith(".py")) return false;
  const normalized = normalizePath(currentPath);
  if (pytestDiscovery.testPathsDeclared && !isInConfiguredPytestPath(normalized, pytestDiscovery)) return false;
  const patterns = pytestDiscovery.pythonFilesDeclared ? pytestDiscovery.pythonFiles : DEFAULT_PYTEST_PYTHON_FILES;
  return patterns.some((pattern) => staticGlobMatches(fileNameOf(normalized), pattern));
}

function isInConfiguredPytestPath(currentPath, pytestDiscovery) {
  const normalized = normalizePath(currentPath);
  return pytestDiscovery.testPaths.some((testPath) => normalized === testPath || normalized.startsWith(`${testPath}/`));
}

function staticGlobMatches(value, pattern) {
  const source = [...pattern].map((character) => {
    if (character === "*") return ".*";
    if (character === "?") return ".";
    return escapeRegex(character);
  }).join("");
  return new RegExp(`^${source}$`).test(value);
}

function buildProfile(root, files, pytestDiscovery) {
  const paths = files.map((file) => normalizePath(file.path));
  const configText = files
    .filter((file) => [".coveragerc", ".pytest.ini", ".pytest.toml", "noxfile.py", "pyproject.toml", "pytest.ini", "pytest.toml", "requirements.txt", "setup.cfg", "setup.py", "tox.ini"].includes(normalizePath(file.path)))
    .map((file) => file.content)
    .join("\n");
  const testFrameworks = detectTestFrameworks(paths, configText, files, pytestDiscovery);
  const testCommand = detectTestCommand(paths, configText, testFrameworks, files);
  const existingTestLocations = detectExistingTestLocations(paths, pytestDiscovery);
  const blockers = detectBlockers(testCommand, testFrameworks);

  return {
    root,
    languages: ["python"],
    packageManagers: detectPackageManagers(paths, configText),
    testFrameworks,
    architectures: detectArchitectures(paths, files, configText),
    testCommand,
    detectedConventions: detectConventions(paths, files, configText, pytestDiscovery),
    existingTestLocations,
    setupSignals: detectSetupSignals(paths, configText, files, pytestDiscovery),
    confidence: scoreProfileConfidence(testFrameworks, existingTestLocations, blockers),
    blockers
  };
}

function detectPackageManagers(paths, configText) {
  const managers = new Set();
  if (paths.includes("pyproject.toml")) managers.add("pyproject");
  if (paths.includes("requirements.txt")) managers.add("pip");
  if (paths.includes("setup.py") || paths.includes("setup.cfg")) managers.add("setuptools");
  const tool = detectPythonTool(paths, configText);
  if (tool === "uv") managers.add("uv");
  if (tool === "poetry") managers.add("poetry");
  if (tool === "hatch") managers.add("hatch");
  return [...managers].sort();
}

function detectTestFrameworks(paths, configText, files, pytestDiscovery) {
  const frameworks = new Set();
  const testText = files.filter((file) => isPythonTestSupportFile(file.path, pytestDiscovery)).map((file) => file.content).join("\n");
  const signalText = `${configText}\n${testText}`;
  if (/\bpytest\b/i.test(configText) || /(?:^|\n)\s*(?:import\s+pytest\b|from\s+pytest\s+import\b)|@pytest\./m.test(testText)) frameworks.add("pytest");
  if (/\bunittest\b|\bfrom\s+django\.test\s+import\b/i.test(signalText) || paths.some((item) => isTestFile(item, pytestDiscovery) && /_test\.py$/.test(item))) frameworks.add("unittest");
  if (/\bpytest[-_]asyncio\b|@pytest\.mark\.asyncio\b/i.test(signalText)) frameworks.add("pytest-asyncio");
  if (/\bpytest[-_]anyio\b|@pytest\.mark\.anyio\b|\bfrom\s+anyio\s+import\b/i.test(signalText)) frameworks.add("anyio");
  if (/\bhypothesis\b|\bfrom\s+hypothesis\s+import\b|@given\s*\(/i.test(signalText)) frameworks.add("hypothesis");
  return [...frameworks].sort();
}

function detectTestCommand(paths, configText, frameworks, files) {
  const environmentCommand = detectPythonTestEnvironmentCommand(paths, files);
  if (environmentCommand) return environmentCommand;
  const tool = detectPythonTool(paths, configText);
  const hasDjangoTestProject = paths.includes("manage.py") && files.some((file) => /\bDJANGO_SETTINGS_MODULE\b|\bfrom\s+django\b|\bimport\s+django\b/.test(file.content));
  if (frameworks.includes("unittest") && paths.includes("tests/runtests.py")) return "python tests/runtests.py";
  if (frameworks.includes("unittest") && hasDjangoTestProject) {
    if (tool === "uv") return "uv run python manage.py test";
    if (tool === "poetry") return "poetry run python manage.py test";
    return "python manage.py test";
  }
  if (frameworks.includes("pytest")) {
    if (tool === "uv") return "uv run pytest";
    if (tool === "poetry") return "poetry run pytest";
    if (tool === "hatch") return "hatch test";
    return "pytest";
  }
  if (frameworks.includes("unittest")) {
    if (tool === "uv") return "uv run python -m unittest";
    if (tool === "poetry") return "poetry run python -m unittest";
    if (tool === "hatch") return "hatch test";
    return "python -m unittest";
  }
  return undefined;
}

function detectExistingTestLocations(paths, pytestDiscovery) {
  const locations = new Set();
  if (paths.some((item) => item.startsWith("tests/"))) locations.add("tests");
  if (paths.some((item) => item.startsWith("test/"))) locations.add("test");
  if (paths.some((item) => item.startsWith("testing/"))) locations.add("testing");
  if (paths.some((item) => item.includes("/tests/"))) locations.add("package-local tests");
  if (paths.some((item) => item.includes("/test/"))) locations.add("package-local test variants");
  if (paths.some((item) => fileNameOf(item) === "tests.py")) locations.add("package tests.py");
  if (paths.some((item) => isConfiguredPytestTestFile(item, pytestDiscovery))) locations.add("configured pytest location");
  return [...locations];
}

function detectArchitectures(paths, files, configText) {
  const architectures = new Set();
  if (files.some((file) => /\bfrom\s+fastapi\s+import\b|\bimport\s+fastapi\b|\bFastAPI\b|\bAPIRouter\b/.test(file.content))) architectures.add("fastapi");
  if (/\bdjango\b/i.test(configText) || files.some((file) => /\bfrom\s+django\b|\bimport\s+django\b|\bDJANGO_SETTINGS_MODULE\b/.test(file.content))) architectures.add("django");
  if (/\bflask\b/i.test(configText) || files.some((file) => /\bfrom\s+flask\s+import\b|\bimport\s+flask\b|\bFlask\s*\(|\bBlueprint\s*\(/.test(file.content))) architectures.add("flask");
  if (paths.some((item) => item.includes("/repositories/") || item.includes("/services/"))) architectures.add("service-layer");
  return [...architectures].sort();
}

function detectConventions(paths, files, configText, pytestDiscovery) {
  const conventions = new Set();
  if (paths.some((item) => /^tests\/test_.*\.py$/.test(item))) conventions.add("tests/test_*.py");
  if (paths.some((item) => /^(?:test|testing)\/test_.*\.py$/.test(item))) conventions.add("test variants/test_*.py");
  if (paths.some((item) => item.includes("/tests/test_"))) conventions.add("package-local tests/test_*.py");
  if (paths.some((item) => /_test\.py$/.test(item))) conventions.add("*_test.py");
  if (paths.some((item) => fileNameOf(item) === "tests.py")) conventions.add("tests.py");
  if (files.some((file) => /@(?:pytest\.)?fixture(?:\s*\(|\b)/.test(file.content))) conventions.add("pytest fixtures");
  if (files.some((file) => /\basync\s+def\s+test_|@pytest\.mark\.(?:asyncio|anyio)\b/.test(file.content))) conventions.add("async tests");
  if (files.some((file) => /@pytest\.mark\.parametrize\s*\(/.test(file.content))) conventions.add("pytest parametrization");
  if (/\bhypothesis\b|\bfrom\s+hypothesis\s+import\b|@given\s*\(/i.test(configText)) conventions.add("property-based tests");
  if (hasCoverageConfig(paths, configText)) conventions.add("coverage configured");
  if (hasCoverageConfig(paths, configText) && hasBranchCoverage(configText)) conventions.add("branch coverage");
  if (pytestDiscovery.testPaths.length > 0) conventions.add("pytest testpaths");
  if (pytestDiscovery.pythonFiles.length > 0) conventions.add("pytest python_files");
  return [...conventions];
}

function detectSetupSignals(paths, configText, files, pytestDiscovery) {
  const signals = new Set();
  const testText = files.filter((file) => isPythonTestSupportFile(file.path, pytestDiscovery)).map((file) => file.content).join("\n");
  const testSignalText = `${configText}\n${testText}`;
  const tool = detectPythonTool(paths, configText);
  if (paths.includes("pyproject.toml")) signals.add("pyproject");
  if (paths.includes("requirements.txt")) signals.add("requirements");
  if (pytestDiscovery.configPath) signals.add("pytest config");
  if (tool === "uv") signals.add("uv project");
  if (tool === "poetry") signals.add("poetry project");
  if (tool === "hatch") signals.add("hatch project");
  const environmentCommand = detectPythonTestEnvironmentCommand(paths, files, configText);
  if (environmentCommand?.startsWith("tox")) signals.add("tox test environment");
  if (environmentCommand?.startsWith("nox")) signals.add("nox test session");
  if (paths.includes("tests/runtests.py")) signals.add("django test runner");
  if (/\bpytest\b/i.test(configText)) signals.add("pytest dependency");
  if (/\bpytest[-_]asyncio\b|@pytest\.mark\.asyncio\b/i.test(testSignalText)) signals.add("pytest async support");
  if (/\bpytest[-_]anyio\b|@pytest\.mark\.anyio\b/i.test(testSignalText)) signals.add("anyio test support");
  if (/\bhypothesis\b|\bfrom\s+hypothesis\s+import\b|@given\s*\(/i.test(testSignalText)) signals.add("hypothesis dependency");
  if (/\bfastapi\b/i.test(configText)) signals.add("fastapi dependency");
  if (/\bdjango\b/i.test(configText)) signals.add("django dependency");
  if (/\bflask\b/i.test(configText)) signals.add("flask dependency");
  if (hasCoverageConfig(paths, configText)) signals.add("coverage config");
  if (hasCoverageConfig(paths, configText) && hasBranchCoverage(configText)) signals.add("branch coverage");
  return [...signals];
}

function detectPythonTestEnvironmentCommand(paths, files = [], configText = "") {
  const toxContent = files.find((file) => normalizePath(file.path) === "tox.ini")?.content ?? (paths.includes("tox.ini") ? configText : "");
  const hasToxTestCommand = /^\s*commands(?:_pre|_post)?\s*=[\s\S]{0,500}?\b(?:pytest|python\s+-m\s+unittest)\b/im.test(toxContent);
  if (/^\s*\[(?:tox|testenv(?::[^\]]+)?)\]/m.test(toxContent) && hasToxTestCommand) return "tox";

  const noxContent = files.find((file) => normalizePath(file.path) === "noxfile.py")?.content ?? (paths.includes("noxfile.py") ? configText : "");
  const hasNoxTestCommand = /session\.run\s*\(\s*["']pytest["']/.test(noxContent) || /session\.run\s*\(\s*["']python["']\s*,\s*["']-m["']\s*,\s*["']unittest["']/.test(noxContent);
  if (/\bimport\s+nox\b|\bfrom\s+nox\s+import\b/.test(noxContent) && hasNoxTestCommand) {
    const sessionName = noxContent.match(/@nox\.session[^\n]*\n(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/)?.[1];
    return sessionName ? `nox -s ${sessionName}` : "nox";
  }
  return undefined;
}

function hasCoverageConfig(paths, configText) {
  return paths.includes(".coveragerc") || /^\s*\[tool\.coverage\./m.test(configText) || /^\s*\[coverage:(?:run|report|html|xml|json)\]\s*$/m.test(configText);
}

function hasBranchCoverage(configText) {
  return /^\s*branch\s*=\s*(?:true|1|yes)\b/im.test(configText);
}

function detectPythonTool(paths, configText) {
  if (paths.includes("uv.lock") || /^\s*\[tool\.uv\]/m.test(configText)) return "uv";
  if (paths.includes("poetry.lock") || /^\s*\[tool\.poetry\]/m.test(configText) || /\bpoetry-core\b/i.test(configText)) return "poetry";
  if (/^\s*\[tool\.hatch\.envs(?:\.|\])/m.test(configText)) return "hatch";
  return undefined;
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

  if (isHttpRoute(lowerPath, content)) {
    const frameworkSignal = isDjangoView(lowerPath, content)
      ? "django-view"
      : isFlaskRoute(content)
        ? "flask-route"
        : "http-route";
    return recommended("http-route", [frameworkSignal, "status-handling"], "high", "medium", "integration", 8, 5, ["HTTP route behavior", "request or status handling"]);
  }

  if (isAppWiring(lowerPath, content)) {
    return skipped(
      "app-wiring",
      ["app-wiring"],
      3,
      5,
      "Application wiring is usually better covered through route or integration tests.",
      "Cover through framework route tests or service integration tests that boot the app."
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

  if (matchesAny(lowerPath, ["parser", "mapper", "validator", "formatter", "calculator"]) || /\bdef\s+(parse|map|validate|format|calculate)_/.test(content)) {
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

function isSourceFile(currentPath, sourceLayout, pytestDiscovery) {
  const normalized = normalizePath(currentPath);
  return (
    SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension)) &&
    !isInTestsDirectory(normalized) &&
    !isInConfiguredPytestPath(normalized, pytestDiscovery) &&
    !isTestFile(normalized, pytestDiscovery) &&
    !basenameWithoutExtension(normalized).startsWith("__init__") &&
    sourceLayout.entries.some(({ prefix }) => normalized.startsWith(prefix))
  );
}

function detectOwnedSourceLayout(files) {
  const paths = files.map((file) => normalizePath(file.path));
  const declaredEntries = detectDeclaredPackageEntries(files, paths);
  if (declaredEntries.length > 0) return { entries: declaredEntries };
  if (paths.some((currentPath) => currentPath.startsWith("src/") && currentPath.endsWith(".py"))) {
    return { entries: [{ prefix: "src/", importRoot: "src/" }] };
  }

  const pyproject = files.find((file) => normalizePath(file.path) === "pyproject.toml")?.content;
  const projectName = pyproject ? parseDeclaredProjectName(pyproject) : undefined;
  if (projectName) {
    const packageName = projectName.replaceAll("-", "_");
    if (paths.includes(`${packageName}/__init__.py`)) {
      return { entries: [{ prefix: `${packageName}/`, importRoot: "" }] };
    }
  }

  const topLevelPackages = paths
    .filter((currentPath) => /^[^/]+\/__init__\.py$/.test(currentPath))
    .map((currentPath) => currentPath.split("/", 1)[0])
    .filter((name) => !IGNORED_TOP_LEVEL_PACKAGES.has(name));
  const uniquePackages = [...new Set(topLevelPackages)].sort();
  return {
    entries: uniquePackages.length === 1
      ? [{ prefix: `${uniquePackages[0]}/`, importRoot: "" }]
      : [{ prefix: "", importRoot: "" }]
  };
}

function detectDeclaredPackageEntries(files, paths) {
  const entries = [];
  const pyproject = files.find((file) => normalizePath(file.path) === "pyproject.toml")?.content;
  if (pyproject) {
    const setuptoolsBase = parsePyprojectPackageBase(extractStaticSectionSetting(pyproject, ["tool.setuptools"], "package-dir"));
    const setuptoolsPackages = parseStaticConfigValues(extractStaticSectionSetting(pyproject, ["tool.setuptools"], "packages"))
      .filter(isStaticPythonPackageName);
    entries.push(...packageEntriesForNames(setuptoolsPackages, setuptoolsBase, paths));

    if (hasStaticConfigSection(pyproject, "tool.setuptools.packages.find")) {
      const where = parseStaticConfigValues(extractStaticSectionSetting(pyproject, ["tool.setuptools.packages.find"], "where"));
      const include = parseStaticConfigValues(extractStaticSectionSetting(pyproject, ["tool.setuptools.packages.find"], "include"));
      const exclude = parseStaticConfigValues(extractStaticSectionSetting(pyproject, ["tool.setuptools.packages.find"], "exclude"));
      entries.push(...packageEntriesForFind(where, include, exclude, paths));
    }

    entries.push(...parsePoetryPackageEntries(pyproject, paths));
  }

  const setupCfg = files.find((file) => normalizePath(file.path) === "setup.cfg")?.content;
  if (setupCfg) {
    const packageSetting = extractStaticSectionSetting(setupCfg, ["options"], "packages");
    const packageBase = parseSetupCfgPackageBase(extractStaticSectionSetting(setupCfg, ["options"], "package_dir"));
    const packageValues = parseStaticConfigValues(packageSetting);
    if (packageValues.some((value) => value === "find:" || value === "find_namespace:")) {
      const where = parseStaticConfigValues(extractStaticSectionSetting(setupCfg, ["options.packages.find"], "where"));
      const include = parseStaticConfigValues(extractStaticSectionSetting(setupCfg, ["options.packages.find"], "include"));
      const exclude = parseStaticConfigValues(extractStaticSectionSetting(setupCfg, ["options.packages.find"], "exclude"));
      entries.push(...packageEntriesForFind(where.length > 0 ? where : [packageBase], include, exclude, paths));
    } else {
      entries.push(...packageEntriesForNames(packageValues.filter(isStaticPythonPackageName), packageBase, paths));
    }
  }

  return deduplicatePackageEntries(entries);
}

function parsePyprojectPackageBase(rawValue) {
  const match = rawValue?.match(/\{\s*["']{2}\s*=\s*["']([^"']+)["']/);
  return match ? normalizePackageBase(match[1]) : "";
}

function parseSetupCfgPackageBase(rawValue) {
  const match = rawValue?.match(/(?:^|\n)\s*=\s*([^\s#;]+)/);
  return match ? normalizePackageBase(match[1]) : "";
}

function normalizePackageBase(value) {
  if (value === undefined || value === "" || value === ".") return "";
  const normalized = normalizePath(value).replace(/^\.\//, "").replace(/\/+$/, "");
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split("/").some((segment) => segment === ".." || /[*?[\]{}]/.test(segment))) return undefined;
  return `${normalized}/`;
}

function packageEntriesForNames(packageNames, importRoot, paths) {
  if (importRoot === undefined) return [];
  return packageNames
    .map((packageName) => ({
      prefix: `${importRoot}${packageName.replaceAll(".", "/")}/`,
      importRoot
    }))
    .filter(({ prefix }) => paths.some((currentPath) => currentPath.startsWith(prefix) && currentPath.endsWith(".py")));
}

function packageEntriesForFind(whereValues, includePatterns, excludePatterns, paths) {
  const where = (whereValues.length > 0 ? whereValues : [""])
    .map(normalizePackageBase)
    .filter((value) => value !== undefined)
    .filter((value, index, values) => values.indexOf(value) === index);
  const entries = [];

  for (const importRoot of where) {
    const topLevelNames = new Set();
    for (const currentPath of paths.filter((candidate) => candidate.endsWith(".py") && candidate.startsWith(importRoot))) {
      const relative = currentPath.slice(importRoot.length);
      if (!relative.includes("/")) continue;
      const topLevel = relative.split("/", 1)[0];
      if (topLevel && !IGNORED_TOP_LEVEL_PACKAGES.has(topLevel)) topLevelNames.add(topLevel);
    }
    for (const packageName of [...topLevelNames].sort()) {
      if (includePatterns.length > 0 && !includePatterns.some((pattern) => isBoundedPackageGlob(pattern) && staticGlobMatches(packageName, pattern))) continue;
      if (excludePatterns.some((pattern) => isBoundedPackageGlob(pattern) && staticGlobMatches(packageName, pattern))) continue;
      entries.push({ prefix: `${importRoot}${packageName}/`, importRoot });
    }
  }

  return entries;
}

function parsePoetryPackageEntries(pyproject, paths) {
  const rawPackages = extractStaticSectionSetting(pyproject, ["tool.poetry"], "packages");
  if (!rawPackages) return [];
  const entries = [];
  for (const object of rawPackages.matchAll(/\{([^}]+)\}/g)) {
    const include = object[1].match(/\binclude\s*=\s*["']([^"']+)["']/)?.[1];
    const from = object[1].match(/\bfrom\s*=\s*["']([^"']+)["']/)?.[1];
    if (!include || !isStaticPythonPackageName(include.replaceAll("/", "."))) continue;
    entries.push(...packageEntriesForNames([include.replaceAll("/", ".")], from === undefined ? "" : normalizePackageBase(from), paths));
  }
  return entries;
}

function isStaticPythonPackageName(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(value);
}

function isBoundedPackageGlob(value) {
  return /^[A-Za-z_][A-Za-z0-9_.?*-]*$/.test(value) && !/[\[\]{}]/.test(value);
}

function deduplicatePackageEntries(entries) {
  const unique = [...new Map(entries.map((entry) => [`${entry.importRoot}\0${entry.prefix}`, entry])).values()]
    .sort((left, right) => left.prefix.length - right.prefix.length || left.prefix.localeCompare(right.prefix));
  return unique.filter((entry, index) => !unique.slice(0, index).some((parent) =>
    parent.importRoot === entry.importRoot && entry.prefix.startsWith(parent.prefix)
  ));
}

function parseDeclaredProjectName(content) {
  let activeSection;
  for (const line of content.split(/\r?\n/)) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/)?.[1];
    if (section) {
      activeSection = section;
      continue;
    }
    if (activeSection === "project" || activeSection === "tool.poetry") {
      const name = line.match(/^\s*name\s*=\s*["']([^"']+)["']/)?.[1];
      if (name) return name;
    }
  }
  return undefined;
}

function isTestFile(currentPath, pytestDiscovery = EMPTY_PYTEST_DISCOVERY) {
  const normalized = normalizePath(currentPath);
  const fileName = fileNameOf(normalized);
  if (pytestDiscovery.hasDiscoveryRules) return isConfiguredPytestTestFile(normalized, pytestDiscovery);
  return fileName === "tests.py" || (isInTestsDirectory(normalized) && (fileName.startsWith("test_") || fileName.endsWith("_test.py")));
}

function analyzePythonTestFile(content) {
  return {
    functions: parsePythonFunctions(content),
    imports: collectPythonModuleImportBindings(content)
  };
}

function collectPythonTestEvidence(sourceFiles, testFiles, sourceLayout, sourceBasenameCounts, packageReexports, pytestFixtures) {
  const moduleToSourcePaths = new Map();
  const basenameToSourcePaths = new Map();
  for (const sourceFile of sourceFiles) {
    const sourcePath = normalizePath(sourceFile.path);
    for (const moduleName of pythonModuleNames(sourcePath, sourceLayout)) {
      const current = moduleToSourcePaths.get(moduleName) ?? [];
      moduleToSourcePaths.set(moduleName, [...current, sourcePath]);
    }
    const basename = basenameWithoutExtension(sourcePath);
    const current = basenameToSourcePaths.get(basename) ?? [];
    basenameToSourcePaths.set(basename, [...current, sourcePath]);
  }

  const reexportLookup = new Map();
  for (const [sourcePath, reexports] of packageReexports) {
    for (const reexport of reexports) {
      const key = `${reexport.packageModule}:${reexport.exported}`;
      const current = reexportLookup.get(key) ?? [];
      reexportLookup.set(key, [...current, sourcePath]);
    }
  }

  const evidenceBySourceAndTest = new Map();
  for (const testFile of testFiles) {
    const testFunctions = testFile.analysis.functions.filter((pythonFunction) => pythonFunction.name.startsWith("test_"));
    const fixtureFunctions = testFile.analysis.functions.filter((pythonFunction) => pythonFunction.decorators.some(isPytestFixtureDecorator));

    for (const currentImport of testFile.analysis.imports) {
      for (const sourcePath of moduleToSourcePaths.get(currentImport.moduleName) ?? []) {
        const testUsage = strongestPythonReferenceUsage(testFunctions, currentImport.reference);
        const fixtureUsesImport = fixtureFunctions.some((pythonFunction) => pythonReferenceAppears(pythonFunction.body, currentImport.reference));
        if (testUsage || !fixtureUsesImport) {
          setPythonTestEvidence(evidenceBySourceAndTest, sourcePath, testFile.path, {
            testPath: testFile.path,
            kind: "python-module-import",
            strength: "direct",
            ...(testUsage ? { usage: testUsage } : {})
          });
        }
      }

      if (currentImport.kind === "from") {
        for (const sourcePath of reexportLookup.get(`${currentImport.moduleName}:${currentImport.imported}`) ?? []) {
          const usage = strongestPythonReferenceUsage(testFunctions, currentImport.reference);
          setPythonTestEvidence(evidenceBySourceAndTest, sourcePath, testFile.path, {
            testPath: testFile.path,
            kind: "python-package-reexport",
            strength: "referenced",
            ...(usage ? { usage } : {})
          });
        }
      } else {
        for (const [key, sourcePaths] of reexportLookup) {
          const [packageModule, exported] = key.split(":");
          if (packageModule !== currentImport.moduleName) continue;
          const reference = `${currentImport.reference}.${exported}`;
          const usage = strongestPythonReferenceUsage(testFunctions, reference);
          if (!usage && !testFunctions.some((pythonFunction) => pythonReferenceAppears(pythonFunction.body, reference))) continue;
          for (const sourcePath of sourcePaths) {
            setPythonTestEvidence(evidenceBySourceAndTest, sourcePath, testFile.path, {
              testPath: testFile.path,
              kind: "python-package-reexport",
              strength: "referenced",
              ...(usage ? { usage } : {})
            });
          }
        }
      }
    }

    for (const { sourcePath, viaUsage } of collectConsumedFixtureSources(testFile, pytestFixtures)) {
      setPythonTestEvidence(evidenceBySourceAndTest, sourcePath, testFile.path, {
        testPath: testFile.path,
        kind: "python-pytest-fixture",
        strength: "indirect",
        ...(viaUsage ? { viaUsage } : {})
      });
    }

    const testBase = basenameWithoutExtension(testFile.path).replace(/^test_/, "").replace(/_test$/, "");
    for (const sourcePath of basenameToSourcePaths.get(testBase) ?? []) {
      const basenameIsUnique = sourceBasenameCounts.get(testBase) === 1;
      if (!basenameIsUnique && !testPathMatchesSourceOwner(sourcePath, testFile.path, sourceLayout)) continue;
      setPythonTestEvidence(evidenceBySourceAndTest, sourcePath, testFile.path, {
        testPath: testFile.path,
        kind: "filename-convention",
        strength: "naming"
      });
    }
  }

  const bySourcePath = new Map();
  for (const [key, evidence] of evidenceBySourceAndTest) {
    const sourcePath = key.slice(0, key.lastIndexOf("\0"));
    const current = bySourcePath.get(sourcePath) ?? [];
    bySourcePath.set(sourcePath, [...current, evidence]);
  }
  return new Map([...bySourcePath].map(([sourcePath, evidence]) => [
    sourcePath,
    evidence.sort((left, right) => left.testPath.localeCompare(right.testPath))
  ]));
}

function collectConsumedFixtureSources(testFile, pytestFixtures) {
  const consumed = new Map();
  const tests = testFile.analysis.functions.filter((pythonFunction) => pythonFunction.name.startsWith("test_"));
  for (const testFunction of tests) {
    const initialFixtures = new Set([...testFunction.parameters, ...testFunction.decorators.flatMap(parseUsefixturesDecorator)]);
    const queue = [...initialFixtures].map((name) => ({ name, rootName: name }));
    const visited = new Set();
    while (queue.length > 0) {
      const current = queue.shift();
      const visitKey = `${current.name}:${current.rootName}`;
      if (visited.has(visitKey)) continue;
      visited.add(visitKey);
      for (const fixture of pytestFixtures.definitionsByName.get(current.name) ?? []) {
        if (!fixtureIsVisible(fixture, testFile.path)) continue;
        const viaUsage = findPythonReferenceUsage(testFunction.body, current.rootName);
        for (const sourcePath of fixture.sourcePaths) {
          const existing = consumed.get(sourcePath);
          consumed.set(sourcePath, strongerPythonUsage(existing, viaUsage));
        }
        for (const dependency of fixture.dependencies) queue.push({ name: dependency, rootName: current.rootName });
      }
    }
  }
  return [...consumed].map(([sourcePath, viaUsage]) => ({ sourcePath, viaUsage }));
}

function strongestPythonReferenceUsage(functions, reference) {
  let usage;
  for (const pythonFunction of functions) usage = strongerPythonUsage(usage, findPythonReferenceUsage(pythonFunction.body, reference));
  return usage;
}

function strongerPythonUsage(left, right) {
  const rank = { undefined: 0, called: 1, asserted: 2 };
  return rank[right] > rank[left] ? right : left;
}

function setPythonTestEvidence(evidenceBySourceAndTest, sourcePath, testPath, evidence) {
  const key = `${sourcePath}\0${testPath}`;
  const existing = evidenceBySourceAndTest.get(key);
  const rank = { naming: 0, indirect: 1, referenced: 2, direct: 3 };
  if (!existing || rank[evidence.strength] > rank[existing.strength]) evidenceBySourceAndTest.set(key, evidence);
}

function isPytestFixtureDecorator(decorator) {
  return /^@(?:pytest\.)?fixture(?:\s*\(|\b)/.test(decorator);
}

function collectPytestFixtures(files, sourceLayout, pytestDiscovery) {
  const sourceFiles = files.filter((file) => isSourceFile(file.path, sourceLayout, pytestDiscovery));
  const moduleToSourcePaths = new Map();
  for (const sourceFile of sourceFiles) {
    for (const moduleName of pythonModuleNames(sourceFile.path, sourceLayout)) {
      const current = moduleToSourcePaths.get(moduleName) ?? [];
      moduleToSourcePaths.set(moduleName, [...current, normalizePath(sourceFile.path)]);
    }
  }

  const definitions = files
    .filter((file) => isPythonTestSupportFile(file.path, pytestDiscovery))
    .flatMap((file) => {
      const imports = collectPythonModuleImportBindings(file.content);
      return parsePythonFunctions(file.content)
        .filter((pythonFunction) => pythonFunction.decorators.some(isPytestFixtureDecorator))
        .map((pythonFunction) => {
          const sourcePaths = new Set();
          for (const currentImport of imports) {
            const matchingSources = moduleToSourcePaths.get(currentImport.moduleName) ?? [];
            if (matchingSources.length === 0 || !pythonReferenceAppears(pythonFunction.body, currentImport.reference)) continue;
            for (const sourcePath of matchingSources) sourcePaths.add(sourcePath);
          }
          return {
            name: pythonFunction.name,
            path: normalizePath(file.path),
            dependencies: pythonFunction.parameters,
            sourcePaths: [...sourcePaths].sort()
          };
        });
    })
    .sort((left, right) => left.path.localeCompare(right.path) || left.name.localeCompare(right.name));

  const definitionsByName = new Map();
  for (const definition of definitions) {
    const current = definitionsByName.get(definition.name) ?? [];
    definitionsByName.set(definition.name, [...current, definition]);
  }
  return { definitions, definitionsByName };
}

function fixtureIsVisible(fixture, testPath) {
  if (fileNameOf(fixture.path) !== "conftest.py") return fixture.path === testPath;
  const directory = fixture.path.slice(0, -"conftest.py".length);
  return normalizePath(testPath).startsWith(directory);
}

function parseUsefixturesDecorator(decorator) {
  if (!/^@pytest\.mark\.usefixtures\s*\(/.test(decorator)) return [];
  return [...decorator.matchAll(/["']([A-Za-z_][A-Za-z0-9_]*)["']/g)].map((match) => match[1]);
}

function isPythonTestSupportFile(currentPath, pytestDiscovery = EMPTY_PYTEST_DISCOVERY) {
  const normalized = normalizePath(currentPath);
  const configuredConftest = fileNameOf(normalized) === "conftest.py" &&
    (!pytestDiscovery.testPathsDeclared || isInConfiguredPytestPath(normalized, pytestDiscovery));
  return normalized.endsWith(".py") &&
    (isTestFile(normalized, pytestDiscovery) || (isInTestsDirectory(normalized) && fileNameOf(normalized) === "conftest.py") || configuredConftest);
}

function collectPythonModuleImportBindings(content) {
  const imports = [];
  const masked = maskPythonCommentsAndStrings(content);
  for (const match of masked.matchAll(/^\s*from\s+([A-Za-z_][A-Za-z0-9_.]*)\s+import\s+(\([^)]*\)|[^\n]+)/gm)) {
    for (const binding of parsePythonImportBindings(match[2])) {
      imports.push({ moduleName: match[1], imported: binding.imported, reference: binding.local, kind: "from" });
    }
  }
  for (const match of masked.matchAll(/^\s*import\s+([^\n]+)/gm)) {
    for (const currentImport of match[1].split(",").map((item) => item.trim())) {
      const parsed = currentImport.match(/^([A-Za-z_][A-Za-z0-9_.]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/);
      if (parsed) imports.push({ moduleName: parsed[1], reference: parsed[2] ?? parsed[1], kind: "module" });
    }
  }
  return imports;
}

function parsePythonFunctions(content) {
  const rawLines = content.split(/\r?\n/);
  const maskedLines = maskPythonCommentsAndStrings(content).split(/\r?\n/);
  const functions = [];

  for (let index = 0; index < maskedLines.length; index += 1) {
    const match = maskedLines[index].match(/^(\s*)(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:->\s*[^:]+)?\s*:/);
    if (!match) continue;
    const indent = indentationWidth(match[1]);
    let decoratorIndex = index - 1;
    const decorators = [];
    while (decoratorIndex >= 0 && rawLines[decoratorIndex].trimStart().startsWith("@")) {
      decorators.unshift(rawLines[decoratorIndex].trim());
      decoratorIndex -= 1;
    }
    let end = index + 1;
    while (end < maskedLines.length) {
      const line = maskedLines[end];
      if (line.trim() && indentationWidth(line.match(/^\s*/)?.[0] ?? "") <= indent) break;
      end += 1;
    }
    functions.push({
      name: match[2],
      parameters: parsePythonParameters(match[3]),
      decorators,
      body: maskedLines.slice(index + 1, end).join("\n")
    });
    index = end - 1;
  }
  return functions;
}

function parsePythonParameters(value) {
  return value
    .split(",")
    .map((parameter) => parameter.trim().replace(/^\*+/, "").split(/[:=]/, 1)[0].trim())
    .filter((parameter) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(parameter) && !["self", "cls"].includes(parameter));
}

function indentationWidth(value) {
  return [...value].reduce((width, character) => width + (character === "\t" ? 4 : 1), 0);
}

function pythonReferenceAppears(content, reference) {
  return new RegExp(`\\b${escapeRegex(reference)}(?:\\b|\\.)`).test(content);
}

function findPythonReferenceUsage(content, reference) {
  const lines = content.split("\n");
  const escapedReference = escapeRegex(reference);
  if (lines.some((line) => /^\s*assert\b|\.assert[A-Z]\w*\s*\(/.test(line) && new RegExp(`\\b${escapedReference}\\b`).test(line))) return "asserted";
  if (new RegExp(`\\b${escapedReference}(?:\\.[A-Za-z_][A-Za-z0-9_]*)?\\s*\\(`).test(content)) return "called";
  return undefined;
}

function collectPythonPackageReexports(files, sourceLayout, pytestDiscovery) {
  const reexportsByModule = new Map();
  for (const file of files.filter((candidate) =>
    normalizePath(candidate.path).endsWith("/__init__.py") &&
    !isInTestsDirectory(candidate.path) &&
    !isInConfiguredPytestPath(candidate.path, pytestDiscovery) &&
    sourceLayout.entries.some(({ prefix }) => normalizePath(candidate.path).startsWith(prefix))
  )) {
    const packageModule = pythonPackageModule(file.path, sourceLayout);
    if (!packageModule) continue;
    const masked = maskPythonCommentsAndStrings(file.content);
    for (const match of masked.matchAll(/^\s*from\s+(\.+)([A-Za-z_][A-Za-z0-9_.]*)?\s+import\s+(\([^)]*\)|[^\n]+)/gm)) {
      const importedModule = resolveRelativePythonModule(packageModule, match[1].length, match[2] ?? "");
      if (!importedModule) continue;
      const bindings = parsePythonImportBindings(match[3]);
      for (const sourcePath of files
        .filter((candidate) => isSourceFile(candidate.path, sourceLayout, pytestDiscovery))
        .filter((candidate) => pythonModuleNames(candidate.path, sourceLayout).includes(importedModule))
        .map((candidate) => normalizePath(candidate.path))) {
        const current = reexportsByModule.get(sourcePath) ?? [];
        reexportsByModule.set(sourcePath, [
          ...current,
          ...bindings.map(({ imported, local }) => ({ packageModule, imported, exported: local }))
        ]);
      }
    }
  }
  return new Map([...reexportsByModule].map(([sourcePath, reexports]) => [
    sourcePath,
    reexports.sort((left, right) => left.packageModule.localeCompare(right.packageModule) || left.exported.localeCompare(right.exported))
  ]));
}

function pythonPackageModule(initializerPath, sourceLayout) {
  const withoutInitializer = normalizePath(initializerPath).replace(/\/__init__\.py$/, "");
  for (const { prefix, importRoot } of sourceLayout.entries) {
    if (withoutInitializer === prefix.replace(/\/$/, "") || withoutInitializer.startsWith(prefix)) {
      return withoutInitializer.slice(importRoot.length).replaceAll("/", ".");
    }
  }
  return withoutInitializer.replaceAll("/", ".");
}

function resolveRelativePythonModule(packageModule, level, suffix) {
  const packageSegments = packageModule.split(".");
  const base = packageSegments.slice(0, Math.max(0, packageSegments.length - (level - 1)));
  const suffixSegments = suffix ? suffix.split(".") : [];
  return [...base, ...suffixSegments].filter(Boolean).join(".");
}

function countSourceBasenames(sourceFiles) {
  const counts = new Map();
  for (const file of sourceFiles) {
    const basename = basenameWithoutExtension(file.path);
    counts.set(basename, (counts.get(basename) ?? 0) + 1);
  }
  return counts;
}

function pythonModuleNames(sourcePath, sourceLayout) {
  const withoutExtension = normalizePath(sourcePath).replace(/\.py$/, "");
  const names = new Set([withoutExtension.replaceAll("/", ".")]);
  for (const { prefix, importRoot } of sourceLayout.entries) {
    if (withoutExtension.startsWith(prefix)) names.add(withoutExtension.slice(importRoot.length).replaceAll("/", "."));
  }
  return [...names].filter(Boolean).sort();
}

function parsePythonImportBindings(value) {
  return value
    .replace(/[()]/g, " ")
    .split(",")
    .map((binding) => binding.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/))
    .filter(Boolean)
    .map((match) => ({ imported: match[1], local: match[2] ?? match[1] }));
}

function testPathMatchesSourceOwner(sourcePath, testPath, sourceLayout) {
  const primaryModule = pythonModuleNames(sourcePath, sourceLayout).at(-1) ?? "";
  const sourceOwner = primaryModule.split(".").slice(0, -1).join(".");
  const testSegments = normalizePath(testPath).split("/");
  const testsIndex = testSegments.findIndex((segment) => segment === "tests" || segment === "test");
  if (testsIndex < 0) return false;
  const testOwner = testSegments.slice(testsIndex + 1, -1).join(".");
  return Boolean(testOwner) && (sourceOwner === testOwner || sourceOwner.endsWith(`.${testOwner}`));
}

function maskPythonCommentsAndStrings(content) {
  let result = "";
  let index = 0;
  let quote;
  let triple = false;
  let comment = false;

  while (index < content.length) {
    const current = content[index];
    if (comment) {
      if (current === "\n") {
        comment = false;
        result += "\n";
      } else result += " ";
      index += 1;
      continue;
    }
    if (quote) {
      if (!triple && current === "\\") {
        result += "  ";
        index += 2;
        continue;
      }
      if (triple && content.slice(index, index + 3) === quote.repeat(3)) {
        result += "   ";
        index += 3;
        quote = undefined;
        triple = false;
        continue;
      }
      if (!triple && current === quote) {
        result += " ";
        index += 1;
        quote = undefined;
        continue;
      }
      result += current === "\n" ? "\n" : " ";
      index += 1;
      continue;
    }
    if (current === "#") {
      comment = true;
      result += " ";
      index += 1;
      continue;
    }
    if (current === "\"" || current === "'") {
      quote = current;
      triple = content.slice(index, index + 3) === current.repeat(3);
      result += triple ? "   " : " ";
      index += triple ? 3 : 1;
      continue;
    }
    result += current;
    index += 1;
  }
  return result;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAppWiring(currentPath, content) {
  if (/(settings|urls|asgi|wsgi)\.py$/.test(currentPath) && /\bdjango\b|\burlpatterns\b|\bDJANGO_SETTINGS_MODULE\b/.test(content)) return true;
  return (
    /(main|app|factory)\.py$/.test(currentPath) &&
    (/\bFastAPI\s*\(|\binclude_router\b|\bFlask\s*\(|\bregister_blueprint\b/.test(content)) &&
    !isFlaskRoute(content)
  );
}

function isDtoLike(currentPath, content) {
  return (
    /(dto|model|models|schema|schemas|request|response)/i.test(currentPath) &&
    (/\bclass\s+\w+\(BaseModel\)\s*:/.test(content) || /@dataclass\s*\n\s*class\s+/.test(content))
  );
}

function isHttpRoute(currentPath, content) {
  return (
    ((currentPath.includes("/routes/") || currentPath.includes("/routers/") || currentPath.includes("/controllers/")) &&
      (/\bAPIRouter\s*\(/.test(content) || /@\w+\.(get|post|put|patch|delete)\s*\(/.test(content))) ||
    isDjangoView(currentPath, content) ||
    isFlaskRoute(content)
  );
}

function isDjangoView(currentPath, content) {
  return (
    (/(^|\/)views?\.py$/.test(currentPath) || currentPath.includes("/views/")) &&
    (/\bfrom\s+django\.(?:http|views)\b|\bHttpResponse\b|\bJsonResponse\b|\bAPIView\b|\bViewSet\b/.test(content))
  );
}

function isFlaskRoute(content) {
  const hasRouteDecorator = /@[A-Za-z_][A-Za-z0-9_]*\.(?:route|get|post|put|patch|delete)\s*\(/.test(content);
  const hasFlaskSignal = /\bfrom\s+flask\s+import\b|\bimport\s+flask\b|\bFlask\s*\(|\bBlueprint\s*\(|\.(?:route)\s*\(/.test(content);
  return hasRouteDecorator && hasFlaskSignal;
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
  return fileNameOf(currentPath).replace(/\.[^.]+$/, "");
}

function fileNameOf(currentPath) {
  return normalizePath(currentPath).split("/").at(-1) ?? currentPath;
}

function isInTestsDirectory(currentPath) {
  const normalized = normalizePath(currentPath);
  return /^(?:test|testing|tests)\//.test(normalized) || /\/(?:test|tests)\//.test(normalized);
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
