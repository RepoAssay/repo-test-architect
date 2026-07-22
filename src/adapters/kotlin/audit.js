import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = [".kt", ".java", ".groovy"];
const BUILD_FILE_NAMES = new Set([
  "build.gradle",
  "build.gradle.kts",
  "gradle.properties",
  "gradlew",
  "gradlew.bat",
  "mvnw",
  "mvnw.cmd",
  "pom.xml",
  "settings.gradle",
  "settings.gradle.kts"
]);

export function auditKotlinRepo(root, options = {}) {
  const files = readRepoFiles(root);
  const modules = resolveJvmModules(files);
  const profile = buildProfile(root, files, modules);
  const changedPaths = options.changedPaths
    ? new Set(options.changedPaths.map((currentPath) => normalizeChangedPath(root, currentPath)))
    : undefined;
  const testFiles = files
    .filter((file) => isEvidenceTestFile(file, files, modules, profile.testFrameworks))
    .map((file) => ({
      ...file,
      path: normalizePath(file.path),
      moduleProjectPath: moduleForPath(file.path, modules, "test")?.projectPath,
      analysis: analyzeJvmFile(file.content, file.path)
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const sourceFiles = files
    .filter((candidate) => isSourceFile(candidate.path, modules))
    .map((file) => ({ ...file, moduleProjectPath: moduleForPath(file.path, modules, "main")?.projectPath }));
  const sourceSymbols = collectSourceSymbols(sourceFiles);
  const testEvidenceBySourcePath = collectJvmTestEvidence(sourceSymbols, testFiles, modules);
  const untestedCandidates = [];
  const coveredButRisky = [];
  const skipped = [];
  const risks = [];

  for (const file of sourceFiles.filter((candidate) => isIncludedByChangedPaths(candidate.path, changedPaths))) {
    const name = basenameWithoutExtension(file.path);
    const classification = classifySourceFile(file);
    const existingTestEvidence = testEvidenceBySourcePath.get(normalizePath(file.path)) ?? [];
    const existingTestPaths = existingTestEvidence.map((evidence) => evidence.testPath);

    if (classification.skipReason) {
      skipped.push({
        id: file.path,
        name,
        path: file.path,
        kind: classification.kind,
        signals: classification.signals,
        riskReductionScore: classification.riskReductionScore,
        maintenanceCost: classification.maintenanceCost,
        reason: classification.skipReason,
        preferredCoveragePath: classification.preferredCoveragePath
      });
      continue;
    }

    const target = {
      id: file.path,
      name,
      path: file.path,
      kind: classification.kind,
      signals: existingTestPaths.length > 0 ? [...classification.signals, "matching-test"] : classification.signals,
      risk: classification.risk,
      testability: classification.testability,
      recommendedTestLevel: classification.testLevel,
      riskReductionScore: classification.riskReductionScore,
      maintenanceCost: classification.maintenanceCost,
      reasons:
        existingTestPaths.length > 0
          ? [...classification.reasons, "Existing test evidence detected; review missing edge cases"]
          : classification.reasons,
      existingTestPaths,
      ...(existingTestEvidence.length > 0 ? { existingTestEvidence } : {})
    };

    if (existingTestPaths.length > 0) coveredButRisky.push(target);
    else untestedCandidates.push(target);

    if (classification.risk === "high") {
      const coverageState = existingTestPaths.length > 0 ? "needs edge-case review" : "has no matching test evidence";
      risks.push(`${name} has ${classification.reasons.join(", ").toLowerCase()} and ${coverageState}.`);
    }
  }

  const recommended = [...untestedCandidates, ...coveredButRisky].sort(byRiskThenName);

  return {
    schemaVersion: "audit/v1",
    profile,
    untestedCandidates: untestedCandidates.sort(byRiskThenName),
    coveredButRisky: coveredButRisky.sort(byRiskThenName),
    recommended,
    skipped: skipped.sort((a, b) => a.name.localeCompare(b.name)),
    risks
  };
}

function isIncludedByChangedPaths(currentPath, changedPaths) {
  return !changedPaths || changedPaths.has(normalizePath(currentPath));
}

function readRepoFiles(root) {
  const ignored = new Set([".git", ".gradle", ".idea", "build", "generated", "out", "target"]);
  const files = [];

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      const relative = normalizePath(path.relative(root, absolute));

      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (entry.isSymbolicLink()) continue;
      if (shouldRead(relative)) files.push({ path: relative, content: fs.readFileSync(absolute, "utf8") });
    }
  }

  visit(root);
  return files;
}

function shouldRead(relative) {
  const normalized = normalizePath(relative);
  return SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension)) || BUILD_FILE_NAMES.has(normalized.split("/").at(-1));
}

function resolveJvmModules(files) {
  const settings = files.find((file) => ["settings.gradle", "settings.gradle.kts"].includes(normalizePath(file.path)));
  if (settings) return resolveGradleModules(files, settings);
  const rootPom = files.find((file) => normalizePath(file.path) === "pom.xml");
  if (rootPom) return resolveMavenModules(files, rootPom);
  return [{ projectPath: ":", directory: ".", dependencies: new Set(), exportedDependencies: new Set(), reachableDependencies: new Set(), buildSystem: undefined }];
}

function resolveGradleModules(files, settings) {
  const paths = new Set(files.map((file) => normalizePath(file.path)));
  const declarations = declaredGradleProjectPaths(settings.content);
  const modules = [{ projectPath: ":", directory: ".", dependencies: new Set(), exportedDependencies: new Set(), buildSystem: "gradle" }];

  for (const declaration of declarations) {
    const hasBuildFile = ["build.gradle", "build.gradle.kts"]
      .some((name) => paths.has(`${declaration.directory}/${name}`));
    if (!hasBuildFile) continue;
    modules.push({ ...declaration, dependencies: new Set(), exportedDependencies: new Set(), buildSystem: "gradle" });
  }

  for (const module of modules) {
    const buildText = moduleBuildText(module, files);
    const declaredDependencies = declaredGradleProjectDependencies(buildText);
    for (const dependency of declaredDependencies.direct) module.dependencies.add(dependency);
    for (const dependency of declaredDependencies.exported) module.exportedDependencies.add(dependency);
  }

  populateReachableModuleDependencies(modules);
  return modules.sort((left, right) => right.directory.length - left.directory.length || left.projectPath.localeCompare(right.projectPath));
}

