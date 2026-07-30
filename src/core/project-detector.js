import fs from "node:fs";
import path from "node:path";
import { analyzeCargoWorkspace } from "../adapters/rust/cargo-workspace.js";
import { analyzeDirectoryBuildProps, findNearestDirectoryBuildProps } from "../adapters/csharp/directory-build-props.js";
import { analyzeRepositoryGlobalJson } from "../adapters/csharp/global-json.js";
import { analyzeGradleSettings } from "./gradle-settings.js";
import { listAdapters } from "./adapter-registry.js";

const IGNORED_DIRECTORIES = new Set([
  ".build",
  ".git",
  ".gradle",
  ".swiftpm",
  ".venv",
  "__fixtures__",
  "bin",
  "build",
  "coverage",
  "dist",
  "fixtures",
  "node_modules",
  "obj",
  "target",
  "testdata",
  "vendor"
]);

const MARKERS = [
  {
    fileName: "package.json",
    ecosystem: "javascript",
    languages: ["javascript", "typescript"]
  },
  {
    fileName: "pyproject.toml",
    ecosystem: "python",
    languages: ["python"]
  },
  {
    fileName: "requirements.txt",
    ecosystem: "python",
    languages: ["python"]
  },
  {
    fileName: "Gemfile",
    ecosystem: "ruby",
    languages: ["ruby"]
  },
  {
    fileName: "composer.json",
    ecosystem: "php",
    languages: ["php"]
  },
  {
    fileName: "mix.exs",
    ecosystem: "elixir",
    languages: ["elixir"]
  },
  {
    fileName: "go.mod",
    ecosystem: "go",
    languages: ["go"]
  },
  {
    fileName: "Cargo.toml",
    ecosystem: "rust",
    languages: ["rust"]
  },
  {
    fileName: "Package.swift",
    ecosystem: "swift",
    languages: ["swift"]
  },
  {
    fileName: "MODULE.bazel",
    ecosystem: "bazel",
    languages: ["swift"],
    requiresSwiftRules: true
  },
  {
    fileName: "WORKSPACE",
    ecosystem: "bazel",
    languages: ["swift"],
    requiresSwiftRules: true
  },
  {
    fileName: "WORKSPACE.bazel",
    ecosystem: "bazel",
    languages: ["swift"],
    requiresSwiftRules: true
  },
  {
    directoryExtension: ".xcodeproj",
    ecosystem: "apple",
    languages: ["swift", "objective-c"]
  },
  {
    directoryExtension: ".xcworkspace",
    ecosystem: "apple",
    languages: ["swift", "objective-c"]
  },
  {
    extension: ".csproj",
    ecosystem: "dotnet",
    languages: ["csharp"]
  },
  {
    fileName: "pom.xml",
    ecosystem: "jvm",
    languages: ["java", "kotlin"]
  },
  {
    fileName: "build.gradle",
    ecosystem: "jvm",
    languages: ["kotlin", "java"]
  },
  {
    fileName: "build.gradle.kts",
    ecosystem: "jvm",
    languages: ["kotlin", "java"]
  },
  {
    fileName: "settings.gradle",
    ecosystem: "jvm",
    languages: ["kotlin", "java"]
  },
  {
    fileName: "settings.gradle.kts",
    ecosystem: "jvm",
    languages: ["kotlin", "java"]
  }
];

/**
 * @typedef {object} ProjectDetectionMarker
 * @property {string} [fileName]
 * @property {string} [extension]
 * @property {string} [directoryExtension]
 * @property {string} ecosystem
 * @property {string[]} languages
 * @property {boolean} [requiresSwiftRules]
 *
 * @typedef {object} ProjectMarkerGroup
 * @property {string} root
 * @property {string[]} markerFiles
 * @property {Set<string>} ecosystems
 * @property {Set<string>} languages
 *
 * @typedef {object} DetectedProject
 * @property {string} id
 * @property {string} root
 * @property {string} absoluteRoot
 * @property {string[]} ecosystems
 * @property {string[]} languages
 * @property {string[]} markerFiles
 * @property {string[]} adapterIds
 * @property {Array<{ adapterId: string, maturity: string, matchedEcosystems: string[], matchedLanguages: string[] }>} adapterMatches
 * @property {boolean} supported
 * @property {string} supportStatusReason
 *
 * @typedef {object} ProjectDetectionRules
 * @property {"project-detection-rules/v1"} schemaVersion
 * @property {ProjectDetectionMarker[]} markers
 * @property {string[]} ignoredDirectories
 *
 * @typedef {object} ProjectDetection
 * @property {"project-detection/v1"} schemaVersion
 * @property {string} root
 * @property {DetectedProject[]} projects
 * @property {{ projectCount: number, supportedProjectCount: number, unsupportedProjectCount: number }} summary
 *
 * @typedef {object} DetectProjectsOptions
 * @property {string[]} [excludeProjectRoots]
 */

