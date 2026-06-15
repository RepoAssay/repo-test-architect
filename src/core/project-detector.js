import fs from "node:fs";
import path from "node:path";
import { listAdapters } from "./adapter-registry.js";

const IGNORED_DIRECTORIES = new Set([
  ".build",
  ".git",
  ".gradle",
  ".swiftpm",
  ".venv",
  "bin",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "obj",
  "target",
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
    directoryExtension: ".xcodeproj",
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
 * @property {boolean} supported
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
 */

/**
 * @returns {ProjectDetectionRules}
 */
export function getProjectDetectionRules() {
  return {
    schemaVersion: "project-detection-rules/v1",
    markers: MARKERS.map((marker) => ({
      ...marker,
      languages: [...marker.languages]
    })),
    ignoredDirectories: [...IGNORED_DIRECTORIES].sort()
  };
}

/**
 * @param {string} repoRoot
 * @returns {ProjectDetection}
 */
export function detectProjects(repoRoot) {
  const absoluteRoot = path.resolve(repoRoot);
  const markerGroups = collectMarkerGroups(absoluteRoot);
  const projects = [...markerGroups.values()]
    .map((project) => toDetectedProject(absoluteRoot, project))
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

/**
 * @param {string} root
 * @returns {Map<string, ProjectMarkerGroup>}
 */
function collectMarkerGroups(root) {
  const groups = new Map();

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
      if (!marker) continue;

      addMarkerGroup(groups, root, current, entry.name, marker);
    }
  }

  visit(root);
  return groups;
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
  const adapterIds = matchingAdapterIds({ ecosystems, languages });

  return {
    id: project.root,
    root: project.root,
    absoluteRoot: path.resolve(repoRoot, project.root),
    ecosystems,
    languages,
    markerFiles: project.markerFiles.sort(),
    adapterIds,
    supported: adapterIds.length > 0
  };
}

/**
 * @param {{ ecosystems: string[], languages: string[] }} project
 * @returns {string[]}
 */
function matchingAdapterIds({ ecosystems, languages }) {
  const ecosystemSet = new Set(ecosystems);
  const languageSet = new Set(languages);

  return listAdapters()
    .filter((adapter) =>
      adapter.ecosystems.some((ecosystem) => ecosystemSet.has(ecosystem)) ||
      adapter.languages.some((language) => languageSet.has(language))
    )
    .map((adapter) => adapter.id)
    .sort();
}
