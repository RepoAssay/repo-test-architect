import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { adapters } from "../src/core/adapter-registry.js";
import { InvalidOptionError } from "../src/core/invalid-option-error.js";
import { createPlanExecutionHints } from "../src/core/plan-execution-hints.js";
import { summarizeProjectAudits } from "../src/core/project-audit-summary.js";
import { validateProjectAudits } from "../src/core/project-audits-validation.js";
import { auditDetectedProjects } from "../src/core/project-auditor.js";
import { rankProjectTestCandidates } from "../src/core/project-candidate-ranking.js";
import {
  FAILED_PROJECT_ADAPTER_ID_PATTERN,
  FAILED_PROJECT_ERROR_CODES,
  FAILED_PROJECT_ERROR_NAMES,
  FAILED_PROJECT_REASON_PATTERN,
  describeFailedProject,
  sortFailedProjects
} from "../src/core/project-failures.js";
import { createProjectFindings } from "../src/core/project-findings.js";
import { collectProjectStats } from "../src/core/project-stats.js";
import { analyzeProjectTestPlacement } from "../src/core/project-test-placement-analysis.js";
import { createProjectTestPlan } from "../src/core/project-test-plan.js";
import { createRepositoryAnalysis } from "../src/core/repository-analysis.js";
import { McpToolError, TOOL_ERROR_CODE, toSafeMcpError } from "../src/mcp/errors.js";
import { callTool } from "../src/mcp/tool-definitions.js";
import { assertMatchesSchema } from "./support/json-schema-validator.js";

const cliPath = "src/cli/index.js";
const polyglotRoot = path.resolve("examples/polyglot-workspace");
const androidProject = { id: "apps/android", root: "apps/android", ecosystems: ["jvm"], languages: ["java", "kotlin"] };

// Tests inject adapter failures explicitly; a real adapter defect must never be what makes these pass.
function failAdapter(t, adapterId, error) {
  const adapter = adapters.find((candidate) => candidate.id === adapterId);
  t.mock.method(adapter, "audit", () => {
    throw error;
  });
}

function failAllPolyglotAdapters(t) {
  for (const adapterId of ["javascript", "kotlin", "python"]) failAdapter(t, adapterId, new Error("boom"));
}

function readSchema(name) {
  return JSON.parse(fs.readFileSync(path.join("schemas", name), "utf8"));
}

function auditWithKotlinFailure(t) {
  failAdapter(t, "kotlin", new TypeError("Cannot read properties of undefined (reading 'modules')"));
  return auditDetectedProjects(polyglotRoot);
}

function throwingGetter() {
  throw new Error("getter must not escape containment");
}

