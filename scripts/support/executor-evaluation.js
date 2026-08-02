import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getAdapter } from "../../src/core/adapter-registry.js";
import { createGenerationDeferredResult } from "../../src/core/generation-deferred.js";
import { createPlanExecutionHints } from "../../src/core/plan-execution-hints.js";
import { createTestPlan } from "../../src/core/test-plan.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export function readExecutorEvaluationFixture(fixturePath) {
  const resolvedPath = path.resolve(fixturePath);
  const fixture = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  validateFixture(fixture);
  return { fixture, fixturePath: resolvedPath };
}

export async function runExecutorEvaluation(fixturePath, options = {}) {
  const loaded = readExecutorEvaluationFixture(fixturePath);
  const fixture = loaded.fixture;
  const repositoryRoot = options.repositoryRoot ?? process.cwd();
  const sourceRoot = path.resolve(repositoryRoot, fixture.repositoryRoot);
  const audit = getAdapter(fixture.adapterId).audit(sourceRoot);
  const plan = createTestPlan(audit);
  const planItem = plan.items.find((item) => item.id === fixture.planItemId);
  if (!planItem) throw new Error(`Unknown executor evaluation plan item: ${fixture.planItemId}`);
  if (plan.summary.verificationCommand !== fixture.expectedVerificationCommand) {
    throw new Error(
      `Executor fixture expected ${fixture.expectedVerificationCommand}, got ${plan.summary.verificationCommand ?? "no command"}.`
    );
  }
  if (plan.blockers.length > 0) {
    throw new Error(`Executor fixture plan is blocked: ${plan.blockers.join("; ")}`);
  }

  const executionHint = createPlanExecutionHints(plan, { itemId: planItem.id }).items[0];
  const contextFiles = Object.fromEntries(fixture.contextPaths.map((currentPath) => {
    const normalizedPath = normalizeRelativePath(currentPath, "context path");
    return [normalizedPath, fs.readFileSync(path.join(sourceRoot, normalizedPath), "utf8")];
  }));
  const inputDigest = digestJson({ planItem, executionHint, files: contextFiles });
  const contextTemplate = deepFreeze({
    fixtureId: fixture.id,
    inputDigest,
    planItem: cloneJson(planItem),
    executionHint: cloneJson(executionHint),
    files: contextFiles,
    guidance: {
      allowedTestPath: fixture.allowedTestPath,
      verificationCommand: fixture.expectedVerificationCommand,
      conventions: fixture.conventions
    }
  });
  const profiles = [];

  for (const profileReference of fixture.profiles) {
    profiles.push(await evaluateProfile({
      fixture,
      fixturePath: loaded.fixturePath,
      profileReference,
      sourceRoot,
      contextTemplate,
      planItem,
      inputDigest,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    }));
  }

  const passedProfileCount = profiles.filter((profile) => profile.status === "passed").length;
  const failedProfileCount = profiles.filter((profile) => profile.status === "failed").length;
  const rejectedProfileCount = profiles.filter((profile) => profile.status === "rejected").length;
  return {
    schemaVersion: "executor-evaluation/v1",
    evaluationMode: "non-shipping",
    productGeneration: {
      schemaVersion: createGenerationDeferredResult(planItem.id).schemaVersion,
      status: "deferred"
    },
    fixture: {
      id: fixture.id,
      adapterId: fixture.adapterId,
      repositoryRoot: normalizeRelativePath(fixture.repositoryRoot, "repository root"),
      planItemId: planItem.id,
      targetPath: planItem.path,
      allowedTestPath: fixture.allowedTestPath,
      verificationCommand: fixture.expectedVerificationCommand,
      maxRepairs: fixture.maxRepairs
    },
    input: {
      digest: inputDigest,
      confidence: audit.profile.confidence,
      sourceSignals: [...planItem.sourceSignals],
      executionHint: {
        complexity: executionHint.complexity,
        contextMode: executionHint.contextScope.mode,
        recommendedAgentRole: executionHint.recommendedAgentRole
      }
    },
    summary: {
      profileCount: profiles.length,
      passedProfileCount,
      failedProfileCount,
      rejectedProfileCount,
      totalAttemptCount: profiles.reduce((total, profile) => total + profile.attempts.length, 0),
      totalRepairCount: profiles.reduce((total, profile) => total + profile.repairCount, 0),
      meaningfulFailureCount: profiles.filter((profile) => profile.faultInjection.status === "detected").length
    },
    profiles
  };
}

