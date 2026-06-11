export type RiskLevel = "low" | "medium" | "high";

export type TestLevel = "unit" | "integration" | "component" | "ui" | "none";

export interface RepoProfile {
  root: string;
  languages: string[];
  packageManagers: string[];
  testFrameworks: string[];
  architectures: string[];
  testCommand?: string;
  detectedConventions: string[];
  existingTestLocations: string[];
  setupSignals: string[];
  confidence: RiskLevel;
  blockers: string[];
}

export interface AuditTarget {
  name: string;
  path: string;
  kind: string;
  risk: RiskLevel;
  testability: RiskLevel;
  recommendedTestLevel: TestLevel;
  riskReductionScore: number;
  maintenanceCost: number;
  reasons: string[];
  existingTestPaths: string[];
}

export interface SkippedTarget {
  name: string;
  path: string;
  kind: string;
  riskReductionScore: number;
  maintenanceCost: number;
  reason: string;
  preferredCoveragePath?: string;
}

export interface AuditResult {
  profile: RepoProfile;
  untestedCandidates: AuditTarget[];
  coveredButRisky: AuditTarget[];
  recommended: AuditTarget[];
  skipped: SkippedTarget[];
  risks: string[];
}