/**
 * @returns {ProjectDetectionRules}
 */
export function getProjectDetectionRules() {
  return {
    schemaVersion: "project-detection-rules/v1",
    markers: MARKERS.map(({ requiresSwiftRules: _requiresSwiftRules, ...marker }) => ({
      ...marker,
      languages: [...marker.languages]
    })),
    ignoredDirectories: [...IGNORED_DIRECTORIES].sort()
  };
}

/**
 * @param {string} repoRoot
 * @param {DetectProjectsOptions} [options]
 * @returns {ProjectDetection}
 */
export function detectProjects(repoRoot, options = {}) {
  const absoluteRoot = path.resolve(repoRoot);
  const markerGroups = removeLiteralCargoWorkspaceAggregates(
    absoluteRoot,
    collapseOwnedMavenModules(
      absoluteRoot,
      collapseOwnedGradleModules(
        absoluteRoot,
        collapseLiteralCSharpProjectPair(absoluteRoot, collectMarkerGroups(absoluteRoot))
      )
    )
  );
  const projects = [...markerGroups.values()]
    .map((project) => toDetectedProject(absoluteRoot, project))
    .filter((project) => !isExcludedProjectRoot(project.root, options.excludeProjectRoots))
    .sort((a, b) => a.root.localeCompare(b.root));

  return {
    schemaVersion: "project-detection/v1",
    root: absoluteRoot,
    projects,
    summary: {
      projectCount: projects.length,
      supportedProjectCount: projects.filter((project) => project.supported).length,
      unsupportedProjectCount: projects.filter((project) => !project.supported).length
    }
  };
}

function collapseLiteralCSharpProjectPair(repoRoot, markerGroups) {
  const globalJson = analyzeRepositoryGlobalJson(repoRoot);
  const candidates = [...markerGroups.values()].flatMap((group) => {
    const projectMarkers = group.markerFiles.filter((markerFile) => markerFile.endsWith(".csproj"));
    return projectMarkers.length === 1 && group.markerFiles.length === 1
      ? [{ group, markerFile: projectMarkers[0] }]
      : [];
  });
  if (candidates.length < 2) return markerGroups;

  const projects = candidates.map((candidate) => ({
    ...candidate,
    content: fs.readFileSync(path.resolve(repoRoot, candidate.markerFile), "utf8"),
    inherited: readDetectorCSharpProps(repoRoot, candidate.markerFile)
  }));
  const testProjects = projects.filter((project) => isDetectorCSharpTestProject(project.content, project.inherited, globalJson));
  const sourceProjects = projects.filter((project) => !isDetectorCSharpTestProject(project.content, project.inherited, globalJson));
  const literalPairs = testProjects.flatMap((testProject) => (
    sourceProjects
      .filter((sourceProject) => hasLiteralDetectorProjectReference(
        testProject.markerFile,
        testProject.content,
        sourceProject.markerFile
      ))
      .map((sourceProject) => ({ sourceProject, testProject }))
  ));
  if (literalPairs.length !== 1) return markerGroups;

  const { sourceProject, testProject } = literalPairs[0];

  const aggregateRoot = commonProjectRoot(testProject.group.root, sourceProject.group.root);
  const existingAggregate = markerGroups.get(aggregateRoot);
  const selectedOwnsAggregate = testProject.group.root === aggregateRoot || sourceProject.group.root === aggregateRoot;
  if (existingAggregate && !selectedOwnsAggregate) return markerGroups;

  const collapsed = new Map(markerGroups);
  collapsed.delete(testProject.group.root);
  collapsed.delete(sourceProject.group.root);
  collapsed.set(aggregateRoot, {
    root: aggregateRoot,
    markerFiles: [sourceProject.markerFile, testProject.markerFile].sort(),
    ecosystems: new Set(["dotnet"]),
    languages: new Set(["csharp"])
  });
  return collapsed;
}

