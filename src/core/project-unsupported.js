/**
 * @typedef {object} SkippedProjectAudit
 * @property {string} projectId
 * @property {string} projectRoot
 * @property {string} reason
 * @property {string[]} ecosystems
 * @property {string[]} languages
 * @property {Array<{ adapterId: string, maturity: string, matchedEcosystems: string[], matchedLanguages: string[] }>} adapterMatches
 * @property {string} supportStatusReason
 */

/**
 * @param {SkippedProjectAudit[]} skippedProjects
 * @returns {SkippedProjectAudit[]}
 */
export function normalizeUnsupportedProjects(skippedProjects) {
  return skippedProjects.map((project) => ({
    projectId: project.projectId,
    projectRoot: project.projectRoot,
    reason: project.reason,
    ecosystems: project.ecosystems,
    languages: project.languages,
    adapterMatches: project.adapterMatches ?? [],
    supportStatusReason: project.supportStatusReason ?? project.reason
  }));
}

/**
 * @param {SkippedProjectAudit[]} unsupportedProjects
 * @returns {string[]}
 */
export function collectUnsupportedReasons(unsupportedProjects) {
  return [...new Set(unsupportedProjects.map((project) => project.supportStatusReason))];
}
