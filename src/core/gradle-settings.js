export function analyzeGradleSettings(content) {
  const settingsText = stripGradleComments(content);
  const declarations = new Map();
  let hasUnsupportedDeclarations = false;

  for (const match of settingsText.matchAll(/\binclude\s*\(([^)]*)\)/g)) {
    const parsed = parseLiteralList(match[1]);
    hasUnsupportedDeclarations ||= !parsed.supported;
    for (const raw of parsed.values) addDeclaration(declarations, raw);
  }
  for (const match of settingsText.matchAll(/^\s*include\s+(?!\()([^\r\n]+)$/gm)) {
    const parsed = parseLiteralList(match[1]);
    hasUnsupportedDeclarations ||= !parsed.supported;
    for (const raw of parsed.values) addDeclaration(declarations, raw);
  }

  const remappedProjectPaths = new Set();
  let remapCount = 0;
  for (const match of settingsText.matchAll(/\bproject\s*\(\s*["'](:[^"']+)["']\s*\)\s*\.\s*projectDir\s*=/g)) {
    const declaration = normalizeGradleProjectPath(match[1]);
    if (declaration.supported) {
      remapCount += 1;
      remappedProjectPaths.add(declaration.projectPath);
    }
  }
  const projectDirAssignmentCount = [...settingsText.matchAll(/\bproject\s*\([^)]*\)\s*\.\s*projectDir\s*=/g)].length;

  return {
    declarations: [...declarations.values()],
    hasUnsupportedDeclarations,
    remappedProjectPaths: [...remappedProjectPaths].sort(),
    hasUnsupportedRemaps: projectDirAssignmentCount > remapCount
  };
}

function addDeclaration(declarations, raw) {
  const declaration = normalizeGradleProjectPath(raw);
  if (!declaration.supported) {
    declarations.set(`unsupported:${raw}`, declaration);
    return;
  }
  declarations.set(declaration.projectPath, declaration);
}

function normalizeGradleProjectPath(raw) {
  const normalized = raw.replace(/^:/, "").replaceAll("/", ":");
  const segments = normalized.split(":");
  const supported = Boolean(normalized) &&
    !raw.startsWith("/") &&
    !/^[A-Za-z]:[\\/]/.test(raw) &&
    !raw.includes("\\") &&
    !raw.includes("$") &&
    segments.every((segment) => Boolean(segment) && segment !== "." && segment !== ".." && !/\s/.test(segment));
  return {
    raw,
    projectPath: supported ? `:${normalized}` : undefined,
    directory: supported ? segments.join("/") : undefined,
    supported
  };
}

function parseLiteralList(content) {
  const values = [];
  const withoutStrings = content.replace(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g, (_match, doubleQuoted, singleQuoted) => {
    values.push(doubleQuoted ?? singleQuoted);
    return " ";
  });
  return {
    values,
    supported: values.length > 0 && !/[^\s,;]/.test(withoutStrings)
  };
}

function stripGradleComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, "");
}