function readDetectorCSharpProps(repoRoot, projectPath) {
  const propsFile = findNearestDirectoryBuildProps(repoRoot, projectPath);
  if (!propsFile) return undefined;
  const analysis = analyzeDirectoryBuildProps(propsFile.content);
  return analysis.blockers.length === 0 && !propsFile.pathBlockers ? analysis : undefined;
}

function isDetectorCSharpTestProject(content, inherited, globalJson) {
  const localTestMarker = content.match(/<IsTestProject>\s*([^<]+?)\s*<\/IsTestProject>/i)?.[1]?.trim().toLowerCase();
  const hasLocalTestSdk = /<PackageReference\b[^>]*\bInclude\s*=\s*["']Microsoft\.NET\.Test\.Sdk["']/i.test(content);
  const projectSdk = content.match(/<Project\b[^>]*\bSdk\s*=\s*["']([^"']+)["']/i)?.[1];
  const isMstestSdk = /^MSTest\.Sdk(?:\/[^/]+)?$/.test(projectSdk ?? "");
  const isTestApplication = content.match(/<IsTestApplication>\s*([^<]+?)\s*<\/IsTestApplication>/i)?.[1]?.trim().toLowerCase();
  return localTestMarker === "true" ||
    (localTestMarker === undefined && inherited?.isTestProject === true) ||
    hasLocalTestSdk ||
    inherited?.packageReferences.includes("microsoft.net.test.sdk") ||
    (isMstestSdk && isTestApplication !== "false" && (projectSdk.includes("/") || globalJson.mstestSdkVersion !== undefined));
}

function hasLiteralDetectorProjectReference(testMarker, content, sourceMarker) {
  const tags = [...content.matchAll(/<ProjectReference\b[^>]*>/gi)].map((match) => match[0]);
  if (tags.length !== 1 || /\bCondition\s*=/i.test(tags[0])) return false;
  const reference = tags[0].match(/\bInclude\s*=\s*["']([^"']+)["']/i)?.[1]?.replaceAll("\\", "/");
  if (!reference || /[$*?]/.test(reference) || path.posix.isAbsolute(reference) || /^[A-Za-z]:\//.test(reference)) return false;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(testMarker), reference));
  return !resolved.startsWith("../") && resolved === sourceMarker;
}

function commonProjectRoot(left, right) {
  const leftParts = left === "." ? [] : left.split("/");
  const rightParts = right === "." ? [] : right.split("/");
  const common = [];
  while (common.length < leftParts.length && common.length < rightParts.length && leftParts[common.length] === rightParts[common.length]) {
    common.push(leftParts[common.length]);
  }
  return common.join("/") || ".";
}

function removeLiteralCargoWorkspaceAggregates(repoRoot, markerGroups) {
  const filtered = new Map(markerGroups);
  for (const group of markerGroups.values()) {
    const cargoMarker = group.markerFiles.find((markerFile) => /(?:^|\/)Cargo\.toml$/.test(markerFile));
    if (!cargoMarker) continue;
    const manifest = fs.readFileSync(path.resolve(repoRoot, cargoMarker), "utf8");
    const analysis = analyzeCargoWorkspace(path.dirname(path.resolve(repoRoot, cargoMarker)), manifest);
    if (!analysis.hasWorkspace || analysis.hasPackage || !analysis.complete) continue;
    const allMembersDetected = analysis.memberDirectories.every((memberDirectory) => {
      const projectRoot = group.root === "." ? memberDirectory : `${group.root}/${memberDirectory}`;
      return markerGroups.get(projectRoot)?.markerFiles.some((markerFile) => /(?:^|\/)Cargo\.toml$/.test(markerFile));
    });
    if (!allMembersDetected) continue;

    const markerFiles = group.markerFiles.filter((markerFile) => markerFile !== cargoMarker);
    if (markerFiles.length === 0) {
      filtered.delete(group.root);
      continue;
    }
    filtered.set(group.root, {
      ...group,
      markerFiles,
      ecosystems: new Set([...group.ecosystems].filter((ecosystem) => ecosystem !== "rust")),
      languages: new Set([...group.languages].filter((language) => language !== "rust"))
    });
  }
  return filtered;
}

function collapseOwnedMavenModules(repoRoot, markerGroups) {
  const collapsed = new Map(markerGroups);
  const groups = [...markerGroups.values()]
    .sort((left, right) => projectRootDepth(left.root) - projectRootDepth(right.root) || left.root.localeCompare(right.root));
  for (const group of groups) {
    if (!collapsed.has(group.root)) continue;
    const ownedRoots = completeOwnedMavenProjectRoots(repoRoot, group, markerGroups);
    if (!ownedRoots) continue;
    for (const projectRoot of ownedRoots) collapsed.delete(projectRoot);
  }
  return collapsed;
}

function completeOwnedMavenProjectRoots(repoRoot, group, markerGroups) {
  const pomMarker = group.markerFiles.find((markerFile) => /(?:^|\/)pom\.xml$/.test(markerFile));
  if (!pomMarker) return undefined;
  const rootPom = fs.readFileSync(path.resolve(repoRoot, pomMarker), "utf8");
  const rootCoordinate = readDetectorMavenCoordinate(rootPom);
  const pending = detectorMavenModuleDeclarations(rootPom).map((declaration) => ({
    declaration,
    parentRoot: group.root,
    parentGroupId: rootCoordinate?.groupId
  }));
  if (pending.length === 0) return [];

  const ownedRoots = new Set();
  for (let index = 0; index < pending.length; index += 1) {
    const { declaration, parentRoot, parentGroupId } = pending[index];
    if (!declaration.supported) return undefined;
    const projectRoot = parentRoot === "."
      ? declaration.directory
      : `${parentRoot}/${declaration.directory}`;
    if (ownedRoots.has(projectRoot)) continue;
    const candidate = markerGroups.get(projectRoot);
    const childPomMarker = candidate?.markerFiles.find((markerFile) => /(?:^|\/)pom\.xml$/.test(markerFile));
    if (!childPomMarker) return undefined;
    const childPom = fs.readFileSync(path.resolve(repoRoot, childPomMarker), "utf8");
    const coordinate = readDetectorMavenCoordinate(childPom, parentGroupId);
    if (!coordinate) return undefined;
    ownedRoots.add(projectRoot);
    for (const nestedDeclaration of detectorMavenModuleDeclarations(childPom)) {
      pending.push({
        declaration: nestedDeclaration,
        parentRoot: projectRoot,
        parentGroupId: coordinate.groupId
      });
    }
  }
  return ownedRoots;
}

function detectorMavenModuleDeclarations(content) {
  const pomText = content
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:profiles|build|reporting|dependencies|dependencyManagement)>[\s\S]*?<\/(?:profiles|build|reporting|dependencies|dependencyManagement)>/g, " ");
  const moduleText = [...pomText.matchAll(/<modules>([\s\S]*?)<\/modules>/g)]
    .map((match) => match[1])
    .join("\n");
  return [...moduleText.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)].map((match) => {
    const raw = match[1].trim();
    const directory = normalizeProjectPattern(raw).replace(/^\.\//, "").replace(/\/$/, "");
    const supported = Boolean(directory) &&
      directory !== "." &&
      !directory.startsWith("/") &&
      !/^[A-Za-z]:\//.test(directory) &&
      !directory.split("/").includes("..") &&
      !directory.includes("${");
    return { directory, supported };
  });
}