describe("project audit failure containment", () => {
  it("records a throwing adapter in failedProjects and still audits the other projects", (t) => {
    const result = auditWithKotlinFailure(t);

    assert.deepEqual(result.summary, { projectCount: 3, auditedProjectCount: 2, skippedProjectCount: 0, failedProjectCount: 1 });
    assert.deepEqual(result.audits.map((entry) => entry.projectRoot), ["apps/web", "services/api"]);
    assert.deepEqual(result.skippedProjects, []);
    assert.deepEqual(result.failedProjects, [
      {
        projectId: "apps/android",
        projectRoot: "apps/android",
        adapterId: "kotlin",
        ecosystems: ["jvm"],
        languages: ["java", "kotlin"],
        errorName: "TypeError",
        reason: "The kotlin adapter failed with TypeError."
      }
    ]);
    assert.doesNotThrow(() => validateProjectAudits(result));
  });

  it("emits an empty failedProjects array when every adapter succeeds", () => {
    const result = auditDetectedProjects(polyglotRoot);

    assert.deepEqual(result.failedProjects, []);
    assert.equal(result.summary.failedProjectCount, 0);
  });

  it("orders failed projects by project root regardless of failure order", (t) => {
    failAdapter(t, "python", Object.assign(new Error("missing manifest"), { code: "ENOENT" }));
    failAdapter(t, "kotlin", new Error("gradle model unavailable"));
    const result = auditDetectedProjects(polyglotRoot);

    assert.deepEqual(result.failedProjects.map((project) => [project.projectRoot, project.adapterId]), [
      ["apps/android", "kotlin"],
      ["services/api", "python"]
    ]);
    assert.equal(result.failedProjects[1].errorCode, "ENOENT");
    assert.equal(result.failedProjects[1].reason, "The python adapter failed with Error. A file or directory disappeared or was not found during the audit.");
    assert.equal(Object.hasOwn(result.failedProjects[0], "errorCode"), false);

    const entries = [
      { projectRoot: "services/api", adapterId: "python" },
      { projectRoot: "Apps/web", adapterId: "javascript" },
      { projectRoot: "apps/android", adapterId: "kotlin" },
      { projectRoot: "apps/android", adapterId: "csharp" }
    ];
    assert.deepEqual(sortFailedProjects(entries).map((entry) => `${entry.projectRoot}:${entry.adapterId}`), [
      "apps/android:csharp",
      "apps/android:kotlin",
      "Apps/web:javascript",
      "services/api:python"
    ]);
    assert.deepEqual(sortFailedProjects([...entries].reverse()), sortFailedProjects(entries));
  });

  it("never records error messages, custom names or unlisted codes", () => {
    const repoRoot = path.join(os.tmpdir(), "rta-failure", "repo");
    const leaks = [
      "Parse failed near 'API_TOKEN=secret123'",
      `Cannot parse ${path.join(repoRoot, "apps", "build.gradle.kts")} near "password = hunter2"`,
      "~/private/token and ../private/token",
      "/repo/../../private/token",
      "C:\\Users\\Jane Doe\\private\\token",
      "first\rsecond\u2028third \u201Cquoted\u201D \"esc\\\"aped\""
    ];

    for (const message of leaks) {
      const error = new Error(message);
      error.code = "SECRET_TOKEN";
      const failure = describeFailedProject(androidProject, "kotlin", error);
      assert.deepEqual(failure, {
        projectId: "apps/android",
        projectRoot: "apps/android",
        adapterId: "kotlin",
        ecosystems: ["jvm"],
        languages: ["java", "kotlin"],
        errorName: "Error",
        reason: "The kotlin adapter failed with Error."
      });
    }

    class GradleSecretError extends Error {
      name = "GradleSecretError";
    }
    assert.equal(describeFailedProject(androidProject, "kotlin", new GradleSecretError("x")).errorName, "Error");
    assert.equal(describeFailedProject(androidProject, "kotlin", new RangeError("x")).errorName, "RangeError");
    assert.equal(describeFailedProject(androidProject, "kotlin", { name: "TypeError", code: "EACCES" }).errorName, "TypeError");
    assert.equal(describeFailedProject(androidProject, "kotlin", "plain string failure").reason, "The kotlin adapter failed with Error.");
    assert.equal(describeFailedProject(androidProject, "kotlin", undefined).errorName, "Error");
    assert.equal(describeFailedProject(androidProject, "kotlin", Symbol("s")).errorName, "Error");
  });

  it("contains thrown values whose inspection throws", (t) => {
    const hostileValues = [
      Object.defineProperty(new Error("x"), "name", { get: throwingGetter }),
      Object.defineProperty(new Error("x"), "message", { get: throwingGetter }),
      Object.defineProperty(new Error("x"), "code", { get: throwingGetter }),
      Object.defineProperty({}, "constructor", { get: throwingGetter }),
      new Proxy({}, { get: throwingGetter, getPrototypeOf: throwingGetter, has: throwingGetter, ownKeys: throwingGetter })
    ];

    for (const value of hostileValues) {
      const adapter = adapters.find((candidate) => candidate.id === "kotlin");
      const mock = t.mock.method(adapter, "audit", () => {
        throw value;
      });
      const result = auditDetectedProjects(polyglotRoot);
      mock.mock.restore();

      assert.deepEqual(result.audits.map((entry) => entry.projectRoot), ["apps/web", "services/api"]);
      assert.equal(result.failedProjects[0].errorName, "Error");
      assert.equal(Object.hasOwn(result.failedProjects[0], "errorCode"), false);
      assert.equal(result.failedProjects[0].reason, "The kotlin adapter failed with Error.");
    }
  });

  it("does not contain errors raised outside an adapter's audit call", () => {
    // Detection runs before any adapter, so its defects still fail the whole run.
    assert.throws(() => auditDetectedProjects(polyglotRoot, { excludeProjectRoots: "apps/**" }), { name: "TypeError" });
  });

  it("does not contain usage errors", (t) => {
    const goRoot = path.resolve("examples/go-testing-basic");

    assert.throws(() => auditDetectedProjects(goRoot, { goTarget: { goos: "nonsense", goarch: "amd64" } }), InvalidOptionError);
    assert.throws(() => auditDetectedProjects(goRoot, { goTarget: { goos: "linux", goarch: "amd64", tags: ["cgo"] } }), InvalidOptionError);
    // Validation happens before any adapter runs, even for a repository with no Go project.
    assert.throws(() => auditDetectedProjects(polyglotRoot, { goTarget: { goos: "nonsense", goarch: "amd64" } }), InvalidOptionError);

    failAdapter(t, "kotlin", new InvalidOptionError("bad option", { option: "goTarget" }));
    assert.throws(() => auditDetectedProjects(polyglotRoot), InvalidOptionError);
  });
});

