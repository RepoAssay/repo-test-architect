import path from "node:path";
import { getAdapter } from "./adapter-registry.js";
import { detectProjects } from "./project-detector.js";

export function auditDetectedProjects(repoRoot) {
  const detection = detectProjects(repoRoot);
  const audits = [];
  const skippedProjects = [];

  for (const project of detection.projects) {
    if (project.adapterIds.length === 0) {
      skippedProjects.push({
        projectId: project.id,
        projectRoot: project.root,
        reason: "No registered adapter supports this project's detected languages.",
        languages: project.languages
      });
      continue;
    }

    const adapterId = project.adapterIds[0];
    const audit = getAdapter(adapterId).audit(path.resolve(detection.root, project.root));

    audits.push({
      projectId: project.id,
      projectRoot: project.root,
      adapterId,
      audit
    });
  }

  return {
    schemaVersion: "project-audits/v1",
    root: detection.root,
    summary: {
      projectCount: detection.summary.projectCount,
      auditedProjectCount: audits.length,
      skippedProjectCount: skippedProjects.length
    },
    audits,
    skippedProjects
  };
}
