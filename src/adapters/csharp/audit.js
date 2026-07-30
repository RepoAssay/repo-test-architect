import fs from "node:fs";
import path from "node:path";
import {
  analyzeDirectoryBuildProps,
  analyzePackageReferenceTag,
  analyzeTargetFrameworkDeclaration,
  findNearestDirectoryBuildProps
} from "./directory-build-props.js";
import {
  analyzeDirectoryPackagesProps,
  findNearestDirectoryPackagesProps
} from "./directory-packages-props.js";

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

const SYSTEM_ROOT_TYPE_NAMES = new Set([
  "Array",
  "Boolean",
  "Byte",
  "Char",
  "Convert",
  "DateTime",
  "DateTimeOffset",
  "Decimal",
  "Double",
  "Exception",
  "Guid",
  "Int16",
  "Int32",
  "Int64",
  "Math",
  "Object",
  "Random",
  "SByte",
  "Single",
  "String",
  "TimeSpan",
  "Tuple",
  "Type",
  "UInt16",
  "UInt32",
  "UInt64",
  "Uri",
  "Version"
]);

export function auditCSharpRepo(root, options = {}) {
  const requestedRepositoryRoot = path.resolve(options.repositoryRoot ?? root);
  const auditRoot = path.resolve(root);
  const rootFromRepository = path.relative(requestedRepositoryRoot, auditRoot);
  const metadataRoot = rootFromRepository === "" || (!rootFromRepository.startsWith("..") && !path.isAbsolute(rootFromRepository))
    ? requestedRepositoryRoot
    : auditRoot;
  const files = readRepoFiles(root);
  const projects = files
    .filter((file) => file.path.endsWith(".csproj"))
    .map((file) => {
      const repositoryProjectPath = normalizePath(path.relative(metadataRoot, path.resolve(auditRoot, file.path)));
      const propsFile = findNearestDirectoryBuildProps(metadataRoot, repositoryProjectPath);
      const propsAnalysis = propsFile ? analyzeDirectoryBuildProps(propsFile.content) : undefined;
      const inherited = propsAnalysis
        ? { ...propsAnalysis, blockers: [...(propsFile.pathBlockers ?? []), ...propsAnalysis.blockers] }
        : undefined;
      const packagesFile = findNearestDirectoryPackagesProps(metadataRoot, repositoryProjectPath);
      const packagesAnalysis = packagesFile ? analyzeDirectoryPackagesProps(packagesFile.content) : undefined;
      const centralPackages = packagesFile
        ? {
            path: packagesFile.path,
            pathBlockers: packagesFile.pathBlockers ?? [],
            ...packagesAnalysis
          }
        : undefined;
      return {
        ...file,
        analysis: analyzeProject(file.content, inherited, propsFile?.path, centralPackages)
      };
    });
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
  const evidenceBySourcePath = canCrossProjectEvidence
    ? collectTestEvidence(sourceFiles, testFiles, { testFrameworks })
    : new Map();
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

function analyzeProject(content, inherited, inheritedPath, centralPackages) {
  const localFramework = analyzeTargetFrameworkDeclaration(content);
  const inheritedTargetFrameworks = inherited?.targetFrameworks ?? (inherited?.targetFramework ? [inherited.targetFramework] : []);
  const targetFrameworks = localFramework.hasDeclaration
    ? localFramework.targetFrameworks
    : inheritedTargetFrameworks;
  const targetFrameworkProperty = localFramework.hasDeclaration
    ? localFramework.property
    : inherited?.targetFrameworkProperty;
  const targetFramework = targetFrameworks.length === 1 ? targetFrameworks[0] : undefined;
  const targetFrameworkBlockers = [...localFramework.blockers];
  if (localFramework.property && inherited?.targetFrameworkProperty &&
    localFramework.property !== inherited.targetFrameworkProperty) {
    targetFrameworkBlockers.push("conflicting inherited target framework metadata");
  }
  const localPackageAnalysis = analyzeLocalPackageReferences(content, targetFrameworks);
  const localPackageReferenceDetails = localPackageAnalysis.references;
  const localPackageReferences = localPackageReferenceDetails.map((reference) => reference.name).filter(Boolean);
  const packageReferenceDetails = [...(inherited?.packageReferenceDetails ?? []), ...localPackageReferenceDetails];
  const packageReferences = [...(inherited?.packageReferences ?? []), ...localPackageReferences];
  const testFrameworks = [];
  if (packageReferences.some((name) => name === "xunit" || name === "xunit.v3")) testFrameworks.push("xunit");
  if (packageReferences.some((name) => name === "nunit")) testFrameworks.push("nunit");
  if (packageReferences.some((name) => name === "mstest.testframework")) testFrameworks.push("mstest");
  const sdk = content.match(/<Project\b[^>]*\bSdk\s*=\s*["']([^"']+)["']/i)?.[1];
  const hasTestSdk = packageReferences.includes("microsoft.net.test.sdk");
  const localIsTestProjectMatches = [...content.matchAll(/<IsTestProject>\s*([^<]+?)\s*<\/IsTestProject>/gi)];
  const localIsTestProject = localIsTestProjectMatches.length === 1
    ? localIsTestProjectMatches[0][1].trim().toLowerCase()
    : undefined;
  const usesInheritedMetadata = Boolean(
    (!localFramework.hasDeclaration && inheritedTargetFrameworks.length > 0) ||
    (localIsTestProject === undefined && inherited?.isTestProject !== undefined) ||
    inherited?.packageReferences.some((name) => [
      "microsoft.net.test.sdk",
      "xunit",
      "xunit.v3",
      "nunit",
      "mstest.testframework"
    ].includes(name))
  );
  const projectReferenceTags = [...content.matchAll(/<ProjectReference\b[^>]*>/gi)].map((match) => match[0]);
  const projectReferences = projectReferenceTags
    .map((tag) => tag.match(/\bInclude\s*=\s*["']([^"']+)["']/i)?.[1])
    .filter(Boolean);
  const centralSetting = analyzeCentralPackageSetting(content);
  const inheritedCentralValues = [
    inherited?.managePackageVersionsCentrally,
    centralPackages?.managePackageVersionsCentrally
  ].filter((value) => value !== undefined);
  const centralPackageBlockers = [...centralSetting.blockers];
  if (centralSetting.value === undefined && new Set(inheritedCentralValues).size > 1) {
    centralPackageBlockers.push("conflicting central package enablement");
  }
  const centralPackagesEnabled = centralSetting.value ?? (
    new Set(inheritedCentralValues).size === 1 ? inheritedCentralValues[0] : undefined
  );
  const hasUnversionedPackageReferences = packageReferenceDetails.some((reference) => (
    reference.name && !reference.hasVersion && !reference.hasVersionOverride
  ));
  const centralPackagesCandidate = centralPackagesEnabled === true || (
    centralPackagesEnabled === undefined && centralPackages && hasUnversionedPackageReferences
  );

  if (centralPackagesCandidate && centralPackagesEnabled !== true) {
    centralPackageBlockers.push("non-literal central package enablement");
  }
  if (centralPackagesEnabled === true) {
    if (!centralPackages) {
      centralPackageBlockers.push("missing Directory.Packages.props");
    } else {
      centralPackageBlockers.push(...centralPackages.pathBlockers, ...centralPackages.blockers);
      if (packageReferenceDetails.some((reference) => !reference.name || reference.hasUpdate)) {
        centralPackageBlockers.push("dynamic package references");
      }
      if (inherited?.hasConditionalPackageReferenceGroups ||
        inherited?.packageReferenceDetails.some((reference) => reference.hasCondition)) {
        centralPackageBlockers.push("conditional package references");
      }
      if (packageReferenceDetails.some((reference) => reference.hasVersion || reference.hasVersionOverride)) {
        centralPackageBlockers.push("project-local package versions");
      }
      const missingVersions = [...new Set(packageReferenceDetails
        .map((reference) => reference.name)
        .filter((name) => name && !centralPackages.packageVersions.has(name)))]
        .sort();
      if (missingVersions.length > 0) {
        centralPackageBlockers.push(`missing central versions for ${missingVersions.join(", ")}`);
      }
    }
  }

  return {
    sdk,
    sdkStyle: Boolean(sdk?.startsWith("Microsoft.NET.Sdk")),
    targetFramework,
    targetFrameworks,
    targetFrameworkProperty,
    isMultiTargeted: targetFrameworkProperty === "TargetFrameworks" && targetFrameworks.length > 1,
    targetFrameworkBlockers: [...new Set(targetFrameworkBlockers)],
    packageReferenceBlockers: localPackageAnalysis.blockers,
    hasTargetConditionedPackageReferences: localPackageAnalysis.hasTargetConditions,
    testFrameworks,
    hasTestSdk,
    isTestProject: (localIsTestProject === "true" || (localIsTestProject === undefined && inherited?.isTestProject === true)) || hasTestSdk,
    projectReferences,
    hasProjectReferences: projectReferenceTags.length > 0,
    hasDynamicProjectReferences: projectReferences.length !== projectReferenceTags.length ||
      projectReferences.some((reference) => /[$*?]/.test(reference)) ||
      projectReferenceTags.some((tag) => /\bCondition\s*=/i.test(tag)),
    hasDynamicCompileItems: /<EnableDefaultCompileItems>\s*false\s*<\/EnableDefaultCompileItems>/i.test(content) || /<Compile\b[^>]*(?:Include|Remove|Update)\s*=/i.test(content),
    inheritedMetadataPath: usesInheritedMetadata ? inheritedPath : undefined,
    inheritedBlockers: inherited?.blockers ?? [],
    centralPackagesEnabled: centralPackagesEnabled === true,
    centralPackagesPath: centralPackagesEnabled === true ? centralPackages?.path : undefined,
    centralPackageBlockers: [...new Set(centralPackageBlockers)]
  };
}

function analyzeLocalPackageReferences(content, targetFrameworks) {
  const source = content.replace(/<!--[\s\S]*?-->/g, (comment) => " ".repeat(comment.length));
  const itemGroups = [...source.matchAll(/<ItemGroup\b([^>]*)>([\s\S]*?)<\/ItemGroup>/gi)].map((match) => ({
    attributes: match[1],
    start: match.index,
    end: match.index + match[0].length
  }));
  const targetSet = new Set(targetFrameworks.map((target) => target.toLowerCase()));
  const blockers = [];
  let hasTargetConditions = false;
  const references = [...source.matchAll(/<PackageReference\b[^>]*(?:\/\s*>|>(?:(?!<PackageReference\b)[\s\S])*?<\/PackageReference\s*>)/gi)].map((match) => {
    const tag = match[0];
    const reference = analyzePackageReferenceTag(tag);
    const group = itemGroups.find((candidate) => match.index > candidate.start && match.index < candidate.end);
    const tagConditions = extractConditionValues(tag);
    const groupConditions = group ? extractConditionValues(group.attributes) : [];
    const tagMentionsCondition = /\bCondition\s*=/i.test(tag);
    const groupMentionsCondition = Boolean(group && /\bCondition\s*=/i.test(group.attributes));

    if ((tagMentionsCondition && tagConditions.length !== 1) ||
      (groupMentionsCondition && groupConditions.length !== 1)) {
      blockers.push("malformed package reference conditions");
      return reference;
    }
    if (tagConditions.length > 0 && groupConditions.length > 0) {
      blockers.push("nested package reference conditions");
      return reference;
    }
    const condition = tagConditions[0] ?? groupConditions[0];
    if (!condition) return reference;
    if (["microsoft.net.test.sdk", "xunit", "xunit.v3", "nunit", "mstest.testframework"].includes(reference.name)) {
      blockers.push("conditional test infrastructure package references");
      return reference;
    }
    const mentionedTargets = packageConditionTargetLiterals(condition);
    const missingTarget = mentionedTargets.find((target) => !targetSet.has(target.toLowerCase()));
    if (missingTarget) {
      blockers.push(`package reference condition target ${missingTarget} is absent from the project target frameworks`);
      return reference;
    }
    const conditionTargets = parseLiteralTargetFrameworkCondition(condition, targetFrameworks);
    if (!conditionTargets) {
      blockers.push("non-literal target package reference conditions");
      return reference;
    }
    hasTargetConditions = true;
    return { ...reference, conditionTargets };
  });

  return {
    references,
    blockers: [...new Set(blockers)],
    hasTargetConditions
  };
}

function extractConditionValues(attributes) {
  return [...attributes.matchAll(/\bCondition\s*=\s*(["'])([\s\S]*?)\1/gi)].map((match) => match[2].trim());
}

function packageConditionTargetLiterals(condition) {
  const literals = [];
  const atomPattern = /(["']?)\s*\$\(\s*TargetFramework\s*\)\s*\1\s*(?:==|!=)\s*(["'])([A-Za-z0-9][A-Za-z0-9._+-]*)\2/gi;
  for (const match of condition.matchAll(atomPattern)) literals.push(match[3]);
  return literals;
}

function parseLiteralTargetFrameworkCondition(condition, targetFrameworks) {
  const parts = condition.trim().split(/\s+(and|or)\s+/i);
  if (parts.length === 0 || parts.length % 2 === 0) return undefined;
  const operators = parts.filter((_, index) => index % 2 === 1).map((operator) => operator.toLowerCase());
  if (new Set(operators).size > 1) return undefined;
  const atoms = parts.filter((_, index) => index % 2 === 0).map((source) => {
    const match = source.match(/^(["']?)\s*\$\(\s*TargetFramework\s*\)\s*\1\s*(==|!=)\s*(["'])([A-Za-z0-9][A-Za-z0-9._+-]*)\3$/i);
    return match ? { comparison: match[2], target: match[4].toLowerCase() } : undefined;
  });
  if (atoms.some((atom) => !atom)) return undefined;
  if (new Set(atoms.map((atom) => atom.comparison)).size > 1) return undefined;
  const declaredTargets = new Set(targetFrameworks.map((target) => target.toLowerCase()));
  if (atoms.some((atom) => !declaredTargets.has(atom.target))) return undefined;
  const selectedTargets = targetFrameworks.filter((target) => {
    const results = atoms.map((atom) => atom.comparison === "=="
      ? target.toLowerCase() === atom.target
      : target.toLowerCase() !== atom.target);
    return operators[0] === "or" ? results.some(Boolean) : results.every(Boolean);
  });
  return selectedTargets.length > 0 && selectedTargets.length < targetFrameworks.length ? selectedTargets : undefined;
}

function analyzeCentralPackageSetting(content) {
  const source = content.replace(/<!--[\s\S]*?-->/g, " ");
  const matches = [...source.matchAll(/<ManagePackageVersionsCentrally\b([^>]*)>\s*([^<]+?)\s*<\/ManagePackageVersionsCentrally>/gi)];
  const blockers = [];
  if (matches.length > 1) blockers.push("repeated project central package metadata");
  if (matches.some((match) => /\bCondition\s*=/i.test(match[1]))) blockers.push("conditional project central package metadata");
  if (matches.some((match) => match[2].includes("$"))) blockers.push("property-expanded project central package metadata");
  if (matches.some((match) => !/^(?:true|false)$/i.test(match[2].trim()))) {
    blockers.push("non-literal project central package metadata");
  }
  const conditionalGroup = [...source.matchAll(/<PropertyGroup\b([^>]*)>([\s\S]*?)<\/PropertyGroup>/gi)]
    .some((match) => /\bCondition\s*=/i.test(match[1]) && /<ManagePackageVersionsCentrally\b/i.test(match[2]));
  if (conditionalGroup ||
    (/<Project\b[^>]*\bCondition\s*=/i.test(source) && matches.length > 0) ||
    (/<(?:Choose|When|Otherwise)\b/i.test(source) && matches.length > 0)) {
    blockers.push("conditional project central package metadata");
  }
  const rawValue = matches.length === 1 ? matches[0][2].trim().toLowerCase() : undefined;
  return {
    value: rawValue === "true" ? true : rawValue === "false" ? false : undefined,
    blockers
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
  if (projects.length > 2) {
    const testProjects = projects.filter((project) => project.analysis.isTestProject);
    const sourceProjects = projects.filter((project) => !project.analysis.isTestProject);
    const literalPairs = testProjects.flatMap((testProject) => (
      sourceProjects
        .filter((sourceProject) => referencesProjectLiterally(testProject, sourceProject))
        .map((sourceProject) => ({ sourceProject, testProject }))
    ));
    if (literalPairs.length === 1) {
      const selectedProjects = new Set([literalPairs[0].sourceProject, literalPairs[0].testProject]);
      const unrelatedProjects = projects.filter((project) => !selectedProjects.has(project));
      const hasOverlappingProject = unrelatedProjects.some((project) => (
        [...selectedProjects].some((selected) => projectDirectoriesOverlap(project.path, selected.path))
      ));
      if (hasOverlappingProject) {
        return {
          kind: "unsupported",
          blockers: ["The unique C# production/test edge overlaps another project's default compile ownership."]
        };
      }
      return {
        kind: "pair",
        ...literalPairs[0],
        unrelatedProjectCount: unrelatedProjects.length,
        blockers: []
      };
    }
  }
  return {
    kind: "unsupported",
    blockers: ["Exactly one root test .csproj or one unique literal production/test project edge is required before C# command ownership is unambiguous."]
  };
}

function buildProfile(root, projects, layout, sourceFiles, testFiles) {
  const blockers = [...layout.blockers];
  const project = layout.testProject;
  const analysis = project?.analysis ?? analyzeProject("");

  const inheritedBlockers = [...new Set([
    ...(layout.sourceProject?.analysis.inheritedBlockers ?? []),
    ...(layout.testProject?.analysis.inheritedBlockers ?? [])
  ])];
  if (inheritedBlockers.length > 0) {
    blockers.push(`Directory.Build.props requires unsupported MSBuild evaluation: ${inheritedBlockers.join(", ")}.`);
  }
  const targetFrameworkBlockers = [...new Set([
    ...(layout.sourceProject?.analysis.targetFrameworkBlockers ?? []),
    ...(layout.testProject?.analysis.targetFrameworkBlockers ?? [])
  ])];
  if (targetFrameworkBlockers.length > 0) {
    blockers.push(`C# target framework metadata requires unsupported MSBuild evaluation: ${targetFrameworkBlockers.join(", ")}.`);
  }
  const packageReferenceBlockers = [...new Set([
    ...(layout.sourceProject?.analysis.packageReferenceBlockers ?? []),
    ...(layout.testProject?.analysis.packageReferenceBlockers ?? [])
  ])];
  if (packageReferenceBlockers.length > 0) {
    blockers.push(`C# package references require unsupported MSBuild evaluation: ${packageReferenceBlockers.join(", ")}.`);
  }
  const centralPackageBlockers = [...new Set([
    ...(layout.sourceProject?.analysis.centralPackageBlockers ?? []),
    ...(layout.testProject?.analysis.centralPackageBlockers ?? [])
  ])];
  if (centralPackageBlockers.length > 0) {
    blockers.push(`Directory.Packages.props requires unsupported central package evaluation: ${centralPackageBlockers.join(", ")}.`);
  }

  if (layout.kind === "single") {
    if (!analysis.sdkStyle) blockers.push("Only static SDK-style Microsoft.NET.Sdk projects are supported in the first C# slice.");
    if (analysis.targetFrameworks.length === 0) blockers.push("At least one static TargetFramework or TargetFrameworks value is required for bounded C# command selection.");
    if (analysis.hasDynamicCompileItems) blockers.push("Custom MSBuild Compile item graphs are outside the first bounded C# source-ownership slice.");
    if (analysis.hasProjectReferences) blockers.push("ProjectReference is supported only for one literal production/test project pair.");
    if (!analysis.isTestProject) blockers.push("The root SDK project is not statically identified as a test project.");
  }

  if (layout.kind === "pair") {
    const sourceAnalysis = layout.sourceProject.analysis;
    const pairAnalyses = [sourceAnalysis, analysis];
    if (pairAnalyses.some((current) => !current.sdkStyle)) blockers.push("Both projects must use a static Microsoft.NET.Sdk project shape.");
    if (pairAnalyses.some((current) => current.targetFrameworks.length === 0)) blockers.push("Both projects require static TargetFramework or TargetFrameworks values for bounded command selection.");
    if (pairAnalyses.some((current) => current.hasDynamicCompileItems)) blockers.push("Custom MSBuild Compile item graphs are outside the bounded C# project-pair slice.");
    if (sourceAnalysis.hasProjectReferences || !referencesProjectLiterally(project, layout.sourceProject)) {
      blockers.push("The test project must contain exactly one literal ProjectReference to the production project, with no other project edges.");
    }
    const sourceTargets = new Set(sourceAnalysis.targetFrameworks.map((target) => target.toLowerCase()));
    if (analysis.targetFrameworks.some((target) => !sourceTargets.has(target.toLowerCase()))) {
      blockers.push("Every test target framework must be listed literally by the production project in this bounded slice.");
    }
  }

  if (analysis.isTestProject && analysis.testFrameworks.length === 0) blockers.push("No supported xUnit, NUnit, or MSTest package reference detected.");
  if (analysis.isTestProject && !analysis.hasTestSdk) blockers.push("Microsoft.NET.Test.Sdk is required for the bounded C# test command.");
  if (testFiles.length === 0) blockers.push("No runnable attributed C# tests detected.");

  const architectures = [];
  if (analysis.sdkStyle) architectures.push("dotnet-sdk-project");
  if (layout.kind === "pair") architectures.push("dotnet-project-pair");
  if (layout.sourceProject?.analysis.isMultiTargeted || layout.testProject?.analysis.isMultiTargeted) architectures.push("dotnet-multi-target-project");
  if (analysis.isTestProject) architectures.push("dotnet-test-project");
  if (layout.sourceProject && !/<OutputType>\s*Exe\s*<\/OutputType>/i.test(layout.sourceProject.content)) architectures.push("library");
  const detectedConventions = [];
  if (analysis.sdkStyle) detectedConventions.push("SDK-style project");
  if (layout.kind === "pair") detectedConventions.push("literal production/test project pair");
  if (layout.sourceProject?.analysis.isMultiTargeted || layout.testProject?.analysis.isMultiTargeted) {
    detectedConventions.push("literal multi-target framework ownership");
  }
  if (layout.unrelatedProjectCount > 0) detectedConventions.push("unique literal test edge among unrelated projects");
  if (analysis.isTestProject) detectedConventions.push(".NET test project");
  if (layout.sourceProject?.analysis.inheritedMetadataPath || layout.testProject?.analysis.inheritedMetadataPath) {
    detectedConventions.push("inherited Directory.Build.props metadata");
  }
  if (layout.sourceProject?.analysis.centralPackagesEnabled || layout.testProject?.analysis.centralPackagesEnabled) {
    detectedConventions.push("bounded central package management");
  }
  if (layout.sourceProject?.analysis.hasTargetConditionedPackageReferences ||
    layout.testProject?.analysis.hasTargetConditionedPackageReferences) {
    detectedConventions.push("literal target-conditioned package references");
  }
  if (testFiles.length > 0) detectedConventions.push("attributed C# tests");
  const existingTestLocations = [...new Set(testFiles.map((file) => (
    file.path.includes("/") ? `${path.posix.dirname(file.path)}/ attributed tests` : "project-root attributed tests"
  )))].sort();
  const setupSignals = [];
  if (layout.kind === "pair") setupSignals.push(layout.sourceProject.path);
  if (project) setupSignals.push(project.path);
  if (analysis.sdk) setupSignals.push(analysis.sdk);
  for (const targetFrameworks of [...new Set([
    layout.sourceProject?.analysis.targetFrameworks.join(";"),
    layout.testProject?.analysis.targetFrameworks.join(";")
  ].filter(Boolean))]) setupSignals.push(targetFrameworks);
  for (const inheritedPath of [...new Set([
    layout.sourceProject?.analysis.inheritedMetadataPath,
    layout.testProject?.analysis.inheritedMetadataPath
  ].filter(Boolean))]) setupSignals.push(inheritedPath);
  for (const centralPackagesPath of [...new Set([
    layout.sourceProject?.analysis.centralPackagesPath,
    layout.testProject?.analysis.centralPackagesPath
  ].filter(Boolean))]) setupSignals.push(centralPackagesPath);
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

function projectDirectoriesOverlap(leftProjectPath, rightProjectPath) {
  const leftDirectory = path.posix.dirname(leftProjectPath);
  const rightDirectory = path.posix.dirname(rightProjectPath);
  return leftDirectory === rightDirectory ||
    leftDirectory === "." ||
    rightDirectory === "." ||
    leftDirectory.startsWith(`${rightDirectory}/`) ||
    rightDirectory.startsWith(`${leftDirectory}/`);
}

function isRunnableTestFile(file, frameworks) {
  if (!file.path.endsWith(".cs")) return false;
  const masked = maskCSharpCommentsAndStrings(file.content);
  return (frameworks.includes("xunit") && /\[(?:Fact|Theory)\b[^\]]*\]/.test(masked)) ||
    (frameworks.includes("nunit") && /\[(?:Test|TestCase|TestCaseSource)\b[^\]]*\]/.test(masked)) ||
    (frameworks.includes("mstest") && /\[(?:TestMethod|DataTestMethod)\b[^\]]*\]/.test(masked));
}

function collectTestEvidence(sourceFiles, testFiles, { testFrameworks = [] } = {}) {
  const evidence = new Map();
  const sourceTypes = collectUniqueSourceTypes(sourceFiles);
  const sourceTypeAliasPatterns = collectSourceTypeAliasPatterns(sourceTypes, sourceFiles);

  for (const testFile of testFiles) {
    const masked = maskCSharpCommentsAndStrings(testFile.content);
    const typeReferenceContext = {
      importsSystemNamespace: /^\s*using\s+System\s*;/m.test(masked),
      explicitSourceAliases: collectExplicitSourceTypeAliases(masked, sourceTypeAliasPatterns)
    };
    const expectedExceptionTypes = testFrameworks.includes("mstest")
      ? collectExpectedExceptionAssertedTypes(masked, sourceTypes, typeReferenceContext)
      : new Set();
    const exceptionAssertionTypes = collectExceptionAssertionAssertedTypes(
      masked,
      sourceTypes,
      testFrameworks,
      typeReferenceContext
    );
    const helperEvidence = collectOneHopTestHelperEvidence(
      masked,
      sourceTypes,
      testFrameworks,
      typeReferenceContext
    );
    for (const [typeName, sourcePath] of sourceTypes) {
      if (declaresType(masked, typeName)) continue;
      const detectedUsage = csharpTypeCallUsage(masked, typeName, testFrameworks, typeReferenceContext);
      const usage = expectedExceptionTypes.has(typeName) || exceptionAssertionTypes.has(typeName)
        ? "asserted"
        : detectedUsage;
      if (usage) {
        addEvidence(evidence, sourcePath, {
          testPath: testFile.path,
          kind: "csharp-symbol-reference",
          strength: "direct",
          usage
        });
      } else if (helperEvidence.has(typeName)) {
        addEvidence(evidence, sourcePath, {
          testPath: testFile.path,
          kind: "csharp-test-helper",
          strength: "indirect",
          viaUsage: helperEvidence.get(typeName)
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

function collectSourceTypeAliasPatterns(sourceTypes, sourceFiles) {
  const sourceFilesByPath = new Map(sourceFiles.map((file) => [file.path, file]));
  const patterns = new Map();

  for (const [typeName, sourcePath] of sourceTypes) {
    const sourceContent = sourceFilesByPath.get(sourcePath)?.content ?? "";
    const namespaceMatches = [...sourceContent.matchAll(/\bnamespace\s+([A-Za-z_][A-Za-z0-9_.]*)\s*(?:[;{])/g)];
    if (namespaceMatches.length !== 1) continue;
    const qualifiedType = `${namespaceMatches[0][1]}.${typeName}`;
    patterns.set(typeName, new RegExp(
      `^\\s*using\\s+${escapeRegExp(typeName)}\\s*=\\s*(?:global\\s*::\\s*)?${escapeRegExp(qualifiedType)}\\s*;`,
      "m"
    ));
  }

  return patterns;
}

function collectExplicitSourceTypeAliases(content, sourceTypeAliasPatterns) {
  const aliases = new Set();
  for (const [typeName, pattern] of sourceTypeAliasPatterns) {
    if (pattern.test(content)) aliases.add(typeName);
  }

  return aliases;
}

function declaresType(content, typeName) {
  return new RegExp(`\\b(?:class|record(?:\\s+(?:class|struct))?|struct)\\s+${escapeRegExp(typeName)}\\b`).test(content);
}

function csharpTypeCallUsage(content, typeName, testFrameworks, typeReferenceContext) {
  const escaped = escapeRegExp(typeName);
  const testBodies = collectRunnableTestBodies(content);
  const patterns = [
    new RegExp(`\\b${escaped}\\s*\\.\\s*[A-Za-z_][A-Za-z0-9_]*\\s*\\(`, "g"),
    new RegExp(`\\bnew\\s+${escaped}(?:\\s*<[^;{}()]+>)?\\s*\\(`, "g")
  ];
  let usage;
  for (const body of testBodies) {
    for (const pattern of patterns) {
      for (const match of body.matchAll(pattern)) {
        if (!isEligibleSourceTypeReference(body, typeName, typeReferenceIndex(match, typeName), typeReferenceContext)) continue;
        if (braceDepthAt(body, match.index) !== 0) continue;
        const statement = statementAt(body, match.index);
        if (statement.text.slice(0, match.index - statement.start).includes("=>")) continue;
        const current = isAssertionStatement(statement.text, testFrameworks) ? "asserted" : "called";
        if (current === "asserted") return current;
        usage = current;
      }
    }
  }
  const fieldUsage = csharpReadonlyFieldReceiverUsage(
    content,
    typeName,
    testFrameworks,
    typeReferenceContext
  );
  if (fieldUsage === "asserted") return fieldUsage;
  if (fieldUsage === "called") usage = fieldUsage;
  for (const body of testBodies) {
    const directResultUsage = csharpDirectTypeResultUsage(
      body,
      typeName,
      testFrameworks,
      typeReferenceContext
    );
    if (directResultUsage === "asserted") return directResultUsage;
    const receiverUsage = csharpLocalReceiverUsage(body, typeName, testFrameworks, typeReferenceContext);
    if (receiverUsage === "asserted") return receiverUsage;
    if (receiverUsage === "called") usage = receiverUsage;
  }
  return usage;
}

function collectRunnableTests(content, attributeDepth) {
  const tests = [];
  const bodyStarts = new Set();
  const attributePattern = /\[(?:Fact|Theory|Test|TestCase|TestCaseSource|TestMethod|DataTestMethod)\b[^\]]*\]/g;

  for (const attribute of content.matchAll(attributePattern)) {
    if (attributeDepth !== undefined && braceDepthAt(content, attribute.index) !== attributeDepth) continue;
    const signatureStart = attribute.index + attribute[0].length;
    const bodyStart = content.indexOf("{", signatureStart);
    if (bodyStart === -1 || bodyStarts.has(bodyStart)) continue;
    const signature = content.slice(signatureStart, bodyStart);
    if (signature.includes(";") || !/\([^;{}]*\)\s*$/.test(signature)) continue;
    const bodyEnd = matchingBraceIndex(content, bodyStart);
    if (bodyEnd === -1) continue;
    bodyStarts.add(bodyStart);
    tests.push({
      body: content.slice(bodyStart + 1, bodyEnd),
      signature,
      expectedException: /\bExpectedException(?:Attribute)?\s*\(/.test(content.slice(attribute.index, bodyStart))
    });
  }

  return tests;
}

function collectRunnableTestBodies(content) {
  return collectRunnableTests(content).map((test) => test.body);
}

function collectExpectedExceptionAssertedTypes(content, sourceTypes, typeReferenceContext) {
  const assertedTypes = new Set();

  for (const test of collectRunnableTests(content)) {
    if (!test.expectedException) continue;
    const eligibleCalls = [];

    for (const [typeName] of sourceTypes) {
      const escapedType = escapeRegExp(typeName);
      const patterns = [
        new RegExp(`\\b${escapedType}\\s*\\.\\s*[A-Za-z_][A-Za-z0-9_]*\\s*\\(`, "g"),
        new RegExp(`\\bnew\\s+${escapedType}(?:\\s*<[^;{}()=]+>)?\\s*\\(`, "g")
      ];

      for (const pattern of patterns) {
        for (const call of test.body.matchAll(pattern)) {
          if (!isEligibleSourceTypeReference(
            test.body,
            typeName,
            typeReferenceIndex(call, typeName),
            typeReferenceContext
          )) continue;
          if (!isSoleDirectCallStatement(test.body, call.index)) continue;
          eligibleCalls.push(typeName);
        }
      }
    }

    if (eligibleCalls.length === 1) assertedTypes.add(eligibleCalls[0]);
  }

  return assertedTypes;
}

function collectExceptionAssertionAssertedTypes(content, sourceTypes, testFrameworks, typeReferenceContext) {
  const methodNames = [];
  if (testFrameworks.includes("xunit")) methodNames.push("Throws", "ThrowsAny", "ThrowsAsync", "ThrowsAnyAsync");
  if (testFrameworks.includes("nunit")) methodNames.push("Throws", "ThrowsAsync", "Catch", "CatchAsync");
  if (testFrameworks.includes("mstest")) {
    methodNames.push("ThrowsException", "ThrowsExceptionAsync", "ThrowsExactly", "ThrowsExactlyAsync");
  }
  if (methodNames.length === 0) return new Set();

  const assertedTypes = new Set();
  const assertionPattern = new RegExp(
    `\\bAssert\\s*\\.\\s*(?:${[...new Set(methodNames)].join("|")})(?:\\s*<[^;{}()]+>)?\\s*\\(`,
    "g"
  );

  for (const test of collectRunnableTests(content)) {
    for (const assertion of test.body.matchAll(assertionPattern)) {
      if (braceDepthAt(test.body, assertion.index) !== 0) continue;
      const statement = statementAt(test.body, assertion.index);
      const assertionOffset = assertion.index - statement.start;
      if (!/^\s*(?:await\s+)?$/.test(statement.text.slice(0, assertionOffset))) continue;

      const assertionOpening = assertion.index + assertion[0].lastIndexOf("(");
      const assertionClosing = matchingParenthesisIndex(test.body, assertionOpening);
      if (assertionClosing === -1 || !/^\s*;\s*$/.test(test.body.slice(assertionClosing + 1, statement.end))) continue;
      const argumentsText = test.body.slice(assertionOpening + 1, assertionClosing);
      const eligibleCalls = collectDirectExceptionLambdaCalls(
        argumentsText,
        sourceTypes,
        typeReferenceContext
      );
      if (eligibleCalls.length === 1) assertedTypes.add(eligibleCalls[0]);
    }
  }

  return assertedTypes;
}

function collectDirectExceptionLambdaCalls(argumentsText, sourceTypes, typeReferenceContext) {
  const calls = [];

  for (const [typeName] of sourceTypes) {
    const escapedType = escapeRegExp(typeName);
    const patterns = [
      new RegExp(`\\b${escapedType}\\s*\\.\\s*[A-Za-z_][A-Za-z0-9_]*\\s*\\(`, "g"),
      new RegExp(`\\bnew\\s+${escapedType}(?:\\s*<[^;{}()=]+>)?\\s*\\(`, "g")
    ];

    for (const pattern of patterns) {
      for (const call of argumentsText.matchAll(pattern)) {
        if (!isEligibleSourceTypeReference(
          argumentsText,
          typeName,
          typeReferenceIndex(call, typeName),
          typeReferenceContext
        )) continue;
        const prefix = argumentsText.slice(0, call.index);
        if (!/^\s*(?:async\s+)?\(\s*\)\s*=>\s*(?:await\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\s*\.\s*)*$/.test(prefix)) continue;
        const callOpening = argumentsText.indexOf("(", call.index);
        const callClosing = callOpening === -1 ? -1 : matchingParenthesisIndex(argumentsText, callOpening);
        if (callClosing === -1 || !/^\s*(?:,\s*[\s\S]*)?$/.test(argumentsText.slice(callClosing + 1))) continue;
        if (countSourceTypeCalls(argumentsText, sourceTypes, typeReferenceContext) !== 1) continue;
        calls.push(typeName);
      }
    }
  }

  return calls;
}

function countSourceTypeCalls(content, sourceTypes, typeReferenceContext) {
  let count = 0;
  for (const [typeName] of sourceTypes) {
    const escapedType = escapeRegExp(typeName);
    const calls = content.matchAll(new RegExp(
      `\\b(?:${escapedType}\\s*\\.\\s*[A-Za-z_][A-Za-z0-9_]*|new\\s+${escapedType}(?:\\s*<[^;{}()=]+>)?)\\s*\\(`,
      "g"
    ));
    for (const call of calls) {
      if (isEligibleSourceTypeReference(
        content,
        typeName,
        typeReferenceIndex(call, typeName),
        typeReferenceContext
      )) count += 1;
    }
  }
  return count;
}

function collectOneHopTestHelperEvidence(content, sourceTypes, testFrameworks, typeReferenceContext) {
  const evidence = new Map();

  for (const classBody of collectClassBodies(content)) {
    const tests = collectRunnableTests(classBody.body, 0);
    const helpers = collectPrivateStaticHelpers(classBody.body);
    const helperNameCounts = new Map();
    for (const helper of helpers) helperNameCounts.set(helper.name, (helperNameCounts.get(helper.name) ?? 0) + 1);

    for (const helper of helpers) {
      if (helperNameCounts.get(helper.name) !== 1) continue;
      if (!tests.some((test) => testCallsHelperDirectly(test, helper.name))) continue;
      const sourceCalls = collectTopLevelSourceTypeCalls(
        helper.body,
        sourceTypes,
        typeReferenceContext
      );
      if (sourceCalls.length !== 1) continue;

      const sourceCall = sourceCalls[0];
      const statement = statementAt(helper.body, sourceCall.index).text;
      const viaUsage = isAssertionStatement(statement, testFrameworks) ||
        csharpDirectTypeResultUsage(
          helper.body,
          sourceCall.typeName,
          testFrameworks,
          typeReferenceContext
        ) === "asserted"
        ? "asserted"
        : "called";
      if (viaUsage === "asserted" || !evidence.has(sourceCall.typeName)) {
        evidence.set(sourceCall.typeName, viaUsage);
      }
    }
  }

  return evidence;
}

function collectPrivateStaticHelpers(classBody) {
  const helpers = [];
  const helperPattern = /\bprivate\s+static\s+(?:async\s+)?[A-Za-z_][A-Za-z0-9_.<>,?\[\]]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*\{/g;

  for (const declaration of classBody.matchAll(helperPattern)) {
    if (braceDepthAt(classBody, declaration.index) !== 0) continue;
    const bodyStart = declaration.index + declaration[0].lastIndexOf("{");
    const bodyEnd = matchingBraceIndex(classBody, bodyStart);
    if (bodyEnd === -1) continue;
    helpers.push({
      name: declaration[1],
      body: classBody.slice(bodyStart + 1, bodyEnd)
    });
  }

  return helpers;
}

function testCallsHelperDirectly(test, helperName) {
  const escaped = escapeRegExp(helperName);
  const localDeclaration = new RegExp(
    `\\b(?:void|[A-Za-z_][A-Za-z0-9_.<>,?\\[\\]]*)\\s+${escaped}\\s*\\([^;{}]*\\)\\s*(?:=>|\\{)`
  );
  if (localDeclaration.test(test.body)) return false;

  const callPattern = new RegExp(`\\b${escaped}\\s*\\(`, "g");
  for (const call of test.body.matchAll(callPattern)) {
    if (braceDepthAt(test.body, call.index) !== 0 || test.body[call.index - 1] === ".") continue;
    const statement = statementAt(test.body, call.index);
    if (!statement.text.slice(0, call.index - statement.start).includes("=>")) return true;
  }
  return false;
}

function collectTopLevelSourceTypeCalls(content, sourceTypes, typeReferenceContext) {
  const calls = [];

  for (const [typeName] of sourceTypes) {
    const escapedType = escapeRegExp(typeName);
    const patterns = [
      new RegExp(`\\b${escapedType}\\s*\\.\\s*[A-Za-z_][A-Za-z0-9_]*\\s*\\(`, "g"),
      new RegExp(`\\bnew\\s+${escapedType}(?:\\s*<[^;{}()=]+>)?\\s*\\(`, "g")
    ];
    for (const pattern of patterns) {
      for (const call of content.matchAll(pattern)) {
        if (!isEligibleSourceTypeReference(
          content,
          typeName,
          typeReferenceIndex(call, typeName),
          typeReferenceContext
        )) continue;
        if (braceDepthAt(content, call.index) !== 0) continue;
        const statement = statementAt(content, call.index);
        if (statement.text.slice(0, call.index - statement.start).includes("=>")) continue;
        calls.push({ typeName, index: call.index });
      }
    }
  }

  return calls;
}

function isSoleDirectCallStatement(body, callIndex) {
  if (braceDepthAt(body, callIndex) !== 0) return false;
  const statement = statementAt(body, callIndex);
  if (body.slice(0, statement.start).trim() || body.slice(statement.end).trim()) return false;
  const callOffset = callIndex - statement.start;
  const prefix = statement.text.slice(0, callOffset);
  if (!/^\s*(?:[A-Za-z_][A-Za-z0-9_]*\s*\.\s*)*$/.test(prefix)) return false;
  const callOpening = body.indexOf("(", callIndex);
  const callClosing = callOpening === -1 ? -1 : matchingParenthesisIndex(body, callOpening);
  return callClosing !== -1 && /^\s*;\s*$/.test(body.slice(callClosing + 1, statement.end));
}

function matchingBraceIndex(content, openingIndex) {
  let depth = 0;
  for (let index = openingIndex; index < content.length; index += 1) {
    if (content[index] === "{") depth += 1;
    if (content[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function matchingParenthesisIndex(content, openingIndex) {
  let depth = 0;
  for (let index = openingIndex; index < content.length; index += 1) {
    if (content[index] === "(") depth += 1;
    if (content[index] === ")") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function csharpReadonlyFieldReceiverUsage(content, typeName, testFrameworks, typeReferenceContext) {
  if (!isEligibleSourceTypeReference(content, typeName, -1, typeReferenceContext)) return undefined;
  const escapedType = escapeRegExp(typeName);
  const fieldPattern = new RegExp(
    `\\bprivate\\s+readonly\\s+${escapedType}\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?:=\\s*([^;]+))?;`,
    "g"
  );
  let usage;

  for (const classBody of collectClassBodies(content)) {
    const constructors = collectConstructors(classBody.body, classBody.name);
    for (const field of classBody.body.matchAll(fieldPattern)) {
      if (braceDepthAt(classBody.body, field.index) !== 0) continue;
      const receiver = field[1];
      if (!hasExactReadonlyFieldInitializer(constructors, receiver, field[2], typeName)) continue;

      for (const test of collectRunnableTests(classBody.body, 0)) {
        if (testShadowsReceiver(test, receiver)) continue;
        const current = csharpReceiverUsage(test.body, receiver, testFrameworks);
        if (current === "asserted") return current;
        if (current === "called") usage = current;
      }
    }
  }

  return usage;
}

function collectClassBodies(content) {
  const classes = [];
  const classPattern = /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b[^;{}]*\{/g;
  for (const declaration of content.matchAll(classPattern)) {
    const bodyStart = declaration.index + declaration[0].lastIndexOf("{");
    const bodyEnd = matchingBraceIndex(content, bodyStart);
    if (bodyEnd === -1) continue;
    classes.push({
      name: declaration[1],
      body: content.slice(bodyStart + 1, bodyEnd)
    });
  }
  return classes;
}

function collectConstructors(classBody, className) {
  const constructors = [];
  const constructorPattern = new RegExp(
    `\\b${escapeRegExp(className)}\\s*\\(([^)]*)\\)\\s*` +
      `(?:\\:\\s*(?:this|base)\\s*\\([^)]*\\)\\s*)?\\{`,
    "g"
  );
  for (const declaration of classBody.matchAll(constructorPattern)) {
    if (braceDepthAt(classBody, declaration.index) !== 0) continue;
    if (/\\bnew\\s*$/.test(classBody.slice(0, declaration.index))) continue;
    const bodyStart = declaration.index + declaration[0].lastIndexOf("{");
    const bodyEnd = matchingBraceIndex(classBody, bodyStart);
    if (bodyEnd === -1) continue;
    constructors.push({
      body: classBody.slice(bodyStart + 1, bodyEnd),
      parameterless: declaration[1].trim() === ""
    });
  }
  return constructors;
}

function hasExactReadonlyFieldInitializer(constructors, receiver, fieldInitializer, typeName) {
  const assignmentPattern = new RegExp(`\\b(?:this\\s*\\.\\s*)?${escapeRegExp(receiver)}\\s*=`);
  if (fieldInitializer !== undefined) {
    return isExactFieldConstruction(fieldInitializer, typeName) &&
      constructors.every((constructor) => !assignmentPattern.test(constructor.body));
  }
  if (constructors.length !== 1 || !constructors[0].parameterless) return false;
  const assignmentMatches = [...constructors[0].body.matchAll(new RegExp(
    `\\b(?:this\\s*\\.\\s*)?${escapeRegExp(receiver)}\\s*=\\s*([^;]+);`,
    "g"
  ))];
  const assignments = assignmentMatches.filter((assignment) => {
    if (braceDepthAt(constructors[0].body, assignment.index) !== 0) return false;
    const statement = statementAt(constructors[0].body, assignment.index).text;
    return new RegExp(
      `^\\s*(?:this\\s*\\.\\s*)?${escapeRegExp(receiver)}\\s*=\\s*[^;]+;\\s*$`
    ).test(statement);
  });
  return assignments.length === 1 && isExactFieldConstruction(assignments[0][1], typeName);
}

function isExactFieldConstruction(initializer, typeName) {
  const escapedType = escapeRegExp(typeName);
  return new RegExp(`^\\s*new\\s*(?:${escapedType}\\s*)?\\([^;{}]*\\)\\s*$`).test(initializer);
}

function testShadowsReceiver(test, receiver) {
  const escaped = escapeRegExp(receiver);
  return new RegExp(`\\([^)]*\\b${escaped}\\b[^)]*\\)`).test(test.signature) ||
    new RegExp(`\\b(?:var|[A-Za-z_][A-Za-z0-9_.<>,?\\[\\]]*)\\s+${escaped}\\b`).test(test.body);
}

function csharpReceiverUsage(content, receiver, testFrameworks) {
  const callPattern = new RegExp(
    `(?:\\bthis\\s*\\.\\s*)?\\b${escapeRegExp(receiver)}\\s*\\.\\s*[A-Za-z_][A-Za-z0-9_]*\\s*\\(`,
    "g"
  );
  let usage;
  for (const call of content.matchAll(callPattern)) {
    if (braceDepthAt(content, call.index) !== 0) continue;
    const statement = statementAt(content, call.index);
    const callOffset = call.index - statement.start;
    if (statement.text.slice(0, callOffset).includes("=>")) continue;
    if (isAssertionStatement(statement.text, testFrameworks)) return "asserted";
    usage = "called";

    const callOpening = content.indexOf("(", call.index);
    const callClosing = callOpening === -1 ? -1 : matchingParenthesisIndex(content, callOpening);
    const callStatementEnd = callClosing === -1 ? -1 : content.indexOf(";", callClosing);
    const afterCall = callStatementEnd === -1 ? content.slice(statement.end) : content.slice(callStatementEnd + 1);

    const resultBinding = statement.text.slice(0, callOffset).match(
      /\b(?:var|[A-Za-z_][A-Za-z0-9_.<>,?\[\]]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:await\s+)?$/
    );
    if (resultBinding && isLocalResultAsserted(afterCall, resultBinding[1], testFrameworks)) return "asserted";

    if (callClosing === -1) continue;
    const outVariables = collectTopLevelOutVariables(content.slice(callOpening + 1, callClosing));
    if (outVariables.length === 1 && isLocalResultAsserted(afterCall, outVariables[0], testFrameworks)) return "asserted";
  }
  return usage;
}

function collectTopLevelOutVariables(argumentsText) {
  const variables = [];
  for (const declaration of argumentsText.matchAll(/\bout\s+var\s+([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
    if (declaration[1] === "_" || delimiterDepthAt(argumentsText, declaration.index) !== 0) continue;
    variables.push(declaration[1]);
  }
  return variables;
}

function delimiterDepthAt(content, targetIndex) {
  let depth = 0;
  for (let index = 0; index < targetIndex; index += 1) {
    if (content[index] === "(" || content[index] === "[" || content[index] === "{") depth += 1;
    if (content[index] === ")" || content[index] === "]" || content[index] === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return depth;
}

function csharpDirectTypeResultUsage(body, typeName, testFrameworks, typeReferenceContext) {
  const escapedType = escapeRegExp(typeName);
  const callPatterns = [
    { pattern: new RegExp(`\\b${escapedType}\\s*\\.\\s*[A-Za-z_][A-Za-z0-9_]*\\s*\\(`, "g"), construction: false },
    { pattern: new RegExp(`\\bnew\\s+${escapedType}(?:\\s*<[^;{}()=]+>)?\\s*\\(`, "g"), construction: true }
  ];

  for (const { pattern, construction } of callPatterns) {
    for (const call of body.matchAll(pattern)) {
      if (!isEligibleSourceTypeReference(
        body,
        typeName,
        typeReferenceIndex(call, typeName),
        typeReferenceContext
      )) continue;
      if (braceDepthAt(body, call.index) !== 0) continue;
      const statement = statementAt(body, call.index);
      const callOffset = call.index - statement.start;
      const resultBinding = statement.text.slice(0, callOffset).match(
        /^\s*(var|[A-Za-z_][A-Za-z0-9_.<>,?\[\]]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:await\s+)?$/
      );
      if (!resultBinding) continue;
      if (construction && resultBinding[1] !== "var" &&
        !new RegExp(`^${escapedType}(?:<[^;{}()=]+>)?$`).test(resultBinding[1])) continue;

      const callOpening = body.indexOf("(", call.index);
      const callClosing = callOpening === -1 ? -1 : matchingParenthesisIndex(body, callOpening);
      if (callClosing === -1 || !/^\s*;\s*$/.test(body.slice(callClosing + 1, statement.end))) continue;
      if (isLocalResultAsserted(body.slice(statement.end), resultBinding[2], testFrameworks)) return "asserted";
    }
  }

  return undefined;
}

function csharpLocalReceiverUsage(body, typeName, testFrameworks, typeReferenceContext) {
  const escapedType = escapeRegExp(typeName);
  const genericSuffix = "(?:\\s*<[^;{}()=]+>)?";
  const bindingPattern = new RegExp(
    `\\b(?:var|${escapedType}${genericSuffix})\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*new\\s+${escapedType}${genericSuffix}\\s*\\(`,
    "g"
  );
  let usage;

  for (const binding of body.matchAll(bindingPattern)) {
    if (!isEligibleSourceTypeReference(
      body,
      typeName,
      typeReferenceIndex(binding, typeName, true),
      typeReferenceContext
    )) continue;
    if (braceDepthAt(body, binding.index) !== 0) continue;
    const receiver = binding[1];
    const bindingEnd = body.indexOf(";", binding.index);
    if (bindingEnd === -1) continue;
    const remainingBody = body.slice(bindingEnd + 1);
    const receiverMutation = identifierMutationIndex(remainingBody, receiver);
    const receiverSegment = receiverMutation === -1 ? remainingBody : remainingBody.slice(0, receiverMutation);
    const current = csharpReceiverUsage(receiverSegment, receiver, testFrameworks);
    if (current === "asserted") return current;
    if (current === "called") usage = current;
  }

  return usage;
}

function statementAt(content, index) {
  const statementStart = Math.max(
    content.lastIndexOf(";", index - 1),
    content.lastIndexOf("{", index - 1),
    content.lastIndexOf("}", index - 1)
  ) + 1;
  const statementEndMatch = content.slice(index).search(/[;{}]/);
  const statementEnd = statementEndMatch === -1 ? content.length : index + statementEndMatch + 1;
  return {
    start: statementStart,
    end: statementEnd,
    text: content.slice(statementStart, statementEnd)
  };
}

function isLocalResultAsserted(content, resultName, testFrameworks) {
  const mutation = identifierMutationIndex(content, resultName);
  const stableContent = mutation === -1 ? content : content.slice(0, mutation);
  const escaped = escapeRegExp(resultName);
  const resultPattern = new RegExp(`\\b${escaped}\\b`);
  const assertionPatterns = [/\b(?:Assert|CollectionAssert|StringAssert)\s*\./g, /\.Should\s*\(/g];
  for (const assertionPattern of assertionPatterns) {
    for (const assertion of stableContent.matchAll(assertionPattern)) {
      if (braceDepthAt(stableContent, assertion.index) !== 0) continue;
      const statement = statementAt(stableContent, assertion.index).text;
      if (isAssertionStatement(statement, testFrameworks) && resultPattern.test(statement)) return true;
    }
  }
  return false;
}

function identifierMutationIndex(content, identifier) {
  const escaped = escapeRegExp(identifier);
  const patterns = [
    new RegExp(`\\b${escaped}\\s*(?:\\+\\+|--|\\?\\?=|<<=|>>=|[+\\-*/%&|^]=|=(?!=|>))`),
    new RegExp(`(?:\\+\\+|--)\\s*\\b${escaped}\\b`),
    new RegExp(`\\b(?:ref|out)\\s+${escaped}\\b`)
  ];
  const indices = patterns.map((pattern) => content.search(pattern)).filter((index) => index !== -1);
  return indices.length === 0 ? -1 : Math.min(...indices);
}

function isAssertionStatement(statement, testFrameworks = []) {
  const supportsSpecializedAssertions = testFrameworks.includes("nunit") || testFrameworks.includes("mstest");
  const assertionPattern = supportsSpecializedAssertions
    ? /\b(?:Assert|CollectionAssert|StringAssert)\s*\.|\.Should\s*\(/
    : /\bAssert\s*\.|\.Should\s*\(/;
  const assertionIndex = statement.search(assertionPattern);
  return assertionIndex !== -1 && !statement.includes("=>");
}

function typeReferenceIndex(match, typeName, preferLast = false) {
  const offset = preferLast ? match[0].lastIndexOf(typeName) : match[0].indexOf(typeName);
  return offset === -1 ? -1 : match.index + offset;
}

function isEligibleSourceTypeReference(content, typeName, typeIndex, typeReferenceContext) {
  if (!typeReferenceContext.importsSystemNamespace || !SYSTEM_ROOT_TYPE_NAMES.has(typeName)) return true;
  if (typeReferenceContext.explicitSourceAliases.has(typeName)) return true;
  if (typeIndex < 0) return false;

  const prefix = content.slice(0, typeIndex);
  if (/(?:global\s*::\s*)?System\s*\.\s*$/.test(prefix)) return false;
  return /\.\s*$/.test(prefix);
}

function braceDepthAt(content, targetIndex) {
  let depth = 0;
  for (let index = 0; index < targetIndex; index += 1) {
    if (content[index] === "{") depth += 1;
    if (content[index] === "}") depth = Math.max(0, depth - 1);
  }
  return depth;
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
