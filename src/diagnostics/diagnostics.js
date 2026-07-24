import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const DIAGNOSTIC_EVENT_LIMIT = 200;
export const DIAGNOSTIC_MODES = ["off", "stderr", "file"];
export const DIAGNOSTICS_ENV = "REPO_TEST_ARCHITECT_DIAGNOSTICS";
export const DIAGNOSTICS_FILE_ENV = "REPO_TEST_ARCHITECT_DIAGNOSTICS_FILE";

const SERVER_VERSION = "0.1.0";
const SAFE_LABEL = /^[a-z][a-z0-9_-]{0,63}$/;
const SAFE_ERROR_KINDS = new Set([
  "internal-error",
  "invalid-arguments",
  "missing-required-argument",
  "unknown-tool",
  "unsupported-argument"
]);

export function resolveDiagnosticConfig(env = process.env) {
  const requestedMode = env[DIAGNOSTICS_ENV] ?? "off";
  const filePath = env[DIAGNOSTICS_FILE_ENV];
  const issues = [];
  let mode = requestedMode;

  if (!DIAGNOSTIC_MODES.includes(mode)) {
    issues.push(`${DIAGNOSTICS_ENV} must be off, stderr, or file.`);
    mode = "off";
  }

  if (mode === "file" && (!filePath || filePath.trim().length === 0)) {
    issues.push(`${DIAGNOSTICS_FILE_ENV} is required when diagnostics mode is file.`);
    mode = "off";
  }

  return {
    mode,
    fileConfigured: Boolean(filePath && filePath.trim()),
    filePath: filePath?.trim(),
    maxEvents: DIAGNOSTIC_EVENT_LIMIT,
    issues
  };
}

export function createDiagnosticRecorderFromEnv(options = {}) {
  const config = resolveDiagnosticConfig(options.env);

  return createDiagnosticRecorder({
    ...options,
    ...config
  });
}

export function createDiagnosticRecorder({
  mode = "off",
  filePath,
  maxEvents = DIAGNOSTIC_EVENT_LIMIT,
  now = () => new Date(),
  createId = () => randomUUID(),
  stderr = process.stderr
} = {}) {
  return {
    mode,
    recordToolCall(details) {
      if (mode === "off") return undefined;

      const event = createDiagnosticEvent(details, { now, createId });

      try {
        if (mode === "stderr") {
          stderr.write(`${JSON.stringify(event)}\n`);
        } else if (mode === "file" && filePath) {
          writeBoundedDiagnosticEvent(filePath, event, maxEvents);
        }
      } catch {
        // Diagnostics are best effort and must never break MCP request handling.
      }

      return event;
    }
  };
}

export function createDiagnosticEvent({
  toolName,
  status,
  durationMs,
  errorKind,
  reportId,
  errorFingerprint
}, {
  now = () => new Date(),
  createId = () => randomUUID()
} = {}) {
  const event = {
    schemaVersion: "diagnostic-event/v1",
    timestamp: normalizeTimestamp(now()),
    eventId: `event-${createId()}`,
    eventType: "mcp-tool-call",
    serverVersion: SERVER_VERSION,
    toolName: sanitizeLabel(toolName, "invalid-tool-name"),
    status: status === "success" ? "success" : "error",
    durationMs: normalizeDuration(durationMs)
  };

  if (event.status === "error") {
    event.errorKind = SAFE_ERROR_KINDS.has(errorKind) ? errorKind : "internal-error";
  }

  if (event.errorKind === "internal-error" && isSafeReportId(reportId)) {
    event.reportId = reportId;
  }

  if (event.errorKind === "internal-error" && isSafeErrorFingerprint(errorFingerprint)) {
    event.errorFingerprint = errorFingerprint;
  }

  return event;
}

export function createErrorFingerprint(error) {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  const digest = createHash("sha256").update(`${name}\n${message}`).digest("hex").slice(0, 16);

  return `sha256:${digest}`;
}

export function createDoctorReport(repoRoot, {
  env = process.env,
  nodeVersion = process.versions.node,
  now = () => new Date(),
  fsAccess = fs.accessSync,
  runGit = (root) => execFileSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  })
} = {}) {
  const config = resolveDiagnosticConfig(env);
  const checks = [];
  const nodeMajor = Number.parseInt(nodeVersion.split(".")[0], 10);

  checks.push({
    id: "node-version",
    status: nodeMajor >= 20 ? "pass" : "fail",
    detail: nodeMajor >= 20 ? `Node ${nodeMajor} satisfies the minimum version.` : `Node ${nodeMajor} is below the required version 20.`
  });

  try {
    fsAccess(repoRoot, fs.constants.R_OK);
    checks.push({ id: "repository-access", status: "pass", detail: "Repository directory is readable." });
  } catch {
    checks.push({ id: "repository-access", status: "fail", detail: "Repository directory is not readable." });
  }

  try {
    const insideWorktree = runGit(repoRoot).trim() === "true";
    checks.push({
      id: "git-worktree",
      status: insideWorktree ? "pass" : "warning",
      detail: insideWorktree ? "Git worktree detected." : "Directory is not a Git worktree."
    });
  } catch {
    checks.push({ id: "git-worktree", status: "warning", detail: "Git worktree detection was unavailable." });
  }

  checks.push({
    id: "diagnostics-mode",
    status: config.issues.length > 0 ? "warning" : "pass",
    detail: config.issues[0] ?? diagnosticModeDetail(config)
  });

  if (config.mode === "file") {
    try {
      fsAccess(findExistingParent(path.dirname(path.resolve(config.filePath))), fs.constants.W_OK);
      checks.push({
        id: "diagnostics-file-access",
        status: "pass",
        detail: "The configured diagnostics file destination is writable."
      });
    } catch {
      checks.push({
        id: "diagnostics-file-access",
        status: "fail",
        detail: "The configured diagnostics file destination is not writable."
      });
    }
  }

  const failureCount = checks.filter((check) => check.status === "fail").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;

  return {
    schemaVersion: "doctor-report/v1",
    generatedAt: normalizeTimestamp(now()),
    status: failureCount > 0 ? "error" : warningCount > 0 ? "warning" : "ready",
    diagnostics: {
      mode: config.mode,
      fileConfigured: config.fileConfigured,
      eventLimit: config.maxEvents,
      externalReporting: false
    },
    summary: {
      checkCount: checks.length,
      passedCount: checks.filter((check) => check.status === "pass").length,
      warningCount,
      failureCount
    },
    checks
  };
}