describe("project audits failedProjects schema compatibility", () => {
  const projectAuditsSchema = readSchema("project-audits-v1.schema.json");

  it("accepts saved 1.0.x artifacts without failedProjects", () => {
    const legacy = {
      schemaVersion: "project-audits/v1",
      root: ".",
      summary: { projectCount: 0, auditedProjectCount: 0, skippedProjectCount: 0 },
      audits: [],
      skippedProjects: []
    };

    assert.doesNotThrow(() => validateProjectAudits(legacy));
    assertMatchesSchema(legacy, projectAuditsSchema, "legacy-project-audits.json");
    assert.equal(summarizeProjectAudits(legacy).summary.auditCoverage, "none");
    assert.equal(Object.hasOwn(summarizeProjectAudits(legacy), "failedProjects"), false);
  });

  it("accepts 1.1.0 artifacts with failed projects", (t) => {
    const result = auditWithKotlinFailure(t);

    assertMatchesSchema(result, projectAuditsSchema, "project-audits.json");
    assertMatchesSchema(JSON.parse(JSON.stringify(result)), projectAuditsSchema, "saved-project-audits.json");
  });

  it("rejects failed project entries outside the fixed vocabulary", () => {
    const base = {
      schemaVersion: "project-audits/v1",
      root: ".",
      summary: { projectCount: 1, auditedProjectCount: 0, skippedProjectCount: 0, failedProjectCount: 1 },
      audits: [],
      skippedProjects: []
    };
    const entry = {
      projectId: "apps/android",
      projectRoot: "apps/android",
      adapterId: "kotlin",
      ecosystems: ["jvm"],
      languages: ["kotlin"],
      errorName: "TypeError",
      errorCode: "ENOENT",
      reason: "The kotlin adapter failed with TypeError. A file or directory disappeared or was not found during the audit."
    };
    const withEntry = (overrides) => ({ ...base, failedProjects: [{ ...entry, ...overrides }] });

    assert.doesNotThrow(() => validateProjectAudits(withEntry({})));
    assert.throws(() => validateProjectAudits({ ...base, failedProjects: {} }), /\$\.failedProjects/);
    assert.throws(() => validateProjectAudits(withEntry({ reason: undefined })), /\$\.failedProjects\[0\]/);
    assert.throws(() => validateProjectAudits(withEntry({ stack: "at x" })), /\$\.failedProjects\[0\]/);
    assert.throws(() => validateProjectAudits(withEntry({ errorName: "GradleError" })), /errorName/);
    assert.throws(() => validateProjectAudits(withEntry({ errorCode: "SECRET_TOKEN" })), /errorCode/);
    assert.throws(() => validateProjectAudits(withEntry({ reason: "API_TOKEN=secret123" })), /reason/);
    assert.throws(() => validateProjectAudits(withEntry({ reason: "The kotlin adapter failed with Error. Token is abc123." })), /reason/);
    assert.throws(() => validateProjectAudits({ ...base, summary: { ...base.summary, failedProjectCount: -1 } }), /failedProjectCount/);
  });
});

