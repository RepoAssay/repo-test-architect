import { createTestPlan } from "./test-plan.js";

/**
 * @typedef {"add-test" | "extend-test" | "defer"} ProjectPlanAction
 *
 * @typedef {object} ProjectAuditEntry
 * @property {string} projectId
 * @property {string} projectRoot
 * @property {string} adapterId
 * @property {object} audit
 *
 * @typedef {object} SkippedProjectAudit
 * @property {string} projectId
 * @property {string} projectRoot
 * @property {string} reason
 * @property {string[]} ecosystems
 * @property {string[]} languages
 * @property {Array<{ adapterId: string, maturity: string, matchedEcosystems: string[], matchedLanguages: string[] }>} adapterMatches
 * @property {string} supportStatusReason
 *
 * @typedef {object} ProjectAudits
 * @property {"project-audits/v1"} schemaVersion
 * @property {string} root
 * @property {{ projectCount: number, auditedProjectCount: number, skippedProjectCount: number }} summary
 * @property {ProjectAuditEntry[]} audits
 * @property {SkippedProjectAudit[]} skippedProjects
 *
 * @typedef {object} ProjectTestPlan
 * @property {"project-test-plan/v1"} schemaVersion
 * @property {string} root
 * @property {object} summary
 * @property {SkippedProjectAudit[]} unsupportedProjects
 * @property {object[]} projectPlans
 * @property {object[]} items
 */

/**
 * @param {ProjectAudits} projectAudits
 * @returns {ProjectTestPlan}
 */
export function createProjectTestPlan(projectAudits) {
  if (projectAudits?.schemaVersion !== "project-audits/v1") {
    throw new Error("Expected project audits schemaVersion project-audits/v1.");
  }

  const projectPlans = projectAudits.audits.map((entry) => {
    const plan = createTestPlan(entry.audit);

    return {
      projectId: entry.projectId,
      projectRoot: entry.projectRoot,
      adapterId: entry.adapterId,
      plan
    };
  });

  const items = projectPlans
    .flatMap((entry) =>
      entry.plan.items.map((item) => ({
        projectId: entry.projectId,
        projectRoot: entry.projectRoot,
        adapterId: entry.adapterId,
        projectItemId: `${entry.projectId}:${item.id}`,
        ...item
      }))
    )
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        b.riskReductionScore - a.riskReductionScore ||
        a.projectRoot.localeCompare(b.projectRoot) ||
        a.target.localeCompare(b.target)
    );

  const unsupportedProjects = projectAudits.skippedProjects.map((project) => ({
    projectId: project.projectId,
    projectRoot: project.projectRoot,
    reason: project.reason,
    ecosystems: project.ecosystems,
    languages: project.languages,
    adapterMatches: project.adapterMatches ?? [],
    supportStatusReason: project.supportStatusReason ?? project.reason
  }));

  return {
    schemaVersion: "project-test-plan/v1",
    root: projectAudits.root,
    summary: {
      projectCount: projectAudits.summary.projectCount,
      plannedProjectCount: projectPlans.length,
      unsupportedProjectCount: unsupportedProjects.length,
      addTestCount: countItems(items, "add-test"),
      extendTestCount: countItems(items, "extend-test"),
      deferredCount: countItems(items, "defer"),
      itemCount: items.length
    },
    unsupportedProjects,
    projectPlans,
    items
  };
}

/**
 * @param {Array<{ action: ProjectPlanAction }>} items
 * @param {ProjectPlanAction} action
 * @returns {number}
 */
function countItems(items, action) {
  return items.filter((item) => item.action === action).length;
}
