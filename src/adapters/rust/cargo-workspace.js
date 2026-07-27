import fs from "node:fs";
import path from "node:path";

export function findNearestCargoWorkspace(packageRoot) {
  const resolvedPackageRoot = path.resolve(packageRoot);
  let current = resolvedPackageRoot;

  while (true) {
    const manifestPath = path.join(current, "Cargo.toml");
    if (fs.existsSync(manifestPath) && fs.statSync(manifestPath).isFile()) {
      const content = fs.readFileSync(manifestPath, "utf8");
      if (hasCargoSection(content, "workspace")) {
        const analysis = analyzeCargoWorkspace(current, content);
        const relativeRoot = normalizeWorkspacePath(path.relative(current, resolvedPackageRoot)) || ".";
        const declared = relativeRoot === "."
          ? analysis.hasPackage
          : analysis.memberDirectories.includes(relativeRoot);
        return {
          root: current,
          local: current === resolvedPackageRoot,
          declared,
          defaultMember: analysis.defaultMemberDirectories.includes(relativeRoot),
          ...analysis
        };
      }
    }

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function analyzeCargoWorkspace(workspaceRoot, content) {
  const hasWorkspace = hasCargoSection(content, "workspace");
  const hasPackage = hasCargoSection(content, "package");
  const members = cargoSectionStringArray(content, "workspace", "members");
  const defaultMembers = cargoSectionStringArray(content, "workspace", "default-members");
  const excludes = cargoSectionStringArray(content, "workspace", "exclude");
  let complete = hasWorkspace && members.complete && defaultMembers.complete && excludes.complete;
  const memberDirectories = resolveWorkspaceDirectories(workspaceRoot, members.values, true);
  const defaultMemberDirectories = resolveWorkspaceDirectories(workspaceRoot, defaultMembers.values, true);
  const excludedDirectories = resolveWorkspaceDirectories(workspaceRoot, excludes.values, false);

  if (
    memberDirectories.length !== members.values.length ||
    defaultMemberDirectories.length !== defaultMembers.values.length ||
    excludedDirectories.length !== excludes.values.length
  ) {
    complete = false;
  }

  const ownedDirectories = new Set(memberDirectories);
  if (hasPackage) ownedDirectories.add(".");
  if (defaultMemberDirectories.some((directory) => !ownedDirectories.has(directory))) complete = false;
  if (memberDirectories.some((directory) => excludedDirectories.includes(directory))) complete = false;

  return {
    hasWorkspace,
    hasPackage,
    complete,
    membersDeclared: members.declared,
    defaultMembersDeclared: defaultMembers.declared,
    memberDirectories: [...new Set(memberDirectories)].sort(),
    defaultMemberDirectories: [...new Set(defaultMemberDirectories)].sort(),
    excludedDirectories: [...new Set(excludedDirectories)].sort()
  };
}

export function hasCargoSection(content, section) {
  return new RegExp(`^\\s*\\[${escapeRegExp(section)}\\]\\s*(?:#.*)?$`, "m").test(content);
}

export function cargoSectionString(content, section, key) {
  const body = cargoSectionBody(content, section);
  if (body === undefined) return undefined;
  return body.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"([^"\\r\\n]+)"\\s*(?:#.*)?$`, "m"))?.[1];
}

function cargoSectionStringArray(content, section, key) {
  const body = cargoSectionBody(content, section);
  if (body === undefined) return { declared: false, complete: true, values: [] };
  const assignments = [...body.matchAll(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`, "gm"))];
  if (assignments.length === 0) return { declared: false, complete: true, values: [] };
  if (assignments.length !== 1) return { declared: true, complete: false, values: [] };
  const valueStart = assignments[0].index + assignments[0][0].length;
  const parsed = parseCargoStringArray(body, valueStart);
  return { declared: true, ...parsed };
}

function cargoSectionBody(content, section) {
  const sectionMatch = content.match(new RegExp(`^\\s*\\[${escapeRegExp(section)}\\]\\s*(?:#.*)?$`, "m"));
  if (!sectionMatch) return undefined;
  const start = sectionMatch.index + sectionMatch[0].length;
  const nextSection = content.slice(start).search(/^\s*\[/m);
  return nextSection === -1 ? content.slice(start) : content.slice(start, start + nextSection);
}

function parseCargoStringArray(content, start) {
  let index = skipCargoWhitespaceAndComments(content, start);
  if (content[index] !== "[") return { complete: false, values: [] };
  index += 1;
  const values = [];

  while (index < content.length) {
    index = skipCargoWhitespaceAndComments(content, index);
    if (content[index] === "]") return { complete: true, values };
    const parsed = parseCargoString(content, index);
    if (!parsed) return { complete: false, values: [] };
    values.push(parsed.value);
    index = skipCargoWhitespaceAndComments(content, parsed.end);
    if (content[index] === ",") {
      index += 1;
      continue;
    }
    if (content[index] === "]") return { complete: true, values };
    return { complete: false, values: [] };
  }

  return { complete: false, values: [] };
}

function parseCargoString(content, start) {
  const quote = content[start];
  if (quote !== "\"" && quote !== "'") return undefined;
  let escaped = false;
  for (let index = start + 1; index < content.length; index += 1) {
    const character = content[index];
    if (quote === "\"" && escaped) {
      escaped = false;
      continue;
    }
    if (quote === "\"" && character === "\\") {
      escaped = true;
      continue;
    }
    if (character !== quote) continue;
    const raw = content.slice(start, index + 1);
    if (quote === "'") return { value: raw.slice(1, -1), end: index + 1 };
    try {
      const value = JSON.parse(raw);
      return typeof value === "string" ? { value, end: index + 1 } : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function skipCargoWhitespaceAndComments(content, start) {
  let index = start;
  while (index < content.length) {
    if (/\s/.test(content[index])) {
      index += 1;
      continue;
    }
    if (content[index] === "#") {
      while (index < content.length && content[index] !== "\n" && content[index] !== "\r") index += 1;
      continue;
    }
    break;
  }
  return index;
}

function resolveWorkspaceDirectories(workspaceRoot, values, requireManifest) {
  const directories = [];
  for (const value of values) {
    const normalized = normalizeWorkspacePath(value).replace(/^\.\//, "").replace(/\/$/, "") || ".";
    if (!isLiteralContainedWorkspacePath(value, normalized)) continue;
    const absolute = path.resolve(workspaceRoot, normalized);
    if (requireManifest && !fs.existsSync(path.join(absolute, "Cargo.toml"))) continue;
    if (!isRealWorkspaceChild(workspaceRoot, absolute)) continue;
    directories.push(normalizeWorkspacePath(path.relative(workspaceRoot, absolute)) || ".");
  }
  return directories;
}

function isLiteralContainedWorkspacePath(value, normalized) {
  if (!value || path.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
  if (/[*?\[\]{}]/.test(value) || normalized.split("/").includes("..")) return false;
  return true;
}

function isRealWorkspaceChild(workspaceRoot, absolute) {
  if (!fs.existsSync(absolute)) return false;
  const relative = path.relative(fs.realpathSync(workspaceRoot), fs.realpathSync(absolute));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function normalizeWorkspacePath(value) {
  return value.replaceAll("\\", "/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