describe("derived artifacts surface failed projects", () => {
  it("adds failure fields and partial coverage only when a project failed", (t) => {
    const complete = auditDetectedProjects(polyglotRoot);
    const partial = auditWithKotlinFailure(t);
    const derive = [
      ["project-audit-summary-v1.schema.json", summarizeProjectAudits, true],
      ["project-candidate-ranking-v1.schema.json", rankProjectTestCandidates, true],
      ["project-test-plan-v1.schema.json", createProjectTestPlan, true],
      ["project-findings-v1.schema.json", createProjectFindings, true],
      ["project-stats-v1.schema.json", collectProjectStats, true],
      ["repository-analysis-v1.schema.json", createRepositoryAnalysis, false]
    ];

    for (const [schemaName, create, listsFailures] of derive) {
      const completeArtifact = create(complete);
      const partialArtifact = create(partial);
      const schema = readSchema(schemaName);

      assert.equal(Object.hasOwn(completeArtifact.summary, "failedProjectCount"), false, schemaName);
      assert.equal(Object.hasOwn(completeArtifact, "failedProjects"), false, schemaName);
      assert.equal(completeArtifact.summary.auditCoverage, "complete", schemaName);
      assert.equal(partialArtifact.summary.failedProjectCount, 1, schemaName);
      assert.equal(partialArtifact.summary.auditCoverage, "partial", schemaName);
      if (listsFailures) assert.deepEqual(partialArtifact.failedProjects, partial.failedProjects, schemaName);
      assertMatchesSchema(partialArtifact, schema, schemaName);
    }

    assert.deepEqual(createRepositoryAnalysis(partial).projectAudits.failedProjects, partial.failedProjects);
  });

  it("reports no audit coverage when every supported project failed", (t) => {
    failAllPolyglotAdapters(t);
    const summary = summarizeProjectAudits(auditDetectedProjects(polyglotRoot));

    assert.equal(summary.summary.auditCoverage, "none");
    assert.equal(summary.summary.failedProjectCount, 3);
  });

  it("keeps failure context in project placement and execution hints", (t) => {
    const complete = auditDetectedProjects(polyglotRoot);
    failAllPolyglotAdapters(t);
    const failed = auditDetectedProjects(polyglotRoot);
    const placementSchema = readSchema("test-placement-findings-v1.schema.json");
    const hintsSchema = readSchema("plan-execution-hints-v1.schema.json");

    const completePlacement = analyzeProjectTestPlacement(complete);
    assert.deepEqual(Object.keys(completePlacement), ["schemaVersion", "findings"]);
    const placement = analyzeProjectTestPlacement(failed);
    assert.deepEqual(placement, {
      schemaVersion: "test-placement-findings/v1",
      findings: [],
      auditCoverage: "none",
      failedProjectCount: 3,
      failedProjects: failed.failedProjects
    });
    assertMatchesSchema(placement, placementSchema, "placement.json");

    const completeHints = createPlanExecutionHints(createProjectTestPlan(complete));
    assert.equal(Object.hasOwn(completeHints, "failedProjects"), false);
    assert.equal(Object.hasOwn(completeHints.summary, "auditCoverage"), false);
    const hints = createPlanExecutionHints(createProjectTestPlan(failed));
    assert.equal(hints.summary.auditCoverage, "none");
    assert.equal(hints.summary.failedProjectCount, 3);
    assert.deepEqual(hints.failedProjects, failed.failedProjects);
    assertMatchesSchema(hints, hintsSchema, "hints.json");
  });

  it("rejects execution-hint inputs whose failedProjects could carry arbitrary text", (t) => {
    const plan = createProjectTestPlan(auditWithKotlinFailure(t));
    const tampered = { ...plan, failedProjects: [{ ...plan.failedProjects[0], reason: "API_TOKEN=secret123" }] };

    assert.throws(() => createPlanExecutionHints(tampered), /Invalid project-test-plan\/v1 artifact at \$\.failedProjects\[0\]\.reason: not a canonical failed project entry\./);
    assert.throws(() => createPlanExecutionHints({ ...plan, failedProjects: [{ ...plan.failedProjects[0], extra: 1 }] }), /failedProjects\[0\]/);
    assert.throws(() => createPlanExecutionHints({ ...plan, failedProjects: "x" }), /\$\.failedProjects: expected array/);
  });

  it("keeps a failed nested project out of its successful parent's source-file stats", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-failed-stats-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "apps", "web", "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "index.js"), "export const value = 1;\n");
    fs.writeFileSync(path.join(root, "apps", "web", "src", "app.ts"), "export const app = 1;\n");
    const artifact = {
      schemaVersion: "project-audits/v1",
      root,
      summary: { projectCount: 2, auditedProjectCount: 1, skippedProjectCount: 0, failedProjectCount: 1 },
      audits: [
        {
          projectId: ".",
          projectRoot: ".",
          adapterId: "javascript",
          audit: {
            schemaVersion: "audit/v1",
            profile: { languages: ["javascript", "typescript"] },
            untestedCandidates: [],
            coveredButRisky: [],
            skipped: [],
            risks: []
          }
        }
      ],
      skippedProjects: [],
      failedProjects: [
        {
          projectId: "apps/web",
          projectRoot: "apps/web",
          adapterId: "javascript",
          ecosystems: ["javascript"],
          languages: ["javascript", "typescript"],
          errorName: "Error",
          reason: "The javascript adapter failed with Error."
        }
      ]
    };

    const stats = collectProjectStats(artifact);

    assert.equal(stats.sourceFiles.audited, 1);
    assert.deepEqual(Object.keys(stats.sourceFiles.byLanguage), ["javascript"]);
  });
});

