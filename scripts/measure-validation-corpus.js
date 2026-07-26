#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getAdapter } from "../src/core/adapter-registry.js";
import { loadValidationCorpus } from "./check-validation-corpus.js";

if (isMainModule()) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const measurement = measureValidationCorpusCase(options);
    console.log(JSON.stringify(measurement, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

export function measureValidationCorpusCase({ caseId, checkoutPath, runCount = 3 }) {
  if (!caseId) throw new Error("Missing required --case.");
  if (!checkoutPath) throw new Error("Missing required --checkout.");
  if (!Number.isInteger(runCount) || runCount < 3) throw new Error("--runs must be an integer of at least 3.");

  const corpusCase = findCorpusCase(caseId);
  const checkoutRoot = path.resolve(checkoutPath);
  verifyPinnedCheckout(checkoutRoot, corpusCase.entry.repository.commit);
  const projectRoot = path.resolve(checkoutRoot, corpusCase.entry.repository.projectRoot);
  if (!fs.statSync(projectRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Project root does not exist for ${caseId}: ${projectRoot}`);
  }

  const adapter = getAdapter(corpusCase.adapterId);
  const runs = [];
  for (let index = 0; index < runCount; index += 1) {
    const started = performance.now();
    const audit = adapter.audit(projectRoot, corpusCase.entry.auditOptions ?? {});
    const durationMs = Math.round(performance.now() - started);
    runs.push({ audit, durationMs });
  }

  return {
    caseId,
    adapterId: corpusCase.adapterId,
    commit: corpusCase.entry.repository.commit,
    ...summarizeCorpusRuns(runs)
  };
}

export function summarizeCorpusRuns(runs) {
  if (!Array.isArray(runs) || runs.length < 3) {
    throw new Error("Corpus measurement requires at least three audit runs.");
  }

  const digests = runs.map(({ audit }) => canonicalAuditDigest(audit));
  if (new Set(digests).size !== 1) {
    throw new Error(`Canonical audit output changed across runs: ${[...new Set(digests)].join(", ")}.`);
  }

  const firstAudit = runs[0].audit;
  const auditDurationSamplesMs = runs.map(({ durationMs }) => Math.max(0, Math.round(durationMs)));
  return {
    testCommand: firstAudit.profile.testCommand,
    untestedCandidates: firstAudit.untestedCandidates.length,
    coveredButRisky: firstAudit.coveredButRisky.length,
    skippedTargets: firstAudit.skipped.length,
    auditDurationMs: medianInteger(auditDurationSamplesMs),
    auditDurationSamplesMs,
    evidenceRelationshipCount: firstAudit.coveredButRisky.reduce(
      (total, target) => total + (target.existingTestEvidence?.length ?? 0),
      0
    ),
    canonicalAuditSha256: digests[0]
  };
}

export function canonicalAuditDigest(audit) {
  const normalized = {
    ...audit,
    profile: {
      ...audit.profile,
      root: "<corpus>"
    }
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function medianInteger(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isInteger(value))) {
    throw new Error("Median values must be a non-empty integer array.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function findCorpusCase(caseId) {
  for (const adapter of loadValidationCorpus().adapters) {
    const entry = adapter.cases.find((candidate) => candidate.id === caseId);
    if (entry) return { adapterId: adapter.adapterId, entry };
  }
  throw new Error(`Unknown validation corpus case: ${caseId}`);
}

function verifyPinnedCheckout(checkoutRoot, expectedCommit) {
  const result = spawnSync("git", ["-C", checkoutRoot, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Checkout is not a Git repository: ${checkoutRoot}`);
  const actualCommit = result.stdout.trim();
  if (actualCommit !== expectedCommit) {
    throw new Error(`Checkout HEAD ${actualCommit} does not match pinned commit ${expectedCommit}.`);
  }
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--case") options.caseId = args[++index];
    else if (argument === "--checkout") options.checkoutPath = args[++index];
    else if (argument === "--runs") options.runCount = Number(args[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