function readDetectorMavenCoordinate(content, fallbackGroupId) {
  const pomText = content.replace(/<!--[\s\S]*?-->/g, " ");
  const parentText = pomText.match(/<parent>([\s\S]*?)<\/parent>/)?.[1] ?? "";
  const projectText = pomText
    .replace(/<parent>[\s\S]*?<\/parent>/, " ")
    .replace(/<(?:dependencies|dependencyManagement|build|profiles|modules|properties|repositories|pluginRepositories|reporting)>[\s\S]*?<\/(?:dependencies|dependencyManagement|build|profiles|modules|properties|repositories|pluginRepositories|reporting)>/g, " ");
  const artifactId = detectorMavenElement(projectText, "artifactId");
  const groupId = detectorMavenElement(projectText, "groupId") ?? detectorMavenElement(parentText, "groupId") ?? fallbackGroupId;
  if (!artifactId || !groupId || artifactId.includes("${") || groupId.includes("${")) return undefined;
  return { artifactId, groupId };
}

function detectorMavenElement(content, name) {
  return content.match(new RegExp(`<${name}>\\s*([^<]+?)\\s*</${name}>`))?.[1].trim();
}

function projectRootDepth(root) {
  return root === "." ? 0 : normalizeProjectPattern(root).split("/").filter(Boolean).length;
}

