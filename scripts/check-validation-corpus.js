#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAdapters } from "../src/core/adapter-registry.js";
import { validationScorecardAreas } from "../src/core/validation-scorecard.js";

export const corpusRoles = [
  "conventional-library-or-service",
  "framework-heavy-application",
  "difficult-ownership-graph"
];

export const scorecardAreas = validationScorecardAreas;

const scoreStatuses = new Set(["pass", "fail", "pending"]);
const corpusMaturities = new Set(["supported", "experimental"]);

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
    console.log(
      `Validation corpus check passed: ${result.adapterCount} adapters ` +
      `(${result.supportedAdapterCount} supported, ${result.experimentalAdapterCount} experimental), ` +
      `${result.caseCount} pinned cases, ${scores}.`
    );
  }
}

export function loadValidationCorpus(manifestPath = path.resolve("evals/validation-corpus.json")) {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function validateValidationCorpus(corpus, options = {}) {
  const root = options.root ?? process.cwd();
  const registeredAdapters = options.adapters ?? listAdapters();
  const registeredAdaptersById = new Map(registeredAdapters.map((adapter) => [adapter.id, adapter]));
  const supportedAdapterIds = registeredAdapters
    .filter((adapter) => adapter.maturity === "supported")
    .map((adapter) => adapter.id)
    .sort();
  const errors = [];
  const adapters = Array.isArray(corpus?.adapters) ? corpus.adapters : [];
  const corpusAdapterIds = adapters.map((adapter) => adapter.adapterId).sort();
  const corpusAdapterIdSet = new Set(corpusAdapterIds);
  const caseIds = new Set();
  const scorecardCounts = { pass: 0, fail: 0, pending: 0 };

  if (corpus?.schemaVersion !== "validation-corpus/v1") {
    errors.push("schemaVersion must be validation-corpus/v1");
  }

  const missingSupportedAdapterIds = supportedAdapterIds.filter((adapterId) => !corpusAdapterIdSet.has(adapterId));
  if (missingSupportedAdapterIds.length > 0) {
    errors.push(`corpus is missing supported adapters: ${missingSupportedAdapterIds.join(", ")}`);
  }
  if (corpusAdapterIdSet.size !== corpusAdapterIds.length) {
    errors.push("corpus adapterIds must be unique");
  }
  for (const adapterId of corpusAdapterIdSet) {
    const registeredAdapter = registeredAdaptersById.get(adapterId);
    if (!registeredAdapter) {
      errors.push(`corpus adapter ${adapterId} is not registered`);
    } else if (!corpusMaturities.has(registeredAdapter.maturity)) {
      errors.push(`corpus adapter ${adapterId} must be supported or experimental`);
    }
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
      validateAuditOptions(entry.auditOptions, label, caseLabel, errors);

      for (const area of scorecardAreas) {
        const status = entry.scorecard?.[area];
        if (!scoreStatuses.has(status)) {
          errors.push(`${caseLabel} scorecard.${area} must be pass, fail, or pending`);
          continue;
        }
        scorecardCounts[status] += 1;
        if (status === "fail") errors.push(`${caseLabel} scorecard.${area} is failing`);
      }

      if (entry.observed?.testCommand !== null && (
        typeof entry.observed?.testCommand !== "string" || entry.observed.testCommand.length === 0
      )) {
        errors.push(`${caseLabel} observed.testCommand must be a non-empty string or null when command execution is intentionally withheld`);
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
    supportedAdapterCount: adapters.filter(
      (adapter) => registeredAdaptersById.get(adapter.adapterId)?.maturity === "supported"
    ).length,
    experimentalAdapterCount: adapters.filter(
      (adapter) => registeredAdaptersById.get(adapter.adapterId)?.maturity === "experimental"
    ).length,
    caseCount: caseIds.size,
    scorecardCounts
  };
}

function validateAuditOptions(options, adapterId, caseLabel, errors) {
  if (options === undefined) return;
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    errors.push(`${caseLabel} auditOptions must be an object when present`);
    return;
  }
  const unknownOptions = Object.keys(options).filter((key) => key !== "goTarget");
  if (unknownOptions.length > 0) errors.push(`${caseLabel} has unsupported audit option ${unknownOptions[0]}`);
  if (options.goTarget === undefined) return;
  if (adapterId !== "go") errors.push(`${caseLabel} goTarget is only valid for the Go adapter`);
  const target = options.goTarget;
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    errors.push(`${caseLabel} auditOptions.goTarget must be an object`);
    return;
  }
  const unknownTargetKeys = Object.keys(target).filter((key) => !["goos", "goarch", "tags"].includes(key));
  if (unknownTargetKeys.length > 0) errors.push(`${caseLabel} has unsupported goTarget option ${unknownTargetKeys[0]}`);
  if (typeof target.goos !== "string" || target.goos.length === 0) errors.push(`${caseLabel} goTarget.goos must be a non-empty string`);
  if (typeof target.goarch !== "string" || target.goarch.length === 0) errors.push(`${caseLabel} goTarget.goarch must be a non-empty string`);
  if (target.tags !== undefined && (
    !Array.isArray(target.tags) ||
    target.tags.some((tag) => typeof tag !== "string" || tag.length === 0) ||
    new Set(target.tags).size !== target.tags.length
  )) {
    errors.push(`${caseLabel} goTarget.tags must contain unique non-empty strings when present`);
  }
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

function isPortableRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\")) return false;
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return false;
  return value === "." || !value.split("/").includes("..");
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
