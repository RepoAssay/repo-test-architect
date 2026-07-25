import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = [".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"];
const SOURCE_ROOTS = ["src/", "source/", "lib/"];
const GENERIC_SOURCE_BASENAMES = new Set(["handler", "index", "types", "utils"]);
const MAX_TRANSITIVE_SOURCE_DEPTH = 2;
const AVA_ASSERTION_METHODS = ["assert", "deepEqual", "false", "falsy", "is", "like", "not", "notDeepEqual", "notRegex", "notThrows", "notThrowsAsync", "regex", "snapshot", "throws", "throwsAsync", "true", "truthy"];
const PACKAGE_MANAGER_LOCKFILES = [
  ["package-lock.json", "npm"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"]
];
const SUPPORTED_PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);

export function auditJavaScriptRepo(root, options = {}) {
  const files = scopeToPackageRoot(readRepoFiles(root));
  const packageData = parsePackageJson(files.find((file) => normalizePath(file.path) === "package.json")?.content ?? "");
  const workspaceContext = findOwningWorkspace(root);
  const runnerConfig = detectRunnerConfiguration(root, files, packageData, workspaceContext);
  const testFilePaths = new Set(files
    .map((file) => normalizePath(file.path))
    .filter((currentPath) => isTestFile(currentPath) || runnerConfig.testPaths.has(currentPath)));
  const profile = buildProfile(root, files, packageData, workspaceContext, runnerConfig, testFilePaths);
  const changedPaths = options.changedPaths ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(root, currentPath))) : undefined;
  const moduleFiles = files.map((file) => analyzeModuleFile({ ...file, path: normalizePath(file.path) }));
  const moduleIndex = createJavaScriptModuleIndex(moduleFiles);
  const testFiles = moduleFiles.filter((file) => testFilePaths.has(file.path));
  const tsconfigData = resolveTsconfigData("tsconfig.json", files);
  const pathAliasEntries = findTsconfigPathAliasEntries(tsconfigData, moduleFiles);
  const boundedTransitiveImports = collectBoundedTransitiveImports(testFiles, moduleIndex, pathAliasEntries);
  const packageSourcePaths = findDeclaredPackageSourcePaths(packageData, moduleFiles);
  const packageEntryFiles = findSourcePackageEntries(packageData, moduleFiles);
  const packageSubpathEntries = findSourcePackageSubpathEntries(packageData, moduleFiles);
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];
  const runtimeSourcePaths = new Set(files
    .map((file) => normalizePath(file.path))
    .filter((currentPath) => !testFilePaths.has(currentPath))
    .filter((currentPath) => isRuntimeJavaScriptSource(currentPath) || (packageSourcePaths.has(currentPath) && /\.(cjs|mjs|js|jsx)$/.test(currentPath))));
  const sourceJavaScriptRuntime = hasSourceJavaScriptRuntimeEntrypoint(files) || [...packageSourcePaths].some((currentPath) => /\.(cjs|mjs|js|jsx)$/.test(currentPath));

  for (const file of files.filter((candidate) => !testFilePaths.has(normalizePath(candidate.path)) && isAuditableSourceFile(candidate.path, packageSourcePaths) && isIncludedByChangedPaths(candidate.path, changedPaths))) {
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

    const existingTestEvidence = findExistingTestEvidence(file.path, testFiles, moduleIndex, boundedTransitiveImports, {
      packageName: packageData.name,
      packageEntryFiles,
      packageSubpathEntries,
      pathAliasEntries,
      browserE2EFrameworks: new Set(profile.testFrameworks.filter((framework) => framework === "playwright" || framework === "cypress"))
    });
    const existingTestPaths = existingTestEvidence.map((evidence) => evidence.testPath);

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
      "bun.lock",
      "bun.lockb",
      "bunfig.toml",
      "vitest.config.ts",
      "vitest.config.js",
      "jest.config.ts",
      "jest.config.js",
      "ava.config.json"
    ].includes(relative) || /(^|\/)(?:vitest(?:\.[A-Za-z0-9_-]+)?\.config|vitest\.config(?:\.[A-Za-z0-9_-]+)?|jest\.config|playwright\.config|cypress\.config|ava\.config)\.(?:[cm]?[jt]s|json)$/.test(relative) || /(^|\/)tsconfig(?:\.[^/]+)?\.json$/.test(relative) || /(^|\/)\.mocharc(?:\.(?:json|ya?ml))?$/.test(relative)
  );
}

function scopeToPackageRoot(files) {
  const nestedPackageRoots = files
    .map((file) => normalizePath(file.path))
    .filter((currentPath) => currentPath.endsWith("/package.json"))
    .map((currentPath) => currentPath.slice(0, -"/package.json".length))
    .filter((nestedRoot) => !isTestHarnessRoot(nestedRoot));

  if (nestedPackageRoots.length === 0) return files;

  return files.filter((file) => {
    const currentPath = normalizePath(file.path);
    return !nestedPackageRoots.some((nestedRoot) => currentPath === nestedRoot || currentPath.startsWith(`${nestedRoot}/`));
  });
}

function isTestHarnessRoot(currentPath) {
  return ["test", "tests", "__tests__"].includes(currentPath.split("/")[0]);
}