function collapseOwnedGradleModules(repoRoot, markerGroups) {
  const collapsed = new Map(markerGroups);
  const groups = [...markerGroups.values()]
    .sort((left, right) => projectRootDepth(left.root) - projectRootDepth(right.root) || left.root.localeCompare(right.root));
  for (const group of groups) {
    if (!collapsed.has(group.root)) continue;
    const settingsMarker = group.markerFiles.find((markerFile) => /(?:^|\/)settings\.gradle(?:\.kts)?$/.test(markerFile));
    if (!settingsMarker) continue;
    const analysis = analyzeGradleSettings(fs.readFileSync(path.resolve(repoRoot, settingsMarker), "utf8"));
    if (
      analysis.hasUnsupportedDeclarations ||
      analysis.hasUnsupportedRemaps ||
      analysis.remappedProjectPaths.length > 0 ||
      analysis.declarations.some((declaration) => !declaration.supported)
    ) continue;

    const declarations = analysis.declarations.filter((declaration) => declaration.supported);
    const declaredDirectories = new Set(declarations.map((declaration) => declaration.directory));
    const ownedProjectRoots = declarations.map((declaration) => ({
      declaration,
      projectRoot: group.root === "." ? declaration.directory : `${group.root}/${declaration.directory}`
    }));
    const hasMissingBuild = ownedProjectRoots.some(({ projectRoot }) => {
      const candidate = markerGroups.get(projectRoot);
      return !candidate || !candidate.markerFiles.some((markerFile) => /(?:^|\/)build\.gradle(?:\.kts)?$/.test(markerFile));
    });
    if (hasMissingBuild) continue;

    const hasUnownedNestedSettings = ownedProjectRoots.some(({ declaration, projectRoot }) => {
      const candidate = markerGroups.get(projectRoot);
      const nestedSettingsMarker = candidate?.markerFiles.find((markerFile) => /(?:^|\/)settings\.gradle(?:\.kts)?$/.test(markerFile));
      if (!nestedSettingsMarker) return false;
      const nested = analyzeGradleSettings(fs.readFileSync(path.resolve(repoRoot, nestedSettingsMarker), "utf8"));
      return nested.hasUnsupportedDeclarations ||
        nested.hasUnsupportedRemaps ||
        nested.remappedProjectPaths.length > 0 ||
        nested.declarations.some((nestedDeclaration) =>
          !nestedDeclaration.supported ||
          !declaredDirectories.has(`${declaration.directory}/${nestedDeclaration.directory}`)
        );
    });
    if (hasUnownedNestedSettings) continue;

    for (const { projectRoot } of ownedProjectRoots) collapsed.delete(projectRoot);
  }
  return collapsed;
}

function isExcludedProjectRoot(projectRoot, excludeProjectRoots = []) {
  return excludeProjectRoots
    .map(normalizeProjectPattern)
    .some((pattern) => matchesProjectPattern(projectRoot, pattern));
}

function matchesProjectPattern(projectRoot, pattern) {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return projectRoot === prefix || projectRoot.startsWith(`${prefix}/`);
  }

  return projectRoot === pattern;
}

function normalizeProjectPattern(pattern) {
  return pattern.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "") || ".";
}

/**
 * @param {string} root
 * @returns {Map<string, ProjectMarkerGroup>}
 */
function collectMarkerGroups(root) {
  const groups = new Map();
  const swiftBazelRoots = new Map();

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const marker = MARKERS.find((candidate) =>
          candidate.directoryExtension && entry.name.endsWith(candidate.directoryExtension)
        );
        if (marker) {
          addMarkerGroup(groups, root, current, entry.name, marker);
          continue;
        }

        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          visit(path.join(current, entry.name));
        }
        continue;
      }

      const marker = MARKERS.find((candidate) =>
        candidate.fileName === entry.name ||
        (candidate.extension && entry.name.endsWith(candidate.extension))
      );
      if (!marker || !isApplicableMarker(current, marker, swiftBazelRoots)) continue;

      addMarkerGroup(groups, root, current, entry.name, marker);
    }
  }

  visit(root);
  return groups;
}

