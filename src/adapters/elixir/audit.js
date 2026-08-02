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
  const ambiguousSourceModules = duplicateModuleNames(sourceModules);
  const runnableTests = collectRunnableTests(testFiles, project.appModule);
  const blockers = buildBlockers({ mixFile, project, sourceFiles, sourceModules, ambiguousSourceModules, runnableTests, helper });
  const profile = buildProfile(absoluteRoot, mixFile, project, sourceModules, runnableTests, helper, blockers);
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
  const expectedProjectModules = appModule ? new Set([`${appModule}.MixProject`, `${appModule}.Mixfile`]) : new Set();
  const umbrella = /\bapps_path\s*:/.test(masked);
  const valid = !umbrella && modules.length === 1 && expectedProjectModules.has(modules[0]) && /\buse\s+Mix\.Project\b/.test(masked);
  return { valid, app, appModule, umbrella, module: modules.length === 1 ? modules[0] : undefined };
}

function analyzeTestHelper(files) {
  const file = files.find((candidate) => candidate.path === "test/test_helper.exs");
  const startup = file ? staticExUnitStart(file.content) : undefined;
  return { present: Boolean(file), started: Boolean(startup), literalOptions: startup?.literalOptions ?? false };
}

function staticExUnitStart(content) {
  const literal = String.raw`(?:true|false|nil|-?\d+(?:\.\d+)?|:[a-z][A-Za-z0-9_]*[!?]?)`;
  const option = String.raw`[a-z_][A-Za-z0-9_]*[!?]?\s*:\s*${literal}`;
  const masked = maskCommentsAndStrings(content);
  if ([...masked.matchAll(/\bExUnit\.start\s*\(/g)].length !== 1) return undefined;
  const match = new RegExp(String.raw`^\s*ExUnit\.start\s*\(\s*(${option}(?:\s*,\s*${option})*)?\s*\)\s*$`, "m")
    .exec(masked);
  return match ? { literalOptions: Boolean(match[1]) } : undefined;
}

function collectOwnedSourceModules(files, appModule) {
  if (!appModule) return [];
  return files.flatMap((file) => {
    const expected = sourceModuleCandidates(file.path, appModule);
    const matches = declaredOwnedDefinitions(file.content).flatMap((definition) => {
      const ownership = expected
        .map((candidate) => conventionalModuleOwnership(candidate, definition.fqn, definition.kind))
        .find(Boolean);
      return ownership && (definition.fqn === appModule || definition.fqn.startsWith(`${appModule}.`))
        ? [{ fqn: definition.fqn, ownership }]
        : [];
    });
    return matches.length === 1
      ? [{ path: file.path, ...matches[0] }]
      : [];
  });
}

function conventionalModuleOwnership(expected, declared, declarationKind) {
  const expectedSegments = expected.split(".");
  const declaredSegments = declared.split(".");
  if (expectedSegments.length !== declaredSegments.length) return undefined;
  const expectedPrefix = expectedSegments.slice(0, -1).join(".").toLowerCase();
  const declaredPrefix = declaredSegments.slice(0, -1).join(".").toLowerCase();
  if (expectedPrefix !== declaredPrefix) return undefined;
  const expectedFinal = expectedSegments.at(-1).toLowerCase();
  const declaredFinal = declaredSegments.at(-1).toLowerCase();
  if (expectedFinal === declaredFinal) return expected === declared ? "exact" : "case-normalized";
  return declarationKind === "protocol" && expectedFinal === `${declaredFinal}s`
    ? "terminal-plural"
    : undefined;
}

function collectRunnableTests(files, appModule) {
  if (!appModule) return [];
  return files.flatMap((file) => {
    const modules = declaredModules(file.content);
    const primaryModules = modules.filter(
      (module) => module === `${appModule}Test` || (module.startsWith(`${appModule}.`) && module.endsWith("Test"))
    );
    const masked = maskCommentsAndStrings(file.content);
    const commentsMasked = maskComments(file.content);
    const exUnitCases = [...masked.matchAll(/\buse\s+ExUnit\.Case(?:\s*,[^\n]+)?/g)];
    const testBodies = collectTestBodies(file.content);
    const runnable = primaryModules.length === 1 && modules[0] === primaryModules[0] && exUnitCases.length === 1 &&
      /\btest\s+"(?:\\.|[^"\\])*"\s+do\b/.test(commentsMasked) && testBodies.length > 0;
    return runnable ? [{ file, module: primaryModules[0], bodyContent: testBodies.join("\n") }] : [];
  });
}

function buildBlockers({ mixFile, project, sourceFiles, sourceModules, ambiguousSourceModules, runnableTests, helper }) {
  const blockers = [];
  if (!mixFile) blockers.push("No root mix.exs detected for the bounded Elixir Mix adapter.");
  if (mixFile && project.umbrella) blockers.push("Mix umbrella ownership is outside the initial Elixir adapter boundary.");
  else if (mixFile && !project.valid) blockers.push("mix.exs must declare one literal app and matching MixProject or Mixfile module using Mix.Project.");
  if (sourceFiles.length === 0) blockers.push("No conventional lib/**/*.ex source files were detected.");
  if (sourceFiles.length > 0 && sourceModules.length !== sourceFiles.length) {
    blockers.push("Each owned source file must declare one module matching its conventional lib path and literal app namespace.");
  }
  if (ambiguousSourceModules.length > 0) {
    blockers.push("Each owned Elixir module name must resolve to one conventional source file.");
  }
  if (!helper.present || !helper.started) blockers.push("test/test_helper.exs must contain a direct ExUnit.start() call.");
  if (runnableTests.length === 0) blockers.push("No runnable conventional ExUnit *_test.exs module was detected.");
  return blockers;
}

