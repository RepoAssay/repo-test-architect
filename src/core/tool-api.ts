import type { AuditResult } from "./audit-model";
import { explainTarget } from "./explain-target";
import { rankTestCandidates } from "./rank-test-candidates";
import { createTestPlan, type TestPlan } from "./test-plan";

export interface ProjectDetection {
  schemaVersion: "project-detection/v1";
  root: string;
  projects: DetectedProject[];
  summary: {
    projectCount: number;
    supportedProjectCount: number;
    unsupportedProjectCount: number;
  };
}

export interface ProjectAudits {
  schemaVersion: "project-audits/v1";
  root: string;
  summary: {
    projectCount: number;
    auditedProjectCount: number;
    skippedProjectCount: number;
  };
  audits: ProjectAuditEntry[];
  skippedProjects: SkippedProjectAudit[];
}

export interface ProjectAuditSummary {
  schemaVersion: "project-audit-summary/v1";
  root: string;
  summary: {
    projectCount: number;
    auditedProjectCount: number;
    unsupportedProjectCount: number;
    untestedCandidateCount: number;
    coveredButRiskyCount: number;
    skippedTargetCount: number;
    riskCount: number;
  };
  projects: ProjectAuditSummaryEntry[];
  unsupportedProjects: SkippedProjectAudit[];
}

export interface ProjectCandidateRanking {
  schemaVersion: "project-candidate-ranking/v1";
  root: string;
  summary: {
    projectCount: number;
    auditedProjectCount: number;
    unsupportedProjectCount: number;
    candidateCount: number;
  };
  unsupportedProjects: SkippedProjectAudit[];
  candidates: ProjectCandidate[];
}

export interface ProjectTestPlan {
  schemaVersion: "project-test-plan/v1";
  root: string;
  summary: {
    projectCount: number;
    plannedProjectCount: number;
    unsupportedProjectCount: number;
    addTestCount: number;
    extendTestCount: number;
    deferredCount: number;
    itemCount: number;
  };
  unsupportedProjects: SkippedProjectAudit[];
  projectPlans: ProjectPlanEntry[];
  items: ProjectPlanItem[];
}

export interface ProjectPlanEntry {
  projectId: string;
  projectRoot: string;
  adapterId: string;
  plan: TestPlan;
}

export interface ProjectPlanItem {
  projectId: string;
  projectRoot: string;
  adapterId: string;
  projectItemId: string;
  id: string;
  action: "add-test" | "extend-test" | "defer";
  targetId: string;
  target: string;
  path: string;
  testLevel: "unit" | "integration" | "component" | "ui" | "none";
  priority: number;
  riskReductionScore: number;
  maintenanceCost: number;
  rationale: string[];
  sourceSignals: string[];
  existingTestPaths: string[];
}

export interface ProjectCandidate {
  projectId: string;
  projectRoot: string;
  adapterId: string;
  projectTargetId: string;
  targetId: string;
  target: string;
  path: string;
  category: "untested" | "covered-but-risky";
  kind: string;
  testLevel: "unit" | "integration" | "component" | "ui" | "none";
  priority: number;
  riskReductionScore: number;
  maintenanceCost: number;
  signals: string[];
  rationale: string[];
  existingTestPaths: string[];
}

export interface ProjectAuditSummaryEntry {
  projectId: string;
  projectRoot: string;
  adapterId: string;
  confidence: string;
  testCommand?: string;
  untestedCandidateCount: number;
  coveredButRiskyCount: number;
  skippedTargetCount: number;
  riskCount: number;
  topCandidateIds: string[];
}

export interface ProjectAuditEntry {
  projectId: string;
  projectRoot: string;
  adapterId: string;
  audit: AuditResult;
}

export interface SkippedProjectAudit {
  projectId: string;
  projectRoot: string;
  reason: string;
  languages: string[];
}

export interface DetectedProject {
  id: string;
  root: string;
  absoluteRoot: string;
  ecosystems: string[];
  languages: string[];
  markerFiles: string[];
  adapterIds: string[];
  supported: boolean;
}

export interface AuditRepoOptions {
  adapterId?: string;
  changedPaths?: string[];
}

export interface GenerateTestPlanOptions {
  itemId?: string;
}

export declare function detectRepoProjects(repoRoot: string): ProjectDetection;

export declare function auditRepoProjects(repoRoot: string): ProjectAudits;

export declare function summarizeRepoProjectAudits(projectAudits: ProjectAudits): ProjectAuditSummary;

export declare function rankRepoProjectCandidates(projectAudits: ProjectAudits): ProjectCandidateRanking;

export declare function generateRepoProjectTestPlan(projectAudits: ProjectAudits): ProjectTestPlan;

export function getAuditGraph(audit: AuditResult): AuditResult {
  validateAudit(audit);
  return audit;
}

export function generateTestPlan(audit: AuditResult, options: GenerateTestPlanOptions = {}): TestPlan {
  validateAudit(audit);
  return filterPlan(createTestPlan(audit), options.itemId);
}

export function explainAuditTarget(audit: AuditResult, targetId: string) {
  validateAudit(audit);
  return explainTarget(audit, targetId);
}

export function rankAuditTestCandidates(audit: AuditResult) {
  validateAudit(audit);
  return rankTestCandidates(audit);
}

export function validateAudit(audit: AuditResult): void {
  if (audit?.schemaVersion !== "audit/v1") {
    throw new Error("Expected audit schemaVersion audit/v1.");
  }

  if (!audit.profile || typeof audit.profile !== "object") {
    throw new Error("Audit profile is missing.");
  }

  for (const key of ["untestedCandidates", "coveredButRisky", "skipped", "risks"] as const) {
    if (!Array.isArray(audit[key])) {
      throw new Error(`Audit ${key} must be an array.`);
    }
  }
}

function filterPlan(plan: TestPlan, itemId?: string): TestPlan {
  if (!itemId) return plan;

  const item = plan.items.find((candidate) => candidate.id === itemId);

  if (!item) {
    throw new Error(`Plan item not found: ${itemId}`);
  }

  return {
    ...plan,
    summary: {
      ...plan.summary,
      addTestCount: item.action === "add-test" ? 1 : 0,
      extendTestCount: item.action === "extend-test" ? 1 : 0,
      deferredCount: item.action === "defer" ? 1 : 0
    },
    items: [item]
  };
}
