import fs from "node:fs";
import path from "node:path";

const RELEVANT_PROPERTY = /<(?:TargetFrameworks?|IsTestProject|EnableDefaultCompileItems|ManagePackageVersionsCentrally)\b/i;
const RELEVANT_ITEM = /<(?:ProjectReference|Compile)\b|<PackageReference\b[^>]*\bInclude\s*=\s*["'](?:Microsoft\.NET\.Test\.Sdk|Microsoft\.Testing\.Platform\.MSBuild|xunit(?:\.v3(?:\.mtp-v2)?)?|nunit|MSTest\.TestFramework)["']/i;
const TEST_PACKAGE = /\bInclude\s*=\s*["'](?:Microsoft\.NET\.Test\.Sdk|Microsoft\.Testing\.Platform\.MSBuild|xunit(?:\.v3(?:\.mtp-v2)?)?|nunit|MSTest\.TestFramework)["']/i;

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
  const literalPropertyAliases = analyzeLiteralPropertyAliases(source);
  const targetFrameworkAnalysis = analyzeTargetFrameworkDeclaration(source, literalPropertyAliases);
  const blockers = [];
  if (/<Import\b/i.test(source)) blockers.push("imports");
  if (/<Project\b[^>]*\bCondition\s*=/i.test(source)) blockers.push("conditional metadata");

  const propertyGroups = [...source.matchAll(/<PropertyGroup\b([^>]*)>([\s\S]*?)<\/PropertyGroup>/gi)];
  const itemGroups = [...source.matchAll(/<ItemGroup\b([^>]*)>([\s\S]*?)<\/ItemGroup>/gi)];
  const relevantPropertyGroups = propertyGroups.filter((match) => RELEVANT_PROPERTY.test(match[2]));
  const relevantItemGroups = itemGroups.filter((match) => RELEVANT_ITEM.test(match[2]));
  if (relevantPropertyGroups.some((match) => /\bCondition\s*=/i.test(match[1]))) blockers.push("conditional metadata");
  if (relevantItemGroups.some((match) => /\bCondition\s*=/i.test(match[1]))) blockers.push("conditional metadata");

  const isTestProjectTags = [...source.matchAll(/<IsTestProject\b([^>]*)>\s*([^<]+?)\s*<\/IsTestProject>/gi)];
  const compileSettingTags = [...source.matchAll(/<EnableDefaultCompileItems\b([^>]*)>\s*([^<]+?)\s*<\/EnableDefaultCompileItems>/gi)];
  const centralPackageTags = [...source.matchAll(/<ManagePackageVersionsCentrally\b([^>]*)>\s*([^<]+?)\s*<\/ManagePackageVersionsCentrally>/gi)];
  const packageReferenceTags = extractPackageReferenceTags(source);
  const projectReferenceTags = [...source.matchAll(/<ProjectReference\b[^>]*>/gi)].map((match) => match[0]);
  const compileItemTags = [...source.matchAll(/<Compile\b[^>]*>/gi)].map((match) => match[0]);

  if (/<(?:Choose|When|Otherwise)\b/i.test(source) && (RELEVANT_PROPERTY.test(source) || RELEVANT_ITEM.test(source))) {
    blockers.push("conditional metadata");
  }

  if ([...isTestProjectTags, ...compileSettingTags, ...centralPackageTags].some((match) => /\bCondition\s*=/i.test(match[1]))) {
    blockers.push("conditional metadata");
  }
  if ([...packageReferenceTags.filter((tag) => TEST_PACKAGE.test(tag)), ...projectReferenceTags, ...compileItemTags]
    .some((tag) => /\bCondition\s*=/i.test(tag))) {
    blockers.push("conditional metadata");
  }
  blockers.push(...targetFrameworkAnalysis.blockers);
  if (isTestProjectTags.length > 1) blockers.push("repeated test metadata");
  if (centralPackageTags.length > 1) blockers.push("repeated central package metadata");
  if (isTestProjectTags.some((match) => match[2].includes("$")) ||
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
  const isTestProjectValue = isTestProjectTags.length === 1 && !isTestProjectTags[0][2].includes("$")
    ? isTestProjectTags[0][2].trim().toLowerCase()
    : undefined;
  const centralPackageValue = centralPackageTags.length === 1 && !centralPackageTags[0][2].includes("$")
    ? centralPackageTags[0][2].trim().toLowerCase()
    : undefined;

  return {
    targetFramework: targetFrameworkAnalysis.targetFramework,
    targetFrameworks: targetFrameworkAnalysis.targetFrameworks,
    targetFrameworkProperty: targetFrameworkAnalysis.property,
    targetFrameworkAlias: targetFrameworkAnalysis.resolvedPropertyAlias,
    literalPropertyAliases,
    isTestProject: isTestProjectValue === "true" ? true : isTestProjectValue === "false" ? false : undefined,
    managePackageVersionsCentrally: centralPackageValue === "true" ? true : centralPackageValue === "false" ? false : undefined,
    packageReferences: packageReferences.map((name) => name.toLowerCase()),
    packageReferenceDetails,
    hasConditionalPackageReferenceGroups,
    blockers: [...new Set(blockers)]
  };
}

export function analyzeTargetFrameworkDeclaration(content, literalPropertyAliases = new Map()) {
  const source = content.replace(/<!--[\s\S]*?-->/g, " ");
  const singular = [...source.matchAll(/<TargetFramework\b([^>]*)>\s*([^<]+?)\s*<\/TargetFramework>/gi)]
    .map((match) => ({ property: "TargetFramework", attributes: match[1], value: match[2].trim() }));
  const plural = [...source.matchAll(/<TargetFrameworks\b([^>]*)>\s*([^<]+?)\s*<\/TargetFrameworks>/gi)]
    .map((match) => ({ property: "TargetFrameworks", attributes: match[1], value: match[2].trim() }));
  const declarations = [...singular, ...plural];
  const blockers = [];
  if (declarations.length > 1) blockers.push("repeated target framework metadata");
  if (declarations.some((declaration) => /\bCondition\s*=/i.test(declaration.attributes))) {
    blockers.push("conditional metadata");
  }
  const conditionalGroup = [...source.matchAll(/<PropertyGroup\b([^>]*)>([\s\S]*?)<\/PropertyGroup>/gi)]
    .some((match) => /\bCondition\s*=/i.test(match[1]) && /<TargetFrameworks?\b/i.test(match[2]));
  if (conditionalGroup ||
    (/<Project\b[^>]*\bCondition\s*=/i.test(source) && declarations.length > 0) ||
    (/<(?:Choose|When|Otherwise)\b/i.test(source) && declarations.length > 0)) {
    blockers.push("conditional metadata");
  }
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  const propertyReference = declaration?.value.match(/^\$\(([A-Za-z_][A-Za-z0-9_.-]*)\)$/);
  const resolvedPropertyAlias = propertyReference && literalPropertyAliases.has(propertyReference[1].toLowerCase())
    ? propertyReference[1]
    : undefined;
  const value = resolvedPropertyAlias
    ? literalPropertyAliases.get(resolvedPropertyAlias.toLowerCase())
    : declaration?.value;
  if (declarations.some((current) => current.value.includes("$") && current !== declaration) ||
    (declaration?.value.includes("$") && resolvedPropertyAlias === undefined)) {
    blockers.push("property-expanded metadata");
  }

  const targetFrameworks = declaration ? parseTargetFrameworks(value, declaration.property) : [];
  if (declaration && targetFrameworks.length === 0 && !value.includes("$")) {
    blockers.push("invalid target framework metadata");
  }

  return {
    hasDeclaration: declarations.length > 0,
    property: declaration?.property,
    resolvedPropertyAlias,
    targetFramework: targetFrameworks.length === 1 ? targetFrameworks[0] : undefined,
    targetFrameworks,
    blockers: [...new Set(blockers)]
  };
}

export function analyzeLiteralPropertyAliases(content) {
  const source = content.replace(/<!--[\s\S]*?-->/g, " ");
  const excludedRanges = ["Target", "Choose"].flatMap((elementName) => (
    [...source.matchAll(new RegExp(`<${elementName}\\b[^>]*>[\\s\\S]*?<\\/${elementName}>`, "gi"))]
      .map((match) => [match.index, match.index + match[0].length])
  ));
  const occurrences = new Map();
  const propertyGroups = [...source.matchAll(/<PropertyGroup\b([^>]*)>([\s\S]*?)<\/PropertyGroup>/gi)];

  for (const group of propertyGroups) {
    const groupIsConditional = /\bCondition\s*=/i.test(group[1]) ||
      excludedRanges.some(([start, end]) => group.index >= start && group.index < end);
    const declarations = [...group[2].matchAll(/<([A-Za-z_][A-Za-z0-9_.-]*)\b([^>]*)>\s*([^<]+?)\s*<\/\1>/gi)];
    for (const declaration of declarations) {
      if (!isTopLevelPropertyDeclaration(group[2], declaration.index)) continue;
      const name = declaration[1];
      const key = name.toLowerCase();
      const current = occurrences.get(key) ?? [];
      current.push({
        name,
        value: declaration[3].trim(),
        eligible: !groupIsConditional && !/\bCondition\s*=/i.test(declaration[2]) &&
          !/[$%@]/.test(declaration[3])
      });
      occurrences.set(key, current);
    }
  }

  const aliases = new Map();
  for (const [key, declarations] of occurrences) {
    if (declarations.length === 1 && declarations[0].eligible) aliases.set(key, declarations[0].value);
  }
  return aliases;
}

function isTopLevelPropertyDeclaration(content, index) {
  let depth = 0;
  for (const match of content.slice(0, index).matchAll(/<\/?[A-Za-z_][A-Za-z0-9_.-]*\b[^>]*>/g)) {
    if (/^<\//.test(match[0])) depth -= 1;
    else if (!/\/\s*>$/.test(match[0])) depth += 1;
  }
  return depth === 0;
}

function parseTargetFrameworks(value, property) {
  const values = value.split(";").map((target) => target.trim());
  if (property === "TargetFramework" && values.length !== 1) return [];
  if (property === "TargetFrameworks" && values.length < 2) return [];
  if (values.some((target) => !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(target))) return [];
  if (new Set(values.map((target) => target.toLowerCase())).size !== values.length) return [];
  return values;
}

export function analyzePackageReferenceTag(tag) {
  const name = tag.match(/\bInclude\s*=\s*["']([^"']+)["']/i)?.[1];
  const rawVersion = tag.match(/\bVersion\s*=\s*["']([^"']+)["']/i)?.[1] ??
    tag.match(/<Version\b[^>]*>\s*([^<]+?)\s*<\/Version>/i)?.[1];
  return {
    name: name && !/[$*?]/.test(name) ? name.toLowerCase() : undefined,
    version: rawVersion && !rawVersion.includes("$") ? rawVersion.trim() : undefined,
    hasVersion: /\bVersion\s*=/i.test(tag) || /<Version\b/i.test(tag),
    hasVersionOverride: /\bVersionOverride\s*=/i.test(tag) || /<VersionOverride\b/i.test(tag),
    hasUpdate: /\bUpdate\s*=/i.test(tag),
    hasCondition: /\bCondition\s*=/i.test(tag)
  };
}

export function extractPackageReferenceTags(content) {
  return [...content.matchAll(/<PackageReference\b[^>]*(?:\/\s*>|>(?:(?!<PackageReference\b)[\s\S])*?<\/PackageReference\s*>)/gi)]
    .map((match) => match[0]);
}
