import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { normalizeChangedPath, readRepositoryTextFiles } from "../../core/repository-text-files.js";

const ignoredDirectoryNames = new Set([
  ".git", ".dart_tool", ".pub-cache", ".flutter-plugins", "build", "coverage", "node_modules", "vendor"
]);

// This adapter reports library import reachability, never executed calls or assertions.
export function auditDartRepo(root, options = {}) {
  const absoluteRoot = path.resolve(root);
  const files = readRepositoryTextFiles(absoluteRoot, {
    ignoredDirectoryNames,
    shouldPruneDirectory: ({ absolutePath }) => fs.existsSync(path.join(absolutePath, "pubspec.yaml")),
    shouldIncludeFile: ({ relativePath }) => relativePath === "pubspec.yaml" || relativePath === "dart_test.yaml" || relativePath.endsWith(".dart"),
    symbolicLinks: "skip"
  });
  const blockers = [];
  const pubspec = readPubspec(files.find((file) => file.path === "pubspec.yaml")?.content, blockers);
  const dependencies = { ...pubspec.dependencies, ...pubspec.dev_dependencies };
  const flutter = dependencies.flutter?.sdk === "flutter" || dependencies.flutter_test?.sdk === "flutter";
  const testFrameworks = [
    ...(Object.hasOwn(dependencies, "test") ? ["dart-test"] : []),
    ...(dependencies.flutter_test?.sdk === "flutter" ? ["flutter-test"] : [])
  ];
  const dartFiles = files.filter((file) => file.path.endsWith(".dart"))
    .map((file) => ({ ...file, tokens: tokenize(file.content) }));
  const sourceFiles = dartFiles.filter((file) => /^(lib|bin)\//.test(file.path));
  const sourcesByPath = new Map(sourceFiles.map((file) => [file.path, file]));
  const exportsBySource = new Map(sourceFiles.map((file) => [file.path, directives(file.tokens, "export")]));
  const testFiles = dartFiles.filter((file) => /^test\/.*_test\.dart$/.test(file.path));
  const runnableTests = testFiles.filter((file) => hasTestRegistration(file.tokens, testFrameworks));
  if (pubspec.workspace !== undefined) blockers.push("Pub workspace aggregates must be audited at individual member package roots.");
  if (files.some((file) => file.path === "dart_test.yaml")) blockers.push("Custom dart_test.yaml configuration requires command review.");
  if (testFrameworks.length === 0) blockers.push("No declared package:test or SDK flutter_test dependency was found.");
  if (runnableTests.length === 0) blockers.push("No conventional test/*_test.dart entrypoint with main() and test registration was found.");
  if (sourceFiles.length === 0) blockers.push("No owned Dart source files were found under lib/ or bin/.");

  const changedPaths = options.changedPaths
    ? new Set(options.changedPaths.map((entry) => normalizeChangedPath(absoluteRoot, entry))) : undefined;
  const evidenceBySource = new Map();
  if (typeof pubspec.name === "string") {
    for (const file of runnableTests) {
      for (const directive of directives(file.tokens, "import")) {
        const sourcePath = resolveOwnedUri(file.path, directive.uri, pubspec.name);
        const source = sourcesByPath.get(sourcePath);
        if (!source || isPart(source.tokens)) continue;
        const evidence = {
          testPath: file.path,
          kind: directive.uri.startsWith("package:") ? "package-entry-import" : "direct-relative-import",
          strength: directive.uri.startsWith("package:") ? "referenced" : "direct"
        };
        addEvidence(evidenceBySource, sourcePath, evidence);
        // Export reachability is weaker than a direct import. It does not prove
        // which exported symbols are called, and never crosses package ownership.
        const pending = [{ sourcePath, depth: 0 }];
        const visited = new Set([sourcePath]);
        for (let index = 0; index < pending.length; index++) {
          const current = pending[index];
          if (current.depth >= 3) continue;
          for (const exported of exportsBySource.get(current.sourcePath) ?? []) {
            const destination = resolveOwnedUri(current.sourcePath, exported.uri, pubspec.name);
            const owned = sourcesByPath.get(destination);
            if (!owned || isPart(owned.tokens) || visited.has(destination)) continue;
            visited.add(destination);
            addEvidence(evidenceBySource, destination, {
              testPath: file.path, kind: "bounded-dependency", strength: "indirect"
            });
            pending.push({ sourcePath: destination, depth: current.depth + 1 });
          }
        }
      }
    }
  }

  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  for (const file of sourceFiles) {
    if (changedPaths && !changedPaths.has(file.path)) continue;
    const code = file.tokens.filter((token) => token.type !== "string").map((token) => token.value).join(" ");
    const base = { id: file.path, name: path.posix.basename(file.path, ".dart"), path: file.path };
    const header = file.content.slice(0, file.tokens[0]?.start ?? file.content.length);
    const generated = /\.(?:g|freezed|gr)\.dart$/.test(file.path) || /^\/\/[^\n]*GENERATED CODE/m.test(header);
    const part = isPart(file.tokens);
    const exports = directives(file.tokens, "export");
    const directiveTokens = new Set([...exports, ...directives(file.tokens, "import")]
      .flatMap((entry) => Array.from({ length: entry.end - entry.start + 1 }, (_, offset) => entry.start + offset)));
    // A named or unnamed library directive is metadata, not runtime behavior.
    if (file.tokens[0]?.value === "library") {
      const end = file.tokens.findIndex((token) => token.value === ";");
      if (end >= 0 && file.tokens.slice(1, end).every((token) => token.type === "identifier" || token.value === ".")) {
        for (let index = 0; index <= end; index++) directiveTokens.add(index);
      }
    }
    const barrel = exports.length > 0 && file.tokens.every((_, index) => directiveTokens.has(index));
    const declarationCode = file.tokens.filter((token, index) => token.type !== "string" && !directiveTokens.has(index))
      .map((token) => token.value).join(" ");
    const abstractBody = /^abstract (?:interface )?class [^{}]+\{([^{}]*)\}$/.exec(declarationCode)?.[1];
    const typeOnly = abstractBody !== undefined && !/[=:]/.test(abstractBody);
    if (generated || part || barrel || typeOnly || !code.trim()) {
      skipped.push({ ...base, kind: "module", signals: barrel ? ["barrel-export"] : typeOnly ? ["type-only"] : [], riskReductionScore: 0, maintenanceCost: 1,
        reason: generated ? "Generated Dart source should be covered through its handwritten owner."
          : part ? "Dart part ownership requires library resolution; no independent test target is claimed."
            : barrel ? "Export-only library should be covered through its implementation libraries."
              : typeOnly ? "Abstract declarations have no method bodies or initializers; test their concrete implementations."
              : "No executable Dart source was found." });
      continue;
    }
    const branching = /\b(?:if|switch|throw|catch)\b/.test(code);
    const async = /\b(?:async|await|Stream|Future)\b/.test(code);
    const widget = flutter && /\bextends\s+(?:StatelessWidget|StatefulWidget|State)\b/.test(code);
    const signals = [...(branching ? ["branching-logic"] : []), ...(async ? ["async-or-concurrency"] : [])];
    const evidence = evidenceBySource.get(file.path) ?? [];
    const target = {
      ...base, kind: widget ? "component" : "module", signals: [...signals, ...(evidence.length ? ["matching-test"] : [])],
      risk: branching || async ? "high" : "medium", testability: widget ? "medium" : "high",
      recommendedTestLevel: widget ? (testFrameworks.includes("flutter-test") ? "component" : "none") : "unit",
      riskReductionScore: branching || async ? 8 : 5, maintenanceCost: widget ? 5 : 2,
      reasons: [branching ? "Conditional or error-handling behavior merits focused tests." : "Handwritten Dart behavior can be tested at its library boundary.",
        ...(async ? ["Asynchronous behavior needs success and failure cases."] : []),
        ...(evidence.length ? [evidence.some((item) => item.strength === "indirect")
          ? "A conventional test reaches this library through static imports or bounded exports; execution and assertions are not proven."
          : "A conventional test entrypoint imports this library; execution and assertions are not proven."] : [])],
      existingTestPaths: evidence.map((item) => item.testPath),
      ...(evidence.length ? { existingTestEvidence: evidence } : {})
    };
    (evidence.length ? coveredButRisky : untestedCandidates).push(target);
  }
  const byRisk = (a, b) => b.riskReductionScore - a.riskReductionScore || a.path.localeCompare(b.path);
  const profile = {
    root: absoluteRoot, languages: ["dart"], packageManagers: ["pub"], testFrameworks,
    architectures: [flutter ? "flutter" : "dart-package"],
    ...(blockers.length === 0 ? { testCommand: flutter ? "flutter test" : "dart test" } : {}),
    detectedConventions: ["Dart lib/ and bin/ source ownership", "Conventional test/*_test.dart entrypoints", "Static library imports are reachability evidence only"],
    existingTestLocations: [...new Set(testFiles.map((file) => path.posix.dirname(file.path)))].sort(),
    setupSignals: files.some((file) => file.path === "pubspec.yaml") ? ["pubspec.yaml"] : [],
    confidence: blockers.length ? "low" : "medium", blockers
  };
  return { schemaVersion: "audit/v1", profile, untestedCandidates: untestedCandidates.sort(byRisk),
    coveredButRisky: coveredButRisky.sort(byRisk), recommended: [...untestedCandidates, ...coveredButRisky].sort(byRisk),
    skipped, risks: blockers.length ? ["Resolve project blockers before using a verification command."] : [] };
}

function addEvidence(map, sourcePath, evidence) {
  if (!map.has(sourcePath)) map.set(sourcePath, []);
  const entries = map.get(sourcePath);
  const index = entries.findIndex((entry) => entry.testPath === evidence.testPath);
  const strengths = { direct: 3, referenced: 2, indirect: 1 };
  if (index < 0) entries.push(evidence);
  else if (strengths[evidence.strength] > strengths[entries[index].strength]) entries[index] = evidence;
}

function readPubspec(content, blockers) {
  try {
    if (content === undefined) throw new Error("missing pubspec.yaml");
    const document = parseDocument(content, { uniqueKeys: true });
    if (document.errors.length) throw new Error("invalid YAML");
    const value = document.toJS({ maxAliasCount: 50 });
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected a mapping");
    if (typeof value.name !== "string" || !/^[a-z_][a-z0-9_]*$/.test(value.name)) throw new Error("missing or invalid package name");
    for (const key of ["dependencies", "dev_dependencies"]) {
      if (value[key] !== undefined && (!value[key] || typeof value[key] !== "object" || Array.isArray(value[key]))) throw new Error(`invalid ${key} mapping`);
    }
    if (!value.environment || typeof value.environment.sdk !== "string") blockers.push("A literal environment.sdk constraint is required in pubspec.yaml.");
    return value;
  } catch (error) {
    blockers.push(`Cannot establish Dart package metadata: ${error.message}.`);
    return {};
  }
}

// Tokenize comments and strings before inspecting directives. Nested block comments,
// raw strings and triple-quoted documentation cannot manufacture import evidence.
function tokenize(content) {
  const tokens = [];
  for (let i = 0; i < content.length;) {
    const start = i;
    if (/\s/.test(content[i])) { i++; continue; }
    if (content.startsWith("//", i)) {
      i = content.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    if (content.startsWith("/*", i)) {
      i += 2;
      let depth = 1;
      while (i < content.length && depth) {
        if (content.startsWith("/*", i)) { depth++; i += 2; }
        else if (content.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      continue;
    }
    const raw = content[i] === "r" && /['"]/.test(content[i + 1] ?? "");
    const quoteAt = i + (raw ? 1 : 0);
    if (content[quoteAt] === "'" || content[quoteAt] === '"') {
      const string = readString(content, quoteAt, raw);
      tokens.push({ type: "string", value: string.value, literal: string.literal, start });
      i = string.end;
      continue;
    }
    const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(content.slice(i));
    const value = identifier?.[0] ?? content[i];
    tokens.push({ type: identifier ? "identifier" : "punctuation", value, start });
    i += value.length;
  }
  return tokens;
}

function readString(content, quoteAt, raw, nesting = 0) {
  const quote = content[quoteAt];
  const delimiter = content.startsWith(quote.repeat(3), quoteAt) ? quote.repeat(3) : quote;
  const start = quoteAt + delimiter.length;
  let i = start;
  let literal = true;
  // Bound malformed/adversarial nested interpolation without exposing its text as code.
  if (nesting >= 32) return { end: content.length, value: "", literal: false };
  while (i < content.length && !content.startsWith(delimiter, i)) {
    if (!raw && (content[i] === "\\" || content[i] === "$")) literal = false;
    if (!raw && content.startsWith("${", i)) {
      i += 2;
      let depth = 1;
      while (i < content.length && depth) {
        if (content.startsWith("//", i)) {
          const newline = content.indexOf("\n", i);
          i = newline < 0 ? content.length : newline + 1;
        } else if (content.startsWith("/*", i)) {
          i += 2;
          let comments = 1;
          while (i < content.length && comments) {
            if (content.startsWith("/*", i)) { comments++; i += 2; }
            else if (content.startsWith("*/", i)) { comments--; i += 2; }
            else i++;
          }
        } else {
          const nestedRaw = content[i] === "r" && /['"]/.test(content[i + 1] ?? "");
          const nestedQuote = i + (nestedRaw ? 1 : 0);
          if (content[nestedQuote] === "'" || content[nestedQuote] === '"') {
            i = readString(content, nestedQuote, nestedRaw, nesting + 1).end;
          } else {
            if (content[i] === "{") depth++;
            if (content[i] === "}") depth--;
            i++;
          }
        }
      }
    } else {
      i += !raw && content[i] === "\\" ? 2 : 1;
    }
  }
  return { value: content.slice(start, i), literal: literal && i < content.length,
    end: Math.min(content.length, i + delimiter.length) };
}

function directives(tokens, kind) {
  const result = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "string") continue;
    if (token.value === "{") depth++;
    if (token.value === "}") depth--;
    if (depth !== 0 || token.value !== kind || tokens[i + 1]?.type !== "string") continue;
    const end = tokens.findIndex((item, index) => index > i && item.value === ";" && item.type !== "string");
    if (end < 0) continue;
    const tail = tokens.slice(i + 2, end).map((item) => item.value);
    const uri = tokens[i + 1];
    // Conditional/deferred imports do not establish an unconditional edge.
    if (uri.literal && /^(?:as [A-Za-z_$][\w$]* ?)?(?:(?:show|hide) [A-Za-z_$][\w$]*(?: , [A-Za-z_$][\w$]*)* ?)*$/.test(tail.join(" "))) {
      result.push({ uri: uri.value, tail, start: i, end });
    }
    i = end;
  }
  return result;
}

function isPart(tokens) {
  return tokens.some((token, i) => token.type !== "string" && token.value === "part" && tokens[i + 1]?.value === "of");
}

function resolveOwnedUri(testPath, uri, packageName) {
  if (/[\\%?#]/.test(uri)) return undefined;
  if (uri.startsWith(`package:${packageName}/`)) {
    const relative = uri.slice(`package:${packageName}/`.length);
    if (relative.split("/").some((segment) => segment === ".." || segment === "." || !segment)) return undefined;
    return `lib/${relative}`;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri) || uri.startsWith("/")) return undefined;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(testPath), uri));
  return /^(lib|bin)\//.test(resolved) ? resolved : undefined;
}

function hasTestRegistration(tokens, frameworks) {
  const imports = directives(tokens, "import").filter((entry) =>
    entry.uri === "package:test/test.dart" && frameworks.includes("dart-test") ||
    entry.uri === "package:flutter_test/flutter_test.dart" && frameworks.includes("flutter-test"));
  const main = tokens.findIndex((token, i) => token.type === "identifier" && token.value === "main" && tokens[i + 1]?.value === "(");
  if (main < 0) return false;
  // Only a conventional top-level main body is accepted; no custom runner resolution.
  const before = tokens.slice(0, main).filter((token) => token.type !== "string").map((token) => token.value);
  if (before.filter((value) => value === "{").length !== before.filter((value) => value === "}").length) return false;
  let bodyStart = main + 2;
  while (bodyStart < tokens.length && tokens[bodyStart].value !== ")") bodyStart++;
  bodyStart++;
  if (tokens[bodyStart]?.value === "async") bodyStart++;
  if (tokens[bodyStart]?.value !== "{") return false;
  let depth = 1;
  let end = bodyStart + 1;
  for (; end < tokens.length && depth; end++) {
    if (tokens[end].type === "string") continue;
    if (tokens[end].value === "{") depth++;
    if (tokens[end].value === "}") depth--;
  }
  if (depth) return false;
  const body = tokens.slice(bodyStart + 1, end - 1);
  return imports.some(({ uri, tail }) => {
    const prefix = tail.includes("as") ? tail[tail.indexOf("as") + 1] : undefined;
    const names = uri.includes("flutter_test") ? ["test", "testWidgets"] : ["test"];
    return names.some((name) => {
      for (let index = 0; index < tail.length; index++) {
        if (tail[index] !== "show" && tail[index] !== "hide") continue;
        let end = index + 1;
        while (end < tail.length && tail[end] !== "show" && tail[end] !== "hide") end++;
        const included = tail.slice(index + 1, end).includes(name);
        if (tail[index] === "show" ? !included : included) return false;
        index = end - 1;
      }
      return body.some((token, i) => token.type === "identifier" && token.value === name && body[i + 1]?.value === "(" &&
        (prefix ? body[i - 1]?.value === "." && body[i - 2]?.value === prefix : body[i - 1]?.value !== "."));
    });
  });
}
