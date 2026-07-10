import type { AuditResult } from "./audit-model";

const MAX_DISPLAYED_EXISTING_TEST_PATHS = 5;

export function renderMarkdownReport(audit: AuditResult): string {
  const lines: string[] = [];

  lines.push("# Repository Test Audit");
  lines.push("");
  lines.push("## Detected");
  lines.push(`- Languages: ${formatList(audit.profile.languages)}`);
  lines.push(`- Package managers: ${formatList(audit.profile.packageManagers)}`);
  lines.push(`- Test frameworks: ${formatList(audit.profile.testFrameworks)}`);
  lines.push(`- Architecture signals: ${formatList(audit.profile.architectures)}`);
  lines.push(`- Test command: ${audit.profile.testCommand ?? "none detected"}`);
  lines.push(`- Confidence: ${audit.profile.confidence}`);
  lines.push("");
  lines.push("## Existing Conventions");
  lines.push(`- Test locations: ${formatList(audit.profile.existingTestLocations)}`);
  lines.push(`- Naming/setup: ${formatList(audit.profile.detectedConventions)}`);
  lines.push(`- Support signals: ${formatList(audit.profile.setupSignals)}`);
  lines.push("");
  lines.push("## Blockers");
  if (audit.profile.blockers.length === 0) {
    lines.push("- None detected.");
  } else {
    for (const blocker of audit.profile.blockers) {
      lines.push(`- ${blocker}`);
    }
  }
  lines.push("");
  lines.push("## Untested Candidates");

  if (audit.untestedCandidates.length === 0) {
    lines.push("- No untested high-value candidates found.");
  } else {
    for (const target of audit.untestedCandidates) {
      lines.push(formatTarget(target));
    }
  }

  lines.push("");
  lines.push("## Covered But Risky");

  if (audit.coveredButRisky.length === 0) {
    lines.push("- No already-tested risky targets found.");
  } else {
    for (const target of audit.coveredButRisky) {
      lines.push(formatTarget(target));
    }
  }

  lines.push("");
  lines.push("## Skipped");

  if (audit.skipped.length === 0) {
    lines.push("- Nothing skipped.");
  } else {
    for (const target of audit.skipped) {
      lines.push(formatSkippedTarget(target));
    }
  }

  lines.push("");
  lines.push("## Remaining Risk");

  if (audit.risks.length === 0) {
    lines.push("- No obvious residual risk detected by current heuristics.");
  } else {
    for (const risk of audit.risks) {
      lines.push(`- ${risk}`);
    }
  }

  return lines.join("\n");
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none detected";
}

function formatExistingTestPaths(paths: string[]): string {
  if (paths.length === 0) return "none detected";
  const displayed = paths.slice(0, MAX_DISPLAYED_EXISTING_TEST_PATHS);
  const omittedCount = paths.length - displayed.length;
  const omitted = omittedCount > 0 ? ` (+${omittedCount} more; full list available in JSON)` : "";
  return `${displayed.join(", ")}${omitted}`;
}

function formatTarget(target: AuditResult["recommended"][number]): string {
  const reasons = target.reasons ?? [];
  const existingTestPaths = target.existingTestPaths ?? [];
  const existingTests =
    existingTestPaths.length > 0 ? `; existing tests: ${formatExistingTestPaths(existingTestPaths)}` : "";

  return `- ${target.name}: ${target.recommendedTestLevel} test for ${target.kind} (risk reduction ${target.riskReductionScore}/10, maintenance ${target.maintenanceCost}/10; ${reasons.join("; ")}${existingTests})`;
}

function formatSkippedTarget(target: AuditResult["skipped"][number]): string {
  const preferredPath = target.preferredCoveragePath ? ` Preferred path: ${target.preferredCoveragePath}` : "";

  return `- ${target.name}: ${target.reason} (risk reduction ${target.riskReductionScore}/10, maintenance ${target.maintenanceCost}/10).${preferredPath}`;
}
