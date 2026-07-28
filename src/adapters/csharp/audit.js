import fs from "node:fs";
import path from "node:path";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".idea",
  ".vs",
  ".vscode",
  "bin",
  "fixtures",
  "obj",
  "packages",
  "testdata",
  "vendor"
]);

export function auditCSharpRepo(root, options = {}) {
  const files = readRepoFiles(root);
  const projects = files
    .filter((file) => file.path.endsWith(".csproj"))
    .map((file) => ({ ...file, analysis: analyzeProject(file.content) }));
  const layout = selectProjectLayout(projects);
  const testFrameworks = layout.testProject?.analysis.testFrameworks ?? [];
  const testFiles = files.filter((file) => (
    file.path.endsWith(".cs") &&
    isOwnedByProject(file.path, layout.testProject, layout.kind === "pair" ? [layout.sourceProject] : []) &&
    isRunnableTestFile(file, testFrameworks)
  ));
  const sourceFiles = files.filter((file) => (
    file.path.endsWith(".cs") &&
    (
      (layout.kind === "unsupported" && projects.length === 0) ||
      isOwnedByProject(file.path, layout.sourceProject, layout.kind === "pair" ? [layout.testProject] : [])
    ) &&
    !testFiles.includes(file)
  ));
  const profile = buildProfile(root, projects, layout, sourceFiles, testFiles);
  const changedPaths = options.changedPaths
    ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(root, currentPath)))
    : undefined;
  const canCrossProjectEvidence = layout.kind !== "pair" || referencesProjectLiterally(layout.testProject, layout.sourceProject);
  const evidenceBySourcePath = canCrossProjectEvidence ? collectTestEvidence(sourceFiles, testFiles) : new Map();
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];

  for (const file of sourceFiles.filter((candidate) => isIncludedByChangedPaths(candidate.path, changedPaths))) {
    const classification = classifySourceFile(file);
    const name = basenameWithoutExtension(file.path);
    const existingTestEvidence = evidenceBySourcePath.get(file.path) ?? [];
    const existingTestPaths = [...new Set(existingTestEvidence.map((evidence) => evidence.testPath))];

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
        ...(classification.preferredCoveragePath ? { preferredCoveragePath: classification.preferredCoveragePath } : {})
      });
      continue;
    }

    const target = {
      id: file.path,
      name,
      path: file.path,
      kind: classification.kind,
      signals: existingTestPaths.length > 0 ? [...classification.signals, "matching-test"] : classification.signals,
      risk: classification.risk,
      testability: classification.testability,
      recommendedTestLevel: classification.testLevel,
      riskReductionScore: classification.riskReductionScore,
      maintenanceCost: classification.maintenanceCost,
      reasons: existingTestPaths.length > 0
        ? [...classification.reasons, "Existing C# test evidence detected; review missing edge cases"]
        : classification.reasons,
      existingTestPaths,
      ...(existingTestEvidence.length > 0 ? { existingTestEvidence } : {})
    };

    if (existingTestPaths.length > 0) coveredButRisky.push(target);
    else untestedCandidates.push(target);

    if (classification.risk === "high") {
      const coverageState = existingTestPaths.length > 0
        ? "needs edge-case review"
        : "has no matching C# test evidence";
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
    skipped: skipped.sort((left, right) => left.path.localeCompare(right.path)),
    risks
  };
}

