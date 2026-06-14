import { createTestPlan } from "./test-plan.js";

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
    languages: project.languages
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

function countItems(items, action) {
  return items.filter((item) => item.action === action).length;
}
