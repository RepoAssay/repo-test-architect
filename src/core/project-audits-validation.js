import { ArtifactValidationError, assertValidArtifact } from "./artifact-validation.js";
import { assertCanonicalFailedProjects } from "./project-failures.js";

/**
 * Validate a saved project-audits/v1 artifact against
 * schemas/project-audits-v1.schema.json. Nested audits are checked to the depth
 * that schema publishes (it intentionally accepts abbreviated audit entries).
 * Throws ArtifactValidationError naming the first invalid JSON path.
 *
 * @param {unknown} projectAudits
 * @returns {void}
 */
export function validateProjectAudits(projectAudits) {
  if (projectAudits?.schemaVersion !== "project-audits/v1") {
    throw invalid("Expected project audits schemaVersion project-audits/v1.", "$.schemaVersion");
  }

  if (typeof projectAudits.root !== "string" || projectAudits.root.length === 0) {
    throw invalid("Project audits root must be a non-empty string.", "$.root");
  }

  if (!projectAudits.summary || typeof projectAudits.summary !== "object" || Array.isArray(projectAudits.summary)) {
    throw invalid("Project audits summary is missing.", "$.summary");
  }

  for (const key of ["projectCount", "auditedProjectCount", "skippedProjectCount"]) {
    if (!Number.isInteger(projectAudits.summary[key]) || projectAudits.summary[key] < 0) {
      throw invalid(`Project audits summary.${key} must be a non-negative integer.`, `$.summary.${key}`);
    }
  }

  for (const key of ["audits", "skippedProjects"]) {
    if (!Array.isArray(projectAudits[key])) {
      throw invalid(`Project audits ${key} must be an array.`, `$.${key}`);
    }
  }

  assertValidArtifact(projectAudits, "project-audits/v1");
  assertCanonicalFailedProjects(projectAudits.failedProjects, { schemaVersion: "project-audits/v1" });
}

function invalid(message, path) {
  return new ArtifactValidationError(message, { schemaVersion: "project-audits/v1", path });
}
