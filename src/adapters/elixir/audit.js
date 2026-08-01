import fs from "node:fs";
import path from "node:path";

const IGNORED_DIRECTORIES = new Set([
  ".elixir_ls", ".git", ".idea", ".vscode", "_build", "coverage", "deps", "node_modules", "vendor"
]);

export function auditElixirRepo(root, options = {}) {
  const absoluteRoot = path.resolve(root);
  const files = readRepoFiles(absoluteRoot);
  const mixFile = files.find((file) => file.path === "mix.exs");
  const project = analyzeMixProject(mixFile?.content);
  const sourceFiles = files.filter((file) => file.path.startsWith("lib/") && file.path.endsWith(".ex"));
  const testFiles = files.filter((file) => file.path.startsWith("test/") && file.path.endsWith("_test.exs"));
  const helper = analyzeTestHelper(files);
  const sourceModules = collectOwnedSourceModules(sourceFiles, project.appModule);
  const runnableTests = collectRunnableTests(testFiles);
  const blockers = buildBlockers({ mixFile, project, sourceFiles, sourceModules, runnableTests, helper });
  const profile = buildProfile(absoluteRoot, mixFile, project, runnableTests, helper, blockers);
  const evidenceBySource = collectEvidence(sourceModules, runnableTests);
  const changedPaths = options.changedPaths
    ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(absoluteRoot, currentPath)))
    : undefined;
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];

  for (const file of sourceFiles.filter((candidate) => !changedPaths || changedPaths.has(candidate.path))) {
    const classification = classifySourceFile(file);
    const owned = sourceModules.find((source) => source.path === file.path);
    const name = owned?.fqn ?? path.basename(file.path, ".ex");
    if (classification.skipReason) {
      skipped.push({
        id: file.path,
        name,
        path: file.path,
        kind: classification.kind,
        signals: classification.signals,
        riskReductionScore: classification.riskReductionScore,
        maintenanceCost: classification.maintenanceCost,
        reason: classification.skipReason
      });
      continue;
    }

    const existingTestEvidence = evidenceBySource.get(file.path) ?? [];
    const existingTestPaths = [...new Set(existingTestEvidence.map((evidence) => evidence.testPath))];
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
        ? [...classification.reasons, "A runnable ExUnit test directly references this owned module."]
        : classification.reasons,
      existingTestPaths,
      ...(existingTestEvidence.length > 0 ? { existingTestEvidence } : {})
    };
    if (existingTestPaths.length > 0) coveredButRisky.push(target);
    else untestedCandidates.push(target);
    if (classification.risk === "high") {
      risks.push(`${name} has ${classification.reasons.join(", ").toLowerCase()} and ${existingTestPaths.length > 0 ? "bounded ExUnit evidence" : "no bounded ExUnit evidence"}.`);
    }
  }

  const recommended = [...untestedCandidates, ...coveredButRisky].sort(byRiskThenName);
  return {
    schemaVersion: "audit/v1",
    profile,
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
    if (current !== root && fs.existsSync(path.join(current, "mix.exs"))) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (IGNORED_DIRECTORIES.has(entry.name) || entry.isSymbolicLink()) continue;
      const absolute = path.join(current, entry.name);
      const relative = normalizePath(path.relative(root, absolute));
      if (entry.isDirectory()) visit(absolute);
      else if (relative === "mix.exs" || relative.endsWith(".ex") || relative.endsWith(".exs")) {
        files.push({ path: relative, content: fs.readFileSync(absolute, "utf8") });
      }
    }
  }
  visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function analyzeMixProject(content) {
  if (content === undefined) return { valid: false };
  const masked = maskCommentsAndStrings(content);
  const modules = [...masked.matchAll(/\bdefmodule\s+([A-Z][A-Za-z0-9_.]*)\s+do\b/g)].map((match) => match[1]);
  const app = /\bapp\s*:\s*:([a-z][a-z0-9_]*)\b/.exec(masked)?.[1];
  const appModule = app ? camelize(app) : undefined;
  const expectedProjectModule = appModule ? `${appModule}.MixProject` : undefined;
  const umbrella = /\bapps_path\s*:/.test(masked);
  const valid = !umbrella && modules.length === 1 && modules[0] === expectedProjectModule && /\buse\s+Mix\.Project\b/.test(masked);
  return { valid, app, appModule, umbrella, module: modules.length === 1 ? modules[0] : undefined };
}

function analyzeTestHelper(files) {
  const file = files.find((candidate) => candidate.path === "test/test_helper.exs");
  const started = Boolean(file && /\bExUnit\.start\s*\(\s*\)/.test(maskCommentsAndStrings(file.content)));
  return { present: Boolean(file), started };
}

