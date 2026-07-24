import fs from "node:fs";
import path from "node:path";
import { callTool } from "../mcp/tool-definitions.js";

/**
 * @typedef {object} ModelConsistencyScenario
 * @property {"model-consistency-scenario/v1"} schemaVersion
 * @property {string} id
 * @property {string} description
 * @property {{ path: string, schemaVersion: string, argumentName?: string }} sourceArtifact
 * @property {{ toolName: string, arguments: Record<string, unknown> }} toolCall
 * @property {Array<{ path: string, expected: string | number | boolean, reason: string }>} lockedFields
 * @property {string[]} allowedVariations
 * @property {string[]} unexpectedVariations
 *
 * @typedef {object} ModelConsistencyFailure
 * @property {string} path
 * @property {string | number | boolean} expected
 * @property {unknown} actual
 * @property {string} reason
 *
 * @typedef {object} ModelConsistencyResult
 * @property {string} scenarioId
 * @property {string} toolName
 * @property {number} checkedFieldCount
 * @property {ModelConsistencyFailure[]} failures
 *
 * @typedef {object} ModelConsistencySummary
 * @property {"model-consistency-summary/v1"} schemaVersion
 * @property {string} profileName
 * @property {{ scenarioCount: number, passedScenarioCount: number, failedScenarioCount: number, checkedFieldCount: number, failureCount: number }} summary
 * @property {Array<{ scenarioId: string, toolName: string, checkedFieldCount: number, status: "passed" | "failed", failureCount: number }>} scenarios
 * @property {string[]} allowedVariationThemes
 * @property {string[]} unexpectedVariationThemes
 *
 * @typedef {object} ModelConsistencyComparison
 * @property {"model-consistency-comparison/v1"} schemaVersion
 * @property {string} baselineProfile
 * @property {string} candidateProfile
 * @property {{ scenarioCount: number, alignedScenarioCount: number, driftedScenarioCount: number, missingScenarioCount: number, unexpectedScenarioCount: number, checkedFieldDelta: number, failureDelta: number }} summary
 * @property {Array<{ scenarioId: string, baselineStatus: "passed" | "failed" | "missing", candidateStatus: "passed" | "failed" | "missing", alignment: "aligned" | "drifted" | "missing" | "unexpected", baselineFailureCount: number, candidateFailureCount: number }>} scenarios
 */

/**
 * @param {string} scenarioPath
 * @returns {ModelConsistencyScenario}
 */
export function readModelConsistencyScenario(scenarioPath) {
  return JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
}

/**
 * @param {ModelConsistencyScenario} scenario
 * @param {{ baseDir?: string }} [options]
 * @returns {ModelConsistencyResult}
 */
export function runModelConsistencyScenario(scenario, options = {}) {
  validateScenario(scenario);

  const baseDir = options.baseDir ?? ".";
  const sourceArtifact = readSourceArtifact(baseDir, scenario.sourceArtifact);
  const toolArgs = buildToolArgs(scenario, sourceArtifact);
  const toolResult = callTool(scenario.toolCall.toolName, toolArgs);
  const failures = scenario.lockedFields
    .map((field) => ({
      path: field.path,
      expected: field.expected,
      actual: readPath(toolResult, field.path),
      reason: field.reason
    }))
    .filter((field) => field.actual !== field.expected);

  return {
    scenarioId: scenario.id,
    toolName: scenario.toolCall.toolName,
    checkedFieldCount: scenario.lockedFields.length,
    failures
  };
}

/**
 * @param {ModelConsistencyScenario[]} scenarios
 * @param {ModelConsistencyResult[]} results
 * @param {{ profileName?: string }} [options]
 * @returns {ModelConsistencySummary}
 */
export function summarizeModelConsistencyResults(scenarios, results, options = {}) {
  const checkedFieldCount = results.reduce((sum, result) => sum + result.checkedFieldCount, 0);
  const failureCount = results.reduce((sum, result) => sum + result.failures.length, 0);
  const failedScenarioCount = results.filter((result) => result.failures.length > 0).length;

  return {
    schemaVersion: "model-consistency-summary/v1",
    profileName: options.profileName ?? "deterministic-baseline",
    summary: {
      scenarioCount: results.length,
      passedScenarioCount: results.length - failedScenarioCount,
      failedScenarioCount,
      checkedFieldCount,
      failureCount
    },
    scenarios: results.map((result) => ({
      scenarioId: result.scenarioId,
      toolName: result.toolName,
      checkedFieldCount: result.checkedFieldCount,
      status: result.failures.length === 0 ? "passed" : "failed",
      failureCount: result.failures.length
    })),
    allowedVariationThemes: uniqueSorted(scenarios.flatMap((scenario) => scenario.allowedVariations)),
    unexpectedVariationThemes: uniqueSorted(scenarios.flatMap((scenario) => scenario.unexpectedVariations))
  };
}

/**
 * @param {ModelConsistencySummary} baseline
 * @param {ModelConsistencySummary} candidate
 * @returns {ModelConsistencyComparison}
 */