export function inspectExecutorProposal(proposal, contract) {
  const unrelatedEdits = [];
  const evidenceContradictions = [];
  const files = Array.isArray(proposal?.files) ? proposal.files : [];
  if (files.length !== 1) evidenceContradictions.push("proposal must contain exactly one generated test file");

  for (const file of files) {
    let currentPath;
    try {
      currentPath = normalizeRelativePath(file?.path, "proposal file path");
    } catch {
      unrelatedEdits.push(String(file?.path ?? "<missing>"));
      continue;
    }
    if (currentPath !== contract.allowedTestPath) unrelatedEdits.push(currentPath);
    if (typeof file.content !== "string" || file.content.length === 0) {
      evidenceContradictions.push(`generated file ${currentPath} must contain text`);
    }
  }

  compareClaim(proposal?.planItemId, contract.planItem.id, "plan item", evidenceContradictions);
  compareClaim(proposal?.targetId, contract.planItem.targetId, "target id", evidenceContradictions);
  compareClaim(proposal?.targetPath, contract.planItem.path, "target path", evidenceContradictions);
  compareClaim(proposal?.action, contract.planItem.action, "plan action", evidenceContradictions);
  compareClaim(proposal?.testLevel, contract.planItem.testLevel, "test level", evidenceContradictions);
  if (JSON.stringify(proposal?.sourceSignals) !== JSON.stringify(contract.planItem.sourceSignals)) {
    evidenceContradictions.push("source signals differ from the selected plan item");
  }

  const generatedFile = files.find((file) => normalizePathSafely(file?.path) === contract.allowedTestPath);
  const conventionChecks = contract.conventions.map((convention) => {
    const value = convention.target === "path" ? contract.allowedTestPath : generatedFile?.content ?? "";
    return {
      id: convention.id,
      status: new RegExp(convention.pattern, "m").test(value) ? "pass" : "fail"
    };
  });
  const conventionAdherence = {
    status: conventionChecks.every((check) => check.status === "pass") ? "pass" : "fail",
    checks: conventionChecks
  };

  return {
    accepted:
      unrelatedEdits.length === 0 &&
      evidenceContradictions.length === 0 &&
      conventionAdherence.status === "pass",
    unrelatedEdits: [...new Set(unrelatedEdits)].sort(),
    evidenceContradictions,
    conventionAdherence
  };
}