function readRepoFiles(root) {
  const files = [];

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      const relative = normalizePath(path.relative(root, absolute));
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (relative.endsWith(".cs") || relative.endsWith(".csproj")) {
        files.push({ path: relative, content: fs.readFileSync(absolute, "utf8") });
      }
    }
  }

  visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function analyzeProject(content) {
  const packageReferences = [...content.matchAll(/<PackageReference\b[^>]*\bInclude\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1].toLowerCase());
  const testFrameworks = [];
  if (packageReferences.some((name) => name === "xunit" || name === "xunit.v3")) testFrameworks.push("xunit");
  if (packageReferences.some((name) => name === "nunit")) testFrameworks.push("nunit");
  if (packageReferences.some((name) => name === "mstest.testframework")) testFrameworks.push("mstest");
  const targetFrameworkMatches = [...content.matchAll(/<TargetFramework>\s*([^<]+?)\s*<\/TargetFramework>/gi)];
  const targetFramework = targetFrameworkMatches.length === 1 && !targetFrameworkMatches[0][1].includes("$")
    ? targetFrameworkMatches[0][1]
    : undefined;
  const sdk = content.match(/<Project\b[^>]*\bSdk\s*=\s*["']([^"']+)["']/i)?.[1];
  const hasTestSdk = packageReferences.includes("microsoft.net.test.sdk");
  const projectReferenceTags = [...content.matchAll(/<ProjectReference\b[^>]*>/gi)].map((match) => match[0]);
  const projectReferences = projectReferenceTags
    .map((tag) => tag.match(/\bInclude\s*=\s*["']([^"']+)["']/i)?.[1])
    .filter(Boolean);

  return {
    sdk,
    sdkStyle: Boolean(sdk?.startsWith("Microsoft.NET.Sdk")),
    targetFramework,
    testFrameworks,
    hasTestSdk,
    isTestProject: /<IsTestProject>\s*true\s*<\/IsTestProject>/i.test(content) || hasTestSdk,
    projectReferences,
    hasProjectReferences: projectReferenceTags.length > 0,
    hasDynamicProjectReferences: projectReferences.length !== projectReferenceTags.length ||
      projectReferences.some((reference) => /[$*?]/.test(reference)) ||
      projectReferenceTags.some((tag) => /\bCondition\s*=/i.test(tag)),
    hasDynamicCompileItems: /<EnableDefaultCompileItems>\s*false\s*<\/EnableDefaultCompileItems>/i.test(content) || /<Compile\b[^>]*(?:Include|Remove|Update)\s*=/i.test(content),
    hasMultipleTargetFrameworks: /<TargetFrameworks>/i.test(content) || targetFrameworkMatches.length > 1
  };
}

function selectProjectLayout(projects) {
  if (projects.length === 0) {
    return { kind: "unsupported", blockers: ["No .csproj detected for the bounded C# SDK project adapter."] };
  }
  if (projects.length === 1) {
    const project = projects[0];
    const blockers = project.path.includes("/")
      ? ["A lone C# project must be rooted at the selected audit directory before source ownership is unambiguous."]
      : [];
    return { kind: "single", sourceProject: project, testProject: project, blockers };
  }
  if (projects.length === 2) {
    const testProjects = projects.filter((project) => project.analysis.isTestProject);
    const sourceProjects = projects.filter((project) => !project.analysis.isTestProject);
    if (testProjects.length === 1 && sourceProjects.length === 1) {
      return {
        kind: "pair",
        sourceProject: sourceProjects[0],
        testProject: testProjects[0],
        blockers: []
      };
    }
  }
  return {
    kind: "unsupported",
    blockers: ["Exactly one root test .csproj or one literal production/test project pair is required before C# command ownership is unambiguous."]
  };
}