export function compareModelConsistencySummaries(baseline, candidate) {
  validateSummary(baseline, "baseline");
  validateSummary(candidate, "candidate");

  const baselineScenarios = new Map(baseline.scenarios.map((scenario) => [scenario.scenarioId, scenario]));
  const candidateScenarios = new Map(candidate.scenarios.map((scenario) => [scenario.scenarioId, scenario]));
  const scenarioIds = uniqueSorted([...baselineScenarios.keys(), ...candidateScenarios.keys()]);
  const scenarios = scenarioIds.map((scenarioId) => {
    const baselineScenario = baselineScenarios.get(scenarioId);
    const candidateScenario = candidateScenarios.get(scenarioId);

    return compareScenario(scenarioId, baselineScenario, candidateScenario);
  });

  return {
    schemaVersion: "model-consistency-comparison/v1",
    baselineProfile: baseline.profileName,
    candidateProfile: candidate.profileName,
    summary: {
      scenarioCount: scenarios.length,
      alignedScenarioCount: scenarios.filter((scenario) => scenario.alignment === "aligned").length,
      driftedScenarioCount: scenarios.filter((scenario) => scenario.alignment === "drifted").length,
      missingScenarioCount: scenarios.filter((scenario) => scenario.alignment === "missing").length,
      unexpectedScenarioCount: scenarios.filter((scenario) => scenario.alignment === "unexpected").length,
      checkedFieldDelta: candidate.summary.checkedFieldCount - baseline.summary.checkedFieldCount,
      failureDelta: candidate.summary.failureCount - baseline.summary.failureCount
    },
    scenarios
  };
}

/**
 * @param {ModelConsistencyScenario} scenario
 * @returns {void}
 */
function validateScenario(scenario) {
  if (scenario?.schemaVersion !== "model-consistency-scenario/v1") {
    throw new Error("Expected model consistency scenario schemaVersion model-consistency-scenario/v1.");
  }

  if (!Array.isArray(scenario.lockedFields) || scenario.lockedFields.length === 0) {
    throw new Error("Model consistency scenario must define at least one locked field.");
  }
}

/**
 * @param {unknown} summary
 * @param {string} label
 * @returns {void}
 */
function validateSummary(summary, label) {
  if (summary?.schemaVersion !== "model-consistency-summary/v1") {
    throw new Error(`Expected ${label} model consistency summary schemaVersion model-consistency-summary/v1.`);
  }
}

/**
 * @param {string} scenarioId
 * @param {{ status: "passed" | "failed", checkedFieldCount: number, failureCount: number } | undefined} baselineScenario
 * @param {{ status: "passed" | "failed", checkedFieldCount: number, failureCount: number } | undefined} candidateScenario
 * @returns {{ scenarioId: string, baselineStatus: "passed" | "failed" | "missing", candidateStatus: "passed" | "failed" | "missing", alignment: "aligned" | "drifted" | "missing" | "unexpected", baselineFailureCount: number, candidateFailureCount: number }}
 */
function compareScenario(scenarioId, baselineScenario, candidateScenario) {
  if (!baselineScenario) {
    return {
      scenarioId,
      baselineStatus: "missing",
      candidateStatus: candidateScenario.status,
      alignment: "unexpected",
      baselineFailureCount: 0,
      candidateFailureCount: candidateScenario.failureCount
    };
  }

  if (!candidateScenario) {
    return {
      scenarioId,
      baselineStatus: baselineScenario.status,
      candidateStatus: "missing",
      alignment: "missing",
      baselineFailureCount: baselineScenario.failureCount,
      candidateFailureCount: 0
    };
  }

  const aligned =
    baselineScenario.status === candidateScenario.status &&
    baselineScenario.failureCount === candidateScenario.failureCount &&
    baselineScenario.checkedFieldCount === candidateScenario.checkedFieldCount;

  return {
    scenarioId,
    baselineStatus: baselineScenario.status,
    candidateStatus: candidateScenario.status,
    alignment: aligned ? "aligned" : "drifted",
    baselineFailureCount: baselineScenario.failureCount,
    candidateFailureCount: candidateScenario.failureCount
  };
}

/**
 * @param {string} baseDir
 * @param {{ path: string, schemaVersion: string, argumentName?: string }} sourceArtifact
 * @returns {object}
 */
function readSourceArtifact(baseDir, sourceArtifact) {
  const source = JSON.parse(fs.readFileSync(path.resolve(baseDir, sourceArtifact.path), "utf8"));
  const artifact = sourceArtifact.argumentName ? source[sourceArtifact.argumentName] : source;

  if (!artifact) {
    throw new Error(`Expected source artifact argument ${sourceArtifact.argumentName}.`);
  }

  if (artifact.schemaVersion !== sourceArtifact.schemaVersion) {
    throw new Error(`Expected source artifact schemaVersion ${sourceArtifact.schemaVersion}.`);
  }

  return artifact;
}

/**
 * @param {ModelConsistencyScenario} scenario
 * @param {object} sourceArtifact
 * @returns {Record<string, unknown>}
 */
function buildToolArgs(scenario, sourceArtifact) {
  const args = { ...scenario.toolCall.arguments };

  if (scenario.sourceArtifact.schemaVersion === "audit/v1") {
    return { audit: sourceArtifact, ...args };
  }

  if (scenario.sourceArtifact.schemaVersion === "project-audits/v1") {
    return { projectAudits: sourceArtifact, ...args };
  }

  if (["plan/v1", "project-test-plan/v1"].includes(scenario.sourceArtifact.schemaVersion)) {
    return { plan: sourceArtifact, ...args };
  }

  throw new Error(`Unsupported source artifact for model consistency: ${scenario.sourceArtifact.schemaVersion}.`);
}

/**
 * @param {unknown} value
 * @param {string} fieldPath
 * @returns {unknown}
 */
function readPath(value, fieldPath) {
  return parsePath(fieldPath).reduce((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return current[segment];
    }

    return undefined;
  }, value);
}

/**
 * @param {string} fieldPath
 * @returns {string[]}
 */
function parsePath(fieldPath) {
  return fieldPath
    .replaceAll("[", ".")
    .replaceAll("]", "")
    .split(".")
    .filter(Boolean);
}

/**
 * @param {string[]} values
 * @returns {string[]}
 */
function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
