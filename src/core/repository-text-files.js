import fs from "node:fs";
import path from "node:path";

export function readRepositoryTextFiles(root, {
  ignoredDirectoryNames = new Set(),
  shouldPruneDirectory = () => false,
  shouldIncludeFile,
  symbolicLinks = "skip"
}) {
  if (typeof shouldIncludeFile !== "function") {
    throw new TypeError("readRepositoryTextFiles requires shouldIncludeFile.");
  }
  if (symbolicLinks !== "skip") {
    throw new TypeError("readRepositoryTextFiles currently supports only symbolicLinks: skip.");
  }

  const files = [];

  function visit(current, depth) {
    const currentRelativePath = normalizeRepositoryPath(path.relative(root, current));
    if (depth > 0 && shouldPruneDirectory({
      absolutePath: current,
      relativePath: currentRelativePath,
      depth
    })) return;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (ignoredDirectoryNames.has(entry.name) || entry.isSymbolicLink()) continue;
      const absolutePath = path.join(current, entry.name);
      const relativePath = normalizeRepositoryPath(path.relative(root, absolutePath));
      if (entry.isDirectory()) {
        visit(absolutePath, depth + 1);
      } else if (shouldIncludeFile({ absolutePath, relativePath, depth })) {
        files.push({
          path: relativePath,
          content: fs.readFileSync(absolutePath, "utf8")
        });
      }
    }
  }

  visit(root, 0);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function normalizeRepositoryPath(filePath) {
  return filePath.replaceAll("\\", "/");
}

export function normalizeChangedPath(root, currentPath) {
  const portable = normalizeRepositoryPath(currentPath);
  if (path.isAbsolute(currentPath)) {
    return normalizeRepositoryPath(path.relative(root, currentPath));
  }
  if (/^[A-Za-z]:\//.test(portable)) {
    const portableRoot = normalizeRepositoryPath(root);
    return portable.startsWith(`${portableRoot}/`)
      ? portable.slice(portableRoot.length + 1)
      : portable;
  }
  return portable.replace(/^\.\//, "");
}
