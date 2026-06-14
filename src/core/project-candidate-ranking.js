import { rankTestCandidates } from "./rank-test-candidates.js";

export function rankProjectTestCandidates(projectAudits) {
  if (projectAudits?.schemaVersion !== "project-audits/v1") {
    throw new Error("Expected project audits schemaVersion project-audits/v1.");
  }

  const candidates = projectAudits.audits.flatMap((entry) => {
    const ranking = rankTestCandidates(entry.audit);

    return ranking.candidates.map((candidate) => ({
      projectId: entry.projectId,
      projectRoot: entry.projectRoot,
      adapterId: entry.adapterId,
      ...candidate,
      projectTargetId: `${entry.projectId}:${candidate.targetId}`
    }));
  }).sort(
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
    schemaVersion: "project-candidate-ranking/v1",
    root: projectAudits.root,
    summary: {
      projectCount: projectAudits.summary.projectCount,
      auditedProjectCount: projectAudits.summary.auditedProjectCount,
      unsupportedProjectCount: projectAudits.summary.skippedProjectCount,
      candidateCount: candidates.length
    },
    unsupportedProjects,
    candidates
  };
}
