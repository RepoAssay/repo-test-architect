export function summarizeProjectAudits(projectAudits) {
  if (projectAudits?.schemaVersion !== "project-audits/v1") {
    throw new Error("Expected project audits schemaVersion project-audits/v1.");
  }

  const projects = projectAudits.audits.map((entry) => {
    const project = {
      projectId: entry.projectId,
      projectRoot: entry.projectRoot,
      adapterId: entry.adapterId,
      confidence: entry.audit.profile.confidence,
      untestedCandidateCount: entry.audit.untestedCandidates.length,
      coveredButRiskyCount: entry.audit.coveredButRisky.length,
      skippedTargetCount: entry.audit.skipped.length,
      riskCount: entry.audit.risks.length,
      topCandidateIds: entry.audit.recommended.slice(0, 3).map((target) => target.id)
    };

    if (entry.audit.profile.testCommand) {
      project.testCommand = entry.audit.profile.testCommand;
    }

    return project;
  });

  const unsupportedProjects = projectAudits.skippedProjects.map((project) => ({
    projectId: project.projectId,
    projectRoot: project.projectRoot,
    reason: project.reason,
    ecosystems: project.ecosystems,
    languages: project.languages
  }));

  return {
    schemaVersion: "project-audit-summary/v1",
    root: projectAudits.root,
    summary: {
      projectCount: projectAudits.summary.projectCount,
      auditedProjectCount: projectAudits.summary.auditedProjectCount,
      unsupportedProjectCount: projectAudits.summary.skippedProjectCount,
      untestedCandidateCount: sum(projects, "untestedCandidateCount"),
      coveredButRiskyCount: sum(projects, "coveredButRiskyCount"),
      skippedTargetCount: sum(projects, "skippedTargetCount"),
      riskCount: sum(projects, "riskCount")
    },
    projects,
    unsupportedProjects
  };
}

function sum(items, key) {
  return items.reduce((total, item) => total + item[key], 0);
}