function buildProfile(root, projects, layout, sourceFiles, testFiles) {
  const blockers = [...layout.blockers];
  const project = layout.testProject;
  const analysis = project?.analysis ?? analyzeProject("");

  if (layout.kind === "single") {
    if (!analysis.sdkStyle) blockers.push("Only static SDK-style Microsoft.NET.Sdk projects are supported in the first C# slice.");
    if (!analysis.targetFramework) blockers.push("A single static TargetFramework is required for bounded C# command selection.");
    if (analysis.hasMultipleTargetFrameworks) blockers.push("Multi-targeted C# projects are outside the first bounded adapter slice.");
    if (analysis.hasDynamicCompileItems) blockers.push("Custom MSBuild Compile item graphs are outside the first bounded C# source-ownership slice.");
    if (analysis.hasProjectReferences) blockers.push("ProjectReference is supported only for one literal production/test project pair.");
    if (!analysis.isTestProject) blockers.push("The root SDK project is not statically identified as a test project.");
  }

  if (layout.kind === "pair") {
    const sourceAnalysis = layout.sourceProject.analysis;
    const pairAnalyses = [sourceAnalysis, analysis];
    if (pairAnalyses.some((current) => !current.sdkStyle)) blockers.push("Both projects must use a static Microsoft.NET.Sdk project shape.");
    if (pairAnalyses.some((current) => !current.targetFramework)) blockers.push("Both projects require one static TargetFramework for bounded command selection.");
    if (pairAnalyses.some((current) => current.hasMultipleTargetFrameworks)) blockers.push("Multi-targeted C# project pairs are outside the bounded adapter slice.");
    if (pairAnalyses.some((current) => current.hasDynamicCompileItems)) blockers.push("Custom MSBuild Compile item graphs are outside the bounded C# project-pair slice.");
    if (sourceAnalysis.hasProjectReferences || !referencesProjectLiterally(project, layout.sourceProject)) {
      blockers.push("The test project must contain exactly one literal ProjectReference to the production project, with no other project edges.");
    }
    if (sourceAnalysis.targetFramework && analysis.targetFramework && sourceAnalysis.targetFramework !== analysis.targetFramework) {
      blockers.push("The production and test projects must use the same static TargetFramework in this slice.");
    }
  }

  if (analysis.isTestProject && analysis.testFrameworks.length === 0) blockers.push("No supported xUnit, NUnit, or MSTest package reference detected.");
  if (analysis.isTestProject && !analysis.hasTestSdk) blockers.push("Microsoft.NET.Test.Sdk is required for the bounded C# test command.");
  if (testFiles.length === 0) blockers.push("No runnable attributed C# tests detected.");

  const architectures = [];
  if (analysis.sdkStyle) architectures.push("dotnet-sdk-project");
  if (layout.kind === "pair") architectures.push("dotnet-project-pair");
  if (analysis.isTestProject) architectures.push("dotnet-test-project");
  if (layout.sourceProject && !/<OutputType>\s*Exe\s*<\/OutputType>/i.test(layout.sourceProject.content)) architectures.push("library");
  const detectedConventions = [];
  if (analysis.sdkStyle) detectedConventions.push("SDK-style project");
  if (layout.kind === "pair") detectedConventions.push("literal production/test project pair");
  if (analysis.isTestProject) detectedConventions.push(".NET test project");
  if (testFiles.length > 0) detectedConventions.push("attributed C# tests");
  const existingTestLocations = [...new Set(testFiles.map((file) => (
    file.path.includes("/") ? `${path.posix.dirname(file.path)}/ attributed tests` : "project-root attributed tests"
  )))].sort();
  const setupSignals = [];
  if (layout.kind === "pair") setupSignals.push(layout.sourceProject.path);
  if (project) setupSignals.push(project.path);
  if (analysis.sdk) setupSignals.push(analysis.sdk);
  if (analysis.targetFramework) setupSignals.push(analysis.targetFramework);
  const testCommand = project && blockers.length === 0 ? `dotnet test ${project.path}` : undefined;

  return {
    root,
    languages: ["csharp"],
    packageManagers: projects.length > 0 ? ["nuget"] : [],
    testFrameworks: analysis.testFrameworks,
    architectures,
    ...(testCommand ? { testCommand } : {}),
    detectedConventions,
    existingTestLocations,
    setupSignals,
    confidence: scoreProfileConfidence(project, sourceFiles, testFiles, blockers),
    blockers
  };
}

