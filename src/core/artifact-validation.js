import fs from "node:fs";
import { compileSchema } from "./json-schema-validator.js";

const artifactSchemaPaths = Object.freeze({
  "audit/v1": "schemas/audit-v1.schema.json",
  "project-audits/v1": "schemas/project-audits-v1.schema.json"
});

const compiledValidators = new Map();

/**
 * Raised when a saved artifact does not match its published JSON schema.
 * The message names the first invalid JSON path and never echoes instance values.
 */
export class ArtifactValidationError extends Error {
  /**
   * @param {string} message
   * @param {{ schemaVersion: string, path: string }} details
   */
  constructor(message, { schemaVersion, path }) {
    super(message);
    this.name = "ArtifactValidationError";
    this.schemaVersion = schemaVersion;
    this.path = path;
  }
}

/**
 * Validate a saved artifact against its published schema and throw on the first violation.
 * Schemas are read from the package and compiled once per process.
 *
 * @param {unknown} artifact
 * @param {"audit/v1" | "project-audits/v1"} schemaVersion
 * @param {{ rootPath?: string }} [options]
 * @returns {void}
 */
export function assertValidArtifact(artifact, schemaVersion, { rootPath = "$" } = {}) {
  const [issue] = getArtifactValidator(schemaVersion)(artifact, { rootPath, maxErrors: 1 });

  if (issue) {
    throw new ArtifactValidationError(
      `Invalid ${schemaVersion} artifact at ${issue.path}: ${issue.message}.`,
      { schemaVersion, path: issue.path }
    );
  }
}

function getArtifactValidator(schemaVersion) {
  let validator = compiledValidators.get(schemaVersion);

  if (!validator) {
    const schemaPath = artifactSchemaPaths[schemaVersion];
    if (!schemaPath) throw new Error(`No published schema for artifact ${schemaVersion}.`);

    const schemaUrl = new URL(`../../${schemaPath}`, import.meta.url);
    validator = compileSchema(JSON.parse(fs.readFileSync(schemaUrl, "utf8")));
    compiledValidators.set(schemaVersion, validator);
  }

  return validator;
}