function collectOwnedSourceModules(files, appModule) {
  if (!appModule) return [];
  return files.flatMap((file) => {
    const expected = moduleForSourcePath(file.path);
    const modules = declaredModules(file.content);
    return modules.length === 1 && modules[0] === expected && (expected === appModule || expected.startsWith(`${appModule}.`))
      ? [{ path: file.path, fqn: expected }]
      : [];
  });
}

function collectRunnableTests(files) {
  return files.flatMap((file) => {
    const modules = declaredModules(file.content);
    const expected = moduleForTestPath(file.path);
    const masked = maskCommentsAndStrings(file.content);
    const commentsMasked = maskComments(file.content);
    const runnable = modules.length === 1 && modules[0] === expected &&
      /\buse\s+ExUnit\.Case(?:\s*,[^\n]+)?/.test(masked) &&
      /\btest\s+"(?:\\.|[^"\\])*"\s+do\b/.test(commentsMasked);
    return runnable ? [{ file, module: modules[0] }] : [];
  });
}

function buildBlockers({ mixFile, project, sourceFiles, sourceModules, runnableTests, helper }) {
  const blockers = [];
  if (!mixFile) blockers.push("No root mix.exs detected for the bounded Elixir Mix adapter.");
  if (mixFile && project.umbrella) blockers.push("Mix umbrella ownership is outside the initial Elixir adapter boundary.");
  else if (mixFile && !project.valid) blockers.push("mix.exs must declare one literal app and matching MixProject module using Mix.Project.");
  if (sourceFiles.length === 0) blockers.push("No conventional lib/**/*.ex source files were detected.");
  if (sourceFiles.length > 0 && sourceModules.length !== sourceFiles.length) {
    blockers.push("Each owned source file must declare one module matching its conventional lib path and literal app namespace.");
  }
  if (!helper.present || !helper.started) blockers.push("test/test_helper.exs must contain a direct ExUnit.start() call.");
  if (runnableTests.length === 0) blockers.push("No runnable conventional ExUnit *_test.exs module was detected.");
  return blockers;
}

function buildProfile(root, mixFile, project, runnableTests, helper, blockers) {
  return {
    root,
    languages: ["elixir"],
    packageManagers: mixFile ? ["mix"] : [],
    testFrameworks: runnableTests.length > 0 && helper.started ? ["exunit"] : [],
    architectures: project.valid ? ["mix-app"] : [],
    ...(blockers.length === 0 ? { testCommand: "mix test" } : {}),
    detectedConventions: [
      ...(project.valid ? ["literal Mix app ownership"] : []),
      ...(runnableTests.length > 0 ? ["*_test.exs ExUnit modules"] : []),
      ...(helper.started ? ["root ExUnit.start() helper"] : [])
    ],
    existingTestLocations: runnableTests.length > 0 ? ["test/ ExUnit files"] : [],
    setupSignals: [
      ...(mixFile ? ["mix.exs"] : []),
      ...(helper.present ? ["test/test_helper.exs"] : [])
    ],
    confidence: blockers.length === 0 ? "high" : !mixFile || blockers.length > 2 ? "low" : "medium",
    blockers
  };
}

function collectEvidence(sourceModules, runnableTests) {
  const evidence = new Map();
  const byFqn = new Map(sourceModules.map((source) => [source.fqn, source]));
  const byPath = new Map(sourceModules.map((source) => [source.path, source]));
  for (const test of runnableTests) {
    const aliases = collectAliases(test.file.content);
    for (const source of sourceModules) {
      const references = [source.fqn];
      for (const [shortName, fqn] of aliases) {
        if (fqn === source.fqn) references.push(shortName);
      }
      const used = references.filter((reference) => hasRemoteCall(test.file.content, reference));
      if (used.length === 0) continue;
      addEvidence(evidence, source.path, {
        testPath: test.file.path,
        kind: "elixir-module-reference",
        strength: "direct",
        usage: used.some((reference) => hasAssertedRemoteCall(test.file.content, reference)) ? "asserted" : "called"
      });
    }
    const conventionalSourcePath = sourcePathForTestPath(test.file.path);
    const fallback = byPath.get(conventionalSourcePath);
    if (fallback && byFqn.get(fallback.fqn) && !evidence.get(fallback.path)?.some((item) => item.testPath === test.file.path)) {
      addEvidence(evidence, fallback.path, {
        testPath: test.file.path,
        kind: "filename-convention",
        strength: "naming"
      });
    }
  }
  return evidence;
}

