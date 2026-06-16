/**
 * @typedef {"complete" | "partial" | "none"} ProjectAuditCoverage
 */

/**
 * @param {number} auditedProjectCount
 * @param {number} skippedProjectCount
 * @returns {ProjectAuditCoverage}
 */
export function classifyProjectAuditCoverage(auditedProjectCount, skippedProjectCount) {
  if (auditedProjectCount === 0) return "none";
  if (skippedProjectCount > 0) return "partial";
  return "complete";
}