function buildProfile(root, files, packageData, workspaceContext, runnerConfig, testFilePaths) {
  const paths = files.map((file) => normalizePath(file.path));
  const packageJson = files.find((file) => normalizePath(file.path) === "package.json");
  const packageManagerInfo = detectPackageManagerInfo(paths, packageData, workspaceContext);
  const testFrameworks = detectTestFrameworks(files, packageData, runnerConfig, testFilePaths);
  const testCommand = detectTestCommand(packageData, testFrameworks, packageManagerInfo, runnerConfig);
  const existingTestLocations = detectExistingTestLocations(paths, testFilePaths);
  const detectedConventions = detectConventions(paths, testFilePaths);
  const setupSignals = detectSetupSignals(paths, packageData, workspaceContext, runnerConfig);
  const blockers = detectBlockers(packageJson !== undefined, testCommand, testFrameworks, packageManagerInfo);

  return {
    root,
    languages: detectLanguages(paths),
    packageManagers: packageManagerInfo.managers,
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

function findOwningWorkspace(root) {
  const packageRoot = path.resolve(root);
  let current = path.dirname(packageRoot);

  while (current !== path.dirname(current)) {
    const relativePackageRoot = normalizePath(path.relative(current, packageRoot));
    if (!relativePackageRoot.startsWith("../") && relativePackageRoot !== "..") {
      const packageData = parsePackageJson(readFileIfPresent(path.join(current, "package.json")));
      const packagePatterns = collectPackageWorkspacePatterns(packageData);
      const pnpmWorkspaceText = readFileIfPresent(path.join(current, "pnpm-workspace.yaml"));
      const pnpmPatterns = collectPnpmWorkspacePatterns(pnpmWorkspaceText);
      const matchesPackageWorkspace = matchesWorkspacePatterns(relativePackageRoot, packagePatterns);
      const matchesPnpmWorkspace = matchesWorkspacePatterns(relativePackageRoot, pnpmPatterns);

      if (matchesPackageWorkspace || matchesPnpmWorkspace) {
        const managers = new Set();
        for (const [lockfile, manager] of PACKAGE_MANAGER_LOCKFILES) {
          if (fs.existsSync(path.join(current, lockfile))) managers.add(manager);
        }
        if (matchesPnpmWorkspace) managers.add("pnpm");

        const explicitManager = detectExplicitPackageManager(packageData) ?? (matchesPnpmWorkspace ? "pnpm" : undefined);
        if (explicitManager) managers.add(explicitManager);
        const detectedManagers = sortPackageManagers(managers);
        const signalManager = explicitManager ?? (detectedManagers.length === 1 ? detectedManagers[0] : undefined);

        return {
          root: current,
          relativePackageRoot,
          managers: detectedManagers,
          explicitManager,
          signal: signalManager ? `${signalManager} workspace` : "package workspace"
        };
      }
    }

    current = path.dirname(current);
  }

  return undefined;
}

function readFileIfPresent(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return "";
    throw error;
  }
}

function collectPackageWorkspacePatterns(packageData) {
  if (Array.isArray(packageData.workspaces)) {
    return packageData.workspaces.filter((value) => typeof value === "string");
  }
  if (packageData.workspaces && typeof packageData.workspaces === "object" && Array.isArray(packageData.workspaces.packages)) {
    return packageData.workspaces.packages.filter((value) => typeof value === "string");
  }
  return [];
}

function collectPnpmWorkspacePatterns(content) {
  const patterns = [];
  let packagesIndent;

  for (const line of content.split(/\r?\n/)) {
    const packagesMatch = /^(\s*)packages\s*:\s*$/.exec(line);
    if (packagesMatch) {
      packagesIndent = packagesMatch[1].length;
      continue;
    }
    if (packagesIndent === undefined || /^\s*(?:#.*)?$/.test(line)) continue;

    const indent = line.match(/^\s*/)[0].length;
    if (indent <= packagesIndent) break;

    const itemMatch = /^\s*-\s*(.*?)\s*$/.exec(line);
    if (!itemMatch) continue;
    const value = parseSimpleYamlString(itemMatch[1]);
    if (value) patterns.push(value);
  }

  return patterns;
}

function parseSimpleYamlString(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith("\"") && trimmed.endsWith("\""))) {
    return trimmed.slice(1, -1);
  }
  return trimmed.replace(/\s+#.*$/, "").trim();
}

function matchesWorkspacePatterns(relativePackageRoot, patterns) {
  const normalizedRoot = relativePackageRoot.replace(/^\.\//, "").replace(/\/+$/, "");
  const included = patterns
    .filter((pattern) => !pattern.trim().startsWith("!"))
    .some((pattern) => workspacePatternToRegExp(pattern).test(normalizedRoot));
  if (!included) return false;

  return !patterns
    .filter((pattern) => pattern.trim().startsWith("!"))
    .some((pattern) => workspacePatternToRegExp(pattern.trim().slice(1)).test(normalizedRoot));
}

function workspacePatternToRegExp(pattern) {
  const normalized = pattern.trim().replace(/^['"]|['"]$/g, "").replace(/^\.\//, "").replace(/\/+$/, "");
  let source = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }

  return new RegExp(`${source}$`);
}

function detectLanguages(paths) {
  const languages = new Set();
  if (paths.some((item) => item.endsWith(".ts") || item.endsWith(".tsx"))) languages.add("typescript");
  if (paths.some((item) => item.endsWith(".js") || item.endsWith(".jsx") || item.endsWith(".mjs"))) languages.add("javascript");
  return [...languages];
}

function detectPackageManagerInfo(paths, packageData, workspaceContext) {
  const localLockfileManagers = detectLockfilePackageManagers(paths);
  const localExplicitManager = detectExplicitPackageManager(packageData);
  const hasLocalManagerEvidence = localLockfileManagers.length > 0 || localExplicitManager !== undefined;
  const inheritedManagers = hasLocalManagerEvidence ? [] : (workspaceContext?.managers ?? []);
  const explicitManager = localExplicitManager ?? (hasLocalManagerEvidence ? undefined : workspaceContext?.explicitManager);
  const managers = new Set();
  for (const manager of [...localLockfileManagers, ...inheritedManagers]) managers.add(manager);
  if (explicitManager) managers.add(explicitManager);
  if (paths.includes("package.json") && managers.size === 0) managers.add("npm");
  const detectedManagers = sortPackageManagers(managers);

  return {
    managers: detectedManagers,
    selectedManager: explicitManager ?? (detectedManagers.length === 1 ? detectedManagers[0] : undefined),
    ambiguous: explicitManager === undefined && detectedManagers.length > 1
  };
}

function detectLockfilePackageManagers(paths) {
  const managers = new Set();
  for (const [lockfile, manager] of PACKAGE_MANAGER_LOCKFILES) {
    if (paths.includes(lockfile)) managers.add(manager);
  }
  return [...managers];
}

function sortPackageManagers(managers) {
  const order = new Map(["npm", "pnpm", "yarn", "bun"].map((manager, index) => [manager, index]));
  return [...managers].sort((left, right) => order.get(left) - order.get(right));
}

function detectExplicitPackageManager(packageData) {
  if (typeof packageData.packageManager !== "string") return undefined;
  const match = /^([a-z][a-z0-9-]*)@/.exec(packageData.packageManager.trim());
  return match && SUPPORTED_PACKAGE_MANAGERS.has(match[1]) ? match[1] : undefined;
}

function detectRunnerConfiguration(root, files, packageData, workspaceContext) {
  const packageRoot = path.resolve(root);
  const selectedConfigs = collectSelectedRunnerConfigs(packageRoot, files, packageData, workspaceContext);
  const explicitlySelectedFrameworks = new Set(selectedConfigs.map((config) => config.framework));
  const localConfigs = files
    .map((file) => {
      const relativePath = normalizePath(file.path);
      const framework = classifyRunnerConfigPath(relativePath);
      if (!framework || !isAutoDiscoveredRunnerConfig(relativePath) || explicitlySelectedFrameworks.has(framework)) return undefined;
      return {
        framework,
        content: file.content,
        absolutePath: path.resolve(packageRoot, relativePath),
        inherited: false
      };
    })
    .filter(Boolean);
  const configs = dedupeRunnerConfigs([...selectedConfigs, ...localConfigs]);
  const testPaths = new Set();

  for (const config of configs) {
    const rules = collectRunnerDiscoveryRules(config, packageRoot);
    for (const file of files) {
      const currentPath = normalizePath(file.path);
      if (!SOURCE_EXTENSIONS.some((extension) => currentPath.endsWith(extension))) continue;
      if (rules.some((rule) => runnerRuleMatches(currentPath, rule))) testPaths.add(currentPath);
    }
  }

  return {
    frameworks: [...new Set(configs.map((config) => config.framework))],
    signals: [...new Set(configs.map((config) => `${config.framework} config${config.inherited ? " (owning workspace)" : ""}`))],
    configPaths: configs
      .filter((config) => !config.inherited && isPathInside(packageRoot, config.absolutePath))
      .map((config) => ({ framework: config.framework, path: normalizePath(path.relative(packageRoot, config.absolutePath)) })),
    testPaths
  };
}

function collectSelectedRunnerConfigs(packageRoot, files, packageData, workspaceContext) {
  const configs = [];
  const scripts = packageData.scripts && typeof packageData.scripts === "object"
    ? Object.values(packageData.scripts).filter((value) => typeof value === "string")
    : [];

  for (const script of scripts) {
    const framework = detectScriptRunner(script);
    if (!framework) continue;
    const option = framework === "cypress" ? "--config-file" : "--config";
    const configuredPath = extractCliOptionPath(script, option);
    if (!configuredPath || path.isAbsolute(configuredPath)) continue;

    const absolutePath = path.resolve(packageRoot, configuredPath);
    const local = isPathInside(packageRoot, absolutePath);
    const inherited = !local && workspaceContext && isPathInside(workspaceContext.root, absolutePath);
    if (!local && !inherited) continue;

    const localPath = normalizePath(path.relative(packageRoot, absolutePath));
    const localFile = files.find((file) => normalizePath(file.path) === localPath);
    const content = localFile?.content ?? readFileIfPresent(absolutePath);
    if (!content || !fs.statSync(absolutePath).isFile()) continue;
    configs.push({ framework, content, absolutePath, inherited });
  }

  return configs;
}

function detectScriptRunner(script) {
  const commandPrefix = "(?:^|&&\\s*|\\|\\|\\s*|;\\s*)";
  const executor = "(?:(?:npx|yarn|bunx|pnpm\\s+exec)\\s+)?";
  const checks = [
    ["playwright", new RegExp(`${commandPrefix}${executor}playwright\\s+test(?:\\s|$)`)],
    ["cypress", new RegExp(`${commandPrefix}${executor}cypress\\s+(?:run|open)(?:\\s|$)`)],
    ["vitest", new RegExp(`${commandPrefix}${executor}vitest(?:\\s|$)`)],
    ["jest", new RegExp(`${commandPrefix}${executor}jest(?:\\s|$)`)],
    ["ava", new RegExp(`${commandPrefix}${executor}ava(?:\\s|$)`)],
    ["mocha", new RegExp(`${commandPrefix}${executor}mocha(?:\\s|$)`)]
  ];
  return checks.find(([, pattern]) => pattern.test(script))?.[0];
}

function extractCliOptionPath(script, option) {
  const escapedOption = escapeRegExp(option);
  const match = new RegExp(`${escapedOption}(?:=|\\s+)(?:"([^"]+)"|'([^']+)'|([^\\s;&|]+))`).exec(script);
  return match?.slice(1).find(Boolean);
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function classifyRunnerConfigPath(currentPath) {
  const basename = path.posix.basename(normalizePath(currentPath));
  if (/^vitest(?:\.[A-Za-z0-9_-]+)?\.config\.[cm]?[jt]s$/.test(basename) || /^vitest\.config(?:\.[A-Za-z0-9_-]+)?\.[cm]?[jt]s$/.test(basename)) return "vitest";
  if (/^jest\.config\.(?:[cm]?[jt]s|json)$/.test(basename)) return "jest";
  if (/^playwright\.config\.[cm]?[jt]s$/.test(basename)) return "playwright";
  if (/^cypress\.config\.[cm]?[jt]s$/.test(basename)) return "cypress";
  if (/^ava\.config\.(?:[cm]?[jt]s|json)$/.test(basename)) return "ava";
  if (/^\.mocharc(?:\.(?:json|ya?ml))?$/.test(basename)) return "mocha";
  return undefined;
}

function isAutoDiscoveredRunnerConfig(currentPath) {
  const directory = path.posix.dirname(normalizePath(currentPath));
  return directory === "." || isTestHarnessRoot(directory);
}

function dedupeRunnerConfigs(configs) {
  const seen = new Set();
  return configs.filter((config) => {
    const key = `${config.framework}:${config.absolutePath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectRunnerDiscoveryRules(config, packageRoot) {
  const content = stripStaticConfigComments(config.content);
  const configDirectory = path.dirname(config.absolutePath);
  const rules = [];

  if (config.framework === "vitest") {
    const bodies = extractObjectPropertyBodies(content, "test");
    for (const body of bodies) {
      addRunnerRules(rules, extractStaticPropertyStrings(body, "include"), extractStaticPropertyStrings(body, "exclude"), packageRoot, packageRoot);
    }
  } else if (config.framework === "jest") {
    addRunnerRules(
      rules,
      extractStaticPropertyStrings(content, "testMatch"),
      [],
      configDirectory,
      packageRoot,
      { rootToken: configDirectory }
    );
  } else if (config.framework === "playwright") {
    const testDirectories = extractStaticPropertyStrings(content, "testDir");
    const testMatches = extractStaticPropertyStrings(content, "testMatch");
    const testIgnores = extractStaticPropertyStrings(content, "testIgnore");
    for (const testDirectory of testDirectories) {
      const directoryBase = resolveStaticPatternBase(configDirectory, testDirectory);
      if (!directoryBase) continue;
      const includes = testMatches.length > 0 ? testMatches : ["**/*.test.*", "**/*.spec.*"];
      addRunnerRules(rules, includes, testIgnores, directoryBase, packageRoot);
    }
  } else if (config.framework === "cypress") {
    for (const property of ["e2e", "component"]) {
      for (const body of extractObjectPropertyBodies(content, property)) {
        addRunnerRules(
          rules,
          extractStaticPropertyStrings(body, "specPattern"),
          extractStaticPropertyStrings(body, "excludeSpecPattern"),
          packageRoot,
          packageRoot
        );
      }
    }
  } else if (config.framework === "ava") {
    addRunnerRules(rules, extractStaticPropertyStrings(content, "files"), [], packageRoot, packageRoot);
  } else if (config.framework === "mocha") {
    const jsonSpec = extractStaticPropertyStrings(content, "spec");
    const yamlSpec = extractSimpleYamlList(content, "spec");
    addRunnerRules(rules, [...jsonSpec, ...yamlSpec], [], packageRoot, packageRoot);
  }

  return rules;
}

function stripStaticConfigComments(content) {
  let result = "";
  let quote;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];
    if (quote) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === "'" || character === "\"" || character === "`") {
      quote = character;
      result += character;
    } else if (character === "/" && next === "/") {
      while (index < content.length && content[index] !== "\n") index += 1;
      result += "\n";
    } else if (character === "/" && next === "*") {
      index += 2;
      while (index < content.length - 1 && !(content[index] === "*" && content[index + 1] === "/")) index += 1;
      index += 1;
    } else {
      result += character;
    }
  }

  return result;
}

function extractObjectPropertyBodies(content, property) {
  const bodies = [];
  const pattern = new RegExp(`(?:^\\s*|[,{]\\s*)(?:["']${escapeRegExp(property)}["']|${escapeRegExp(property)})\\s*:\\s*\\{`, "gm");
  for (const match of content.matchAll(pattern)) {
    const openIndex = match.index + match[0].lastIndexOf("{");
    const closeIndex = findClosingDelimiter(content, openIndex, "{", "}");
    if (closeIndex !== undefined) bodies.push(content.slice(openIndex + 1, closeIndex));
  }
  return bodies;
}

function extractStaticPropertyStrings(content, property) {
  const values = [];
  const pattern = new RegExp(`(?:^\\s*|[,{]\\s*)(?:["']${escapeRegExp(property)}["']|${escapeRegExp(property)})\\s*:\\s*`, "gm");
  for (const match of content.matchAll(pattern)) {
    let index = match.index + match[0].length;
    while (/\s/.test(content[index] ?? "")) index += 1;
    if (content[index] === "[") {
      const closeIndex = findClosingDelimiter(content, index, "[", "]");
      if (closeIndex !== undefined) values.push(...extractQuotedStrings(content.slice(index + 1, closeIndex)));
    } else if (content[index] === "'" || content[index] === "\"") {
      const value = readQuotedString(content, index);
      if (value) values.push(value.value);
    }
  }
  return values;
}

function findClosingDelimiter(content, openIndex, open, close) {
  let depth = 0;
  let quote;
  let escaped = false;
  for (let index = openIndex; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === "'" || character === "\"" || character === "`") {
      quote = character;
    } else if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

function extractQuotedStrings(content) {
  const values = [];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== "'" && content[index] !== "\"") continue;
    const value = readQuotedString(content, index);
    if (!value) continue;
    values.push(value.value);
    index = value.end;
  }
  return values;
}

function readQuotedString(content, start) {
  const quote = content[start];
  let value = "";
  let escaped = false;
  for (let index = start + 1; index < content.length; index += 1) {
    const character = content[index];
    if (escaped) {
      value += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === quote) {
      return { value, end: index };
    } else {
      value += character;
    }
  }
  return undefined;
}

function extractSimpleYamlList(content, property) {
  const values = [];
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = new RegExp(`^(\\s*)${escapeRegExp(property)}\\s*:\\s*(.*?)\\s*$`).exec(lines[index]);
    if (!match) continue;
    if (match[2]) {
      const value = parseSimpleYamlString(match[2]);
      if (value) values.push(value);
      continue;
    }
    const baseIndent = match[1].length;
    for (index += 1; index < lines.length; index += 1) {
      const item = /^(\s*)-\s*(.*?)\s*$/.exec(lines[index]);
      if (!item || item[1].length <= baseIndent) {
        index -= 1;
        break;
      }
      const value = parseSimpleYamlString(item[2]);
      if (value) values.push(value);
    }
  }
  return values;
}

function addRunnerRules(rules, includes, excludes, baseDirectory, packageRoot, options = {}) {
  const negativeIncludes = includes
    .filter((pattern) => typeof pattern === "string" && pattern.trim().startsWith("!"))
    .map((pattern) => pattern.trim().slice(1));
  const normalizedExcludes = [...excludes, ...negativeIncludes]
    .flatMap((pattern) => normalizeRunnerPatterns(pattern, baseDirectory, packageRoot, options));
  for (const include of includes.filter((pattern) => typeof pattern === "string" && !pattern.trim().startsWith("!"))) {
    for (const pattern of normalizeRunnerPatterns(include, baseDirectory, packageRoot, options)) {
      rules.push({ include: runnerGlobToRegExp(pattern), excludes: normalizedExcludes.map(runnerGlobToRegExp) });
    }
  }
}

function resolveStaticPatternBase(baseDirectory, value) {
  if (!value || path.isAbsolute(value) || hasUnsupportedGlobSyntax(value)) return undefined;
  return path.resolve(baseDirectory, value);
}

function normalizeRunnerPatterns(value, baseDirectory, packageRoot, options = {}) {
  if (typeof value !== "string" || !value.trim()) return [];
  let pattern = value.trim().replaceAll("\\", "/");
  if (options.rootToken) {
    pattern = pattern.replaceAll("<rootDir>", ".");
  }
  if (path.posix.isAbsolute(pattern) || hasUnsupportedGlobSyntax(pattern)) return [];
  const expanded = expandSimpleBraces(pattern);

  return expanded.flatMap((currentPattern) => {
    const absolutePattern = path.resolve(baseDirectory, currentPattern);
    const relativePattern = normalizePath(path.relative(packageRoot, absolutePattern)).replace(/^\.\//, "");
    if (relativePattern === ".." || relativePattern.startsWith("../")) return [];
    return [relativePattern];
  });
}

function hasUnsupportedGlobSyntax(value) {
  return /[()[\]@+]/.test(value) || /\$\{/.test(value);
}

function expandSimpleBraces(pattern) {
  const match = /\{([^{}]+)\}/.exec(pattern);
  if (!match) return [pattern];
  const options = match[1].split(",").map((value) => value.trim()).filter(Boolean);
  if (options.length === 0 || options.length > 8) return [];
  return options.flatMap((option) => expandSimpleBraces(`${pattern.slice(0, match.index)}${option}${pattern.slice(match.index + match[0].length)}`)).slice(0, 32);
}

function runnerGlobToRegExp(pattern) {
  const normalized = pattern.replace(/^!/, "").replace(/^\.\//, "").replace(/\/+$/, "");
  const directoryOnly = !/[?*]/.test(normalized) && !SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension));
  const value = directoryOnly ? `${normalized}/**` : normalized;
  let source = "^";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "*" && value[index + 1] === "*" && value[index + 2] === "/") {
      source += "(?:.*/)?";
      index += 2;
    } else if (character === "*" && value[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }

  return new RegExp(`${source}$`);
}

function runnerRuleMatches(currentPath, rule) {
  return rule.include.test(currentPath) && !rule.excludes.some((pattern) => pattern.test(currentPath));
}

function detectTestFrameworks(files, packageData, runnerConfig, testFilePaths) {
  const frameworks = new Set(runnerConfig.frameworks);
  for (const script of Object.values(packageData.scripts ?? {}).filter((value) => typeof value === "string")) {
    const runner = detectScriptRunner(script);
    if (runner) frameworks.add(runner);
  }
  if (hasPackageDependency(packageData, "ava")) frameworks.add("ava");
  if (hasPackageDependency(packageData, "mocha")) frameworks.add("mocha");
  if (hasPackageDependency(packageData, "vitest")) frameworks.add("vitest");
  if (hasPackageDependency(packageData, "jest")) frameworks.add("jest");
  if (hasPackageDependency(packageData, "@playwright/test")) frameworks.add("playwright");
  if (hasPackageDependency(packageData, "cypress")) frameworks.add("cypress");
  if (files.some((file) => testFilePaths.has(normalizePath(file.path)) && usesNodeTest(file.content))) frameworks.add("node-test");
  if (files.some((file) => testFilePaths.has(normalizePath(file.path)) && usesBunTest(file.content))) frameworks.add("bun-test");
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

function usesBunTest(content) {
  return /(?:from\s+|import\s+|require\(\s*)["']bun:test["']/.test(content);
}

function detectTestCommand(packageData, frameworks, packageManagerInfo, runnerConfig) {
  const scripts = packageData.scripts ?? {};

  for (const key of ["test", "test:unit", "test:e2e", "e2e", "vitest", "jest", "playwright", "cypress"]) {
    const command = scripts[key];
    if (command && !isPlaceholderTestScript(command)) {
      return packageManagerInfo.ambiguous
        ? undefined
        : formatPackageScriptCommand(packageManagerInfo.selectedManager, key);
    }
  }

  if (packageManagerInfo.ambiguous && frameworks.some((framework) => !["node-test", "bun-test"].includes(framework))) {
    return undefined;
  }
  if (frameworks.includes("vitest")) return "npx vitest run";
  if (frameworks.includes("jest")) return "npx jest";
  if (frameworks.includes("node-test")) return "node --test";
  if (frameworks.includes("ava")) return "npx ava";
  if (frameworks.includes("mocha")) return "npx mocha";
  if (frameworks.includes("bun-test")) return "bun test";
  if (frameworks.includes("playwright")) {
    const config = runnerConfig.configPaths.find((entry) => entry.framework === "playwright")?.path;
    return config?.includes("/") ? `npx playwright test --config ${quoteCommandPath(config)}` : "npx playwright test";
  }
  if (frameworks.includes("cypress")) {
    const config = runnerConfig.configPaths.find((entry) => entry.framework === "cypress")?.path;
    return config?.includes("/") ? `npx cypress run --config-file ${quoteCommandPath(config)}` : "npx cypress run";
  }

  return undefined;
}

function quoteCommandPath(value) {
  return /^[A-Za-z0-9_./-]+$/.test(value) ? value : JSON.stringify(value);
}

function formatPackageScriptCommand(packageManager, script) {
  if (packageManager === "bun") return `bun run ${script}`;
  if (packageManager === "pnpm") return `pnpm run ${script}`;
  if (packageManager === "yarn") return `yarn ${script}`;
  return `npm run ${script}`;
}

function isPlaceholderTestScript(command) {
  return command.includes("no test specified") || command.includes("exit 1");
}

function detectExistingTestLocations(paths, testFilePaths) {
  const locations = new Set();

  for (const currentPath of paths) {
    if (!testFilePaths.has(currentPath)) continue;

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

function detectConventions(paths, testFilePaths) {
  const conventions = new Set();
  const testPaths = paths.filter((currentPath) => testFilePaths.has(currentPath));

  if (testPaths.some((currentPath) => /\.test\.[cm]?[jt]sx?$/.test(currentPath))) {
    conventions.add("*.test files");
  }

  if (testPaths.some((currentPath) => /\.spec\.[cm]?[jt]sx?$/.test(currentPath))) {
    conventions.add("*.spec files");
  }

  if (testPaths.some((currentPath) => /\.cy\.[cm]?[jt]sx?$/.test(currentPath))) conventions.add("*.cy files");
  if (testPaths.some((currentPath) => /_(?:test|spec)\.[cm]?[jt]sx?$/.test(currentPath))) conventions.add("Bun-style test files");
  if (testPaths.some((currentPath) => !isTestFile(currentPath))) conventions.add("configured test files");

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

function detectSetupSignals(paths, packageData, workspaceContext, runnerConfig) {
  const signals = new Set();

  if (paths.includes("tsconfig.json")) signals.add("tsconfig");
  for (const signal of runnerConfig.signals) signals.add(signal);
  if (paths.includes("bunfig.toml")) signals.add("bunfig");
  if (hasPackageDependency(packageData, "msw")) signals.add("msw");
  if (hasPackageDependency(packageData, "nock")) signals.add("nock");
  if (hasPackageDependency(packageData, "supertest")) signals.add("supertest");
  if (workspaceContext?.signal) signals.add(workspaceContext.signal);

  return [...signals];
}

function detectBlockers(hasPackageJson, testCommand, frameworks, packageManagerInfo) {
  const blockers = [];

  if (!hasPackageJson) {
    blockers.push("No package.json found, so JavaScript package conventions are uncertain.");
  }

  if (frameworks.length === 0) {
    blockers.push("No supported JS test framework detected.");
  }

  if (packageManagerInfo.ambiguous) {
    blockers.push(`Multiple package managers detected (${packageManagerInfo.managers.join(", ")}) without an explicit packageManager field, so the package-script command is ambiguous.`);
  } else if (!testCommand) {
    blockers.push("No runnable test command detected from package scripts or framework config.");
  }

  return blockers;
}

function scoreProfileConfidence(testFrameworks, existingTestLocations, blockers) {
  if (blockers.length > 1) return "low";
  if (blockers.length === 1) return "medium";
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
  return isInSourceRoot(normalized) && isJavaScriptModuleFile(normalized);
}

function isAuditableSourceFile(currentPath, packageSourcePaths) {
  const normalized = normalizePath(currentPath);
  return isSourceFile(normalized) || packageSourcePaths.has(normalized);
}

function findDeclaredPackageSourcePaths(packageData, moduleFiles) {
  const entrypoints = collectPackageEntrypoints(packageData).map((entrypoint) => stripCurrentDirectoryPrefix(normalizePath(entrypoint)));
  return new Set(moduleFiles.filter((file) => {
    if (file.path.endsWith(".d.ts") || !isJavaScriptModuleFile(file.path)) return false;
    return entrypoints.some((entrypoint) => moduleSpecifierTargetsSource("package.json", entrypoint, file.path));
  }).map((file) => file.path));
}

function isJavaScriptModuleFile(currentPath) {
  const normalized = normalizePath(currentPath);
  return SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension)) && !isTestFile(normalized);
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
  if (/(^|\/)(?:playwright|cypress)\.config\.[cm]?[jt]s$/.test(normalized) || /(^|\/)cypress\/support\//.test(normalized)) return false;
  return (
    ((normalized.startsWith("test/") || normalized.startsWith("tests/")) && SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension))) ||
    normalized.includes("__tests__/") ||
    /\.(test|spec|cy)\.[cm]?[jt]sx?$/.test(normalized) ||
    /_(test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function findExistingTestEvidence(sourcePath, testFiles, moduleIndex, boundedTransitiveImports, packageEntry) {
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
      const testBase = basenameWithoutExtension(testFile.path).replace(/\.(test|spec|cy)$|_(test|spec)$/, "");
      const filenameMatch =
        hasFilenameMatch(testFile.path, testBase, sourceBase, sourceDir, baseNameCandidates, sourceBaseCandidates, qualifiedBaseCandidates) ||
        testFile.path.startsWith(`${sourceDir}/__tests__/${sourceBase}.`);
      const directImportUsage = getDirectRelativeImportUsage(testFile, normalized);
      if (directImportUsage) return [{ testPath: testFile.path, kind: "direct-relative-import", strength: "direct", ...(directImportUsage !== "imported" ? { usage: directImportUsage } : {}) }];
      const barrelUsage = getOneHopBarrelImportUsage(testFile, normalized, moduleIndex);
      if (barrelUsage) return [{ testPath: testFile.path, kind: "referenced-relative-reexport", strength: "referenced", ...(barrelUsage !== "referenced" ? { usage: barrelUsage } : {}) }];
      const pathAliasUsage = getPathAliasImportUsage(testFile, normalized, moduleIndex, packageEntry.pathAliasEntries);
      if (pathAliasUsage) return [{ testPath: testFile.path, kind: "tsconfig-path-import", strength: "direct", ...(pathAliasUsage !== "imported" ? { usage: pathAliasUsage } : {}) }];
      const packageEntryUsage = getPackageEntryImportUsage(testFile, normalized, moduleIndex, packageEntry);
      if (packageEntryUsage) return [{ testPath: testFile.path, kind: "package-entry-import", strength: "referenced", ...(packageEntryUsage !== "referenced" ? { usage: packageEntryUsage } : {}) }];
      const transitiveImports = boundedTransitiveImports.get(testFile.path);
      if (transitiveImports?.has(normalized)) {
        const viaUsage = transitiveImports.get(normalized);
        return [{ testPath: testFile.path, kind: "bounded-dependency", strength: "indirect", ...(viaUsage ? { viaUsage } : {}) }];
      }
      if (filenameMatch && !isBrowserE2ETestFile(testFile, packageEntry.browserE2EFrameworks)) {
        return [{ testPath: testFile.path, kind: "filename-convention", strength: "naming" }];
      }
      return [];
    });
}

function isBrowserE2ETestFile(testFile, browserE2EFrameworks) {
  return browserE2EFrameworks?.size > 0 || /(^|\/)cypress\/(?:e2e|integration|component)\//.test(testFile.path) || /\.cy\.[cm]?[jt]sx?$/.test(testFile.path) || /["']@playwright\/test["']/.test(testFile.content);
}

function hasFilenameMatch(testPath, testBase, sourceBase, sourceDir, baseNameCandidates, sourceBaseCandidates, qualifiedBaseCandidates) {
  if (!GENERIC_SOURCE_BASENAMES.has(sourceBase)) return sourceBaseCandidates.has(testBase);
  const testDir = path.posix.dirname(testPath);
  return qualifiedBaseCandidates.has(testBase) || (testDir === sourceDir && baseNameCandidates.has(testBase));
}

function getDirectRelativeImportUsage(testFile, sourcePath) {
  const matchingImports = getModuleImports(testFile).filter(({ specifier }) =>
    specifier.startsWith(".") && moduleSpecifierTargetsSource(testFile.path, specifier, sourcePath)
  );
  if (matchingImports.some(({ assertedImportedNames }) => assertedImportedNames.size > 0)) return "asserted";
  if (matchingImports.some(({ calledImportedNames }) => calledImportedNames.size > 0)) return "called";
  return matchingImports.length > 0 || getRelativeModuleSpecifiers(testFile).some((specifier) =>
    moduleSpecifierTargetsSource(testFile.path, specifier, sourcePath)
  ) ? "imported" : undefined;
}

function collectBoundedTransitiveImports(testFiles, moduleIndex, pathAliasEntries) {
  return new Map(testFiles.map((testFile) => [testFile.path, collectBoundedTransitiveImportsForTest(testFile, moduleIndex, pathAliasEntries)]));
}

function collectBoundedTransitiveImportsForTest(testFile, moduleIndex, pathAliasEntries) {
  const queue = [];
  for (const { specifier, usedImportedNames, calledImportedNames, assertedImportedNames } of getModuleImports(testFile)) {
    const file = findImportedModuleFile(testFile.path, specifier, moduleIndex, pathAliasEntries);
    if (!file) continue;
    const viaUsage = assertedImportedNames.size > 0 ? "asserted" : calledImportedNames.size > 0 ? "called" : undefined;
    queue.push({ file, depth: 0, viaUsage });
    for (const reExport of findImportedReExportFiles(file, usedImportedNames, moduleIndex)) {
      queue.push({ file: reExport, depth: 1, viaUsage });
    }
  }
  const visited = new Map();

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const { file, depth, viaUsage } = queue[cursor];
    if (visited.has(file.path) && usageRank(visited.get(file.path)) >= usageRank(viaUsage)) continue;
    visited.set(file.path, viaUsage);
    if (depth >= MAX_TRANSITIVE_SOURCE_DEPTH) continue;

    for (const specifier of getRuntimeDependencySpecifiers(file)) {
      const dependency = findImportedModuleFile(file.path, specifier, moduleIndex, pathAliasEntries);
      if (dependency) queue.push({ file: dependency, depth: depth + 1, viaUsage });
    }
  }

  return visited;
}

function usageRank(usage) {
  return usage === "asserted" ? 2 : usage === "called" ? 1 : 0;
}

function findImportedModuleFile(importerPath, specifier, moduleIndex, pathAliasEntries) {
  return specifier.startsWith(".")
    ? findRelativeModuleFile(importerPath, specifier, moduleIndex)
    : pathAliasEntries.get(specifier);
}

function findImportedReExportFiles(barrelFile, importedNames, moduleIndex) {
  if (importedNames.size === 0) return [];
  const candidateFiles = new Map(getResolvedRelativeReExports(barrelFile, moduleIndex)
    .map((reExport) => [reExport.target.path, reExport.target]));
  return [...candidateFiles.values()].filter((sourceFile) =>
    sourceFile.path !== barrelFile.path &&
    isSourceFile(sourceFile.path) &&
    barrelExportsImportedNames(barrelFile, sourceFile, importedNames, moduleIndex)
  );
}

function findRelativeModuleFile(importerPath, specifier, moduleIndex) {
  const cacheKey = `${importerPath}\0${specifier}`;
  if (moduleIndex.relativeResolutionCache.has(cacheKey)) {
    return moduleIndex.relativeResolutionCache.get(cacheKey) ?? undefined;
  }

  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importerPath), specifier));
  const requestedExtension = path.posix.extname(resolved);
  const candidates = requestedExtension
    ? [resolved, ...compatibleSourceExtensions(requestedExtension).map((extension) => `${removeJavaScriptExtension(resolved)}${extension}`)]
    : [
        ...SOURCE_EXTENSIONS.map((extension) => `${resolved}${extension}`),
        ...SOURCE_EXTENSIONS.map((extension) => `${resolved}/index${extension}`)
      ];
  const match = [...new Set(candidates)]
    .map((candidate) => moduleIndex.byPath.get(candidate))
    .find((file) => file && isJavaScriptModuleFile(file.path));
  moduleIndex.relativeResolutionCache.set(cacheKey, match ?? null);
  return match;
}

function getOneHopBarrelImportUsage(testFile, sourcePath, moduleIndex) {
  for (const { specifier, usedImportedNames, calledImportedNames, assertedImportedNames } of getModuleImports(testFile)) {
    if (!specifier.startsWith(".")) continue;
    const barrelFile = findRelativeModuleFile(testFile.path, specifier, moduleIndex);
    if (!barrelFile || barrelFile.path === sourcePath) continue;
    const sourceFile = moduleIndex.byPath.get(sourcePath);
    if (!sourceFile || !barrelExportsImportedNames(barrelFile, sourceFile, usedImportedNames, moduleIndex)) continue;
    if (barrelExportsImportedNames(barrelFile, sourceFile, assertedImportedNames, moduleIndex)) return "asserted";
    if (barrelExportsImportedNames(barrelFile, sourceFile, calledImportedNames, moduleIndex)) return "called";
    return "referenced";
  }
  return undefined;
}

function getPathAliasImportUsage(testFile, sourcePath, moduleIndex, pathAliasEntries) {
  for (const moduleImport of getModuleImports(testFile)) {
    const { specifier } = moduleImport;
    const entryFile = pathAliasEntries.get(specifier);
    if (!entryFile) continue;
    const sourceFile = moduleIndex.byPath.get(sourcePath);
    const usage = sourceFile ? getEntrypointImportUsage(moduleImport, entryFile, sourceFile, moduleIndex, "imported") : undefined;
    if (usage) return usage;
  }
  return undefined;
}

function getPackageEntryImportUsage(testFile, sourcePath, moduleIndex, { packageName, packageEntryFiles, packageSubpathEntries }) {
  if (typeof packageName !== "string") return undefined;

  for (const moduleImport of getModuleImports(testFile)) {
    const { specifier } = moduleImport;
    const entryFile = specifier === packageName
      ? packageEntryFiles[moduleImport.kind]
      : packageSubpathEntries.get(specifier)?.[moduleImport.kind];
    if (!entryFile) continue;
    const sourceFile = moduleIndex.byPath.get(sourcePath);
    const usage = sourceFile ? getEntrypointImportUsage(moduleImport, entryFile, sourceFile, moduleIndex, "referenced") : undefined;
    if (usage) return usage;
  }
  return undefined;
}

function getEntrypointImportUsage(moduleImport, entryFile, sourceFile, moduleIndex, structuralUsage) {
  if (entryFile.path === sourceFile.path) {
    if (moduleImport.assertedImportedNames.size > 0) return "asserted";
    if (moduleImport.calledImportedNames.size > 0) return "called";
    return structuralUsage;
  }
  if (!barrelExportsImportedNames(entryFile, sourceFile, moduleImport.usedImportedNames, moduleIndex)) return undefined;
  if (barrelExportsImportedNames(entryFile, sourceFile, moduleImport.assertedImportedNames, moduleIndex)) return "asserted";
  if (barrelExportsImportedNames(entryFile, sourceFile, moduleImport.calledImportedNames, moduleIndex)) return "called";
  return structuralUsage;
}

function barrelExportsImportedNames(barrelFile, sourceFile, importedNames, moduleIndex) {
  if (importedNames.size === 0) return false;
  const reExports = getResolvedRelativeReExports(barrelFile, moduleIndex);

  return [...importedNames].some((name) => {
    const explicitProviders = reExports.filter((reExport) => !reExport.exportAll && reExport.exportedNames.has(name));
    if (explicitProviders.length > 0) {
      return new Set(explicitProviders.map((provider) => provider.target.path)).size === 1 &&
        explicitProviders[0].target.path === sourceFile.path;
    }
    if (name === "default") return false;

    const starProviders = reExports.filter((reExport) =>
      reExport.exportAll && getDeclaredExportNames(reExport.target, moduleIndex).has(name)
    );
    return new Set(starProviders.map((provider) => provider.target.path)).size === 1 &&
      starProviders[0]?.target.path === sourceFile.path;
  });
}

function getResolvedRelativeReExports(barrelFile, moduleIndex) {
  if (!moduleIndex.relativeReExportCache.has(barrelFile.path)) {
    const reExports = collectRelativeReExports(barrelFile.content)
      .map((reExport) => ({
        ...reExport,
        target: findRelativeModuleFile(barrelFile.path, reExport.specifier, moduleIndex)
      }))
      .filter((reExport) => reExport.target);
    moduleIndex.relativeReExportCache.set(barrelFile.path, reExports);
  }
  return moduleIndex.relativeReExportCache.get(barrelFile.path);
}

function getDeclaredExportNames(file, moduleIndex) {
  if (!moduleIndex.declaredExportNamesCache.has(file.path)) {
    moduleIndex.declaredExportNamesCache.set(file.path, collectDeclaredExportNames(file.content));
  }
  return moduleIndex.declaredExportNamesCache.get(file.path);
}

function findSourcePackageEntries(packageData, moduleFiles) {
  if (packageData.exports !== undefined) {
    const rootExport = findPackageRootExport(packageData.exports);
    return {
      import: findSourceFileForExportValue(rootExport, "import", moduleFiles),
      require: findSourceFileForExportValue(rootExport, "require", moduleFiles)
    };
  }

  const candidates = [packageData.source, packageData.module, packageData.main, "src/index", "index"]
    .filter((candidate) => typeof candidate === "string")
    .map((candidate) => candidate.replace(/^\.\//, ""));
  const entryFile = findSourceFileForCandidates(candidates, moduleFiles);
  return { import: entryFile, require: entryFile };
}

function findSourcePackageSubpathEntries(packageData, moduleFiles) {
  const entries = new Map();
  if (typeof packageData.name !== "string" || !packageData.exports || typeof packageData.exports !== "object") {
    return entries;
  }

  for (const [subpath, value] of Object.entries(packageData.exports)) {
    if (!subpath.startsWith("./")) continue;
    const relativeSubpath = subpath.slice(2);
    const entry = {};
    for (const requestKind of ["import", "require"]) {
      const declaredPaths = collectConditionalExportTargets(value, requestKind)
        .map((candidate) => candidate.replace(/^\.\//, ""));
      if (declaredPaths.length === 0) continue;
      const candidates = buildSourceCandidates(declaredPaths, relativeSubpath);
      if (relativeSubpath.includes("*")) {
        addWildcardPackageEntries(entries, packageData.name, relativeSubpath, requestKind, candidates, moduleFiles);
      } else {
        entry[requestKind] = findSourceFileForCandidates(candidates, moduleFiles);
      }
    }
    if (!relativeSubpath.includes("*") && (entry.import || entry.require)) {
      entries.set(`${packageData.name}/${relativeSubpath}`, entry);
    }
  }

  return entries;
}

function findPackageRootExport(exportsValue) {
  if (!exportsValue || typeof exportsValue !== "object" || Array.isArray(exportsValue)) return exportsValue;
  const keys = Object.keys(exportsValue);
  return keys.some((key) => key.startsWith(".")) ? exportsValue["."] : exportsValue;
}

function findSourceFileForExportValue(value, requestKind, moduleFiles) {
  const declaredPaths = collectConditionalExportTargets(value, requestKind)
    .map((candidate) => candidate.replace(/^\.\//, ""));
  return findSourceFileForCandidates(buildSourceCandidates(declaredPaths), moduleFiles);
}

function collectConditionalExportTargets(value, requestKind) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((candidate) => collectConditionalExportTargets(candidate, requestKind));
  if (!value || typeof value !== "object") return [];

  for (const [condition, candidate] of Object.entries(value)) {
    if (condition === "types" || condition.startsWith("types@")) continue;
    if (condition === requestKind || condition === "node" || condition === "default") {
      return collectConditionalExportTargets(candidate, requestKind);
    }
  }
  return [];
}

function buildSourceCandidates(declaredPaths, relativeSubpath) {
  return [
    ...declaredPaths,
    ...declaredPaths.filter((candidate) => candidate.startsWith("dist/")).map((candidate) => candidate.replace(/^dist\//, "src/")),
    ...(relativeSubpath ? [`src/${relativeSubpath}`, relativeSubpath] : [])
  ];
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
    for (const targetPattern of targetPatterns.filter((candidate) => candidate.split("*").length === 2)) {
      const patternMatches = new Map();
      for (const file of moduleFiles.filter((candidate) => isSourceFile(candidate.path))) {
        const wildcardValue = matchWildcardSourcePath(targetPattern, file.path);
        if (wildcardValue === undefined) continue;
        const specifier = aliasPattern.replace("*", wildcardValue);
        const matches = patternMatches.get(specifier) ?? [];
        matches.push(file);
        patternMatches.set(specifier, matches);
      }
      for (const [specifier, matches] of patternMatches) {
        if (entries.has(specifier)) continue;
        const uniqueFiles = [...new Map(matches.map((file) => [file.path, file])).values()];
        if (uniqueFiles.length === 1) entries.set(specifier, uniqueFiles[0]);
      }
    }
  }
  return entries;
}

function addWildcardPackageEntries(entries, packageName, relativeSubpath, requestKind, candidatePatterns, moduleFiles) {
  const resolvedSpecifiers = new Set();
  for (const pattern of candidatePatterns.filter((candidate) => candidate.includes("*"))) {
    const matches = new Map();
    for (const file of moduleFiles.filter((candidate) => isSourceFile(candidate.path))) {
      const wildcardValue = matchWildcardSourcePath(pattern, file.path);
      if (wildcardValue === undefined) continue;
      const current = matches.get(wildcardValue) ?? [];
      current.push(file);
      matches.set(wildcardValue, current);
    }
    for (const [wildcardValue, files] of matches) {
      const uniqueFiles = [...new Map(files.map((file) => [file.path, file])).values()];
      if (uniqueFiles.length !== 1) continue;
      const specifier = `${packageName}/${relativeSubpath.replace("*", wildcardValue)}`;
      if (resolvedSpecifiers.has(specifier)) continue;
      const entry = entries.get(specifier) ?? {};
      entry[requestKind] = uniqueFiles[0];
      entries.set(specifier, entry);
      resolvedSpecifiers.add(specifier);
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
    const matches = moduleFiles.filter(
      (file) => isSourceFile(file.path) && moduleSpecifierTargetsSource("package.json", candidate, file.path)
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return undefined;
  }
  return undefined;
}

function moduleSpecifierTargetsSource(importerPath, specifier, sourcePath) {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importerPath), specifier));
  if (resolved === sourcePath) return true;
  const resolvedExtension = path.posix.extname(resolved);
  const sourceExtension = path.posix.extname(sourcePath);
  const resolvedWithoutExtension = removeJavaScriptExtension(resolved);
  const sourceWithoutExtension = removeJavaScriptExtension(sourcePath);
  return (
    (resolvedWithoutExtension === sourceWithoutExtension && moduleExtensionsAreCompatible(resolvedExtension, sourceExtension)) ||
    (!resolvedExtension && basenameWithoutExtension(sourcePath) === "index" && resolved === path.posix.dirname(sourcePath))
  );
}

function moduleExtensionsAreCompatible(requestedExtension, sourceExtension) {
  if (!requestedExtension) return true;
  if (requestedExtension === sourceExtension) return true;
  return compatibleSourceExtensions(requestedExtension).includes(sourceExtension);
}

function compatibleSourceExtensions(requestedExtension) {
  const substitutions = {
    ".cjs": [".cts"],
    ".js": [".jsx", ".ts", ".tsx"],
    ".jsx": [".tsx"],
    ".mjs": [".mts"]
  };
  return substitutions[requestedExtension] ?? [];
}

function collectRelativeModuleSpecifiers(content) {
  return collectModuleImports(content)
    .map(({ specifier }) => specifier)
    .filter((specifier) => specifier.startsWith("."));
}

function analyzeModuleFile(file) {
  if (!SOURCE_EXTENSIONS.some((extension) => file.path.endsWith(extension))) return file;
  const moduleImports = collectModuleImports(file.content);
  return {
    ...file,
    moduleImports,
    relativeModuleSpecifiers: moduleImports
      .map(({ specifier }) => specifier)
      .filter((specifier) => specifier.startsWith(".")),
    runtimeDependencySpecifiers: moduleImports.map(({ specifier }) => specifier)
  };
}

function createJavaScriptModuleIndex(moduleFiles) {
  return {
    byPath: new Map(moduleFiles.map((file) => [file.path, file])),
    relativeResolutionCache: new Map(),
    relativeReExportCache: new Map(),
    declaredExportNamesCache: new Map()
  };
}

function getModuleImports(file) {
  return file.moduleImports ?? collectModuleImports(file.content);
}

function getRelativeModuleSpecifiers(file) {
  return file.relativeModuleSpecifiers ?? collectRelativeModuleSpecifiers(file.content);
}

function getRuntimeDependencySpecifiers(file) {
  return file.runtimeDependencySpecifiers ?? collectRuntimeDependencySpecifiers(file.content);
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
    if (/^\s*type\b/.test(match[1])) continue;
    imports.push({
      kind: "import",
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
    imports.push({ kind: "require", specifier: match[2], importedNames, usedImportedNames: collectUsedRequireNames(match[1], contentWithoutImports), calledImportedNames: collectCalledRequireNames(match[1], contentWithoutImports), assertedImportedNames: collectAssertedRequireNames(match[1], contentWithoutImports) });
  }
  const namespaceRequirePattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of content.matchAll(namespaceRequirePattern)) {
    const calledImportedNames = collectNamespaceMemberNames(match[1], contentWithoutImports, isIdentifierCalled);
    const assertedImportedNames = collectNamespaceMemberNames(match[1], contentWithoutImports, isIdentifierAsserted);
    if (isIdentifierCalled(contentWithoutImports, match[1])) calledImportedNames.add("default");
    if (isIdentifierAsserted(contentWithoutImports, match[1])) assertedImportedNames.add("default");
    imports.push({
      kind: "require",
      specifier: match[2],
      importedNames: collectNamespaceMemberNames(match[1], contentWithoutImports),
      usedImportedNames: collectNamespaceMemberNames(match[1], contentWithoutImports),
      calledImportedNames,
      assertedImportedNames
    });
  }
  const plainRequirePattern = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of content.matchAll(plainRequirePattern)) {
    if (!imports.some((current) => current.kind === "require" && current.specifier === match[1])) {
      imports.push({ kind: "require", specifier: match[1], importedNames: new Set(), usedImportedNames: new Set(), calledImportedNames: new Set(), assertedImportedNames: new Set() });
    }
  }
  return imports;
}

function collectCalledImportClauseNames(clause, contentWithoutImports) {
  const names = new Set();
  const named = clause.match(/\{([^}]+)\}/)?.[1];
  if (named) {
    for (const part of named.split(",")) {
      if (/^\s*type\b/.test(part)) continue;
      const [imported, local = imported] = part.trim().split(/\s+as\s+/);
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
      if (/^\s*type\b/.test(part)) continue;
      const [imported, local = imported] = part.trim().split(/\s+as\s+/);
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
      if (/^\s*type\b/.test(part)) continue;
      const [imported, local = imported] = part.trim().split(/\s+as\s+/);
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
  if (named) {
    for (const part of named.split(",")) {
      if (/^\s*type\b/.test(part)) continue;
      for (const name of collectAliasedNames(part, "as")) names.add(name);
    }
  }
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
  const declarationPattern = /\bexport\s+(?:async\s+)?(?:function|class|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/g;
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

function isReactHook(currentPath, content, profile) {
  if (!profile.architectures.includes("react")) return false;
  const name = basenameWithoutExtension(currentPath);
  if (!/^use[A-Z0-9]/.test(name)) return false;
  return new RegExp(`\\b(?:function\\s+${escapeRegExp(name)}|(?:const|let|var)\\s+${escapeRegExp(name)}\\b)`).test(content);
}

function byRiskThenName(a, b) {
  const order = { high: 0, medium: 1, low: 2 };
  return order[a.risk] - order[b.risk] || a.name.localeCompare(b.name);
}
