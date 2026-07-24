import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { getProjectDetectionRules } from "../src/core/project-detector.js";

describe("docs links", () => {
  it("keeps README doc links valid", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const links = [...readme.matchAll(/\]\((docs\/[^)]+)\)/g)].map((match) => match[1]);

    assert.ok(links.length > 0);

    for (const link of links) {
      assert.ok(fs.existsSync(path.resolve(link)), `Missing README doc link: ${link}`);
    }
  });

  it("keeps docs free of local machine paths", () => {
    const markdownFiles = fs
      .readdirSync("docs")
      .filter((fileName) => fileName.endsWith(".md"))
      .map((fileName) => path.join("docs", fileName));

    for (const filePath of ["README.md", ...markdownFiles]) {
      const contents = fs.readFileSync(filePath, "utf8");

      assert.doesNotMatch(contents, /C:\/Users\/[^/\s]+/i, `Local Windows user path leaked in ${filePath}`);
      assert.doesNotMatch(contents, /C:\\Users\\[^\\\s]+/i, `Local Windows user path leaked in ${filePath}`);
      assert.doesNotMatch(contents, /\/Users\/[^/\s]+\/(source|repos|projects)/i, `Local Unix user path leaked in ${filePath}`);
    }
  });

  it("keeps README MCP script examples complete", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const mcpScripts = Object.keys(packageJson.scripts).filter((script) => script.startsWith("mcp:"));

    for (const script of mcpScripts) {
      assert.ok(readme.includes(`npm run ${script}`), `Missing README MCP script example: ${script}`);
    }
  });

  it("keeps README CLI script examples complete", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const cliScripts = Object.entries(packageJson.scripts)
      .filter(([, command]) => command.startsWith("node ./src/cli/index.js"))
      .map(([script]) => script);

    for (const script of cliScripts) {
      assert.ok(readme.includes(`npm run ${script}`), `Missing README CLI script example: ${script}`);
    }
  });

  it("keeps MCP install docs aligned with package name and binaries", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const clientConfig = fs.readFileSync("docs/mcp-client-config.md", "utf8");
    const agentInstallPaths = fs.readFileSync("docs/agent-install-paths.md", "utf8");
    const releaseChecklist = fs.readFileSync("docs/release-checklist.md", "utf8");

    assert.ok(clientConfig.includes(`npm install -g ${packageJson.name}`));
    assert.ok(clientConfig.includes('"command": "repo-test-architect-mcp"'));
    assert.ok(clientConfig.includes("npm run mcp:smoke"));
    assert.ok(agentInstallPaths.includes(`npm install -g ${packageJson.name}`));
    assert.ok(agentInstallPaths.includes("repo-test-architect-mcp"));
    assert.ok(agentInstallPaths.includes("MCP-Capable Hosts"));
    assert.ok(agentInstallPaths.includes("macOS/Linux terminal"));
    assert.ok(agentInstallPaths.includes("Windows PowerShell"));
    assert.ok(agentInstallPaths.includes("node ~/source/repo-test-architect/src/mcp/stdio.js"));
    assert.ok(agentInstallPaths.includes("node C:/path/to/repo-test-architect/src/mcp/stdio.js"));
    assert.ok(agentInstallPaths.includes("Instruction-only mode"));
    assert.ok(agentInstallPaths.includes("Node.js must be available"));
    assert.ok(agentInstallPaths.includes("local-first security"));
    assert.ok(agentInstallPaths.includes("avoid claiming native test generation is ready"));

    for (const binName of Object.keys(packageJson.bin)) {
      assert.ok(releaseChecklist.includes(`\`${binName}\``), `Missing release checklist binary: ${binName}`);
    }
  });

  it("keeps project detection docs aligned with detector rules", () => {
    const docs = fs.readFileSync("docs/project-detection.md", "utf8");
    const rules = getProjectDetectionRules();

    for (const marker of rules.markers) {
      const label = marker.fileName ?? `*${marker.extension ?? marker.directoryExtension}`;
      assert.ok(docs.includes(`\`${label}\``), `Missing documented project marker: ${label}`);
      assert.ok(docs.includes(`\`${marker.ecosystem}\``), `Missing documented ecosystem: ${marker.ecosystem}`);
      for (const language of marker.languages) {
        assert.ok(docs.includes(`\`${language}\``), `Missing documented language: ${language}`);
      }
    }

    for (const directory of rules.ignoredDirectories) {
      assert.ok(docs.includes(`\`${directory}\``), `Missing documented ignored directory: ${directory}`);
    }

    assert.ok(docs.includes("| `package.json` | `javascript` | `javascript`, `typescript` | Supported by `javascript` |"));
    assert.ok(docs.includes("| `Package.swift` | `swift` | `swift` | Supported by `swift` |"));
    assert.ok(docs.includes("| `*.xcodeproj` | `apple` | `swift`, `objective-c` | Supported by `swift` |"));
    assert.ok(docs.includes("| `*.xcworkspace` | `apple` | `swift`, `objective-c` | Supported by `swift` |"));
    assert.ok(docs.includes("| `pom.xml` | `jvm` | `java`, `kotlin` | Supported by bounded `kotlin` |"));
    assert.ok(docs.includes("| `build.gradle.kts` | `jvm` | `kotlin`, `java` | Supported by bounded `kotlin` |"));
    assert.ok(docs.includes("| `pyproject.toml` | `python` | `python` | Supported by `python` |"));
  });

  it("documents future test placement findings", () => {
    const projectPlan = fs.readFileSync("docs/project-plan.md", "utf8");
    const adapterContract = fs.readFileSync("docs/adapter-contract.md", "utf8");
    const artifactContract = fs.readFileSync("docs/artifact-contract.md", "utf8");

    assert.ok(projectPlan.includes("Test Placement Direction"));
    assert.ok(projectPlan.includes("move or split"));
    assert.ok(adapterContract.includes("Test Placement Findings"));
    assert.match(artifactContract, /single-project\s+analyzer\s+emits\s+conservative/);
    assert.match(artifactContract, /project-audits\s+analyzer\s+can\s+also\s+emit\s+conservative/);
    assert.ok(artifactContract.includes("matched test path uses `..` to escape the audited project root"));
    assert.ok(adapterContract.includes("move"));
    assert.ok(adapterContract.includes("split"));
    assert.ok(adapterContract.includes("keep"));
  });

  it("documents public readiness separately from npm publishing", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const alphaReadiness = fs.readFileSync("docs/alpha-readiness.md", "utf8");
    const realRepoReports = fs.readFileSync("docs/real-repo-audit-reports.md", "utf8");
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const publicReadiness = fs.readFileSync("docs/public-readiness.md", "utf8");
    const releaseChecklist = fs.readFileSync("docs/release-checklist.md", "utf8");
    const status = fs.readFileSync("docs/status.md", "utf8");

    assert.ok(readme.includes("[Public readiness](docs/public-readiness.md)"));
    assert.ok(readme.includes("[Alpha readiness](docs/alpha-readiness.md)"));
    assert.ok(readme.includes("[Real repository audit reports](docs/real-repo-audit-reports.md)"));
    assert.ok(alphaReadiness.includes("test architecture audit"));
    assert.ok(alphaReadiness.includes("[Real Repository Audit Reports](real-repo-audit-reports.md)"));
    assert.ok(alphaReadiness.includes("Which important behavior lacks meaningful test coverage?"));
    assert.ok(alphaReadiness.includes("Which tests appear misplaced for the project or package structure?"));
    assert.ok(alphaReadiness.includes("native test generation"));
    assert.ok(realRepoReports.includes("Repo Test Architect self-audit"));
    assert.ok(realRepoReports.includes("Collectors Grimoire app audit"));
    assert.ok(realRepoReports.includes("cg-bff"));
    assert.ok(realRepoReports.includes("one JavaScript/TypeScript codebase"));
    assert.ok(publicReadiness.includes("Ready To Show"));
    assert.ok(publicReadiness.includes("Not Ready To Publish"));
    assert.ok(publicReadiness.includes("package remains `private: true`"));
    assert.ok(publicReadiness.includes("final public repository URL is not configured"));
    assert.ok(publicReadiness.includes("package metadata still needs final repository, homepage, bugs, and keyword decisions"));
    assert.ok(publicReadiness.includes("package manifest declares MIT and the repository includes the matching license file"));
    assert.ok(publicReadiness.includes("native test generation is still deferred"));
    assert.ok(publicReadiness.includes("alpha-readiness acceptance gates"));
    assert.ok(publicReadiness.includes("local stdio MCP SDK server and dependency-free invoke harness"));
    assert.ok(!publicReadiness.includes("real MCP SDK transport wrapper is still pending"));
    assert.ok(publicReadiness.includes("verify the copyright owner before publishing"));
    assert.ok(publicReadiness.includes("Avoid presenting native test generation as available"));
    assert.ok(releaseChecklist.includes("add package metadata before publishing"));
    assert.ok(releaseChecklist.includes("final `keywords`"));

    for (const field of ["repository", "homepage", "bugs"]) {
      assert.equal(packageJson[field], undefined);
      assert.ok(releaseChecklist.includes(`\`${field}\``), `Missing release checklist metadata field: ${field}`);
    }

    assert.ok(status.includes("public-readiness checklist"));
    assert.ok(status.includes("alpha-readiness checklist"));
    assert.ok(status.includes("real-repo audit reports"));
  });

  it("documents product positioning without overstating generation or acquisition", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const positioning = fs.readFileSync("docs/product-positioning.md", "utf8");
    const publicReadiness = fs.readFileSync("docs/public-readiness.md", "utf8");
    const status = fs.readFileSync("docs/status.md", "utf8");

    assert.ok(readme.includes("[Product positioning](docs/product-positioning.md)"));
    assert.ok(positioning.includes("audit-first test strategy tool"));
    assert.ok(positioning.includes("not another generic AI test writer"));
    assert.ok(positioning.includes("The defensible value is the audit graph and strategy layer"));
    assert.ok(positioning.includes("whether existing tests are valuable"));
    assert.ok(positioning.includes("whether tests are in the right project layer"));
    assert.ok(positioning.includes("Acquisition should be treated as optional upside"));
    assert.ok(positioning.includes("local-first MCP install path"));
    assert.ok(positioning.includes("Avoid claims that the tool:"));
    assert.ok(positioning.includes("maximizes coverage"));
    assert.ok(positioning.includes("supports every language equally"));
    assert.ok(positioning.includes("fewer, better, repo-native tests"));
    assert.ok(publicReadiness.includes("product positioning"));
    assert.ok(status.includes("product positioning note"));
  });

  it("documents near-term milestones before claiming broader adapter support", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const roadmap = fs.readFileSync("docs/near-term-roadmap.md", "utf8");
    const status = fs.readFileSync("docs/status.md", "utf8");

    assert.ok(readme.includes("[Near-term roadmap](docs/near-term-roadmap.md)"));
    assert.ok(roadmap.includes("Alpha Readiness"));
    assert.ok(roadmap.includes("public-demo ready, but not package-release ready"));
    assert.ok(roadmap.includes("Milestone 1: Alpha Test Architecture Audit"));
    assert.ok(roadmap.includes("one concise repo-level summary can show top findings with evidence"));
    assert.ok(roadmap.includes("Milestone 2: Public Demo Polish"));
    assert.ok(roadmap.includes("Milestone 3: Adapter Spike Hardening"));
    assert.ok(roadmap.includes("bounded single-module and settings-owned all-KMP literal-JVM-target graphs with source-set-qualified API traversal"));
    assert.ok(roadmap.includes("Swift Package Manager with XCTest, Swift Testing, Quick/Nimble, and SnapshotTesting signals"));
    assert.ok(roadmap.includes("Python fixture reachability, async/parametrized/property-based pytest conventions, Django/Flask routes, tox/nox commands, coverage configuration, and no-tests-yet blocker behavior"));
    assert.ok(roadmap.includes("Milestone 4: Placement And Boundary Analysis"));
    assert.ok(roadmap.includes("app-level tests that belong in package-level test targets"));
    assert.ok(roadmap.includes("Milestone 5: Local MCP Transport"));
    assert.ok(roadmap.includes("Host-Owned Model And Subagent Orchestration"));
    assert.ok(roadmap.includes("the installing CLI or agent host owns model selection"));
    assert.ok(roadmap.includes("The MCP server performs no hidden model or subagent calls") || roadmap.includes("the MCP server performs no hidden model or subagent calls"));
    assert.ok(roadmap.includes("inexpensive summarization or routine implementation"));
    assert.ok(roadmap.includes("Milestone 6: Generation Readiness Gate"));
    assert.ok(roadmap.includes("Native generation should remain off until this gate is met"));
    assert.ok(roadmap.includes("npm run release:check"));
    assert.ok(status.includes("near-term roadmap"));
  });

  it("documents the first public demo path without claiming generation readiness", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const demoScript = fs.readFileSync("docs/demo-script.md", "utf8");
    const publicReadiness = fs.readFileSync("docs/public-readiness.md", "utf8");
    const status = fs.readFileSync("docs/status.md", "utf8");

    assert.ok(readme.includes("[Demo script](docs/demo-script.md)"));
    assert.ok(demoScript.includes("test strategy decisions before writing tests"));
    assert.ok(demoScript.includes("Native generation is intentionally deferred"));
    assert.ok(demoScript.includes("npm run audit:example"));
    assert.ok(demoScript.includes("npm run audit:kotlin-fixture"));
    assert.ok(demoScript.includes("npm run rank:example"));
    assert.ok(demoScript.includes("npm run plan:example"));
    assert.ok(demoScript.includes("npm run plan:kotlin-fixture"));
    assert.ok(demoScript.includes("npm run detect:example"));
    assert.ok(demoScript.includes("npm run audit-projects:example"));
    assert.ok(demoScript.includes("npm run findings-projects:example"));
    assert.ok(demoScript.includes("npm run stats-projects:example"));
    assert.ok(demoScript.includes("npm run mcp:tools"));
    assert.ok(demoScript.includes("npm run mcp:audit:kotlin-fixture"));
    assert.ok(demoScript.includes("npm run mcp:findings-projects:example"));
    assert.ok(demoScript.includes("npm run demo:check"));
    assert.ok(demoScript.includes("npm run model-consistency:check"));
    assert.ok(demoScript.includes("npm run model-consistency:compare:profiles"));
    assert.ok(demoScript.includes("The tool is useful before it generates a single test"));
    assert.ok(publicReadiness.includes("[Demo Script](demo-script.md)"));
    assert.ok(status.includes("demo script for showing audit quality"));
  });

  it("records architecture and scope decisions for future traceability", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const decisionLog = fs.readFileSync("docs/decision-log.md", "utf8");
    const status = fs.readFileSync("docs/status.md", "utf8");

    assert.ok(readme.includes("[Decision log](docs/decision-log.md)"));
    assert.ok(decisionLog.includes("Audit Graph First"));
    assert.ok(decisionLog.includes("JavaScript And TypeScript First"));
    assert.ok(decisionLog.includes("Polyglot Detection Before Universal Adapters"));
    assert.ok(decisionLog.includes("Local Stdio MCP First"));
    assert.ok(decisionLog.includes("SDK Stdio Wrapper Over Deterministic Tools"));
    assert.ok(decisionLog.includes("Native Generation Deferred"));
    assert.ok(decisionLog.includes("Public Demo Before Package Release"));
    assert.ok(decisionLog.includes("Local-First Stats Before Telemetry"));
    assert.ok(decisionLog.includes("Revisit when:"));
    assert.ok(fs.readFileSync("docs/project-plan.md", "utf8").includes("the Kotlin/JVM adapter spike"));
    assert.ok(status.includes("decision log for audit-first architecture"));
  });

  it("documents host-owned model and subagent routing hints", () => {
    const artifactContract = fs.readFileSync("docs/artifact-contract.md", "utf8");
    const decisionLog = fs.readFileSync("docs/decision-log.md", "utf8");
    const roadmap = fs.readFileSync("docs/near-term-roadmap.md", "utf8");

    for (const contents of [artifactContract, decisionLog, roadmap]) {
      assert.ok(contents.includes("plan-execution-hints/v1"));
    }
    assert.ok(artifactContract.includes("They do not select a vendor, model, price tier, token budget, permission mode, or subagent implementation."));
    assert.ok(decisionLog.includes("model routing, token and cost budgets, permissions, context management, and subagent lifecycle in the MCP client or agent host"));
    assert.ok(roadmap.includes("Host-specific routing policy and actual subagent lifecycle remain outside Repo Test Architect."));
  });

  it("documents local-only MCP diagnostics and external reporting boundaries", () => {
    const diagnostics = fs.readFileSync("docs/diagnostics.md", "utf8");
    const artifactContract = fs.readFileSync("docs/artifact-contract.md", "utf8");
    const decisionLog = fs.readFileSync("docs/decision-log.md", "utf8");
    const mcpTools = fs.readFileSync("docs/mcp-tools.md", "utf8");

    for (const contents of [diagnostics, artifactContract]) {
      assert.ok(contents.includes("diagnostic-event/v1"));
      assert.ok(contents.includes("doctor-report/v1"));
      assert.ok(contents.includes("diagnostic-bundle/v1"));
    }
    assert.ok(diagnostics.includes("It never contains tool arguments, prompts, environment values, repository paths, source content, stack traces, model names, token usage, or subagent activity."));
    assert.ok(diagnostics.includes("Diagnostics do not make network requests."));
    assert.ok(diagnostics.includes("External error reporting and product analytics are not implemented."));
    assert.ok(decisionLog.includes("Local Diagnostics Without Automatic Reporting"));
    assert.ok(mcpTools.includes("MCP stdout remains JSON-RPC-only."));
  });

  it("documents the acceptance gate for a second adapter spike", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const adapterContract = fs.readFileSync("docs/adapter-contract.md", "utf8");
    const polyglotWorkflow = fs.readFileSync("docs/polyglot-workflow.md", "utf8");
    const secondAdapterSpike = fs.readFileSync("docs/second-adapter-spike.md", "utf8");
    const status = fs.readFileSync("docs/status.md", "utf8");

    assert.ok(readme.includes("[Second adapter spike](docs/second-adapter-spike.md)"));
    assert.ok(adapterContract.includes("[Second Adapter Spike](second-adapter-spike.md)"));
    assert.ok(adapterContract.includes("Currently registered adapters are:"));
    assert.ok(adapterContract.includes("The repository detector finds multiple project roots"));
    assert.ok(adapterContract.includes("Independent adapter audits are isolated by project root today"));
    assert.ok(polyglotWorkflow.includes("bounded Kotlin/JVM adapter handles Java plus Kotlin source ownership"));
    assert.ok(secondAdapterSpike.includes("Kotlin/JVM with Gradle/Maven and JUnit"));
    assert.ok(secondAdapterSpike.includes("Swift Package Manager with XCTest, Swift Testing, Quick/Nimble, and SnapshotTesting signals"));
    assert.ok(secondAdapterSpike.includes("Python package roots with pytest or unittest"));
    assert.ok(secondAdapterSpike.includes("reuse the shared audit model"));
    assert.ok(secondAdapterSpike.includes("produce golden audit and plan snapshots"));
    assert.ok(secondAdapterSpike.includes("model-consistency scenario"));
    assert.ok(secondAdapterSpike.includes("native test generation"));
    assert.ok(secondAdapterSpike.includes("npm run release:check"));
    assert.ok(status.includes("adapter spike checklist"));
  });

  it("documents the bounded Kotlin/JVM support and live validation boundary", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const support = fs.readFileSync("docs/kotlin-jvm-alpha-support.md", "utf8");
    const validation = fs.readFileSync("docs/kotlin-jvm-validation-hunt-report.md", "utf8");

    assert.ok(readme.includes("[Kotlin/JVM alpha support](docs/kotlin-jvm-alpha-support.md)"));
    assert.ok(support.includes("JUnit 4, JUnit 5/Jupiter, `kotlin.test`, and Kotest"));
    assert.ok(support.includes("Kotest styles other than `FunSpec`, `StringSpec`, and `ShouldSpec`"));
    assert.ok(support.includes("method-level TestNG with a direct Maven dependency or Gradle `useTestNG()`"));
    assert.ok(support.includes("TestNG class-level tests, lifecycle hooks, data providers"));
    assert.ok(support.includes("conventional Spock feature methods in direct `Specification` subclasses"));
    assert.ok(support.includes("Spock fixture methods, annotations/extensions, `where:`/`filter:` data-driven features"));
    assert.ok(support.includes("Android application/library unit-test semantics"));
    assert.ok(support.includes("one KMP module or a settings-owned all-KMP aggregate whose source modules each declare exactly one literal `jvm()` or `jvm(\"name\")` target"));
    assert.ok(support.includes("`commonTest` can cover only `commonMain` while `<targetName>Test` can cover common and JVM-target production"));
    assert.ok(support.includes("registered as `supported`"));
    assert.ok(validation.includes("JUnit 4"));
    assert.ok(validation.includes("Cash App Barber"));
    assert.ok(validation.includes("graphql-java"));
    assert.ok(validation.includes("Micronaut Core"));
    assert.ok(validation.includes("Ratpack"));
    assert.ok(validation.includes("KotlinPoet"));
    assert.ok(validation.includes("libcs1"));
    assert.ok(validation.includes("service-apply"));
    assert.ok(validation.includes("OHC"));
    assert.ok(validation.includes("FusionAuth java-http"));
    assert.ok(validation.includes("OpenTest4K"));
    assert.ok(validation.includes("`./gradlew jvmTest`"));
    assert.ok(validation.includes("kmp-base"));
    assert.ok(validation.includes("`./gradlew :kmp-base:jvmTest :kmp-base-text:jvmTest`"));
    assert.ok(validation.includes("Spatial-K"));
    assert.ok(validation.includes("exact evidence from 238 to 296 relationships"));
    assert.ok(validation.includes("KVision RealWorld"));
    assert.ok(validation.includes("`./gradlew backendTest`"));
    assert.ok(validation.includes("ktor-io-perf"));
    assert.ok(validation.includes("no repository build, plugin, test, or application code was executed"));
  });
});