function referencesProjectLiterally(testProject, sourceProject) {
  const analysis = testProject.analysis;
  if (analysis.hasDynamicProjectReferences || analysis.projectReferences.length !== 1) return false;
  const reference = normalizePath(analysis.projectReferences[0]);
  if (path.posix.isAbsolute(reference) || /^[A-Za-z]:\//.test(reference)) return false;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(testProject.path), reference));
  return !resolved.startsWith("../") && resolved === sourceProject.path;
}

function isOwnedByProject(filePath, project, excludedProjects = []) {
  if (!project || !isPathWithinProject(filePath, project.path)) return false;
  return excludedProjects.filter(Boolean).every((excluded) => (
    !isProjectNestedWithin(excluded.path, project.path) || !isPathWithinProject(filePath, excluded.path)
  ));
}

function isPathWithinProject(filePath, projectPath) {
  const projectDirectory = path.posix.dirname(projectPath);
  return projectDirectory === "." || filePath.startsWith(`${projectDirectory}/`);
}

function isProjectNestedWithin(nestedProjectPath, ownerProjectPath) {
  const nestedDirectory = path.posix.dirname(nestedProjectPath);
  const ownerDirectory = path.posix.dirname(ownerProjectPath);
  return nestedDirectory !== ownerDirectory && (ownerDirectory === "." || nestedDirectory.startsWith(`${ownerDirectory}/`));
}

function isRunnableTestFile(file, frameworks) {
  if (!file.path.endsWith(".cs")) return false;
  const masked = maskCSharpCommentsAndStrings(file.content);
  return (frameworks.includes("xunit") && /\[(?:Fact|Theory)\b[^\]]*\]/.test(masked)) ||
    (frameworks.includes("nunit") && /\[(?:Test|TestCase|TestCaseSource)\b[^\]]*\]/.test(masked)) ||
    (frameworks.includes("mstest") && /\[(?:TestMethod|DataTestMethod)\b[^\]]*\]/.test(masked));
}

function collectTestEvidence(sourceFiles, testFiles) {
  const evidence = new Map();
  const sourceTypes = collectUniqueSourceTypes(sourceFiles);

  for (const testFile of testFiles) {
    const masked = maskCSharpCommentsAndStrings(testFile.content);
    for (const [typeName, sourcePath] of sourceTypes) {
      if (declaresType(masked, typeName)) continue;
      const usage = csharpTypeCallUsage(masked, typeName);
      if (usage) {
        addEvidence(evidence, sourcePath, {
          testPath: testFile.path,
          kind: "csharp-symbol-reference",
          strength: "direct",
          usage
        });
      }
    }

    const testStem = basenameWithoutExtension(testFile.path).replace(/(?:Tests?|Specs?)$/, "");
    const filenameMatches = sourceFiles.filter((file) => basenameWithoutExtension(file.path) === testStem);
    if (filenameMatches.length === 1 && !hasEvidenceFromTest(evidence, filenameMatches[0].path, testFile.path)) {
      addEvidence(evidence, filenameMatches[0].path, {
        testPath: testFile.path,
        kind: "filename-convention",
        strength: "naming"
      });
    }
  }

  for (const values of evidence.values()) {
    values.sort((left, right) => left.testPath.localeCompare(right.testPath) || left.kind.localeCompare(right.kind));
  }
  return evidence;
}

function collectUniqueSourceTypes(sourceFiles) {
  const owners = new Map();
  for (const file of sourceFiles) {
    const masked = maskCSharpCommentsAndStrings(file.content);
    for (const match of masked.matchAll(/\b(?:class|record(?:\s+(?:class|struct))?|struct)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
      const paths = owners.get(match[1]) ?? new Set();
      paths.add(file.path);
      owners.set(match[1], paths);
    }
  }
  return new Map([...owners].filter(([, paths]) => paths.size === 1).map(([name, paths]) => [name, [...paths][0]]));
}

function declaresType(content, typeName) {
  return new RegExp(`\\b(?:class|record(?:\\s+(?:class|struct))?|struct)\\s+${escapeRegExp(typeName)}\\b`).test(content);
}

function csharpTypeCallUsage(content, typeName) {
  const escaped = escapeRegExp(typeName);
  const patterns = [
    new RegExp(`\\b${escaped}\\s*\\.\\s*[A-Za-z_][A-Za-z0-9_]*\\s*\\(`, "g"),
    new RegExp(`\\bnew\\s+${escaped}(?:\\s*<[^;{}()]+>)?\\s*\\(`, "g")
  ];
  let usage;
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const statementStart = Math.max(content.lastIndexOf(";", match.index - 1), content.lastIndexOf("{", match.index - 1)) + 1;
      const statementEndMatch = content.slice(match.index).search(/[;}]/);
      const statementEnd = statementEndMatch === -1 ? content.length : match.index + statementEndMatch + 1;
      const statement = content.slice(statementStart, statementEnd);
      const current = /\bAssert\s*\.|\.Should\s*\(/.test(statement) ? "asserted" : "called";
      if (current === "asserted") return current;
      usage = current;
    }
  }
  return usage;
}

