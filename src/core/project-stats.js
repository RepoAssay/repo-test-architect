import { classifyProjectAuditCoverage } from "./project-audit-coverage.js";
import { validateProjectAudits } from "./project-audits-validation.js";

/**
 * @typedef {object} ProjectStats
 * @property {"project-stats/v1"} schemaVersion
 * @property {string} root
 * @property {{ projectCount: number, auditedProjectCount: number, unsupportedProjectCount: number, auditCoverage: "complete" | "partial" | "none" }} summary
 * @property {{ untestedCandidateCount: number, coveredButRiskyCount: number, skippedTargetCount: number, riskCount: number, blockerCount: number }} counts
 * @property {{ confidence: Record<string, number>, testFrameworks: Record<string, number>, testCommands: Record<string, number>, targetKinds: Record<string, number>, riskLevels: Record<string, number>, signals: Record<string, number> }} distributions
 * @property {{ adapterId: string, projectCount: number }[]} adapters
 */

/**
 * @param {import("./project-auditor.js").ProjectAudits} projectAudits
 * @returns {ProjectStats}
 */
export function collectProjectStats(projectAudits) {
  validateProjectAudits(projectAudits);

  const counts = {
    untestedCandidateCount: 0,
    coveredButRiskyCount: 0,
    skippedTargetCount: 0,
    riskCount: 0,
    blockerCount: 0
  };
  const confidence = {};
  const testFrameworks = {};
  const testCommands = {};
  const targetKinds = {};
  const riskLevels = {};
  const signals = {};
  const adapters = {};

  for (const entry of projectAudits.audits) {
    const audit = entry.audit;
    const targets = [
      ...audit.untestedCandidates,
      ...audit.coveredButRisky,
      ...audit.skipped
    ];

    counts.untestedCandidateCount += audit.untestedCandidates.length;
    counts.coveredButRiskyCount += audit.coveredButRisky.length;
    counts.skippedTargetCount += audit.skipped.length;
    counts.riskCount += audit.risks.length;
    counts.blockerCount += audit.profile.blockers?.length ?? 0;

    increment(confidence, audit.profile.confidence ?? "unknown");
    increment(adapters, entry.adapterId);

    for (const framework of audit.profile.testFrameworks ?? []) {
      increment(testFrameworks, framework);
    }

    if (audit.profile.testCommand) {
      increment(testCommands, audit.profile.testCommand);
    }

    for (const target of targets) {
      increment(targetKinds, target.kind);

      if (target.risk) {
        increment(riskLevels, target.risk);
      }

      for (const signal of target.signals ?? []) {
        increment(signals, signal);
      }
    }
  }

  return {
    schemaVersion: "project-stats/v1",
    root: projectAudits.root,
    summary: {
      projectCount: projectAudits.summary.projectCount,
      auditedProjectCount: projectAudits.summary.auditedProjectCount,
      unsupportedProjectCount: projectAudits.summary.skippedProjectCount,
      auditCoverage: classifyProjectAuditCoverage(projectAudits.summary.auditedProjectCount, projectAudits.summary.skippedProjectCount)
    },
    counts,
    distributions: {
      confidence: sortRecord(confidence),
      testFrameworks: sortRecord(testFrameworks),
      testCommands: sortRecord(testCommands),
      targetKinds: sortRecord(targetKinds),
      riskLevels: sortRecord(riskLevels),
      signals: sortRecord(signals)
    },
    adapters: Object.keys(adapters)
      .sort()
      .map((adapterId) => ({
        adapterId,
        projectCount: adapters[adapterId]
      }))
  };
}

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

function sortRecord(record) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}
