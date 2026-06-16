/**
 * @param {unknown} projectAudits
 * @returns {void}
 */
export function validateProjectAudits(projectAudits) {
  if (projectAudits?.schemaVersion !== "project-audits/v1") {
    throw new Error("Expected project audits schemaVersion project-audits/v1.");
  }

  if (typeof projectAudits.root !== "string" || projectAudits.root.length === 0) {
    throw new Error("Project audits root must be a non-empty string.");
  }

  if (!projectAudits.summary || typeof projectAudits.summary !== "object" || Array.isArray(projectAudits.summary)) {
    throw new Error("Project audits summary is missing.");
  }

  for (const key of ["projectCount", "auditedProjectCount", "skippedProjectCount"]) {
    if (!Number.isInteger(projectAudits.summary[key]) || projectAudits.summary[key] < 0) {
      throw new Error(`Project audits summary.${key} must be a non-negative integer.`);
    }
  }

  for (const key of ["audits", "skippedProjects"]) {
    if (!Array.isArray(projectAudits[key])) {
      throw new Error(`Project audits ${key} must be an array.`);
    }
  }
}
