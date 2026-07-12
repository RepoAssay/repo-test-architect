import type { AuditResult, TestLevel } from "./audit-model";

export interface CandidateRankingItem {
  targetId: string;
  target: string;
  path: string;
  category: "untested" | "covered-but-risky";
  kind: string;
  testLevel: TestLevel;
  priority: number;
  riskReductionScore: number;
  maintenanceCost: number;
  signals: string[];
  rationale: string[];
  existingTestPaths: string[];
  existingTestEvidence?: Array<{ testPath: string; kind: string; strength: string; usage?: "called" | "asserted" }>;
}

export interface CandidateRanking {
  schemaVersion: "candidate-ranking/v1";
  summary: {
    confidence: string;
    candidateCount: number;
    blockerCount: number;
    verificationCommand?: string;
  };
  blockers: string[];
  candidates: CandidateRankingItem[];
}

export function rankTestCandidates(audit: AuditResult): CandidateRanking {
  const candidates = [...audit.untestedCandidates, ...audit.coveredButRisky]
    .map((target) => ({
      targetId: target.id,
      target: target.name,
      path: target.path,
      category: audit.untestedCandidates.includes(target) ? "untested" as const : "covered-but-risky" as const,
      kind: target.kind,
      testLevel: target.recommendedTestLevel,
      priority: target.riskReductionScore - target.maintenanceCost,
      riskReductionScore: target.riskReductionScore,
      maintenanceCost: target.maintenanceCost,
      signals: target.signals,
      rationale: target.reasons ?? [],
      existingTestPaths: target.existingTestPaths ?? [],
      ...(target.existingTestEvidence ? { existingTestEvidence: target.existingTestEvidence } : {})
    }))
    .sort((a, b) => b.priority - a.priority || b.riskReductionScore - a.riskReductionScore || a.target.localeCompare(b.target));

  return {
    schemaVersion: "candidate-ranking/v1",
    summary: {
      confidence: audit.profile.confidence,
      candidateCount: candidates.length,
      blockerCount: audit.profile.blockers.length,
      ...(audit.profile.testCommand ? { verificationCommand: audit.profile.testCommand } : {})
    },
    blockers: audit.profile.blockers,
    candidates
  };
}