function isApplicableMarker(current, marker, swiftBazelRoots) {
  if (!marker.requiresSwiftRules) return true;
  if (!swiftBazelRoots.has(current)) swiftBazelRoots.set(current, containsSwiftBazelProject(current));
  return swiftBazelRoots.get(current);
}

function containsSwiftBazelProject(root) {
  let hasSwiftSource = false;
  let hasSwiftRule = false;

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) visit(path.join(current, entry.name));
        continue;
      }
      if (entry.name.endsWith(".swift")) hasSwiftSource = true;
      if (entry.name === "BUILD" || entry.name === "BUILD.bazel") {
        const content = fs.readFileSync(path.join(current, entry.name), "utf8");
        if (/\bswift_(?:library|binary|test)\s*\(/.test(content)) hasSwiftRule = true;
      }
      if (hasSwiftSource && hasSwiftRule) return;
    }
  }

  visit(root);
  return hasSwiftSource && hasSwiftRule;
}

/**
 * @param {Map<string, ProjectMarkerGroup>} groups
 * @param {string} root
 * @param {string} current
 * @param {string} markerName
 * @param {ProjectDetectionMarker} marker
 * @returns {void}
 */
function addMarkerGroup(groups, root, current, markerName, marker) {
  const projectRoot = path.relative(root, current).replaceAll(path.sep, "/") || ".";
  const group = groups.get(projectRoot) ?? {
    root: projectRoot,
    markerFiles: [],
    ecosystems: new Set(),
    languages: new Set()
  };

  group.markerFiles.push(path.posix.join(projectRoot, markerName).replace(/^\.\//, ""));
  group.ecosystems.add(marker.ecosystem);
  for (const language of marker.languages) {
    group.languages.add(language);
  }
  groups.set(projectRoot, group);
}

/**
 * @param {string} repoRoot
 * @param {ProjectMarkerGroup} project
 * @returns {DetectedProject}
 */
function toDetectedProject(repoRoot, project) {
  const ecosystems = [...project.ecosystems].sort();
  const languages = [...project.languages].sort();
  const adapterMatches = matchingAdapters({ ecosystems, languages });
  const adapterIds = adapterMatches.map((adapter) => adapter.adapterId);
  const supported = adapterIds.length > 0;

  return {
    id: project.root,
    root: project.root,
    absoluteRoot: path.resolve(repoRoot, project.root),
    ecosystems,
    languages,
    markerFiles: project.markerFiles.sort(),
    adapterIds,
    adapterMatches,
    supported,
    supportStatusReason: supported
      ? formatSupportedReason(adapterMatches)
      : formatUnsupportedReason(ecosystems, languages)
  };
}

/**
 * @param {{ ecosystems: string[], languages: string[] }} project
 * @returns {string[]}
 */
function matchingAdapters({ ecosystems, languages }) {
  const ecosystemSet = new Set(ecosystems);
  const languageSet = new Set(languages);

  return listAdapters()
    .map((adapter) => ({
      adapterId: adapter.id,
      maturity: adapter.maturity,
      matchedEcosystems: adapter.ecosystems.filter((ecosystem) => ecosystemSet.has(ecosystem)).sort(),
      matchedLanguages: adapter.languages.filter((language) => languageSet.has(language)).sort()
    }))
    .filter((adapter) => adapter.matchedEcosystems.length > 0 || adapter.matchedLanguages.length > 0)
    .sort((a, b) => a.adapterId.localeCompare(b.adapterId));
}

/**
 * @param {Array<{ adapterId: string, matchedEcosystems: string[], matchedLanguages: string[] }>} adapterMatches
 * @returns {string}
 */
function formatSupportedReason(adapterMatches) {
  return adapterMatches
    .map((adapter) => {
      const matches = [
        adapter.matchedEcosystems.length > 0 ? `ecosystems ${adapter.matchedEcosystems.join(", ")}` : undefined,
        adapter.matchedLanguages.length > 0 ? `languages ${adapter.matchedLanguages.join(", ")}` : undefined
      ].filter(Boolean);

      return `${adapter.adapterId} matched ${matches.join(" and ")}`;
    })
    .join("; ");
}

/**
 * @param {string[]} ecosystems
 * @param {string[]} languages
 * @returns {string}
 */
function formatUnsupportedReason(ecosystems, languages) {
  return `No registered adapter supports ecosystems ${ecosystems.join(", ")} with languages ${languages.join(", ")}.`;
}
