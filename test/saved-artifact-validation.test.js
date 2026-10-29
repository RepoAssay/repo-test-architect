import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  ArtifactValidationError,
  collectRepoProjectStats,
  generateTestPlan,
  getAuditGraph,
  summarizeRepoProjectAudits,
  validateAudit,
  validateProjectAudits
} from "../src/core/tool-api.js";
import { callTool } from "../src/mcp/tool-definitions.js";
import { toSafeMcpError } from "../src/mcp/errors.js";

const cliPath = "src/cli/index.js";
const expectedDir = path.resolve("evals/expected");
const validAuditPath = path.join(expectedDir, "node-vitest-basic.audit.json");
const secretMarker = "SECRET-VALUE-SHOULD-NOT-ECHO";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validAudit() {
  return readJson(validAuditPath);
}

function validProjectAudits() {
  return {
    schemaVersion: "project-audits/v1",
    root: ".",
    summary: { projectCount: 1, auditedProjectCount: 1, skippedProjectCount: 0 },
    audits: [{ projectId: ".", projectRoot: ".", adapterId: "javascript", audit: validAudit() }],
    skippedProjects: []
  };
}

const malformedAudits = [
  {
    name: "profile: []",
    audit: () => ({ ...validAudit(), profile: [] }),
    path: "$.profile",
    message: /Invalid audit\/v1 artifact at \$\.profile: expected object, got array\./
  },
  {
    name: "untestedCandidates: [null]",
    audit: () => ({ ...validAudit(), untestedCandidates: [null] }),
    path: "$.untestedCandidates[0]",
    message: /Invalid audit\/v1 artifact at \$\.untestedCandidates\[0\]: expected object, got null\./
  },
  {
    name: "a nested target with a wrongly typed field",
    audit: () => {
      const audit = validAudit();
      audit.untestedCandidates[0].riskReductionScore = secretMarker;
      return audit;
    },
    path: "$.untestedCandidates[0].riskReductionScore",
    message: /Invalid audit\/v1 artifact at \$\.untestedCandidates\[0\]\.riskReductionScore: expected integer, got string\./
  }
];

const malformedProjectAudits = [
  {
    name: "an audit entry whose audit profile is an array",
    projectAudits: () => {
      const projectAudits = validProjectAudits();
      projectAudits.audits[0].audit.profile = [];
      return projectAudits;
    },
    path: "$.audits[0].audit.profile",
    message: /Invalid project-audits\/v1 artifact at \$\.audits\[0\]\.audit\.profile: expected object, got array\./
  },
  {
    name: "an audit entry with a null untested candidate",
    projectAudits: () => {
      const projectAudits = validProjectAudits();
      projectAudits.audits[0].audit.untestedCandidates = [null];
      return projectAudits;
    },
    path: "$.audits[0].audit.untestedCandidates[0]",
    message: /Invalid project-audits\/v1 artifact at \$\.audits\[0\]\.audit\.untestedCandidates\[0\]: expected object, got null\./
  },
  {
    name: "an audit entry missing projectId",
    projectAudits: () => {
      const projectAudits = validProjectAudits();
      delete projectAudits.audits[0].projectId;
      return projectAudits;
    },
    path: "$.audits[0].projectId",
    message: /Invalid project-audits\/v1 artifact at \$\.audits\[0\]\.projectId: required property missing\./
  },
  {
    name: "an audit entry with a null entry",
    projectAudits: () => ({ ...validProjectAudits(), audits: [null] }),
    path: "$.audits[0]",
    message: /expected object, got null/
  }
];

