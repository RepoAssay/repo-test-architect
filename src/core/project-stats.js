import fs from "node:fs";
import path from "node:path";
import { classifyProjectAuditCoverage } from "./project-audit-coverage.js";
import { validateProjectAudits } from "./project-audits-validation.js";

const IGNORED_DIRECTORIES = new Set([
  ".build",
  ".git",
  ".gradle",
  ".swiftpm",
  ".venv",
  "__fixtures__",
  "bin",
  "build",
  "coverage",
  "dist",
  "fixtures",
  "node_modules",
  "obj",
  "target",
  "testdata",
  "vendor"
]);

const LANGUAGE_EXTENSIONS = new Map([
  ["csharp", [".cs"]],
  ["elixir", [".ex", ".exs"]],
  ["go", [".go"]],
  ["java", [".java"]],
  ["javascript", [".js", ".jsx", ".mjs", ".cjs"]],
  ["kotlin", [".kt"]],
  ["objective-c", [".m", ".mm"]],
  ["php", [".php"]],
  ["python", [".py"]],
  ["ruby", [".rb"]],
  ["rust", [".rs"]],
  ["swift", [".swift"]],
  ["typescript", [".ts", ".tsx"]]
]);

/**
 * @typedef {object} ProjectStats
 * @property {"project-stats/v1"} schemaVersion
 * @property {string} root
 * @property {{ projectCount: number, auditedProjectCount: number, unsupportedProjectCount: number, auditCoverage: "complete" | "partial" | "none" }} summary
 * @property {{ total: number, audited: number, unsupported: number, byLanguage: Record<string, { total: number, audited: number, unsupported: number }> }} sourceFiles
 * @property {{ untestedCandidateCount: number, coveredButRiskyCount: number, skippedTargetCount: number, riskCount: number, blockerCount: number }} counts
 * @property {{ confidence: Record<string, number>, testFrameworks: Record<string, number>, testCommands: Record<string, number>, targetKinds: Record<string, number>, riskLevels: Record<string, number>, signals: Record<string, number>, evidenceStrengths: Record<string, number>, evidenceKinds: Record<string, number>, evidenceUsage: Record<string, number>, evidenceViaUsage: Record<string, number> }} distributions
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
  const evidenceStrengths = {};
  const evidenceKinds = {};
  const evidenceUsage = {};
  const evidenceViaUsage = {};
  const adapters = {};
  const sourceFiles = createSourceFileStats();
  const projectRoots = [
    ...projectAudits.audits.map((entry) => entry.projectRoot),
    ...projectAudits.skippedProjects.map((entry) => entry.projectRoot)
  ];

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
    mergeSourceFileStats(
      sourceFiles,
      countProjectSourceFiles(projectAudits.root, entry.projectRoot, audit.profile.languages ?? [], "audited", projectRoots)
    );

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

      for (const evidence of target.existingTestEvidence ?? []) {
        increment(evidenceStrengths, evidence.strength);
        increment(evidenceKinds, evidence.kind);
        if (evidence.usage) increment(evidenceUsage, evidence.usage);
        if (evidence.viaUsage) increment(evidenceViaUsage, evidence.viaUsage);
      }
    }
  }

  for (const project of projectAudits.skippedProjects) {
    mergeSourceFileStats(
      sourceFiles,
      countProjectSourceFiles(projectAudits.root, project.projectRoot, project.languages ?? [], "unsupported", projectRoots)
    );
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
    sourceFiles: normalizeSourceFileStats(sourceFiles),
    counts,
    distributions: {
      confidence: sortRecord(confidence),
      testFrameworks: sortRecord(testFrameworks),
      testCommands: sortRecord(testCommands),
      targetKinds: sortRecord(targetKinds),
      riskLevels: sortRecord(riskLevels),
      signals: sortRecord(signals),
      evidenceStrengths: sortRecord(evidenceStrengths),
      evidenceKinds: sortRecord(evidenceKinds),
      evidenceUsage: sortRecord(evidenceUsage),
      evidenceViaUsage: sortRecord(evidenceViaUsage)
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

function createSourceFileStats() {
  return {
    total: 0,
    audited: 0,
    unsupported: 0,
    byLanguage: {}
  };
}

function countProjectSourceFiles(repoRoot, projectRoot, languages, coverageKey, projectRoots) {
  const stats = createSourceFileStats();
  const absoluteProjectRoot = path.resolve(repoRoot, projectRoot);
  if (!fs.existsSync(absoluteProjectRoot)) return stats;
  const nestedProjectRoots = new Set(projectRoots
    .filter((candidate) => candidate !== projectRoot)
    .map((candidate) => path.resolve(repoRoot, candidate))
    .filter((candidate) => candidate.startsWith(`${absoluteProjectRoot}${path.sep}`)));

  for (const filePath of collectSourceFilePaths(absoluteProjectRoot, nestedProjectRoots)) {
    const language = detectSourceLanguage(filePath, languages);
    if (!language) continue;

    stats.total += 1;
    stats[coverageKey] += 1;
    stats.byLanguage[language] ??= { total: 0, audited: 0, unsupported: 0 };
    stats.byLanguage[language].total += 1;
    stats.byLanguage[language][coverageKey] += 1;
  }

  return stats;
}

function collectSourceFilePaths(root, excludedRoots) {
  const files = [];

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const absolute = path.join(current, entry.name);
        if (!IGNORED_DIRECTORIES.has(entry.name) && !excludedRoots.has(absolute)) {
          visit(absolute);
        }
        continue;
      }

      files.push(path.join(current, entry.name));
    }
  }

  visit(root);
  return files;
}

function detectSourceLanguage(filePath, languages) {
  const extension = path.extname(filePath);
  const languageSet = new Set(languages);

  for (const [language, extensions] of LANGUAGE_EXTENSIONS.entries()) {
    if (languageSet.has(language) && extensions.includes(extension)) return language;
  }

  return undefined;
}

function mergeSourceFileStats(target, source) {
  target.total += source.total;
  target.audited += source.audited;
  target.unsupported += source.unsupported;

  for (const [language, counts] of Object.entries(source.byLanguage)) {
    target.byLanguage[language] ??= { total: 0, audited: 0, unsupported: 0 };
    target.byLanguage[language].total += counts.total;
    target.byLanguage[language].audited += counts.audited;
    target.byLanguage[language].unsupported += counts.unsupported;
  }
}

function normalizeSourceFileStats(stats) {
  return {
    total: stats.total,
    audited: stats.audited,
    unsupported: stats.unsupported,
    byLanguage: Object.fromEntries(
      Object.entries(stats.byLanguage).sort(([left], [right]) => left.localeCompare(right))
    )
  };
}