function resolveMavenModules(files, rootPom) {
  const paths = new Set(files.map((file) => normalizePath(file.path)));
  const rootCoordinate = readMavenCoordinate(rootPom.content);
  const rootProjectPath = rootCoordinate?.id ?? "maven:.";
  const modules = [{
    projectPath: rootProjectPath,
    directory: ".",
    dependencies: new Set(),
    exportedDependencies: new Set(),
    buildSystem: "maven",
    coordinate: rootCoordinate
  }];

  for (const directory of declaredMavenModules(rootPom.content)) {
    const pomPath = `${directory}/pom.xml`;
    if (!paths.has(pomPath)) continue;
    const pom = files.find((file) => normalizePath(file.path) === pomPath);
    const coordinate = readMavenCoordinate(pom?.content ?? "", rootCoordinate?.groupId);
    if (!coordinate) continue;
    modules.push({
      projectPath: coordinate.id,
      directory,
      dependencies: new Set(),
      exportedDependencies: new Set(),
      buildSystem: "maven",
      coordinate
    });
  }

  for (const module of modules) {
    const buildText = moduleBuildText(module, files);
    const declaredDependencies = declaredMavenDependencies(buildText, module.coordinate?.groupId);
    for (const dependency of declaredDependencies.direct) module.dependencies.add(dependency);
    for (const dependency of declaredDependencies.exported) module.exportedDependencies.add(dependency);
  }

  populateReachableModuleDependencies(modules);
  return modules.sort((left, right) => right.directory.length - left.directory.length || left.projectPath.localeCompare(right.projectPath));
}

function populateReachableModuleDependencies(modules) {
  const modulesByProjectPath = new Map(modules.map((module) => [module.projectPath, module]));
  for (const module of modules) {
    const reachable = new Set(module.dependencies);
    const pending = [...module.dependencies];
    const visited = new Set([module.projectPath]);
    for (let index = 0; index < pending.length; index += 1) {
      const currentProjectPath = pending[index];
      if (visited.has(currentProjectPath)) continue;
      visited.add(currentProjectPath);
      const currentModule = modulesByProjectPath.get(currentProjectPath);
      if (!currentModule) continue;
      for (const dependency of currentModule.exportedDependencies) {
        reachable.add(dependency);
        if (!visited.has(dependency)) pending.push(dependency);
      }
    }
    module.reachableDependencies = reachable;
  }
}

function declaredMavenModules(content) {
  const pomText = stripMavenComments(content)
    .replace(/<(?:profiles|build|reporting|dependencies|dependencyManagement)>[\s\S]*?<\/(?:profiles|build|reporting|dependencies|dependencyManagement)>/g, " ");
  const moduleText = [...pomText.matchAll(/<modules>([\s\S]*?)<\/modules>/g)].map((match) => match[1]).join("\n");
  return [...moduleText.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)]
    .map((match) => normalizePath(match[1].trim()).replace(/^\.\//, "").replace(/\/$/, ""))
    .filter((modulePath) => modulePath && !modulePath.startsWith("/") && !modulePath.split("/").includes("..") && !modulePath.includes("${"));
}

function readMavenCoordinate(content, fallbackGroupId) {
  const pomText = stripMavenComments(content);
  const parentText = pomText.match(/<parent>([\s\S]*?)<\/parent>/)?.[1] ?? "";
  const projectText = pomText
    .replace(/<parent>[\s\S]*?<\/parent>/, " ")
    .replace(/<(?:dependencies|dependencyManagement|build|profiles|modules|properties|repositories|pluginRepositories|reporting)>[\s\S]*?<\/(?:dependencies|dependencyManagement|build|profiles|modules|properties|repositories|pluginRepositories|reporting)>/g, " ");
  const artifactId = mavenElement(projectText, "artifactId");
  const groupId = mavenElement(projectText, "groupId") ?? mavenElement(parentText, "groupId") ?? fallbackGroupId;
  if (!artifactId || !groupId || artifactId.includes("${") || groupId.includes("${")) return undefined;
  return { groupId, artifactId, id: `${groupId}:${artifactId}` };
}

function declaredMavenDependencies(content, moduleGroupId) {
  const direct = new Set();
  const exported = new Set();
  const pomText = stripMavenComments(content)
    .replace(/<profiles>[\s\S]*?<\/profiles>/g, " ")
    .replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, " ")
    .replace(/<plugin>[\s\S]*?<\/plugin>/g, " ");
  for (const match of pomText.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const dependency = match[1];
    const artifactId = mavenElement(dependency, "artifactId");
    let groupId = mavenElement(dependency, "groupId");
    const scope = mavenElement(dependency, "scope") ?? "compile";
    const optional = mavenElement(dependency, "optional");
    if (["${project.groupId}", "${project.parent.groupId}", "${groupId}"].includes(groupId)) groupId = moduleGroupId;
    if (!artifactId || !groupId || !["compile", "provided", "test"].includes(scope)) continue;
    if (artifactId.includes("${") || groupId.includes("${")) continue;
    const coordinate = `${groupId}:${artifactId}`;
    direct.add(coordinate);
    const hasExclusions = /<exclusions>[\s\S]*?<\/exclusions>/.test(dependency);
    if (scope === "compile" && (!optional || optional === "false") && !hasExclusions) exported.add(coordinate);
  }
  return { direct, exported };
}

function mavenElement(content, name) {
  return content.match(new RegExp(`<${name}>\\s*([^<]+?)\\s*</${name}>`))?.[1].trim();
}

function stripMavenComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, " ");
}

function declaredGradleProjectDependencies(content) {
  const direct = new Set();
  const exported = new Set();
  const buildText = content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, "")
    .replace(/\bconstraints\s*\{[\s\S]*?\}/g, " ");
  const hasExclusions = /\bexclude\b/.test(buildText);
  const dependencyPattern = /\b(api|implementation|testImplementation|compileOnly|testCompileOnly)\s*(?:\(\s*)?project\s*\(\s*["'](:[^"']+)["']\s*\)/g;
  for (const match of buildText.matchAll(dependencyPattern)) {
    direct.add(match[2]);
    if (match[1] === "api" && !hasExclusions) exported.add(match[2]);
  }
  return { direct, exported };
}

