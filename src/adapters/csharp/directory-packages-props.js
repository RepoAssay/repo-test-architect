import { findNearestMsbuildFile } from "./directory-build-props.js";

export function findNearestDirectoryPackagesProps(repoRoot, projectPath) {
  return findNearestMsbuildFile(
    repoRoot,
    projectPath,
    "Directory.Packages.props",
    "symbolic central packages path"
  );
}

export function analyzeDirectoryPackagesProps(content) {
  const source = content.replace(/<!--[\s\S]*?-->/g, " ");
  const blockers = [];
  if (/<Import\b/i.test(source)) blockers.push("imports");
  if (/<Project\b[^>]*\bCondition\s*=/i.test(source)) blockers.push("conditional central metadata");
  if (/<(?:Choose|When|Otherwise)\b/i.test(source)) blockers.push("conditional central metadata");
  if (/<GlobalPackageReference\b/i.test(source)) blockers.push("global package references");

  const propertyGroups = [...source.matchAll(/<PropertyGroup\b([^>]*)>([\s\S]*?)<\/PropertyGroup>/gi)];
  const properties = new Map();
  for (const group of propertyGroups) {
    if (/\bCondition\s*=/i.test(group[1])) blockers.push("conditional central metadata");
    for (const match of group[2].matchAll(/<([A-Za-z_][A-Za-z0-9_.-]*)\b([^>]*)>\s*([^<]+?)\s*<\/\1>/g)) {
      const name = match[1].toLowerCase();
      const value = match[3].trim();
      if (/\bCondition\s*=/i.test(match[2])) blockers.push("conditional central metadata");
      if (properties.has(name)) blockers.push("repeated central properties");
      else properties.set(name, { value, index: group.index + match.index });
    }
  }

  const packageVersions = new Map();
  const itemGroups = [...source.matchAll(/<ItemGroup\b([^>]*)>([\s\S]*?)<\/ItemGroup>/gi)];
  if (itemGroups.some((group) => /\bCondition\s*=/i.test(group[1]) && /<PackageVersion\b/i.test(group[2]))) {
    blockers.push("conditional central package versions");
  }
  const packageVersionTags = [...source.matchAll(/<PackageVersion\b[^>]*>/gi)];
  for (const match of packageVersionTags) {
    const tag = match[0];
    if (/\bCondition\s*=/i.test(tag)) blockers.push("conditional central package versions");
    const rawName = tag.match(/\bInclude\s*=\s*["']([^"']+)["']/i)?.[1];
    const rawVersion = tag.match(/\bVersion\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!rawName || /[$*?]/.test(rawName) || /\bUpdate\s*=/i.test(tag) || !rawVersion) {
      blockers.push("dynamic central package versions");
      continue;
    }
    const version = resolveStaticVersion(rawVersion, properties, match.index);
    if (!version) blockers.push("property-expanded central package versions");
    const name = rawName.toLowerCase();
    if (packageVersions.has(name)) blockers.push("repeated central package versions");
    else if (version) packageVersions.set(name, version);
  }

  const manageValue = properties.get("managepackageversionscentrally")?.value.toLowerCase();
  if (manageValue !== undefined && manageValue !== "true" && manageValue !== "false") {
    blockers.push("non-literal central package metadata");
  }

  return {
    managePackageVersionsCentrally: manageValue === "true" ? true : manageValue === "false" ? false : undefined,
    packageVersions,
    blockers: [...new Set(blockers)]
  };
}

function resolveStaticVersion(value, properties, packageVersionIndex) {
  if (!value.includes("$")) return value;
  const propertyName = value.match(/^\$\(([A-Za-z_][A-Za-z0-9_.-]*)\)$/)?.[1]?.toLowerCase();
  if (!propertyName) return undefined;
  const property = properties.get(propertyName);
  return property && property.index < packageVersionIndex && !property.value.includes("$")
    ? property.value
    : undefined;
}