function addEvidence(evidence, sourcePath, item) {
  const current = evidence.get(sourcePath) ?? [];
  if (!current.some((candidate) => candidate.testPath === item.testPath && candidate.kind === item.kind)) current.push(item);
  evidence.set(sourcePath, current);
}

function hasEvidenceFromTest(evidence, sourcePath, testPath) {
  return (evidence.get(sourcePath) ?? []).some((item) => item.testPath === testPath);
}

function classifySourceFile(file) {
  const name = basenameWithoutExtension(file.path).toLowerCase();
  const masked = maskCSharpCommentsAndStrings(file.content);
  if (/\.(?:g|generated|designer)\.cs$/i.test(file.path) || /(?:^|\/)assemblyinfo\.cs$/i.test(file.path)) {
    return skippedClassification("generated-code", ["generated-code"], "Generated C# is not a direct test target.", 1, 1);
  }
  if (name === "program" || name === "startup" || /\bWebApplication\.CreateBuilder\s*\(/.test(masked)) {
    return skippedClassification("module-wiring", ["low-runtime-behavior"], "Application startup wiring is better covered through consuming integration behavior.", 1, 3, "integration");
  }
  if (/\b(?:record|class)\s+[A-Za-z_][A-Za-z0-9_]*(?:\s*\([^)]*\))?\s*(?:;|\{\s*(?:public\s+[^;{}]+\{\s*get;\s*(?:init|set);\s*\}\s*)*\})/s.test(masked) && !hasBranching(masked)) {
    return skippedClassification("data-model", ["dto-only"], "Data-only C# models are better exercised through consuming behavior.", 2, 2);
  }
  if (/\binterface\s+[A-Za-z_][A-Za-z0-9_]*/.test(masked) && !/\bclass\s+/.test(masked)) {
    return skippedClassification("contract", ["type-only"], "Interfaces are contracts; test concrete behavior through an implementation.", 1, 2);
  }

  let kind = "utility";
  const signals = [];
  if (name.includes("parser") || /\b(?:Parse|TryParse)\s*\(/.test(masked)) {
    kind = "parser";
    signals.push("pure-logic");
  } else if (name.includes("validator") || /\b(?:Validate|IsValid)\s*\(/.test(masked)) {
    kind = "validator";
    signals.push("pure-logic");
  } else if (name.includes("service")) {
    kind = "service";
    signals.push("service-boundary");
  } else if (name.includes("repository")) {
    kind = "repository";
    signals.push("data-access");
  } else if (name.includes("controller")) {
    kind = "http-controller";
    signals.push("http-route");
  } else if (name.includes("client") || /\bHttpClient\b/.test(masked)) {
    kind = "client";
    signals.push("external-boundary");
  } else if (name.includes("calculator") || name.includes("formatter") || name.includes("mapper")) {
    kind = name.includes("calculator") ? "calculator" : name.includes("formatter") ? "formatter" : "mapper";
    signals.push("pure-logic");
  }

  const branching = hasBranching(masked);
  const edgeCases = /\b(?:throw|TryParse)\b|\?\?|\?\./.test(masked);
  const external = /\b(?:HttpClient|DbContext|File|Directory|Stream|SqlConnection)\b|\bawait\b/.test(masked);
  if (branching) signals.push("branching-logic");
  if (edgeCases) signals.push("edge-case-surface");
  if (external && !signals.includes("external-boundary")) signals.push("external-boundary");
  if (signals.length === 0) signals.push("runtime-behavior");
  const highRisk = external || branching || edgeCases || ["service", "repository", "http-controller", "client"].includes(kind);
  const reasons = [];
  if (branching) reasons.push("Branching C# behavior");
  if (edgeCases) reasons.push("Fallible or edge-case behavior");
  if (external) reasons.push("External or asynchronous boundary");
  if (reasons.length === 0) reasons.push("Deterministic C# behavior");
  return {
    kind,
    signals,
    risk: highRisk ? "high" : "medium",
    testability: external ? "medium" : "high",
    testLevel: external ? "integration" : "unit",
    riskReductionScore: highRisk ? 8 : 6,
    maintenanceCost: external ? 5 : highRisk ? 3 : 2,
    reasons
  };
}

function skippedClassification(kind, signals, skipReason, riskReductionScore, maintenanceCost, preferredCoveragePath) {
  return { kind, signals, skipReason, riskReductionScore, maintenanceCost, preferredCoveragePath };
}

function hasBranching(content) {
  return /\b(?:if|switch|catch)\s*[({]|\bthrow\b/.test(content);
}

function maskCSharpCommentsAndStrings(content) {
  let output = "";
  let index = 0;
  let state = "code";
  while (index < content.length) {
    const current = content[index];
    const next = content[index + 1];
    if (state === "code") {
      if (current === "/" && next === "/") {
        output += "  "; index += 2; state = "line-comment"; continue;
      }
      if (current === "/" && next === "*") {
        output += "  "; index += 2; state = "block-comment"; continue;
      }
      if ((current === "@" || current === "$") && next === '"') {
        output += "  "; index += 2; state = current === "@" ? "verbatim-string" : "string"; continue;
      }
      if (current === "$" && next === "@" && content[index + 2] === '"') {
        output += "   "; index += 3; state = "verbatim-string"; continue;
      }
      if (current === "@" && next === "$" && content[index + 2] === '"') {
        output += "   "; index += 3; state = "verbatim-string"; continue;
      }
      if (current === '"') { output += " "; index += 1; state = "string"; continue; }
      if (current === "'") { output += " "; index += 1; state = "character"; continue; }
      output += current; index += 1; continue;
    }
    if (state === "line-comment") {
      output += current === "\n" ? "\n" : " "; index += 1;
      if (current === "\n") state = "code";
      continue;
    }
    if (state === "block-comment") {
      if (current === "*" && next === "/") { output += "  "; index += 2; state = "code"; continue; }
      output += current === "\n" ? "\n" : " "; index += 1; continue;
    }
    if (state === "verbatim-string") {
      if (current === '"' && next === '"') { output += "  "; index += 2; continue; }
      if (current === '"') { output += " "; index += 1; state = "code"; continue; }
      output += current === "\n" ? "\n" : " "; index += 1; continue;
    }
    if (current === "\\" && index + 1 < content.length) { output += "  "; index += 2; continue; }
    if ((state === "string" && current === '"') || (state === "character" && current === "'")) {
      output += " "; index += 1; state = "code"; continue;
    }
    output += current === "\n" ? "\n" : " "; index += 1;
  }
  return output;
}

function scoreProfileConfidence(project, sourceFiles, testFiles, blockers) {
  if (project && sourceFiles.length > 0 && testFiles.length > 0 && blockers.length === 0) return "high";
  if (project || sourceFiles.length > 0 || testFiles.length > 0) return "medium";
  return "low";
}

function isIncludedByChangedPaths(filePath, changedPaths) {
  return !changedPaths || changedPaths.has(filePath);
}

function normalizeChangedPath(root, currentPath) {
  const normalized = path.isAbsolute(currentPath) ? path.relative(root, currentPath) : currentPath;
  return normalizePath(normalized).replace(/^\.\//, "");
}

function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/");
}

function basenameWithoutExtension(filePath) {
  return path.posix.basename(normalizePath(filePath), path.posix.extname(normalizePath(filePath)));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function byRiskThenName(left, right) {
  const riskOrder = { high: 0, medium: 1, low: 2 };
  return (riskOrder[left.risk] ?? 3) - (riskOrder[right.risk] ?? 3) || left.name.localeCompare(right.name);
}
