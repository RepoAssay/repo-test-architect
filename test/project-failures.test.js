import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { adapters } from "../src/core/adapter-registry.js";
import { summarizeProjectAudits } from "../src/core/project-audit-summary.js";
import { validateProjectAudits } from "../src/core/project-audits-validation.js";
import { auditDetectedProjects } from "../src/core/project-auditor.js";
import { rankProjectTestCandidates } from "../src/core/project-candidate-ranking.js";
import { describeFailedProject, sortFailedProjects } from "../src/core/project-failures.js";
import { createProjectFindings } from "../src/core/project-findings.js";
import { collectProjectStats } from "../src/core/project-stats.js";
import { createProjectTestPlan } from "../src/core/project-test-plan.js";
import { createRepositoryAnalysis } from "../src/core/repository-analysis.js";
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

function readSchema(name) {
  return JSON.parse(fs.readFileSync(path.join("schemas", name), "utf8"));
}

function auditWithKotlinFailure(t) {
  failAdapter(t, "kotlin", new TypeError("Cannot read properties of undefined (reading 'modules')"));
  return auditDetectedProjects(polyglotRoot);
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
        reason: "Cannot read properties of undefined (reading 'modules')"
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

  it("keeps absolute paths, quoted content and stack frames out of the error summary", () => {
    const repoRoot = path.join(os.tmpdir(), "rta-sanitize", "repo");
    const error = new Error(
      `Cannot parse ${path.join(repoRoot, "apps", "android", "build.gradle.kts")} near "password = hunter2" ` +
        "via /etc/secrets/key.pem, C:\\Users\\me\\settings.gradle and (file:///home/me/init.gradle)\n" +
        `    at parseGradle (${path.join(repoRoot, "src", "parser.js")}:10:5)`
    );
    error.code = "ERR_GRADLE_PARSE";

    const failure = describeFailedProject(androidProject, "kotlin", error, repoRoot);

    assert.deepEqual(failure, {
      projectId: "apps/android",
      projectRoot: "apps/android",
      adapterId: "kotlin",
      ecosystems: ["jvm"],
      languages: ["java", "kotlin"],
      errorName: "Error",
      errorCode: "ERR_GRADLE_PARSE",
      reason: `Cannot parse ${["apps", "android", "build.gradle.kts"].join(path.sep)} near "<redacted>" via <path>, <path> and (<path>)`
    });
    const sibling = describeFailedProject(androidProject, "kotlin", new Error(`compared ${repoRoot} with ${repoRoot}-old`), repoRoot);
    assert.equal(sibling.reason, "compared . with <path>");
    const serialized = JSON.stringify(failure);
    for (const leaked of [repoRoot, "hunter2", "/etc/secrets", "Users\\\\me", "/home/me", "parseGradle", "\\n"]) {
      assert.equal(serialized.includes(leaked), false, `failure summary leaked ${leaked}`);
    }
  });

  it("bounds unusual thrown values to a safe name, code and message", () => {
    const longMessage = new RangeError("x".repeat(500));
    longMessage.code = "not a code; /etc/passwd";

    assert.deepEqual(describeFailedProject(androidProject, "kotlin", longMessage, polyglotRoot).reason.length, 200);
    assert.equal(Object.hasOwn(describeFailedProject(androidProject, "kotlin", longMessage, polyglotRoot), "errorCode"), false);
    assert.equal(describeFailedProject(androidProject, "kotlin", longMessage, polyglotRoot).errorName, "RangeError");

    const fromString = describeFailedProject(androidProject, "kotlin", "plain string failure", polyglotRoot);
    assert.equal(fromString.errorName, "Error");
    assert.equal(fromString.reason, "plain string failure");

    const fromObject = describeFailedProject(androidProject, "kotlin", { name: "<script>", message: "ignored" }, polyglotRoot);
    assert.equal(fromObject.errorName, "Error");
    assert.equal(fromObject.reason, "Adapter audit failed without a message.");

    const badName = new Error("renamed");
    badName.name = "Bad Name\nwith newline";
    assert.equal(describeFailedProject(androidProject, "kotlin", badName, polyglotRoot).errorName, "Error");
  });

  it("does not contain errors raised outside an adapter's audit call", () => {
    // Detection runs before any adapter, so its defects still fail the whole run.
    assert.throws(() => auditDetectedProjects(polyglotRoot, { excludeProjectRoots: "apps/**" }), { name: "TypeError" });
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

  it("rejects malformed failed project entries", () => {
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
      reason: "boom"
    };

    assert.doesNotThrow(() => validateProjectAudits({ ...base, failedProjects: [entry] }));
    assert.throws(() => validateProjectAudits({ ...base, failedProjects: {} }), /\$\.failedProjects/);
    assert.throws(() => validateProjectAudits({ ...base, failedProjects: [{ ...entry, reason: undefined }] }), /\$\.failedProjects\[0\]/);
    assert.throws(() => validateProjectAudits({ ...base, failedProjects: [{ ...entry, stack: "at x" }] }), /\$\.failedProjects\[0\]/);
    assert.throws(() => validateProjectAudits({ ...base, failedProjects: [{ ...entry, errorName: "Type Error" }] }), /errorName/);
    assert.throws(() => validateProjectAudits({ ...base, failedProjects: [{ ...entry, reason: "x".repeat(201) }] }), /reason/);
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
      ["project-stats-v1.schema.json", collectProjectStats, false],
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
    for (const adapterId of ["javascript", "kotlin", "python"]) failAdapter(t, adapterId, new Error("boom"));
    const summary = summarizeProjectAudits(auditDetectedProjects(polyglotRoot));

    assert.equal(summary.summary.auditCoverage, "none");
    assert.equal(summary.summary.failedProjectCount, 3);
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
    assert.match(markdown.stdout, /## Failed Projects\n- 1 project failed to audit; their results are missing from this report\.\n- apps\/android: kotlin adapter failed \(TypeError\): Cannot read properties/);
    assert.match(markdown.stderr, /^Warning: 1 project failed to audit; results are partial\.\n- apps\/android: kotlin adapter failed/);

    const json = run("audit-projects", "--format", "json");
    assert.equal(json.status, 2);
    assert.deepEqual(JSON.parse(json.stdout).failedProjects, artifact.failedProjects);

    for (const command of ["analyze", "audit-projects", "rank-projects", "plan-projects", "findings-projects", "stats-projects", "hints-projects", "placement-projects"]) {
      const result = run(command);
      assert.equal(result.status, 2, command);
      assert.match(result.stderr, /1 project failed to audit/, command);
      if (!["hints-projects", "placement-projects", "stats-projects"].includes(command)) {
        assert.match(result.stdout, /## Failed Projects/, command);
      }
    }
  });

  it("keeps exit status 0 and output unchanged when no project failed", () => {
    const result = spawnSync(process.execPath, [cliPath, "summarize-projects", "examples/polyglot-workspace"], { encoding: "utf8" });

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.doesNotMatch(result.stdout, /Failed/);
  });
});