function collectAliases(content) {
  const aliases = new Map();
  for (const match of maskComments(content).matchAll(/^\s*alias\s+([A-Z][A-Za-z0-9_.]*)(?:\s*,\s*as:\s*([A-Z][A-Za-z0-9_]*))?\s*$/gm)) {
    const shortName = match[2] ?? match[1].split(".").at(-1);
    aliases.set(shortName, aliases.has(shortName) ? undefined : match[1]);
  }
  return new Map([...aliases].filter(([, fqn]) => fqn));
}

function hasRemoteCall(content, reference) {
  return new RegExp(`\\b${escapeRegExp(reference)}\\.[a-z_][A-Za-z0-9_]*[!?]?\\s*\\(`).test(maskCommentsAndStrings(content));
}

function hasAssertedRemoteCall(content, reference) {
  const escaped = escapeRegExp(reference);
  return new RegExp(`\\b(?:assert|refute)\\s+[^\\n;]{0,1500}\\b${escaped}\\.[a-z_][A-Za-z0-9_]*[!?]?\\s*\\(`).test(maskCommentsAndStrings(content));
}

function classifySourceFile(file) {
  const masked = maskCommentsAndStrings(file.content);
  const functions = [...masked.matchAll(/\bdefp?\s+([a-z_][A-Za-z0-9_]*[!?]?)\b/g)].map((match) => match[1]);
  if (functions.length === 0) {
    return {
      kind: "data-model",
      signals: ["low-runtime-behavior"],
      riskReductionScore: 1,
      maintenanceCost: 1,
      skipReason: "No owned runtime functions were detected in this module."
    };
  }
  const boundary = /(?:Client|Controller|Gateway|Repo|Repository)$/.test(path.basename(file.path, ".ex"));
  const branching = /\b(?:case|cond|if|unless|with|raise|rescue|catch|throw)\b/.test(masked);
  return {
    kind: boundary ? "boundary" : "module",
    signals: [boundary ? "external-boundary" : "runtime-behavior", ...(branching ? ["branching-logic", "edge-case-surface"] : [])],
    risk: boundary || branching ? "high" : "medium",
    testability: boundary ? "medium" : "high",
    testLevel: boundary ? "integration" : "unit",
    riskReductionScore: boundary || branching ? 8 : 6,
    maintenanceCost: boundary ? 5 : 3,
    reasons: [boundary ? "External boundary behavior" : "Owned runtime behavior", ...(branching ? ["Branching or error behavior"] : [])]
  };
}

function declaredModules(content) {
  return [...maskCommentsAndStrings(content).matchAll(/\bdefmodule\s+([A-Z][A-Za-z0-9_.]*)\s+do\b/g)].map((match) => match[1]);
}

function moduleForSourcePath(filePath) {
  return filePath.replace(/^lib\//, "").replace(/\.ex$/, "").split("/").map(camelize).join(".");
}

function moduleForTestPath(filePath) {
  const relative = filePath.replace(/^test\//, "").replace(/_test\.exs$/, "");
  return `${relative.split("/").map(camelize).join(".")}Test`;
}

function sourcePathForTestPath(filePath) {
  return `lib/${filePath.replace(/^test\//, "").replace(/_test\.exs$/, ".ex")}`;
}

function camelize(value) {
  return value.split("_").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function addEvidence(map, sourcePath, item) {
  if (!map.has(sourcePath)) map.set(sourcePath, []);
  map.get(sourcePath).push(item);
}

function maskComments(content) {
  return content.split("\n").map((line) => {
    let quote;
    let escaped = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (escaped) { escaped = false; continue; }
      if (quote && char === "\\") { escaped = true; continue; }
      if (char === '"' || char === "'") { quote = quote === char ? undefined : (quote ?? char); continue; }
      if (char === "#" && !quote) return `${line.slice(0, index)}${" ".repeat(line.length - index)}`;
    }
    return line;
  }).join("\n");
}

function maskCommentsAndStrings(content) {
  return maskComments(content).replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gs, (value) => " ".repeat(value.length));
}

function normalizeChangedPath(root, currentPath) {
  const portable = normalizePath(currentPath);
  if (path.isAbsolute(currentPath)) return normalizePath(path.relative(root, currentPath));
  if (/^[A-Za-z]:\//.test(portable)) {
    const portableRoot = normalizePath(root);
    return portable.startsWith(`${portableRoot}/`) ? portable.slice(portableRoot.length + 1) : portable;
  }
  return portable.replace(/^\.\//, "");
}

function byRiskThenName(left, right) {
  const riskWeight = { high: 0, medium: 1, low: 2 };
  return (riskWeight[left.risk] ?? 3) - (riskWeight[right.risk] ?? 3) || left.name.localeCompare(right.name);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}