async function evaluateProfile(options) {
  const {
    fixture,
    fixturePath,
    profileReference,
    sourceRoot,
    contextTemplate,
    planItem,
    inputDigest,
    timeoutMs
  } = options;
  const profilePath = path.resolve(path.dirname(fixturePath), profileReference.module);
  const profileModule = await import(pathToFileURL(profilePath).href);
  if (profileModule.profileId !== profileReference.id || typeof profileModule.createProposal !== "function") {
    throw new Error(`Executor profile module does not implement ${profileReference.id}.`);
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-executor-evaluation-"));
  const workingRoot = path.join(temporaryRoot, "repository");
  fs.cpSync(sourceRoot, workingRoot, { recursive: true });
  const baseline = collectFileDigests(workingRoot);
  const attempts = [];
  let previousVerification;
  let status = "failed";
  let faultInjection = { status: "not-run" };

  try {
    for (let attemptNumber = 1; attemptNumber <= fixture.maxRepairs + 1; attemptNumber += 1) {
      const context = deepFreeze({
        ...cloneJson(contextTemplate),
        ...(previousVerification ? { previousVerification: cloneJson(previousVerification) } : {})
      });
      const proposal = profileModule.createProposal(context, attemptNumber);
      if (!proposal) break;
      const inspection = inspectExecutorProposal(proposal, {
        planItem,
        allowedTestPath: fixture.allowedTestPath,
        conventions: fixture.conventions
      });
      const attempt = {
        attemptNumber,
        repair: attemptNumber > 1,
        proposalStatus: inspection.accepted ? "accepted" : "rejected",
        conventionAdherence: inspection.conventionAdherence,
        unrelatedEdits: inspection.unrelatedEdits,
        evidenceContradictions: inspection.evidenceContradictions,
        changedPaths: []
      };

      if (!inspection.accepted) {
        attempts.push(attempt);
        status = "rejected";
        break;
      }

      const generatedFile = proposal.files[0];
      const generatedPath = path.join(workingRoot, fixture.allowedTestPath);
      fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
      fs.writeFileSync(generatedPath, generatedFile.content);
      attempt.changedPaths = changedPaths(baseline, collectFileDigests(workingRoot));
      const runtimeUnrelatedEdits = attempt.changedPaths.filter((currentPath) => currentPath !== fixture.allowedTestPath);
      if (runtimeUnrelatedEdits.length > 0) {
        attempt.unrelatedEdits = runtimeUnrelatedEdits;
        attempt.proposalStatus = "rejected";
        attempts.push(attempt);
        status = "rejected";
        break;
      }

      const verification = runVerification(fixture.expectedVerificationCommand, workingRoot, timeoutMs);
      attempt.verification = verification;
      attempts.push(attempt);
      previousVerification = verification;
      if (verification.status !== "passed") continue;

      faultInjection = evaluateFaultInjection(fixture, workingRoot, timeoutMs);
      status = faultInjection.status === "detected" ? "passed" : "failed";
      break;
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }

  return {
    id: profileReference.id,
    inputDigest,
    status,
    repairCount: attempts.filter((attempt) => attempt.repair).length,
    attempts,
    faultInjection
  };
}

function evaluateFaultInjection(fixture, workingRoot, timeoutMs) {
  const injectionPath = path.join(workingRoot, fixture.faultInjection.path);
  const originalContent = fs.readFileSync(injectionPath, "utf8");
  fs.writeFileSync(injectionPath, createFaultInjectedContent(originalContent, fixture.faultInjection));
  try {
    const verification = runVerification(fixture.expectedVerificationCommand, workingRoot, timeoutMs);
    return {
      path: fixture.faultInjection.path,
      status: verification.status === "failed" ? "detected" : "missed",
      verification
    };
  } finally {
    fs.writeFileSync(injectionPath, originalContent);
  }
}

export function createFaultInjectedContent(originalContent, faultInjection) {
  const normalizedContent = originalContent.replaceAll("\r\n", "\n");
  const normalizedFind = faultInjection.find.replaceAll("\r\n", "\n");
  const normalizedReplacement = faultInjection.replacement.replaceAll("\r\n", "\n");
  const occurrences = normalizedContent.split(normalizedFind).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Fault injection must match exactly once in ${faultInjection.path}, got ${occurrences}.`);
  }
  const injectedContent = normalizedContent.replace(normalizedFind, normalizedReplacement);
  return originalContent.includes("\r\n") ? injectedContent.replaceAll("\n", "\r\n") : injectedContent;
}

function runVerification(command, cwd, timeoutMs) {
  const startedAt = Date.now();
  const verificationEnvironment = { ...process.env, CI: "1" };
  delete verificationEnvironment.NODE_TEST_CONTEXT;
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: "utf8",
    timeout: timeoutMs,
    env: verificationEnvironment,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const durationMs = Date.now() - startedAt;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status === 0 && !result.error) {
    return { command, status: "passed", exitCode: 0, durationMs };
  }
  return {
    command,
    status: "failed",
    exitCode: Number.isInteger(result.status) ? result.status : -1,
    durationMs,
    failureKind: classifyVerificationFailure(result.error, output)
  };
}

function classifyVerificationFailure(error, output) {
  if (error?.code === "ETIMEDOUT") return "timeout";
  if (/AssertionError|ERR_ASSERTION|expected .+ to/i.test(output)) return "assertion-failure";
  if (/SyntaxError|transform failed|failed to parse|compilation failed/i.test(output)) return "compile-failure";
  return "verification-failure";
}

function collectFileDigests(root) {
  const digests = new Map();
  visit(root);
  return digests;

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if ([".git", "node_modules"].includes(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        const relative = normalizePath(path.relative(root, absolute));
        digests.set(relative, crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex"));
      }
    }
  }
}

function changedPaths(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((currentPath) => before.get(currentPath) !== after.get(currentPath)).sort();
}

function compareClaim(actual, expected, label, contradictions) {
  if (actual !== expected) contradictions.push(`${label} differs from the selected plan item`);
}

function validateFixture(fixture) {
  if (fixture?.schemaVersion !== "executor-evaluation-fixture/v1") {
    throw new Error("Expected executor evaluation fixture schemaVersion executor-evaluation-fixture/v1.");
  }
  for (const key of ["id", "repositoryRoot", "adapterId", "planItemId", "allowedTestPath", "expectedVerificationCommand"]) {
    if (typeof fixture[key] !== "string" || fixture[key].length === 0) {
      throw new Error(`Executor evaluation fixture ${key} must be a non-empty string.`);
    }
  }
  normalizeRelativePath(fixture.repositoryRoot, "repository root");
  fixture.allowedTestPath = normalizeRelativePath(fixture.allowedTestPath, "allowed test path");
  if (!Number.isInteger(fixture.maxRepairs) || fixture.maxRepairs < 0 || fixture.maxRepairs > 1) {
    throw new Error("Executor evaluation fixture maxRepairs must be zero or one.");
  }
  if (!Array.isArray(fixture.contextPaths) || fixture.contextPaths.length === 0) {
    throw new Error("Executor evaluation fixture must provide context paths.");
  }
  fixture.contextPaths = fixture.contextPaths.map((currentPath) =>
    normalizeRelativePath(currentPath, "context path")
  );
  if (!Array.isArray(fixture.conventions) || fixture.conventions.length === 0) {
    throw new Error("Executor evaluation fixture must provide convention checks.");
  }
  for (const convention of fixture.conventions) {
    if (typeof convention?.id !== "string" || !["path", "content"].includes(convention?.target)) {
      throw new Error("Executor evaluation conventions require an id and path or content target.");
    }
    try {
      new RegExp(convention.pattern, "m");
    } catch {
      throw new Error(`Executor evaluation convention ${convention.id} has an invalid pattern.`);
    }
  }
  if (!Array.isArray(fixture.profiles) || fixture.profiles.length < 2) {
    throw new Error("Executor evaluation fixture must provide at least two profiles.");
  }
  const profileIds = new Set();
  for (const profile of fixture.profiles) {
    if (typeof profile?.id !== "string" || profile.id.length === 0 || profileIds.has(profile.id)) {
      throw new Error("Executor evaluation profiles require unique non-empty ids.");
    }
    profileIds.add(profile.id);
    profile.module = normalizeRelativePath(profile.module, "profile module");
  }
  fixture.faultInjection.path = normalizeRelativePath(fixture.faultInjection?.path, "fault injection path");
  if (typeof fixture.faultInjection?.find !== "string" || typeof fixture.faultInjection?.replacement !== "string") {
    throw new Error("Executor evaluation fixture must provide a literal fault injection.");
  }
  if (fixture.faultInjection.find.length === 0 || fixture.faultInjection.find === fixture.faultInjection.replacement) {
    throw new Error("Executor evaluation fault injection must replace a non-empty literal with different text.");
  }
}

function normalizeRelativePath(currentPath, label) {
  if (typeof currentPath !== "string" || currentPath.length === 0) {
    throw new Error(`${label} must be a non-empty relative path.`);
  }
  const normalized = normalizePath(currentPath).replace(/^\.\//, "");
  if (path.posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`${label} must stay inside the evaluation root.`);
  }
  return normalized;
}

function normalizePathSafely(currentPath) {
  try {
    return normalizeRelativePath(currentPath, "proposal file path");
  } catch {
    return undefined;
  }
}

function normalizePath(currentPath) {
  return currentPath.replaceAll("\\", "/");
}

function digestJson(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