describe("saved artifact validation", () => {
  describe("core tool API", () => {
    for (const testCase of malformedAudits) {
      it(`rejects an audit with ${testCase.name}`, () => {
        for (const run of [getAuditGraph, generateTestPlan, validateAudit]) {
          assert.throws(
            () => run(testCase.audit()),
            (error) =>
              error instanceof ArtifactValidationError &&
              error.path === testCase.path &&
              testCase.message.test(error.message) &&
              !error.message.includes(secretMarker)
          );
        }
      });
    }

    for (const testCase of malformedProjectAudits) {
      it(`rejects project audits with ${testCase.name}`, () => {
        for (const run of [summarizeRepoProjectAudits, collectRepoProjectStats, validateProjectAudits]) {
          assert.throws(
            () => run(testCase.projectAudits()),
            (error) => error instanceof ArtifactValidationError && error.path === testCase.path && testCase.message.test(error.message)
          );
        }
      });
    }

    it("keeps the established shallow messages for top-level shape errors", () => {
      assert.throws(() => validateAudit({ schemaVersion: "plan/v1" }), /Expected audit schemaVersion audit\/v1\./);
      assert.throws(
        () => validateProjectAudits({ ...validProjectAudits(), skippedProjects: undefined }),
        /Project audits skippedProjects must be an array\./
      );
    });

    it("renders untrusted property names without echoing them", () => {
      const audit = { ...validAudit(), [`${secretMarker} <script>`]: true };

      assert.throws(
        () => validateAudit(audit),
        (error) =>
          error.path === "$[<property>]" &&
          /additional property not allowed/.test(error.message) &&
          !error.message.includes(secretMarker)
      );
    });

    it("redacts unknown property names even when they look like safe identifiers", () => {
      const unknownName = "SECRET_VALUE_SHOULD_NOT_ECHO";
      const audit = validAudit();
      audit.untestedCandidates[0][unknownName] = true;

      assert.throws(
        () => validateAudit(audit),
        (error) =>
          error.path === "$.untestedCandidates[0][<property>]" &&
          /additional property not allowed/.test(error.message) &&
          !error.message.includes(unknownName) &&
          !error.path.includes(unknownName)
      );

      assert.throws(
        () => callTool("generate_test_plan", { audit: { ...validAudit(), [unknownName]: true } }),
        (error) => {
          const safe = toSafeMcpError(error);
          return safe.data.path === "$[<property>]" && !JSON.stringify(safe).includes(unknownName);
        }
      );
    });
  });

  describe("MCP callTool", () => {
    const auditTools = [
      ["get_audit_graph", {}],
      ["generate_test_plan", {}],
      ["explain_target", { targetId: "src/authService.ts" }],
      ["rank_test_candidates", {}],
      ["analyze_test_placement", {}]
    ];
    const projectAuditTools = [
      "summarize_project_audits",
      "rank_project_candidates",
      "generate_project_test_plan",
      "collect_project_findings",
      "analyze_project_test_placement",
      "collect_project_stats"
    ];

    for (const testCase of malformedAudits) {
      it(`returns invalid-arguments for an audit with ${testCase.name}`, () => {
        for (const [toolName, extraArgs] of auditTools) {
          assert.throws(
            () => callTool(toolName, { audit: testCase.audit(), ...extraArgs }),
            (error) => {
              const safe = toSafeMcpError(error);
              return (
                safe.code === -32000 &&
                safe.data.kind === "invalid-arguments" &&
                safe.data.toolName === toolName &&
                safe.data.argument === "audit" &&
                safe.data.path === testCase.path &&
                testCase.message.test(safe.message) &&
                !JSON.stringify(safe).includes(secretMarker)
              );
            },
            toolName
          );
        }
      });
    }

    for (const testCase of malformedProjectAudits) {
      it(`returns invalid-arguments for project audits with ${testCase.name}`, () => {
        for (const toolName of projectAuditTools) {
          assert.throws(
            () => callTool(toolName, { projectAudits: testCase.projectAudits() }),
            (error) =>
              error.kind === "invalid-arguments" &&
              error.details.toolName === toolName &&
              error.details.argument === "projectAudits" &&
              error.details.path === testCase.path &&
              testCase.message.test(error.message),
            toolName
          );
        }
      });
    }

    it("still accepts valid saved artifacts", () => {
      assert.equal(callTool("generate_test_plan", { audit: validAudit() }).schemaVersion, "plan/v1");
      assert.equal(
        callTool("summarize_project_audits", { projectAudits: validProjectAudits() }).schemaVersion,
        "project-audit-summary/v1"
      );
    });
  });

  describe("CLI", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rta-saved-artifacts-"));

    function runCli(args) {
      return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
    }

    function writeTemp(name, value) {
      const filePath = path.join(tempDir, name);
      fs.writeFileSync(filePath, JSON.stringify(value));
      return filePath;
    }

    malformedAudits.forEach((testCase, index) => {
      it(`rejects --from-audit with ${testCase.name}`, () => {
        const auditPath = writeTemp(`audit-${index}.json`, testCase.audit());
        const result = runCli(["plan", "--from-audit", auditPath, "--format", "json"]);

        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /^Failed to read audit JSON: /);
        assert.match(result.stderr, testCase.message);
        assert.doesNotMatch(result.stderr, /TypeError|at .*\.js:\d+/);
        assert.ok(!result.stderr.includes(secretMarker));
      });
    });

    malformedProjectAudits.forEach((testCase, index) => {
      it(`rejects --from-project-audits with ${testCase.name}`, () => {
        const projectAuditsPath = writeTemp(`project-audits-${index}.json`, testCase.projectAudits());
        const result = runCli(["summarize-projects", "--from-project-audits", projectAuditsPath, "--format", "json"]);

        assert.equal(result.status, 1);
        assert.match(result.stderr, /^Failed to read project audits JSON: /);
        assert.match(result.stderr, testCase.message);
      });
    });
  });

  describe("checked-in input artifacts", () => {
    const auditFiles = fs.readdirSync(expectedDir).filter((fileName) => fileName.endsWith(".audit.json"));

    it("finds saved audit artifacts to check", () => {
      assert.ok(auditFiles.length > 0);
    });

    for (const fileName of auditFiles) {
      it(`accepts evals/expected/${fileName}`, () => {
        const audit = readJson(path.join(expectedDir, fileName));

        assert.doesNotThrow(() => validateAudit(audit));
      });
    }

    for (const fileName of fs.readdirSync("examples/mcp").filter((name) => name.endsWith(".json"))) {
      it(`accepts saved artifacts in examples/mcp/${fileName}`, () => {
        const args = readJson(path.join("examples/mcp", fileName));

        if (Object.hasOwn(args, "audit")) assert.doesNotThrow(() => validateAudit(args.audit));
        if (Object.hasOwn(args, "projectAudits")) assert.doesNotThrow(() => validateProjectAudits(args.projectAudits));
      });
    }

    it("keeps the MCP placement example audit in sync with the saved node-vitest-basic audit", () => {
      assert.deepEqual(readJson("examples/mcp/node-vitest-basic-audit.args.json").audit, validAudit());
    });

    const packageScripts = Object.entries(readJson("package.json").scripts).filter(([, command]) =>
      /src\/mcp\/invoke\.js call(?:-envelope)? /.test(command)
    );

    it("finds package MCP example scripts to check", () => {
      assert.ok(packageScripts.length > 0);
    });

    for (const [scriptName, command] of packageScripts) {
      it(`accepts saved artifacts passed by npm run ${scriptName}`, () => {
        const rawArgs = command.replace(/^.*src\/mcp\/invoke\.js call(?:-envelope)? \S+ /, "");
        const args = rawArgs.startsWith("@")
          ? readJson(rawArgs.slice(1).replace(/^"|"$/g, ""))
          : JSON.parse(rawArgs.slice(1, -1).replaceAll('\\"', '"'));

        if (Object.hasOwn(args, "audit")) assert.doesNotThrow(() => validateAudit(args.audit));
        if (Object.hasOwn(args, "projectAudits")) assert.doesNotThrow(() => validateProjectAudits(args.projectAudits));
      });
    }
  });
});
