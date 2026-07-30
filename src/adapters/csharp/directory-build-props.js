import fs from "node:fs";
import path from "node:path";

const RELEVANT_PROPERTY = /<(?:TargetFrameworks?|IsTestProject|EnableDefaultCompileItems|ManagePackageVersionsCentrally)\b/i;
const RELEVANT_ITEM = /<(?:ProjectReference|Compile)\b|<PackageReference\b[^>]*\bInclude\s*=\s*["'](?:Microsoft\.NET\.Test\.Sdk|xunit(?:\.v3)?|nunit|MSTest\.TestFramework)["']/i;
const TEST_PACKAGE = /\bInclude\s*=\s*["'](?:Microsoft\.NET\.Test\.Sdk|xunit(?:\.v3)?|nunit|MSTest\.TestFramework)["']/i;

export function findNearestDirectoryBuildProps(repoRoot, projectPath) {
  return findNearestMsbuildFile(repoRoot, projectPath, "Directory.Build.props", "symbolic props path");
}

export function findNearestMsbuildFile(repoRoot, projectPath, fileName, symbolicPathBlocker) {
  let directory = path.posix.dirname(projectPath);

  while (true) {
    const relativePath = directory === "."
      ? fileName
      : `${directory}/${fileName}`;
    const absoluteDirectory = path.resolve(repoRoot, directory === "." ? "" : directory);
    const absolutePath = path.resolve(repoRoot, relativePath);
    const hasExactFileName = fs.readdirSync(absoluteDirectory).includes(fileName);
    if (hasExactFileName && fs.lstatSync(absolutePath).isSymbolicLink()) {
      return { path: relativePath, content: "", pathBlockers: [symbolicPathBlocker] };
    }
    if (hasExactFileName && fs.lstatSync(absolutePath).isFile()) {
      return {
        path: relativePath,
        content: fs.readFileSync(absolutePath, "utf8")
      };
    }
    if (directory === ".") return undefined;
    directory = path.posix.dirname(directory);
  }
}

export function analyzeDirectoryBuildProps(content) {
  const source = content.replace(/<!--[\s\S]*?-->/g, " ");
  const blockers = [];
  if (/<Import\b/i.test(source)) blockers.push("imports");
  if (/<Project\b[^>]*\bCondition\s*=/i.test(source)) blockers.push("conditional metadata");

  const propertyGroups = [...source.matchAll(/<PropertyGroup\b([^>]*)>([\s\S]*?)<\/PropertyGroup>/gi)];
  const itemGroups = [...source.matchAll(/<ItemGroup\b([^>]*)>([\s\S]*?)<\/ItemGroup>/gi)];
  const relevantPropertyGroups = propertyGroups.filter((match) => RELEVANT_PROPERTY.test(match[2]));
  const relevantItemGroups = itemGroups.filter((match) => RELEVANT_ITEM.test(match[2]));
  if (relevantPropertyGroups.some((match) => /\bCondition\s*=/i.test(match[1]))) blockers.push("conditional metadata");
  if (relevantItemGroups.some((match) => /\bCondition\s*=/i.test(match[1]))) blockers.push("conditional metadata");

  const targetFrameworkTags = [...source.matchAll(/<TargetFramework\b([^>]*)>\s*([^<]+?)\s*<\/TargetFramework>/gi)];
  const targetFrameworksTags = [...source.matchAll(/<TargetFrameworks\b/gi)];
  const isTestProjectTags = [...source.matchAll(/<IsTestProject\b([^>]*)>\s*([^<]+?)\s*<\/IsTestProject>/gi)];
  const compileSettingTags = [...source.matchAll(/<EnableDefaultCompileItems\b([^>]*)>\s*([^<]+?)\s*<\/EnableDefaultCompileItems>/gi)];
  const centralPackageTags = [...source.matchAll(/<ManagePackageVersionsCentrally\b([^>]*)>\s*([^<]+?)\s*<\/ManagePackageVersionsCentrally>/gi)];
  const packageReferenceTags = extractPackageReferenceTags(source);
  const projectReferenceTags = [...source.matchAll(/<ProjectReference\b[^>]*>/gi)].map((match) => match[0]);
  const compileItemTags = [...source.matchAll(/<Compile\b[^>]*>/gi)].map((match) => match[0]);

  if (/<(?:Choose|When|Otherwise)\b/i.test(source) && (RELEVANT_PROPERTY.test(source) || RELEVANT_ITEM.test(source))) {
    blockers.push("conditional metadata");
  }

  if ([...targetFrameworkTags, ...isTestProjectTags, ...compileSettingTags, ...centralPackageTags].some((match) => /\bCondition\s*=/i.test(match[1]))) {
    blockers.push("conditional metadata");
  }
  if ([...packageReferenceTags.filter((tag) => TEST_PACKAGE.test(tag)), ...projectReferenceTags, ...compileItemTags]
    .some((tag) => /\bCondition\s*=/i.test(tag))) {
    blockers.push("conditional metadata");
  }
  if (targetFrameworksTags.length > 0 || targetFrameworkTags.length > 1) blockers.push("multiple target frameworks");
  if (isTestProjectTags.length > 1) blockers.push("repeated test metadata");
  if (centralPackageTags.length > 1) blockers.push("repeated central package metadata");
  if (targetFrameworkTags.some((match) => match[2].includes("$")) ||
    isTestProjectTags.some((match) => match[2].includes("$")) ||
    centralPackageTags.some((match) => match[2].includes("$"))) {
    blockers.push("property-expanded metadata");
  }
  if (centralPackageTags.some((match) => !/^(?:true|false)$/i.test(match[2].trim()))) blockers.push("non-literal central package metadata");
  if (projectReferenceTags.length > 0) blockers.push("inherited project items");
  if (compileItemTags.length > 0 || compileSettingTags.some((match) => match[2].trim().toLowerCase() === "false")) {
    blockers.push("custom compile items");
  }

  const packageReferences = packageReferenceTags
    .map((tag) => tag.match(/\bInclude\s*=\s*["']([^"']+)["']/i)?.[1])
    .filter(Boolean);
  const packageReferenceDetails = packageReferenceTags.map(analyzePackageReferenceTag);
  const hasConditionalPackageReferenceGroups = itemGroups.some((match) => (
    /\bCondition\s*=/i.test(match[1]) && /<PackageReference\b/i.test(match[2])
  ));
  const targetFramework = targetFrameworkTags.length === 1 && !targetFrameworkTags[0][2].includes("$")
    ? targetFrameworkTags[0][2].trim()
    : undefined;
  const isTestProjectValue = isTestProjectTags.length === 1 && !isTestProjectTags[0][2].includes("$")
    ? isTestProjectTags[0][2].trim().toLowerCase()
    : undefined;
  const centralPackageValue = centralPackageTags.length === 1 && !centralPackageTags[0][2].includes("$")
    ? centralPackageTags[0][2].trim().toLowerCase()
    : undefined;

  return {
    targetFramework,
    isTestProject: isTestProjectValue === "true" ? true : isTestProjectValue === "false" ? false : undefined,
    managePackageVersionsCentrally: centralPackageValue === "true" ? true : centralPackageValue === "false" ? false : undefined,
    packageReferences: packageReferences.map((name) => name.toLowerCase()),
    packageReferenceDetails,
    hasConditionalPackageReferenceGroups,
    blockers: [...new Set(blockers)]
  };
}

export function analyzePackageReferenceTag(tag) {
  const name = tag.match(/\bInclude\s*=\s*["']([^"']+)["']/i)?.[1];
  return {
    name: name && !/[$*?]/.test(name) ? name.toLowerCase() : undefined,
    hasVersion: /\bVersion\s*=/i.test(tag) || /<Version\b/i.test(tag),
    hasVersionOverride: /\bVersionOverride\s*=/i.test(tag) || /<VersionOverride\b/i.test(tag),
    hasUpdate: /\bUpdate\s*=/i.test(tag),
    hasCondition: /\bCondition\s*=/i.test(tag)
  };
}

export function extractPackageReferenceTags(content) {
  return [...content.matchAll(/<PackageReference\b[^>]*(?:\/>|>[\s\S]*?<\/PackageReference>)/gi)]
    .map((match) => match[0]);
}