export function createDiagnosticBundle(filePath, {
  now = () => new Date(),
  limit = DIAGNOSTIC_EVENT_LIMIT
} = {}) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    throw new Error("A diagnostics file path is required.");
  }

  const { events, invalidLineCount, truncated } = readDiagnosticEvents(filePath, { limit });

  return {
    schemaVersion: "diagnostic-bundle/v1",
    generatedAt: normalizeTimestamp(now()),
    source: {
      kind: "local-jsonl",
      eventLimit: limit,
      truncated
    },
    summary: {
      eventCount: events.length,
      successCount: events.filter((event) => event.status === "success").length,
      errorCount: events.filter((event) => event.status === "error").length,
      internalErrorCount: events.filter((event) => event.errorKind === "internal-error").length,
      invalidLineCount
    },
    privacy: {
      containsToolArguments: false,
      containsRepositoryPaths: false,
      containsSourceContent: false,
      externalReporting: false
    },
    events
  };
}

export function readDiagnosticEvents(filePath, { limit = DIAGNOSTIC_EVENT_LIMIT } = {}) {
  if (!fs.existsSync(filePath)) {
    return { events: [], invalidLineCount: 0, truncated: false };
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  const events = [];
  let invalidLineCount = 0;

  for (const line of lines) {
    try {
      const event = sanitizeDiagnosticEvent(JSON.parse(line));
      if (event) events.push(event);
      else invalidLineCount += 1;
    } catch {
      invalidLineCount += 1;
    }
  }

  return {
    events: limit === 0 ? [] : events.slice(-limit),
    invalidLineCount,
    truncated: events.length > limit
  };
}

function writeBoundedDiagnosticEvent(filePath, event, maxEvents) {
  const parent = path.dirname(path.resolve(filePath));
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const { events } = readDiagnosticEvents(filePath, { limit: Math.max(0, maxEvents - 1) });
  const contents = [...events, event].map((entry) => JSON.stringify(entry)).join("\n");
  fs.writeFileSync(filePath, `${contents}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function sanitizeDiagnosticEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  if (value.schemaVersion !== "diagnostic-event/v1") return undefined;
  if (value.eventType !== "mcp-tool-call") return undefined;
  if (!["success", "error"].includes(value.status)) return undefined;
  if (!Number.isInteger(value.durationMs) || value.durationMs < 0) return undefined;
  if (typeof value.timestamp !== "string" || Number.isNaN(Date.parse(value.timestamp))) return undefined;
  if (typeof value.eventId !== "string" || !/^event-[0-9a-f-]{36}$/.test(value.eventId)) return undefined;

  return createSanitizedStoredEvent(value);
}

function createSanitizedStoredEvent(value) {
  const event = {
    schemaVersion: "diagnostic-event/v1",
    timestamp: value.timestamp,
    eventId: value.eventId.slice(0, 128),
    eventType: "mcp-tool-call",
    serverVersion: sanitizeVersion(value.serverVersion),
    toolName: sanitizeLabel(value.toolName, "invalid-tool-name"),
    status: value.status,
    durationMs: value.durationMs
  };

  if (event.status === "error") {
    event.errorKind = SAFE_ERROR_KINDS.has(value.errorKind) ? value.errorKind : "internal-error";
  }

  if (event.errorKind === "internal-error" && isSafeReportId(value.reportId)) {
    event.reportId = value.reportId;
  }

  if (event.errorKind === "internal-error" && isSafeErrorFingerprint(value.errorFingerprint)) {
    event.errorFingerprint = value.errorFingerprint;
  }

  return event;
}

function diagnosticModeDetail(config) {
  if (config.mode === "off") return "Local MCP diagnostics are disabled.";
  if (config.mode === "stderr") return "Local MCP diagnostics write allowlisted JSON events to stderr.";
  return "Local MCP diagnostics write a bounded allowlisted JSONL file.";
}

function sanitizeLabel(value, fallback) {
  return typeof value === "string" && SAFE_LABEL.test(value) ? value : fallback;
}

function sanitizeVersion(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(value)
    ? value
    : SERVER_VERSION;
}

function normalizeTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function normalizeDuration(value) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

function isSafeReportId(value) {
  return typeof value === "string" && /^report-[0-9a-f-]{36}$/.test(value);
}

function isSafeErrorFingerprint(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{16}$/.test(value);
}

function findExistingParent(startPath) {
  let current = startPath;

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }

  return current;
}