function buildProfile(root, mixFile, project, sourceModules, runnableTests, helper, blockers) {
  return {
    root,
    languages: ["elixir"],
    packageManagers: mixFile ? ["mix"] : [],
    testFrameworks: runnableTests.length > 0 && helper.started ? ["exunit"] : [],
    architectures: project.valid ? ["mix-app"] : [],
    ...(blockers.length === 0 ? { testCommand: "mix test" } : {}),
    detectedConventions: [
      ...(project.valid ? ["literal Mix app ownership"] : []),
      ...(project.valid && project.module?.endsWith(".Mixfile") ? ["legacy Mixfile project module"] : []),
      ...(sourceModules.some((source) => source.ownership === "case-normalized") ? ["case-normalized source module ownership"] : []),
      ...(sourceModules.some((source) => source.ownership === "terminal-plural") ? ["terminal plural source ownership"] : []),
      ...(runnableTests.length > 0 ? ["*_test.exs ExUnit modules"] : []),
      ...(helper.started ? ["root ExUnit.start() helper"] : []),
      ...(helper.literalOptions ? ["static ExUnit.start options"] : [])
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
  const ambiguousNames = new Set(duplicateModuleNames(sourceModules));
  const unambiguousSources = sourceModules.filter((source) => !ambiguousNames.has(source.fqn));
  const byFqn = new Map(unambiguousSources.map((source) => [source.fqn, source]));
  const byPath = new Map(unambiguousSources.map((source) => [source.path, source]));
  for (const test of runnableTests) {
    const aliases = collectAliases(test.file.content);
    for (const source of unambiguousSources) {
      const references = [source.fqn];
      for (const [shortName, fqn] of aliases) {
        if (fqn === source.fqn) references.push(shortName);
      }
      const used = references.filter((reference) => hasRemoteCall(test.bodyContent, reference));
      if (used.length === 0) continue;
      addEvidence(evidence, source.path, {
        testPath: test.file.path,
        kind: "elixir-module-reference",
        strength: "direct",
        usage: used.some((reference) => hasAssertedRemoteCall(test.bodyContent, reference)) ? "asserted" : "called"
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

function duplicateModuleNames(sourceModules) {
  const counts = new Map();
  for (const source of sourceModules) counts.set(source.fqn, (counts.get(source.fqn) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([fqn]) => fqn).sort();
}

function collectAliases(content) {
  const aliases = new Map();
  for (const match of maskComments(content).matchAll(/^\s*alias\s+([A-Z][A-Za-z0-9_.]*)(?:\s*,\s*as:\s*([A-Z][A-Za-z0-9_]*))?\s*$/gm)) {
    const shortName = match[2] ?? match[1].split(".").at(-1);
    addAlias(aliases, shortName, match[1]);
  }
  for (const match of maskComments(content).matchAll(/^\s*alias\s+([A-Z][A-Za-z0-9_.]*)\.\{([^}\n]+)\}\s*$/gm)) {
    const prefix = match[1];
    for (const member of match[2].split(",").map((value) => value.trim())) {
      if (!/^[A-Z][A-Za-z0-9_.]*$/.test(member)) continue;
      addAlias(aliases, member.split(".").at(-1), `${prefix}.${member}`);
    }
  }
  return new Map([...aliases].filter(([, fqn]) => fqn));
}

function addAlias(aliases, shortName, fqn) {
  aliases.set(shortName, aliases.has(shortName) ? undefined : fqn);
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

function collectTestBodies(content) {
  const commentsMasked = maskComments(content);
  const syntaxMasked = maskCommentsAndStrings(content);
  const bodies = [];
  const headers = commentsMasked.matchAll(/\btest\s+"(?:\\.|[^"\\])*"\s+do\b/g);
  for (const header of headers) {
    const bodyStart = header.index + header[0].length;
    const tokens = syntaxMasked.slice(bodyStart).matchAll(/\b(?:do|fn|end)\b/g);
    let depth = 1;
    for (const token of tokens) {
      if (token[0] === "do") {
        const suffix = syntaxMasked.slice(bodyStart + token.index + token[0].length);
        if (/^\s*:/.test(suffix)) continue;
        depth += 1;
      } else if (token[0] === "fn") {
        depth += 1;
      } else {
        depth -= 1;
        if (depth === 0) {
          bodies.push(content.slice(bodyStart, bodyStart + token.index));
          break;
        }
      }
    }
  }
  return bodies;
}

function declaredOwnedDefinitions(content) {
  return [...maskCommentsAndStrings(content).matchAll(/\bdef(module|protocol)\s+([A-Z][A-Za-z0-9_.]*)\s+do\b/g)]
    .map((match) => ({ kind: match[1], fqn: match[2] }));
}

function sourceModuleCandidates(filePath, appModule) {
  const conventional = moduleForSourcePath(filePath);
  return conventional === appModule || conventional.startsWith(`${appModule}.`)
    ? [conventional]
    : [conventional, `${appModule}.${conventional}`];
}

function moduleForSourcePath(filePath) {
  return filePath.replace(/^lib\//, "").replace(/\.ex$/, "").split("/").map(camelize).join(".");
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