describe("MCP and CLI surface failed projects", () => {
  it("returns partial MCP results instead of a tool error", (t) => {
    failAdapter(t, "kotlin", new TypeError("adapter defect"));

    const projectAudits = callTool("audit_projects", { repoRoot: polyglotRoot });
    assert.equal(projectAudits.failedProjects[0].projectRoot, "apps/android");
    assert.equal(projectAudits.audits.length, 2);

    const analysis = callTool("analyze_repository", { repoRoot: polyglotRoot });
    assert.equal(analysis.summary.failedProjectCount, 1);
    assert.equal(analysis.auditSummary.failedProjects[0].errorName, "TypeError");

    const summary = callTool("summarize_project_audits", { projectAudits: JSON.parse(JSON.stringify(projectAudits)) });
    assert.equal(summary.summary.auditCoverage, "partial");
    assert.deepEqual(summary.failedProjects, projectAudits.failedProjects);
  });

  it("returns invalid-arguments for invalid MCP Go targets without echoing the value", () => {
    for (const goTarget of [{ goos: "nonsense", goarch: "amd64" }, { goos: "linux", goarch: "amd64", tags: ["cgo"] }]) {
      assert.throws(
        () => callTool("audit_projects", { repoRoot: path.resolve("examples/go-testing-basic"), goTarget }),
        (error) =>
          error instanceof McpToolError &&
          error.kind === "invalid-arguments" &&
          error.details.argument === "goTarget" &&
          !error.message.includes("nonsense") &&
          !error.message.includes("cgo")
      );
    }
  });

  it("prints partial CLI results, lists failures and exits with status 2", (t) => {
    const artifact = auditWithKotlinFailure(t);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-failed-projects-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const artifactPath = path.join(directory, "project-audits.json");
    fs.writeFileSync(artifactPath, JSON.stringify(artifact));

    const run = (...args) => spawnSync(process.execPath, [cliPath, ...args, "--from-project-audits", artifactPath], { encoding: "utf8" });

    const markdown = run("summarize-projects");
    assert.equal(markdown.status, 2);
    assert.match(markdown.stdout, /- Failed to audit: 1/);
    assert.match(markdown.stdout, /- Audit coverage: partial/);
    assert.match(markdown.stdout, /## Failed Projects\n- 1 project failed to audit; their results are missing from this report\.\n- `apps\/android`: The kotlin adapter failed with TypeError\.\n/);
    assert.match(markdown.stderr, /^Warning: 1 project failed to audit; results are partial\. Run the audit command on a failed project root to see its full error\.\n- `apps\/android`: The kotlin adapter failed with TypeError\./);

    const json = run("audit-projects", "--format", "json");
    assert.equal(json.status, 2);
    assert.deepEqual(JSON.parse(json.stdout).failedProjects, artifact.failedProjects);

    for (const command of ["analyze", "audit-projects", "rank-projects", "plan-projects", "findings-projects", "stats-projects", "hints-projects", "placement-projects"]) {
      const result = run(command);
      assert.equal(result.status, 2, command);
      assert.match(result.stderr, /1 project failed to audit/, command);
      assert.match(result.stdout, /- Failed to audit: 1/, command);
      assert.match(result.stdout, /## Failed Projects\n- 1 project failed to audit/, command);
    }
  });

  it("exits with status 1 for invalid Go target options instead of recording a failed project", () => {
    for (const args of [["--goos", "nonsense", "--goarch", "amd64"], ["--goos", "linux", "--goarch", "amd64", "--go-tag", "cgo"]]) {
      const result = spawnSync(process.execPath, [cliPath, "audit-projects", "examples/go-testing-basic", ...args, "--format", "json"], { encoding: "utf8" });

      assert.equal(result.status, 1, args.join(" "));
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Unsupported Go build target|cannot override environment-defined tag/);
    }
  });

  it("keeps exit status 0 and output unchanged when no project failed", () => {
    const result = spawnSync(process.execPath, [cliPath, "summarize-projects", "examples/polyglot-workspace"], { encoding: "utf8" });

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.doesNotMatch(result.stdout, /Failed/);
  });
});

describe("canonical failed project validation", () => {
  const schemaNames = [
    "project-audits-v1.schema.json",
    "project-audit-summary-v1.schema.json",
    "project-candidate-ranking-v1.schema.json",
    "project-test-plan-v1.schema.json",
    "project-findings-v1.schema.json",
    "project-stats-v1.schema.json",
    "test-placement-findings-v1.schema.json",
    "plan-execution-hints-v1.schema.json"
  ];
  const tamperedReason = "The javascript adapter failed with Error. Secret token is abcdef.";

  function failedProjectItemSchema(schema) {
    const items = schema.properties.failedProjects.items;
    return items.$ref ? schema.$defs[items.$ref.replace("#/$defs/", "")] : items;
  }

  function partialArtifact(t, overrides = {}) {
    const artifact = JSON.parse(JSON.stringify(auditWithKotlinFailure(t)));
    Object.assign(artifact.failedProjects[0], overrides);
    return artifact;
  }

  it("publishes the failure vocabulary from the same constants in every schema", () => {
    for (const name of schemaNames) {
      const item = failedProjectItemSchema(readSchema(name));

      assert.equal(item.properties.reason.pattern, FAILED_PROJECT_REASON_PATTERN, name);
      assert.equal(item.properties.adapterId.pattern, FAILED_PROJECT_ADAPTER_ID_PATTERN, name);
      assert.deepEqual(item.properties.errorName.enum, FAILED_PROJECT_ERROR_NAMES, name);
      assert.deepEqual(item.properties.errorCode.enum, FAILED_PROJECT_ERROR_CODES, name);
      assert.equal(item.additionalProperties, false, name);
    }
  });

  it("accepts every reason the code can produce and rejects any other sentence", (t) => {
    const reason = new RegExp(FAILED_PROJECT_REASON_PATTERN);
    for (const errorName of FAILED_PROJECT_ERROR_NAMES) {
      for (const errorCode of [undefined, ...FAILED_PROJECT_ERROR_CODES]) {
        const failure = describeFailedProject(androidProject, "kotlin", Object.assign(new Error("x"), { name: errorName, code: errorCode }));
        assert.match(failure.reason, reason);
      }
    }
    assert.doesNotMatch(tamperedReason, reason);

    assert.throws(() => validateProjectAudits(partialArtifact(t, { reason: tamperedReason })), /\$\.failedProjects\[0\]\.reason/);
    // The schema allows each description, but only the one matching errorCode is canonical.
    assert.throws(
      () => validateProjectAudits(partialArtifact(t, {
        errorCode: "ENOENT",
        reason: "The kotlin adapter failed with TypeError. Permission was denied while reading the project."
      })),
      /\$\.failedProjects\[0\]\.reason: not a canonical failed project entry/
    );
    assert.throws(() => validateProjectAudits(partialArtifact(t, { adapterId: "Kotlin Adapter" })), /\$\.failedProjects\[0\]\.adapterId/);
  });

  it("rejects non-canonical entries at every ingestion point", (t) => {
    const tampered = partialArtifact(t, { reason: tamperedReason });

    assert.throws(
      () => callTool("summarize_project_audits", { projectAudits: tampered }),
      (error) => error instanceof McpToolError && error.kind === "invalid-arguments" && error.details.argument === "projectAudits"
    );

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-tampered-failure-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const artifactPath = path.join(directory, "project-audits.json");
    fs.writeFileSync(artifactPath, JSON.stringify(tampered));
    const result = spawnSync(process.execPath, [cliPath, "summarize-projects", "--from-project-audits", artifactPath], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.doesNotMatch(result.stderr, /Secret token/);

    const plan = createProjectTestPlan(partialArtifact(t));
    plan.failedProjects[0].reason = tamperedReason;
    let thrown;
    try {
      callTool("get_plan_execution_hints", { plan });
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown instanceof McpToolError);
    assert.equal(thrown.kind, "invalid-arguments");
    assert.equal(thrown.details.argument, "plan");
    assert.equal(toSafeMcpError(thrown).code, TOOL_ERROR_CODE);
    assert.doesNotMatch(thrown.message, /Secret token/);
  });
});

describe("repository-controlled project roots in text output", () => {
  const hostileRoot = "android\n# ALL CHECKS PASSED\n\u001b[2J";

  it("escapes control characters and Markdown in Markdown and stderr while JSON keeps the original", (t) => {
    const artifact = partialArtifact();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-hostile-root-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const artifactPath = path.join(directory, "project-audits.json");
    fs.writeFileSync(artifactPath, JSON.stringify(artifact));
    const run = (...args) => spawnSync(process.execPath, [cliPath, ...args, "--from-project-audits", artifactPath], { encoding: "utf8" });

    for (const command of ["summarize-projects", "stats-projects", "hints-projects", "placement-projects"]) {
      const result = run(command);
      assert.equal(result.status, 2, command);
      for (const output of [result.stdout, result.stderr]) {
        assert.equal(output.includes("\u001b"), false, command);
        assert.doesNotMatch(output, /^# ALL CHECKS PASSED/m, command);
        assert.ok(output.includes("- `android\\n# ALL CHECKS PASSED\\n\\u001b[2J`: The kotlin adapter failed with TypeError."), command);
      }
    }

    const json = run("audit-projects", "--format", "json");
    assert.equal(JSON.parse(json.stdout).failedProjects[0].projectRoot, hostileRoot);
  });

  it("fences roots containing backticks", (t) => {
    const artifact = partialArtifact({ projectRoot: "apps/`web`" });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-backtick-root-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const artifactPath = path.join(directory, "project-audits.json");
    fs.writeFileSync(artifactPath, JSON.stringify(artifact));

    const result = spawnSync(process.execPath, [cliPath, "summarize-projects", "--from-project-audits", artifactPath], { encoding: "utf8" });
    assert.ok(result.stdout.includes("- `` apps/`web` ``: The kotlin adapter failed with TypeError."));
  });

  it("escapes Unicode format and bidi characters", (t) => {
    const cases = [
      ["apps/\u202ePASS\u202c", "- `apps/\\u202ePASS\\u202c`: The kotlin adapter failed with TypeError."],
      ["apps/\u200bweb\u200d", "- `apps/\\u200bweb\\u200d`: The kotlin adapter failed with TypeError."],
      ["\ufeffapps/\u2066x\u2069\u061c\u2028\u{e0001}", "- `\\ufeffapps/\\u2066x\\u2069\\u061c\\u2028\\udb40\\udc01`: The kotlin adapter failed with TypeError."]
    ];
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-bidi-root-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

    for (const [projectRoot, expectedLine] of cases) {
      const artifactPath = path.join(directory, "project-audits.json");
      fs.writeFileSync(artifactPath, JSON.stringify(partialArtifact({ projectRoot })));
      const result = spawnSync(process.execPath, [cliPath, "summarize-projects", "--from-project-audits", artifactPath], { encoding: "utf8" });

      assert.equal(result.status, 2);
      for (const output of [result.stdout, result.stderr]) {
        assert.ok(output.includes(expectedLine), expectedLine);
        assert.doesNotMatch(output, /[\p{Cf}\p{Zl}\p{Zp}]/u);
      }
    }
  });

  it("renders roots with very many backtick runs without overflowing the stack", (t) => {
    const projectRoot = "a`".repeat(150000);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-backtick-runs-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const artifactPath = path.join(directory, "project-audits.json");
    fs.writeFileSync(artifactPath, JSON.stringify(partialArtifact({ projectRoot })));
    const run = (...args) => spawnSync(process.execPath, [cliPath, ...args, "--from-project-audits", artifactPath], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    });

    const markdown = run("summarize-projects");
    assert.equal(markdown.status, 2);
    assert.ok(markdown.stdout.includes(`- \`\` ${projectRoot} \`\`: The kotlin adapter failed with TypeError.`));
    assert.match(markdown.stderr, /^Warning: 1 project failed to audit/);
    assert.doesNotMatch(markdown.stderr, /RangeError/);

    const json = run("audit-projects", "--format", "json");
    assert.equal(json.status, 2);
    assert.equal(JSON.parse(json.stdout).failedProjects[0].projectRoot, projectRoot);
    assert.match(json.stderr, /^Warning: 1 project failed to audit/);
  });

  function partialArtifact(overrides = { projectRoot: hostileRoot, projectId: hostileRoot }) {
    return {
      schemaVersion: "project-audits/v1",
      root: polyglotRoot,
      summary: { projectCount: 1, auditedProjectCount: 0, skippedProjectCount: 0, failedProjectCount: 1 },
      audits: [],
      skippedProjects: [],
      failedProjects: [
        {
          projectId: "apps/android",
          projectRoot: "apps/android",
          adapterId: "kotlin",
          ecosystems: ["jvm"],
          languages: ["java", "kotlin"],
          errorName: "TypeError",
          reason: "The kotlin adapter failed with TypeError.",
          ...overrides
        }
      ]
    };
  }
});
