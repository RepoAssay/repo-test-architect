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
  id: string;
  name: string;
  path: string;
  kind: string;
  signals: string[];
  risk: RiskLevel;
  testability: RiskLevel;
  recommendedTestLevel: TestLevel;
  riskReductionScore: number;
  maintenanceCost: number;
  reasons?: string[];
  existingTestPaths?: string[];
  existingTestEvidence?: Array<{
    testPath: string;
    kind: "filename-convention" | "direct-relative-import" | "referenced-relative-reexport" | "tsconfig-path-import" | "package-entry-import" | "bounded-dependency" | "swift-symbol-reference" | "python-module-import" | "python-package-reexport" | "python-pytest-fixture" | "jvm-symbol-reference";
    strength: "naming" | "direct" | "referenced" | "indirect";
    usage?: "called" | "asserted";
    viaUsage?: "called" | "asserted";
  }>;
}

export interface SkippedTarget {
  id: string;
  name: string;
  path: string;
  kind: string;
  signals: string[];
  riskReductionScore: number;
  maintenanceCost: number;
  reason: string;
  preferredCoveragePath?: string;
}

export interface AuditResult {
  schemaVersion: "audit/v1";
  profile: RepoProfile;
  untestedCandidates: AuditTarget[];
  coveredButRisky: AuditTarget[];
  recommended: AuditTarget[];
  skipped: SkippedTarget[];
  risks: string[];
}
