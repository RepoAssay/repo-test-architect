import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createDiagnosticBundle,
  createDiagnosticEvent,
  createDiagnosticRecorder,
  createDoctorReport,
  createErrorFingerprint,
  resolveDiagnosticConfig
} from "../src/diagnostics/diagnostics.js";

const UUID_A = "00000000-0000-4000-8000-000000000001";
const UUID_B = "00000000-0000-4000-8000-000000000002";
const UUID_C = "00000000-0000-4000-8000-000000000003";
const NOW = new Date("2026-07-24T12:00:00.000Z");

describe("local diagnostics", () => {
  it("is disabled by default and requires an explicit file destination", () => {
    assert.deepEqual(resolveDiagnosticConfig({}), {
      mode: "off",
      fileConfigured: false,
      filePath: undefined,
      maxEvents: 200,
      issues: []
    });

    const invalid = resolveDiagnosticConfig({
      REPO_TEST_ARCHITECT_DIAGNOSTICS: "file"
    });

    assert.equal(invalid.mode, "off");
    assert.equal(invalid.issues.length, 1);
  });

  it("creates allowlisted events without tool arguments or repository data", () => {
    const event = createDiagnosticEvent({
      toolName: "audit_repo",
      status: "success",
      durationMs: 12.4,
      arguments: {
        token: "secret-token",
        repoRoot: "/Users/private/repo",
        source: "proprietary source"
      }
    }, {
      now: () => NOW,
      createId: () => UUID_A
    });

    assert.deepEqual(event, {
      schemaVersion: "diagnostic-event/v1",
      timestamp: "2026-07-24T12:00:00.000Z",
      eventId: `event-${UUID_A}`,
      eventType: "mcp-tool-call",
      serverVersion: "0.1.0",
      toolName: "audit_repo",
      status: "success",
      durationMs: 12
    });
    assert.doesNotMatch(JSON.stringify(event), /secret-token|Users|proprietary/);
  });

  it("writes opt-in stderr events without affecting stdout", () => {
    let stderr = "";
    const recorder = createDiagnosticRecorder({
      mode: "stderr",
      now: () => NOW,
      createId: () => UUID_A,
      stderr: {
        write(chunk) {
          stderr += chunk;
        }
      }
    });

    recorder.recordToolCall({
      toolName: "audit_repo",
      status: "error",
      durationMs: 3,
      errorKind: "invalid-arguments"
    });

    const event = JSON.parse(stderr);
    assert.equal(event.status, "error");
    assert.equal(event.errorKind, "invalid-arguments");
    assert.equal(event.reportId, undefined);
  });

  it("groups unexpected failures with a one-way fingerprint without exposing error text", () => {
    const error = new Error("token=secret-token at /Users/private/repo/source.js");
    const first = createErrorFingerprint(error);
    const second = createErrorFingerprint(new Error("token=secret-token at /Users/private/repo/source.js"));

    assert.equal(first, second);
    assert.match(first, /^sha256:[0-9a-f]{16}$/);
    assert.doesNotMatch(first, /secret-token|Users|source/);
  });

  it("bounds file diagnostics and strips non-contract fields from bundles", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-diagnostics-"));
    const filePath = path.join(tempRoot, "diagnostics.jsonl");
    const ids = [UUID_A, UUID_B, UUID_C];
    const recorder = createDiagnosticRecorder({
      mode: "file",
      filePath,
      maxEvents: 2,
      now: () => NOW,
      createId: () => ids.shift()
    });

    recorder.recordToolCall({ toolName: "audit_repo", status: "success", durationMs: 1 });
    recorder.recordToolCall({ toolName: "generate_test_plan", status: "success", durationMs: 2 });
    recorder.recordToolCall({
      toolName: "get_plan_execution_hints",
      status: "error",
      durationMs: 3,
      errorKind: "internal-error",
      reportId: `report-${UUID_A}`,
      errorFingerprint: "sha256:0123456789abcdef"
    });

    fs.appendFileSync(filePath, `${JSON.stringify({
      schemaVersion: "diagnostic-event/v1",
      timestamp: NOW.toISOString(),
      eventId: `event-${UUID_A}`,
      eventType: "mcp-tool-call",
      serverVersion: "0.1.0",
      toolName: "audit_repo",
      status: "success",
      durationMs: 4,
      token: "secret-token",
      repoRoot: "/Users/private/repo",
      source: "proprietary source"
    })}\n`);

    const bundle = createDiagnosticBundle(filePath, { now: () => NOW });
    const serialized = JSON.stringify(bundle);

    assert.equal(bundle.summary.eventCount, 3);
    assert.equal(bundle.summary.errorCount, 1);
    assert.equal(bundle.events[0].toolName, "generate_test_plan");
    assert.equal(bundle.events[1].reportId, `report-${UUID_A}`);
    assert.equal(bundle.events[1].errorFingerprint, "sha256:0123456789abcdef");
    assert.doesNotMatch(serialized, /secret-token|Users|proprietary/);
    assert.deepEqual(bundle.privacy, {
      containsToolArguments: false,
      containsRepositoryPaths: false,
      containsSourceContent: false,
      externalReporting: false
    });
  });

  it("reports runtime readiness without exposing the repository path or environment values", () => {
    const report = createDoctorReport("/private/repository", {
      env: {
        REPO_TEST_ARCHITECT_DIAGNOSTICS: "stderr",
        PRIVATE_TOKEN: "secret-token"
      },
      nodeVersion: "22.0.0",
      now: () => NOW,
      fsAccess() {},
      runGit: () => "true\n"
    });
    const serialized = JSON.stringify(report);

    assert.equal(report.schemaVersion, "doctor-report/v1");
    assert.equal(report.status, "ready");
    assert.equal(report.diagnostics.mode, "stderr");
    assert.equal(report.diagnostics.externalReporting, false);
    assert.doesNotMatch(serialized, /private\/repository|secret-token|PRIVATE_TOKEN/);
  });

  it("checks an opt-in file destination without echoing its path", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-doctor-"));
    const filePath = path.join(tempRoot, "nested", "diagnostics.jsonl");
    const report = createDoctorReport(tempRoot, {
      env: {
        REPO_TEST_ARCHITECT_DIAGNOSTICS: "file",
        REPO_TEST_ARCHITECT_DIAGNOSTICS_FILE: filePath
      },
      nodeVersion: "22.0.0",
      now: () => NOW,
      runGit: () => "true\n"
    });

    assert.equal(report.status, "ready");
    assert.equal(
      report.checks.find((check) => check.id === "diagnostics-file-access")?.status,
      "pass"
    );
    assert.doesNotMatch(JSON.stringify(report), /repo-test-architect-doctor|diagnostics\.jsonl/);
  });
});