function moduleBuildText(module, files) {
  const prefix = module.directory === "." ? "" : `${module.directory}/`;
  return files
    .filter((file) => ["build.gradle", "build.gradle.kts", "pom.xml"].includes(normalizePath(file.path).replace(prefix, "")))
    .filter((file) => !normalizePath(file.path).replace(prefix, "").includes("/"))
    .map((file) => file.content)
    .join("\n");
}

function moduleForPath(currentPath, modules, sourceSet) {
  const normalized = normalizePath(currentPath);
  const sourceDirectory = sourceSet === "test" ? "(?:kotlin|java|groovy)" : "(?:kotlin|java)";
  const sourceExtension = sourceSet === "test" ? "(?:kt|java|groovy)" : "(?:kt|java)";
  return modules.find((module) => {
    const prefix = module.directory === "." ? "" : `${module.directory}/`;
    return new RegExp(`^${escapeRegExp(prefix)}src/${sourceSet}/${sourceDirectory}/.+\\.${sourceExtension}$`).test(normalized);
  });
}

function buildProfile(root, files, modules) {
  const paths = files.map((file) => normalizePath(file.path));
  const buildText = modules.map((module) => moduleBuildText(module, files)).join("\n");
  const testText = files.filter((file) => isTestFile(file.path, modules)).map((file) => file.content).join("\n");
  const testFrameworks = detectTestFrameworks(buildText, testText, files, modules);
  const unsupportedProjectShapes = detectUnsupportedProjectShapes(buildText, paths);
  const testCommandResolution = detectTestCommand(root, paths, testFrameworks);
  const testCommand = testCommandResolution.command;
  const existingTestLocations = detectExistingTestLocations(paths, modules);
  const blockers = detectBlockers(paths, files, modules, testCommand, testFrameworks, unsupportedProjectShapes);

  return {
    root,
    languages: detectLanguages(paths),
    packageManagers: detectPackageManagers(paths, modules),
    testFrameworks,
    architectures: ["jvm"],
    testCommand,
    detectedConventions: detectConventions(paths, modules),
    existingTestLocations,
    setupSignals: detectSetupSignals(paths, buildText, testText, testCommandResolution, modules),
    confidence: scoreProfileConfidence(testFrameworks, existingTestLocations, blockers),
    blockers
  };
}

function detectLanguages(paths) {
  const languages = new Set();
  if (paths.some((item) => item.endsWith(".kt"))) languages.add("kotlin");
  if (paths.some((item) => item.endsWith(".java"))) languages.add("java");
  return [...languages].sort();
}

function detectPackageManagers(paths, modules) {
  const managers = new Set();
  if (modules.some((module) => {
    const prefix = module.directory === "." ? "" : `${module.directory}/`;
    return paths.includes(`${prefix}build.gradle`) || paths.includes(`${prefix}build.gradle.kts`);
  })) managers.add("gradle");
  if (paths.includes("pom.xml")) managers.add("maven");
  return [...managers].sort();
}

