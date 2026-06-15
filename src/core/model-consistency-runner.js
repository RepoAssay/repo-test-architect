import fs from "node:fs";
import path from "node:path";
import { callTool } from "../mcp/tool-definitions.js";

/**
 * @typedef {object} ModelConsistencyScenario
 * @property {"model-consistency-scenario/v1"} schemaVersion
 * @property {string} id
 * @property {string} description
 * @property {{ path: string, schemaVersion: string }} sourceArtifact
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
 * @param {string} baseDir
 * @param {{ path: string, schemaVersion: string }} sourceArtifact
 * @returns {object}
 */
function readSourceArtifact(baseDir, sourceArtifact) {
  const artifact = JSON.parse(fs.readFileSync(path.resolve(baseDir, sourceArtifact.path), "utf8"));

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

  throw new Error(`Unsupported source artifact for model consistency: ${scenario.sourceArtifact.schemaVersion}.`);
}

/**
 * @param {unknown} value
 * @param {string} fieldPath
 * @returns {unknown}
 */
function readPath(value, fieldPath) {
  return fieldPath.split(".").reduce((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return current[segment];
    }

    return undefined;
  }, value);
}
