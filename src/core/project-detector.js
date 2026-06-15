import fs from "node:fs";
import path from "node:path";
import { listAdapters } from "./adapter-registry.js";

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", "coverage", "target"]);

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
    fileName: "Package.swift",
    ecosystem: "swift",
    languages: ["swift"]
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

function collectMarkerGroups(root) {
  const groups = new Map();

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          visit(path.join(current, entry.name));
        }
        continue;
      }

      const marker = MARKERS.find((candidate) => candidate.fileName === entry.name);
      if (!marker) continue;

      const projectRoot = path.relative(root, current).replaceAll(path.sep, "/") || ".";
      const group = groups.get(projectRoot) ?? {
        root: projectRoot,
        markerFiles: [],
        ecosystems: new Set(),
        languages: new Set()
      };

      group.markerFiles.push(path.posix.join(projectRoot, entry.name).replace(/^\.\//, ""));
      group.ecosystems.add(marker.ecosystem);
      for (const language of marker.languages) {
        group.languages.add(language);
      }
      groups.set(projectRoot, group);
    }
  }

  visit(root);
  return groups;
}

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