function detectTestFrameworks(buildText, testText, files, modules) {
  const frameworks = new Set();
  if (/kotlin\s*\(\s*["']test["']\s*\)|\bkotlin-test\b|\bkotlin\.test\b/.test(`${buildText}\n${testText}`)) frameworks.add("kotlin-test");
  if (/\b(?:junit|org\.junit|useJUnitPlatform)\b/i.test(`${buildText}\n${testText}`)) frameworks.add("junit");
  if (modules.some((module) => supportsKotestModule(module, files))) frameworks.add("kotest");
  if (modules.some((module) => supportsSpockModule(module, files))) frameworks.add("spock");
  if (modules.some((module) => supportsTestNgModule(module, files))) frameworks.add("testng");
  return [...frameworks].sort();
}

function usesKotest(content) {
  return /\b(?:io\.kotest|kotest)\b/i.test(content);
}

function supportsKotestModule(module, files) {
  const buildText = moduleBuildText(module, files);
  return module.buildSystem === "gradle" && usesKotest(buildText) && /\buseJUnitPlatform\s*\(/.test(buildText);
}

function usesSpock(content) {
  return /\b(?:org\.spockframework|spock-core|spock\.lang\.Specification|useSpock\s*\()/i.test(content);
}

function usesSpockSpecification(content) {
  return /\b(?:import\s+spock\.lang\.Specification|extends\s+(?:spock\.lang\.)?Specification)\b/.test(content);
}

function supportsSpockModule(module, files) {
  const buildText = moduleBuildText(module, files);
  return module.buildSystem === "gradle" && /\b(?:org\.spockframework|spock-core)\b/i.test(buildText) && /\buseJUnitPlatform\s*\(\s*\)/.test(buildText) && !hasAdvancedSpockExecution(module, files);
}

function hasAdvancedSpockExecution(module, files) {
  const buildText = moduleBuildText(module, files);
  const prefix = module.directory === "." ? "" : `${module.directory}/`;
  return /\b(?:includeTags|excludeTags|includeEngines|excludeEngines|includeTestsMatching|excludeTestsMatching)\s*(?:\(|["'])|\bscanForTestClasses\s*=/.test(buildText) ||
    files.some((file) => normalizePath(file.path).startsWith(`${prefix}src/test/resources/`) && normalizePath(file.path).endsWith("SpockConfig.groovy"));
}

function usesTestNg(content) {
  return /\b(?:org\.testng|testng)\b/i.test(content);
}

function usesTestNgAnnotations(content) {
  return /\borg\.testng\.annotations\b|@org\.testng\.annotations\./.test(content);
}

function supportsTestNgModule(module, files) {
  const buildText = moduleBuildText(module, files);
  if (hasAdvancedTestNgExecution(buildText)) return false;
  if (module.buildSystem === "gradle") return usesTestNg(buildText) && /\buseTestNG\s*\(/.test(buildText);
  if (module.buildSystem === "maven") {
    return declaredMavenDependencies(buildText, module.coordinate?.groupId).direct.has("org.testng:testng");
  }
  return false;
}

function declaresTestNgDependency(module, files) {
  const buildText = moduleBuildText(module, files);
  if (module.buildSystem === "gradle") return usesTestNg(buildText);
  if (module.buildSystem === "maven") {
    return declaredMavenDependencies(buildText, module.coordinate?.groupId).direct.has("org.testng:testng");
  }
  return false;
}

function hasAdvancedTestNgExecution(buildText) {
  return /\b(?:suiteXmlFiles|suites|includeGroups|excludeGroups|preserveOrder)\s*(?:\(|=)|\b(?:parallel|threadCount)\s*=|<(?:suiteXmlFiles|groups|excludedGroups|parallel|threadCount)>/i.test(buildText);
}

function detectUnsupportedProjectShapes(buildText, paths) {
  const shapes = [];
  if (
    /\bcom\.android\.(?:application|library|test)\b|\bid\s*\(?\s*["']com\.android\./i.test(buildText) ||
    paths.some((currentPath) => /(?:^|\/)src\/androidTest\//.test(currentPath))
  ) {
    shapes.push("Android unit and instrumentation source sets are outside the supported JVM module boundary.");
  }
  if (
    /\b(?:org\.jetbrains\.kotlin\.)?multiplatform\b|kotlin\s*\(\s*["']multiplatform["']\s*\)/i.test(buildText) ||
    paths.some((currentPath) => /(?:^|\/)src\/(?:common|jvm)(?:Main|Test)\//.test(currentPath))
  ) {
    shapes.push("Kotlin Multiplatform modules and target-specific source sets are outside the supported JVM module boundary.");
  }
  return shapes;
}

function detectTestCommand(root, paths, frameworks) {
  if (frameworks.length === 0) return {};
  if (paths.includes("gradlew") || paths.includes("gradlew.bat")) return { command: "./gradlew test" };
  if (paths.includes("build.gradle") || paths.includes("build.gradle.kts")) {
    return findParentGradleCommand(root) ?? { command: "gradle test" };
  }
  if (paths.includes("mvnw") || paths.includes("mvnw.cmd")) return { command: "./mvnw test" };
  if (paths.includes("pom.xml")) {
    return findParentMavenCommand(root) ?? { command: "mvn test" };
  }
  return {};
}

function findParentGradleCommand(root) {
  for (const ancestor of parentDirectories(root)) {
    const settingsPath = ["settings.gradle.kts", "settings.gradle"]
      .map((name) => path.join(ancestor, name))
      .find((candidate) => fs.existsSync(candidate));
    const wrapperPath = ["gradlew", "gradlew.bat"]
      .map((name) => path.join(ancestor, name))
      .find((candidate) => fs.existsSync(candidate));
    if (!settingsPath || !wrapperPath) continue;

    const moduleDirectory = normalizePath(path.relative(ancestor, root));
    if (!moduleDirectory || moduleDirectory.startsWith("../")) continue;
    const projectPath = declaredGradleProjectPaths(fs.readFileSync(settingsPath, "utf8"))
      .find((candidate) => candidate.directory === moduleDirectory)?.projectPath;
    if (!projectPath) continue;

    return {
      command: `${relativeCommandPath(root, wrapperPath)} ${projectPath}:test`,
      inheritedSignal: "parent gradle wrapper"
    };
  }
  return undefined;
}

function declaredGradleProjectPaths(content) {
  const settingsText = content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, "");
  const declarations = new Set();
  const remappedProjects = new Set(
    [...settingsText.matchAll(/\bproject\s*\(\s*["'](:[^"']+)["']\s*\)\s*\.\s*projectDir\s*=/g)]
      .map((match) => match[1])
  );
  for (const match of settingsText.matchAll(/\binclude\s*\(([^)]*)\)/g)) {
    for (const value of quotedValues(match[1])) declarations.add(value);
  }
  for (const match of settingsText.matchAll(/^\s*include\s+(?!\()([^\n]+)$/gm)) {
    for (const value of quotedValues(match[1])) declarations.add(value);
  }
  return [...declarations]
    .map((value) => value.replace(/^:/, "").replaceAll("/", ":"))
    .filter((value) => value && !value.includes(".."))
    .filter((value) => !remappedProjects.has(`:${value}`))
    .map((value) => ({ projectPath: `:${value}`, directory: value.replaceAll(":", "/") }));
}

function quotedValues(content) {
  return [...content.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

function findParentMavenCommand(root) {
  for (const ancestor of parentDirectories(root)) {
    const pomPath = path.join(ancestor, "pom.xml");
    const wrapperPath = ["mvnw", "mvnw.cmd"]
      .map((name) => path.join(ancestor, name))
      .find((candidate) => fs.existsSync(candidate));
    if (!fs.existsSync(pomPath) || !wrapperPath) continue;

    const moduleDirectory = normalizePath(path.relative(ancestor, root));
    if (!moduleDirectory || moduleDirectory.startsWith("../") || /\s/.test(moduleDirectory)) continue;
    const pomText = fs.readFileSync(pomPath, "utf8").replace(/<!--[\s\S]*?-->/g, " ");
    const declaredModules = [...pomText.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)]
      .map((match) => normalizePath(match[1].trim()).replace(/^\.\//, ""));
    if (!declaredModules.includes(moduleDirectory)) continue;

    return {
      command: `${relativeCommandPath(root, wrapperPath)} -f ${relativeCommandPath(root, pomPath)} -pl ${moduleDirectory} test`,
      inheritedSignal: "parent maven wrapper"
    };
  }
  return undefined;
}

function parentDirectories(root) {
  const directories = [];
  let current = path.dirname(path.resolve(root));
  while (current !== path.dirname(current)) {
    directories.push(current);
    current = path.dirname(current);
  }
  return directories;
}

function relativeCommandPath(root, target) {
  const relative = normalizePath(path.relative(root, target));
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function detectExistingTestLocations(paths, modules) {
  const locations = new Set();
  for (const module of modules) {
    const location = module.directory === "." ? "src/test" : `${module.directory}/src/test`;
    if (paths.some((item) => item.startsWith(`${location}/`))) locations.add(location);
  }
  return [...locations].sort();
}

function detectConventions(paths, modules) {
  const conventions = new Set();
  if (paths.some((item) => /(?:^|\/)(?:Test[^/]*|[^/]*(?:Test|Tests|TestCase))\.(?:kt|java)$/.test(item))) conventions.add("*Test files");
  if (paths.some((item) => /(?:^|\/)[^/]*Spec\.groovy$/.test(item))) conventions.add("*Spec files");
  if (paths.some((item) => moduleForPath(item, modules, "test") && /(?:^|\/)src\/test\/kotlin\//.test(item))) conventions.add("src/test/kotlin");
  if (paths.some((item) => moduleForPath(item, modules, "test") && /(?:^|\/)src\/test\/java\//.test(item))) conventions.add("src/test/java");
  if (paths.some((item) => moduleForPath(item, modules, "test") && /(?:^|\/)src\/test\/groovy\//.test(item))) conventions.add("src/test/groovy");
  return [...conventions];
}

function detectSetupSignals(paths, buildText, testText, testCommandResolution, modules) {
  const signals = new Set();
  if (paths.includes("build.gradle.kts")) signals.add("gradle kotlin dsl");
  if (paths.includes("build.gradle")) signals.add("gradle");
  if (paths.includes("settings.gradle.kts") || paths.includes("settings.gradle")) signals.add("gradle settings");
  if (paths.includes("gradlew") || paths.includes("gradlew.bat")) signals.add("gradle wrapper");
  if (paths.includes("pom.xml")) signals.add("maven");
  if (paths.includes("mvnw") || paths.includes("mvnw.cmd")) signals.add("maven wrapper");
  if (/useJUnitPlatform|org\.junit\.jupiter/i.test(`${buildText}\n${testText}`)) signals.add("junit platform");
  if (/org\.junit(?!\.(?:jupiter|platform))/i.test(`${buildText}\n${testText}`)) signals.add("junit 4");
  if (usesKotest(`${buildText}\n${testText}`)) signals.add("kotest");
  if (usesSpock(`${buildText}\n${testText}`)) signals.add("spock");
  if (usesTestNg(`${buildText}\n${testText}`)) signals.add("testng");
  if (testCommandResolution.inheritedSignal) signals.add(testCommandResolution.inheritedSignal);
  if (modules.some((module) => module.buildSystem === "gradle" && module.directory !== ".")) signals.add("gradle module graph");
  if (modules.some((module) => module.buildSystem === "maven" && module.directory !== ".")) signals.add("maven reactor graph");
  return [...signals];
}

function detectBlockers(paths, files, modules, testCommand, frameworks, unsupportedProjectShapes) {
  const blockers = [];
  if (frameworks.length === 0) blockers.push("No supported JVM test framework detected.");
  if (!testCommand) blockers.push("No runnable JVM test command detected from Gradle or Maven markers.");
  if (!paths.some((currentPath) => isSourceFile(currentPath, modules))) {
    const hasNestedSourceSet = paths.some((currentPath) => /(?:^|\/)src\/main\/(?:kotlin|java)\/.+\.(?:kt|java)$/.test(currentPath));
    blockers.push(
      hasNestedSourceSet
        ? "No supported root JVM source set detected; audit a Gradle or Maven module root."
        : "No supported src/main/java or src/main/kotlin source set detected."
    );
  }
  blockers.push(...detectKotestBlockers(files, modules));
  blockers.push(...detectSpockBlockers(files, modules));
  blockers.push(...detectTestNgBlockers(files, modules));
  blockers.push(...unsupportedProjectShapes);
  return blockers;
}

function detectKotestBlockers(files, modules) {
  const blockers = [];
  const kotestModules = modules.filter((module) => usesKotest(moduleBuildText(module, files)));
  const kotestTestText = files
    .filter((file) => isTestFile(file.path, modules) && usesKotest(file.content))
    .map((file) => file.content)
    .join("\n");
  if (kotestModules.length === 0 && !kotestTestText) return blockers;
  if (kotestModules.some((module) => !supportsKotestModule(module, files))) {
    blockers.push("Kotest support requires a Gradle JVM test task using JUnit Platform.");
  }

  const stripped = stripJvmCommentsAndStrings(kotestTestText);
  const styles = new Set(
    [...stripped.matchAll(/:\s*(?:io\.kotest\.core\.spec\.style\.)?([A-Z][A-Za-z]*Spec)\s*\(/g)]
      .map((match) => match[1])
  );
  const supportedStyles = new Set(["FunSpec", "ShouldSpec", "StringSpec"]);
  const unsupportedStyles = [...styles].filter((style) => !supportedStyles.has(style)).sort();
  if (unsupportedStyles.length > 0) {
    blockers.push(`Unsupported Kotest spec styles detected: ${unsupportedStyles.join(", ")}.`);
  }
  if (/\b(?:before|after|around)(?:Each|Any|Container|Test|Spec|Project)\s*(?:\(|\{)|\b(?:extensions?|listeners?)\s*\(|\bisolationMode\b|\b(?:Abstract)?ProjectConfig\b/.test(stripped)) {
    blockers.push("Kotest lifecycle hooks, extensions, and isolation configuration are outside the supported evidence boundary.");
  }
  if (/\b(?:withData|checkAll|forAll)\s*(?:<[^>\n]+>\s*)?[({]/.test(stripped)) {
    blockers.push("Kotest data-driven and property tests are outside the supported evidence boundary.");
  }
  return blockers;
}

function detectTestNgBlockers(files, modules) {
  const blockers = [];
  const testNgModules = modules.filter((module) => declaresTestNgDependency(module, files));
  const testNgFiles = files.filter((file) => isTestFile(file.path, modules) && usesTestNgAnnotations(file.content));
  if (testNgModules.length === 0 && testNgFiles.length === 0) return blockers;

  const hasUnsupportedExecution =
    testNgModules.some((module) => !supportsTestNgModule(module, files)) ||
    testNgFiles.some((file) => {
      const module = moduleForPath(file.path, modules, "test");
      return !module || !supportsTestNgModule(module, files);
    });
  if (hasUnsupportedExecution) {
    blockers.push("TestNG support requires a direct Maven dependency or a Gradle JVM test task using useTestNG().");
  }
  if (testNgModules.some((module) => hasAdvancedTestNgExecution(moduleBuildText(module, files)))) {
    blockers.push("TestNG suite XML, group filters, and parallel or custom execution configuration are outside the supported execution boundary.");
  }
  if (testNgFiles.some((file) => hasUnsupportedTestNgSemantics(file.content))) {
    blockers.push("TestNG class-level tests, lifecycle hooks, generated or parameterized tests, listeners, and dependency or group semantics are outside the supported evidence boundary.");
  }
  return blockers;
}

function detectSpockBlockers(files, modules) {
  const blockers = [];
  const spockModules = modules.filter((module) => usesSpock(moduleBuildText(module, files)));
  const spockFiles = files.filter((file) => isTestFile(file.path, modules) && usesSpockSpecification(file.content));
  if (spockModules.length === 0 && spockFiles.length === 0) return blockers;

  if (
    spockModules.some((module) => !supportsSpockModule(module, files)) ||
    spockFiles.some((file) => {
      const module = moduleForPath(file.path, modules, "test");
      return !module || !supportsSpockModule(module, files);
    })
  ) {
    blockers.push("Spock support requires a Gradle JVM module with a direct spock-core dependency and conventional JUnit Platform execution.");
  }
  if (spockModules.some((module) => hasAdvancedSpockExecution(module, files))) {
    blockers.push("Spock configuration files and custom JUnit Platform engine, tag, or test filters are outside the supported execution boundary.");
  }
  if (spockFiles.some((file) => hasUnsupportedSpockSemantics(file.content))) {
    blockers.push("Spock fixtures, data-driven features, extensions, helper assertions, and interaction-based mocking are outside the supported evidence boundary.");
  }
  return blockers;
}

function hasUnsupportedSpockSemantics(content) {
  const stripped = stripJvmCommentsAndStrings(content);
  return /^\s*@/m.test(stripped) ||
    /^\s*(?:where|filter)\s*:/m.test(stripped) ||
    /\b(?:def|void)\s+(?:setup|cleanup|setupSpec|cleanupSpec)\s*\(/.test(stripped) ||
    /\b(?:Mock|Stub|Spy|GroovyMock|GroovyStub|GroovySpy|DetachedMockFactory|with|verifyAll)\s*\(/.test(stripped) ||
    /(?:^|[;\n])\s*(?:\d+|_)\s*\*|>{2,3}/m.test(stripped);
}

function hasUnsupportedTestNgSemantics(content) {
  const stripped = stripJvmCommentsAndStrings(content);
  const annotation = "(?:org\\.testng\\.annotations\\.)?";
  const advancedAnnotation = new RegExp(`@${annotation}(?:DataProvider|Factory|Parameters|Listeners|BeforeSuite|AfterSuite|BeforeTest|AfterTest|BeforeClass|AfterClass|BeforeMethod|AfterMethod)\\b`);
  const classLevelTest = new RegExp(`@${annotation}Test(?:\\s*\\([^)]*\\))?\\s*(?:(?:public|internal|private|protected|open|final|abstract)\\s+)*(?:data\\s+)?class\\b`);
  return advancedAnnotation.test(stripped) || classLevelTest.test(stripped) || /\b(?:dataProvider|dataProviderClass|dependsOnMethods|dependsOnGroups|groups|invocationCount|threadPoolSize|timeOut|expectedExceptions|retryAnalyzer|priority)\s*=|\benabled\s*=\s*false\b/.test(stripped);
}

function scoreProfileConfidence(testFrameworks, existingTestLocations, blockers) {
  if (testFrameworks.length === 0 || blockers.some((blocker) => blocker.startsWith("No supported root") || blocker.startsWith("No supported src/main"))) return "low";
  if (blockers.length > 0) return "medium";
  if (testFrameworks.length > 0 && existingTestLocations.length > 0) return "high";
  if (testFrameworks.length > 0) return "medium";
  return "low";
}

function classifySourceFile(file) {
  const currentPath = normalizePath(file.path);
  const content = stripJvmCommentsAndStrings(file.content);
  const lowerPath = currentPath.toLowerCase();

  if (isDtoLike(lowerPath, content)) {
    return skipped(
      "dto",
      ["dto-only"],
      2,
      4,
      "DTO-only models are usually better covered through boundary parsing or mapper tests.",
      "Cover through parser, mapper, repository, or route integration tests that consume the model."
    );
  }

  if (isDeclarationOnly(content)) {
    return skipped(
      "low-value",
      ["low-runtime-behavior"],
      1,
      3,
      "No meaningful runtime behavior detected by current JVM heuristics.",
      "Cover through tests for the behavior that consumes this declaration."
    );
  }

  if (matchesAny(lowerPath, ["calculator", "parser", "mapper", "validator", "formatter", "converter", "normalizer"])) {
    return recommended("pure-logic", ["pure-logic", "edge-case-surface"], "high", "high", "unit", 9, 2, ["Pure transformation logic", "edge-case surface"]);
  }

  if (matchesAny(lowerPath, ["service", "client", "repository", "gateway"])) {
    const external = hasExternalBoundary(content);
    return recommended(
      "service",
      external ? ["service-name", "external-boundary"] : ["service-name"],
      external ? "high" : "medium",
      "medium",
      external ? "integration" : "unit",
      external ? 8 : 6,
      external ? 5 : 4,
      external ? ["Service boundary", "External I/O boundary"] : ["Service boundary"]
    );
  }

  if (hasBranching(content)) {
    return recommended("utility", ["branching-logic"], "medium", "high", "unit", 5, 2, ["Branching logic"]);
  }

  return skipped(
    "low-value",
    ["low-runtime-behavior"],
    1,
    3,
    "No meaningful runtime behavior detected by current JVM heuristics.",
    "Cover through tests for the behavior that consumes this file."
  );
}

function recommended(kind, signals, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons) {
  return { kind, signals, risk, testability, testLevel, riskReductionScore, maintenanceCost, reasons };
}

function skipped(kind, signals, riskReductionScore, maintenanceCost, skipReason, preferredCoveragePath) {
  return {
    kind,
    signals,
    risk: "low",
    testability: "low",
    testLevel: "none",
    riskReductionScore,
    maintenanceCost,
    reasons: [],
    skipReason,
    preferredCoveragePath
  };
}

function collectSourceSymbols(sourceFiles) {
  const sources = [];
  for (const file of sourceFiles) {
    const analysis = analyzeJvmFile(file.content, file.path);
    const fallbackName = basenameWithoutExtension(file.path);
    const symbols = [...new Set([...analysis.declarations, fallbackName])].sort();
    sources.push({
      path: normalizePath(file.path),
      moduleProjectPath: file.moduleProjectPath,
      packageName: analysis.packageName,
      symbols,
      qualifiedSymbols: symbols.map((symbol) => analysis.packageName ? `${analysis.packageName}.${symbol}` : symbol)
    });
  }
  return sources;
}

function collectJvmTestEvidence(sourceSymbols, testFiles, modules) {
  const evidenceBySourcePath = new Map();

  for (const source of sourceSymbols) {
    const evidence = [];
    for (const testFile of testFiles) {
      if (!canModuleTestSource(testFile.moduleProjectPath, source.moduleProjectPath, modules)) continue;
      const match = findJvmTestMatch(source, testFile.analysis);
      if (!match) continue;
      evidence.push({
        testPath: testFile.path,
        kind: "jvm-symbol-reference",
        strength: match.strength,
        ...(match.usage ? { usage: match.usage } : {})
      });
    }
    if (evidence.length > 0) evidenceBySourcePath.set(source.path, evidence.sort((a, b) => a.testPath.localeCompare(b.testPath)));
  }

  return evidenceBySourcePath;
}

function canModuleTestSource(testModuleProjectPath, sourceModuleProjectPath, modules) {
  if (!testModuleProjectPath || !sourceModuleProjectPath) return false;
  if (testModuleProjectPath === sourceModuleProjectPath) return true;
  const testModule = modules.find((module) => module.projectPath === testModuleProjectPath);
  return testModule?.reachableDependencies.has(sourceModuleProjectPath) ?? false;
}

function findJvmTestMatch(source, test) {
  for (let index = 0; index < source.symbols.length; index += 1) {
    const symbol = source.symbols[index];
    const qualified = source.qualifiedSymbols[index];
    const exactImport = test.imports.find(
      (currentImport) => currentImport.qualified === qualified || currentImport.qualified.startsWith(`${qualified}.`)
    );
    if (exactImport) {
      const importedName = exactImport.qualified.split(".").at(-1);
      const reference = exactImport.alias ?? (exactImport.qualified === qualified ? symbol : importedName);
      return { strength: "direct", usage: jvmReferenceUsage(test.content, reference) };
    }

    const wildcardImport = source.packageName && test.imports.some((currentImport) => currentImport.qualified === `${source.packageName}.*`);
    if ((test.packageName === source.packageName || wildcardImport) && containsJvmReference(test.content, symbol)) {
      return { strength: "referenced", usage: jvmReferenceUsage(test.content, symbol) };
    }

    if (qualified && qualified !== symbol && containsJvmReference(test.content, qualified)) {
      return { strength: "referenced", usage: jvmReferenceUsage(test.content, qualified) };
    }
  }
  return undefined;
}

function analyzeJvmFile(content, currentPath) {
  const stripped = stripJvmCommentsAndStrings(content);
  const packageName = stripped.match(/^\s*package\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;?/m)?.[1] ?? "";
  const imports = [];
  const importPattern = /^\s*import\s+(static\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$*][\w$*]*)*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*;?/gm;
  for (const match of stripped.matchAll(importPattern)) imports.push({ qualified: match[2], alias: match[3], static: Boolean(match[1]) });

  const declarations = new Set();
  const typePattern = /\b(?:class|interface|object|enum\s+class|enum|record)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of stripped.matchAll(typePattern)) declarations.add(match[1]);
  if (currentPath.endsWith(".kt")) {
    const functionPattern = /^(?:\s*(?:public|internal|private|protected|inline|tailrec|suspend|operator|infix|external|expect|actual|open|final|override)\s+)*\s*fun\s+(?:<[^>]+>\s*)?([A-Za-z_$][\w$]*)\s*\(/gm;
    for (const match of stripped.matchAll(functionPattern)) declarations.add(match[1]);
  }

  return { packageName, imports, declarations: [...declarations], content: stripped };
}

function containsJvmReference(content, reference) {
  const escaped = escapeRegExp(reference);
  return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(content);
}

function jvmReferenceUsage(content, reference) {
  const escaped = escapeRegExp(reference);
  const assertionBodies = jvmAssertionBodies(content);
  if (assertionBodies.some((body) => containsJvmReference(body, reference))) return "asserted";

  const aliases = collectJvmReferenceAliases(content, escaped);
  if (assertionBodies.some((body) => [...aliases].some((alias) => containsJvmReference(body, alias)))) return "asserted";
  if (new RegExp(`(?<![\\w$])${escaped}(?![\\w$])\\s*(?:\\(|\\.)`).test(content)) return "called";
  return undefined;
}

function collectJvmReferenceAliases(content, escapedReference) {
  const aliases = new Set();
  const directCall = new RegExp(`(?:new\\s+)?(?<![\\w$])${escapedReference}(?![\\w$])\\s*(?:<[^>\\n]+>\\s*)?\\(`);

  for (const line of content.split("\n")) {
    const equalsIndex = line.indexOf("=");
    if (equalsIndex < 0) continue;
    const left = line.slice(0, equalsIndex).trim();
    const right = line.slice(equalsIndex + 1);
    if (!directCall.test(right)) continue;
    const alias = left.match(/([A-Za-z_$][\w$]*)\s*(?::[^=]+)?$/)?.[1];
    if (alias) aliases.add(alias);
  }

  let foundNewAlias = true;
  while (foundNewAlias) {
    foundNewAlias = false;
    for (const line of content.split("\n")) {
      const equalsIndex = line.indexOf("=");
      if (equalsIndex < 0) continue;
      const left = line.slice(0, equalsIndex).trim();
      const right = line.slice(equalsIndex + 1);
      if (![...aliases].some((alias) => new RegExp(`(?<![\\w$])${escapeRegExp(alias)}(?![\\w$])\\s*\\.`).test(right))) continue;
      const resultAlias = left.match(/([A-Za-z_$][\w$]*)\s*(?::[^=]+)?$/)?.[1];
      if (resultAlias && !aliases.has(resultAlias)) {
        aliases.add(resultAlias);
        foundNewAlias = true;
      }
    }
  }

  return aliases;
}

function jvmAssertionBodies(content) {
  const bodies = [];
  const matcher = /\b(?:assert[A-Za-z]*|verify|expect[A-Za-z]*|should(?:Not)?[A-Z][A-Za-z]*)\s*(?:<[^>\n]+>\s*)?([({])/g;
  let match;

  while ((match = matcher.exec(content)) !== null) {
    const opening = match[1];
    const closing = opening === "(" ? ")" : "}";
    let depth = 1;
    let index = matcher.lastIndex;
    for (; index < content.length && depth > 0; index += 1) {
      if (content[index] === opening) depth += 1;
      else if (content[index] === closing) depth -= 1;
    }
    bodies.push(content.slice(matcher.lastIndex, index - 1));
    matcher.lastIndex = index;
  }

  for (const line of content.split("\n")) {
    if (/\bshould(?:Not)?[A-Z][A-Za-z]*\b/.test(line)) bodies.push(line);
  }

  bodies.push(...spockConditionBodies(content));

  return bodies;
}

function spockConditionBodies(content) {
  if (!usesSpockSpecification(content)) return [];
  const bodies = [];
  let active = false;
  let body = [];
  for (const line of stripJvmCommentsAndStrings(content).split("\n")) {
    const blockMatch = line.match(/^\s*(given|setup|when|then|expect|cleanup|where|filter|and)\s*:\s*(.*)$/);
    if (blockMatch) {
      const [, block, inlineBody] = blockMatch;
      if (block !== "and") {
        if (active && body.length > 0) bodies.push(body.join("\n"));
        active = ["then", "expect"].includes(block);
        body = [];
      }
      if (active && inlineBody) body.push(inlineBody);
      continue;
    }
    if (active) body.push(line);
  }
  if (active && body.length > 0) bodies.push(body.join("\n"));
  return bodies;
}

function isSourceFile(currentPath, modules) {
  return Boolean(moduleForPath(currentPath, modules, "main"));
}

function isTestFile(currentPath, modules) {
  return Boolean(moduleForPath(currentPath, modules, "test"));
}

function isEvidenceTestFile(file, files, modules, frameworks) {
  if (!isTestFile(file.path, modules)) return false;
  const content = stripJvmCommentsAndStrings(file.content);
  const module = moduleForPath(file.path, modules, "test");
  if (usesTestNgAnnotations(file.content)) {
    return Boolean(frameworks.includes("testng") && module && supportsTestNgModule(module, files) && isSupportedTestNgFile(file.content));
  }
  if (usesSpockSpecification(file.content)) {
    return Boolean(frameworks.includes("spock") && module && supportsSpockModule(module, files) && isSupportedSpockSpec(file.content));
  }
  if (frameworks.some((framework) => ["junit", "kotlin-test"].includes(framework)) && /@(?:[A-Za-z_$][\w$]*\.)*(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate|RunWith)\b|\bextends\s+(?:junit\.framework\.)?TestCase\b/.test(content)) return true;
  return Boolean(frameworks.includes("kotest") && module && supportsKotestModule(module, files) && isSupportedKotestSpec(file.content));
}

function isSupportedTestNgFile(content) {
  if (hasUnsupportedTestNgSemantics(content)) return false;
  const stripped = stripJvmCommentsAndStrings(content);
  const testAnnotation = "@(?:org\\.testng\\.annotations\\.)?Test(?:\\s*\\([^)]*\\))?";
  const kotlinMethod = new RegExp(`${testAnnotation}\\s*(?:(?:public|internal|private|protected|open|final|override|suspend)\\s+)*fun\\s+[A-Za-z_$][\\w$]*\\s*\\(`);
  const javaMethod = new RegExp(`${testAnnotation}\\s*(?:(?:public|private|protected|static|final|synchronized)\\s+)*(?:[A-Za-z_$][\\w$]*(?:\\s*<[^>{};\\n]+>)?(?:\\[\\])?)\\s+[A-Za-z_$][\\w$]*\\s*\\(`);
  return kotlinMethod.test(stripped) || javaMethod.test(stripped);
}

function isSupportedSpockSpec(content) {
  if (hasUnsupportedSpockSemantics(content)) return false;
  const commentsRemoved = stripJvmComments(content);
  return /\bclass\s+[A-Za-z_$][\w$]*\s+extends\s+(?:spock\.lang\.)?Specification\b/.test(commentsRemoved) &&
    /\bdef\s+["'][^"'\n]+["']\s*\([^)]*\)\s*\{/.test(commentsRemoved) &&
    /^\s*(?:then|expect)\s*:/m.test(commentsRemoved);
}

function isSupportedKotestSpec(content) {
  const stripped = stripJvmCommentsAndStrings(content);
  const style = stripped.match(/\bclass\s+[A-Za-z_$][\w$]*(?:\s*<[^>{}\n]+>)?(?:\s*\([^{}]*\))?\s*:\s*(?:io\.kotest\.core\.spec\.style\.)?(FunSpec|ShouldSpec|StringSpec)\s*\(/)?.[1];
  if (!style) return false;
  const commentsRemoved = stripJvmComments(content);
  if (style === "FunSpec") return /\btest\s*\(\s*["']/.test(commentsRemoved);
  if (style === "ShouldSpec") return /\bshould\s*\(\s*["']/.test(commentsRemoved);
  return /(?:^|[({\n])\s*["'][^"'\n]+["']\s*\{/m.test(commentsRemoved);
}

function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/");
}

function normalizeChangedPath(root, currentPath) {
  if (path.isAbsolute(currentPath)) return stripCurrentDirectoryPrefix(normalizePath(path.relative(root, currentPath)));
  return stripCurrentDirectoryPrefix(normalizePath(currentPath));
}

function stripCurrentDirectoryPrefix(currentPath) {
  return currentPath.replace(/^\.\//, "");
}

function basenameWithoutExtension(currentPath) {
  const fileName = normalizePath(currentPath).split("/").at(-1) ?? currentPath;
  return fileName.replace(/\.[^.]+$/, "");
}

function matchesAny(value, fragments) {
  return fragments.some((fragment) => value.includes(fragment));
}

function hasBranching(content) {
  return /\b(if|when|switch|try|catch)\b|\?\s*[^:]+:/.test(content);
}

function hasExternalBoundary(content) {
  return /\b(?:HttpClient|URL|URLConnection|Socket|Files\.|File\(|Path\.|DataSource|Connection|EntityManager|JdbcTemplate|WebClient|RestTemplate)\b|\bjava\.(?:net|nio\.file|sql)\b/.test(content);
}

function isDtoLike(currentPath, content) {
  return (
    /(dto|model|request|response)/i.test(currentPath) &&
    (/\bdata\s+class\s+/.test(content) || /\brecord\s+[A-Za-z_$][\w$]*\s*\(/.test(content))
  );
}

function isDeclarationOnly(content) {
  return /^\s*(?:package\s+[^\n;]+;?\s*)?(?:import\s+[^\n;]+;?\s*)*(?:(?:public\s+)?(?:interface|enum)\b)/.test(content) && !hasBranching(content);
}

function stripJvmCommentsAndStrings(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function stripJvmComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function byRiskThenName(a, b) {
  const order = { high: 0, medium: 1, low: 2 };
  return order[a.risk] - order[b.risk] || a.name.localeCompare(b.name);
}
