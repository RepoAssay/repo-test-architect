#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAdapters } from "../src/core/adapter-registry.js";

export const corpusRoles = [
  "conventional-library-or-service",
  "framework-heavy-application",
  "difficult-ownership-graph"
];

export const scorecardAreas = [
  "detection",
  "ownership",
  "command",
  "evidence",
  "ranking",
  "stability",
  "performance"
];

const scoreStatuses = new Set(["pass", "fail", "pending"]);

if (isMainModule()) {
  const corpus = loadValidationCorpus();
  const result = validateValidationCorpus(corpus);

  if (result.errors.length > 0) {
    console.error(`Validation corpus check failed:\n${result.errors.map((error) => `- ${error}`).join("\n")}`);
    process.exitCode = 1;
  } else {
    const scores = Object.entries(result.scorecardCounts)
      .map(([status, count]) => `${count} ${status}`)
      .join(", ");
    console.log(`Validation corpus check passed: ${result.adapterCount} adapters, ${result.caseCount} pinned cases, ${scores}.`);
  }
}

export function loadValidationCorpus(manifestPath = path.resolve("evals/validation-corpus.json")) {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function validateValidationCorpus(corpus, options = {}) {
  const root = options.root ?? process.cwd();
  const supportedAdapterIds = (options.adapters ?? listAdapters())
    .filter((adapter) => adapter.maturity === "supported")
    .map((adapter) => adapter.id)
    .sort();
  const errors = [];
  const adapters = Array.isArray(corpus?.adapters) ? corpus.adapters : [];
  const corpusAdapterIds = adapters.map((adapter) => adapter.adapterId).sort();
  const caseIds = new Set();
  const scorecardCounts = { pass: 0, fail: 0, pending: 0 };

  if (corpus?.schemaVersion !== "validation-corpus/v1") {
    errors.push("schemaVersion must be validation-corpus/v1");
  }

  if (!sameValues(corpusAdapterIds, supportedAdapterIds)) {
    errors.push(`corpus adapters must match supported adapters: ${supportedAdapterIds.join(", ")}`);
  }

  for (const adapter of adapters) {
    const label = adapter.adapterId || "<missing adapter>";
    const cases = Array.isArray(adapter.cases) ? adapter.cases : [];
    const roles = new Set(cases.map((entry) => entry.role));

    if (typeof adapter.adapterId !== "string" || adapter.adapterId.length === 0) {
      errors.push("every corpus adapter needs a non-empty adapterId");
    }
    if (cases.length < corpusRoles.length) {
      errors.push(`${label} needs at least ${corpusRoles.length} corpus cases`);
    }

    for (const role of corpusRoles) {
      if (!roles.has(role)) errors.push(`${label} is missing corpus role ${role}`);
    }

    for (const entry of cases) {
      const caseLabel = entry.id || `${label}/<missing case>`;

      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id ?? "")) {
        errors.push(`${caseLabel} id must be a lowercase kebab-case identifier`);
      }
      if (caseIds.has(entry.id)) errors.push(`${caseLabel} has a duplicate case id`);
      caseIds.add(entry.id);

      if (!corpusRoles.includes(entry.role)) {
        errors.push(`${caseLabel} has unsupported corpus role ${entry.role}`);
      }
      if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(entry.repository?.url ?? "")) {
        errors.push(`${caseLabel} repository URL must be a GitHub repository URL`);
      }

      if (!/^[0-9a-f]{40}$/.test(entry.repository?.commit ?? "")) {
        errors.push(`${caseLabel} commit must be a full lowercase 40-character Git SHA`);
      }

      for (const [field, value] of [
        ["projectRoot", entry.repository?.projectRoot],
        ["reportPath", entry.reportPath]
      ]) {
        if (!isPortableRelativePath(value)) {
          errors.push(`${caseLabel} ${field} must be a portable relative path`);
        }
      }

      if (isPortableRelativePath(entry.reportPath) && !fs.existsSync(path.resolve(root, entry.reportPath))) {
        errors.push(`${caseLabel} report does not exist: ${entry.reportPath}`);
      }
      if (typeof entry.supportBoundary !== "string" || entry.supportBoundary.length === 0) {
        errors.push(`${caseLabel} needs a non-empty supportBoundary`);
      }

      for (const area of scorecardAreas) {
        const status = entry.scorecard?.[area];
        if (!scoreStatuses.has(status)) {
          errors.push(`${caseLabel} scorecard.${area} must be pass, fail, or pending`);
          continue;
        }
        scorecardCounts[status] += 1;
        if (status === "fail") errors.push(`${caseLabel} scorecard.${area} is failing`);
      }

      if (typeof entry.observed?.testCommand !== "string" || entry.observed.testCommand.length === 0) {
        errors.push(`${caseLabel} observed.testCommand must be a non-empty string`);
      }
      for (const field of ["untestedCandidates", "coveredButRisky", "skippedTargets"]) {
        if (!Number.isInteger(entry.observed?.[field]) || entry.observed[field] < 0) {
          errors.push(`${caseLabel} observed.${field} must be a non-negative integer`);
        }
      }
      for (const field of ["auditDurationMs", "evidenceRelationshipCount"]) {
        const value = entry.observed?.[field];
        if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
          errors.push(`${caseLabel} observed.${field} must be a non-negative integer when present`);
        }
      }
      if (
        entry.observed?.auditDurationSamplesMs !== undefined &&
        (!Array.isArray(entry.observed.auditDurationSamplesMs) ||
          entry.observed.auditDurationSamplesMs.length < 3 ||
          entry.observed.auditDurationSamplesMs.some((value) => !Number.isInteger(value) || value < 0))
      ) {
        errors.push(`${caseLabel} observed.auditDurationSamplesMs must contain at least three non-negative integers when present`);
      }
      if (
        entry.observed?.canonicalAuditSha256 !== undefined &&
        !/^[0-9a-f]{64}$/.test(entry.observed.canonicalAuditSha256)
      ) {
        errors.push(`${caseLabel} observed.canonicalAuditSha256 must be a lowercase SHA-256 digest when present`);
      }

      if (entry.scorecard?.performance === "pass") {
        if (!Number.isInteger(entry.observed?.auditDurationMs)) {
          errors.push(`${caseLabel} needs auditDurationMs before performance can pass`);
        }
        if (!Number.isInteger(entry.observed?.evidenceRelationshipCount)) {
          errors.push(`${caseLabel} needs evidenceRelationshipCount before performance can pass`);
        }
        if (!hasRepeatedDurationSamples(entry.observed)) {
          errors.push(`${caseLabel} needs at least three auditDurationSamplesMs before performance can pass`);
        } else if (entry.observed.auditDurationMs !== medianInteger(entry.observed.auditDurationSamplesMs)) {
          errors.push(`${caseLabel} auditDurationMs must equal the median auditDurationSamplesMs value`);
        }
      }
      if (entry.scorecard?.stability === "pass") {
        if (!/^[0-9a-f]{64}$/.test(entry.observed?.canonicalAuditSha256 ?? "")) {
          errors.push(`${caseLabel} needs canonicalAuditSha256 before stability can pass`);
        }
        if (!hasRepeatedDurationSamples(entry.observed)) {
          errors.push(`${caseLabel} needs at least three auditDurationSamplesMs before stability can pass`);
        }
      }
    }
  }

  return {
    errors,
    adapterCount: adapters.length,
    caseCount: caseIds.size,
    scorecardCounts
  };
}

function hasRepeatedDurationSamples(observed) {
  return Array.isArray(observed?.auditDurationSamplesMs) &&
    observed.auditDurationSamplesMs.length >= 3 &&
    observed.auditDurationSamplesMs.every((value) => Number.isInteger(value) && value >= 0);
}

function medianInteger(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isPortableRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\")) return false;
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return false;
  return value === "." || !value.split("/").includes("..");
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
