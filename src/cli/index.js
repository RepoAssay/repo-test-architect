#!/usr/bin/env node
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  auditRepoProjects,
  auditRepo,
  detectRepoProjects,
  explainAuditTarget,
  generateRepoProjectTestPlan,
  generateTestPlan,
  rankRepoProjectCandidates,
  rankAuditTestCandidates,
  summarizeRepoProjectAudits,
  validateAudit
} from "../core/tool-api.js";

const options = parseArgs(process.argv.slice(2));

if (!["detect", "audit-projects", "summarize-projects", "rank-projects", "plan-projects", "audit", "plan", "explain", "rank"].includes(options.command)) {
  console.error("Usage: repo-test-architect <detect|audit-projects|summarize-projects|rank-projects|plan-projects|audit|plan|explain|rank> <repo> [--format markdown|json] [--from-audit audit.json] [--from-project-audits project-audits.json] [--item id] [--target id] [--changed] [--changed-since ref]");
  process.exit(1);
}

if (!["markdown", "json"].includes(options.format)) {
  console.error(`Unsupported format: ${options.format}`);
  process.exit(1);
}

if (options.fromAuditPath && !["plan", "explain", "rank"].includes(options.command)) {
  console.error("--from-audit is only supported with plan, explain, and rank commands.");
  process.exit(1);
}

if (options.fromProjectAuditsPath && !["audit-projects", "summarize-projects", "rank-projects", "plan-projects"].includes(options.command)) {
  console.error("--from-project-audits is only supported with audit-projects, summarize-projects, rank-projects, and plan-projects commands.");
  process.exit(1);
}

const repoRoot = path.resolve(process.cwd(), options.repoPath);
const detection = options.command === "detect" ? detectRepoProjects(repoRoot) : undefined;
const projectAudits = options.fromProjectAuditsPath
  ? readProjectAuditsJson(options.fromProjectAuditsPath)
  : ["audit-projects", "summarize-projects", "rank-projects", "plan-projects"].includes(options.command)
    ? auditRepoProjects(repoRoot)
    : undefined;
const audit = options.fromAuditPath
  ? readAuditJson(options.fromAuditPath)
  : detection || projectAudits
    ? undefined
    : auditRepo(repoRoot, {
      changedPaths: readSelectedChangedPaths(repoRoot, options)
    });
const output = detection ?? selectProjectOutput(projectAudits, options) ?? selectOutput(audit, options);

if (options.format === "json") {
  console.log(JSON.stringify(output, null, 2));
} else if (options.command === "detect") {
  console.log(renderMarkdownDetection(output));
} else if (options.command === "audit-projects") {
  console.log(renderMarkdownProjectAudits(output));
} else if (options.command === "summarize-projects") {
  console.log(renderMarkdownProjectAuditSummary(output));
} else if (options.command === "rank-projects") {
  console.log(renderMarkdownProjectCandidateRanking(output));
} else if (options.command === "plan-projects") {
  console.log(renderMarkdownProjectTestPlan(output));
} else if (options.command === "plan") {
  console.log(renderMarkdownPlan(output));
} else if (options.command === "explain") {
  console.log(renderMarkdownExplanation(output));
} else if (options.command === "rank") {
  console.log(renderMarkdownRanking(output));
} else {
  console.log(renderMarkdownReport(audit));
}

function parseArgs(args) {
  const [command, ...rest] = args;
  let repoPath = ".";
  let format = "markdown";
  let fromAuditPath;
  let fromProjectAuditsPath;
  let itemId;
  let targetId;
  let changedOnly = false;
  let changedSinceRef;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--format") {
      format = rest[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      format = arg.slice("--format=".length);
      continue;
    }

    if (arg === "--from-audit") {
      fromAuditPath = rest[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--from-audit=")) {
      fromAuditPath = arg.slice("--from-audit=".length);
      continue;
    }

    if (arg === "--from-project-audits") {
      fromProjectAuditsPath = rest[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--from-project-audits=")) {
      fromProjectAuditsPath = arg.slice("--from-project-audits=".length);
      continue;
    }

    if (arg === "--item") {
      itemId = rest[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--item=")) {
      itemId = arg.slice("--item=".length);
      continue;
    }

    if (arg === "--target") {
      targetId = rest[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--target=")) {
      targetId = arg.slice("--target=".length);
      continue;
    }

    if (arg === "--changed") {
      changedOnly = true;
      continue;
    }

    if (arg === "--changed-since") {
      changedSinceRef = rest[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--changed-since=")) {
      changedSinceRef = arg.slice("--changed-since=".length);
      continue;
    }

    if (!arg.startsWith("-")) {
      repoPath = arg;
    }
  }

  return { command, repoPath, format, fromAuditPath, fromProjectAuditsPath, itemId, targetId, changedOnly, changedSinceRef };
}

function readAuditJson(auditPath) {
  if (!auditPath) {
    console.error("--from-audit requires a JSON file path.");
    process.exit(1);
  }

  try {
    const audit = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), auditPath), "utf8"));
    validateAudit(audit);
    return audit;
  } catch (error) {
    console.error(`Failed to read audit JSON: ${error.message}`);
    process.exit(1);
  }
}

function readProjectAuditsJson(projectAuditsPath) {
  if (!projectAuditsPath) {
    console.error("--from-project-audits requires a JSON file path.");
    process.exit(1);
  }

  try {
    const projectAudits = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), projectAuditsPath), "utf8"));
    validateProjectAudits(projectAudits);
    return projectAudits;
  } catch (error) {
    console.error(`Failed to read project audits JSON: ${error.message}`);
    process.exit(1);
  }
}

function validateProjectAudits(projectAudits) {
  if (projectAudits?.schemaVersion !== "project-audits/v1") {
    throw new Error("Expected project audits schemaVersion project-audits/v1.");
  }

  if (!projectAudits.summary || typeof projectAudits.summary !== "object") {
    throw new Error("Project audits summary is missing.");
  }

  for (const key of ["audits", "skippedProjects"]) {
    if (!Array.isArray(projectAudits[key])) {
      throw new Error(`Project audits ${key} must be an array.`);
    }
  }
}

function readChangedPaths(repoRoot) {
  try {
    const output = execFileSync("git", ["-C", repoRoot, "status", "--short"], {
      encoding: "utf8"
    });

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
      .map((line) => line.includes(" -> ") ? line.split(" -> ").at(-1) : line)
      .map((line) => line.replaceAll("\\", "/"));
  } catch (error) {
    console.error(`Failed to read changed files: ${error.message}`);
    process.exit(1);
  }
}

function readChangedPathsSince(repoRoot, ref) {
  if (!ref) {
    console.error("--changed-since requires a Git ref.");
    process.exit(1);
  }

  try {
    const output = execFileSync("git", ["-C", repoRoot, "diff", "--name-only", `${ref}...HEAD`], {
      encoding: "utf8"
    });

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replaceAll("\\", "/"));
  } catch (error) {
    console.error(`Failed to read changed files since ${ref}: ${error.message}`);
    process.exit(1);
  }
}

function readSelectedChangedPaths(repoRoot, options) {
  if (options.changedSinceRef) return readChangedPathsSince(repoRoot, options.changedSinceRef);
  if (options.changedOnly) return readChangedPaths(repoRoot);
  return undefined;
}

function selectOutput(audit, options) {
  if (options.command === "plan") {
    try {
      return generateTestPlan(audit, { itemId: options.itemId });
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }

  if (options.command === "explain") {
    try {
      return explainAuditTarget(audit, options.targetId);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }

  if (options.command === "rank") return rankAuditTestCandidates(audit);

  return audit;
}

function selectProjectOutput(projectAudits, options) {
  if (!projectAudits) return undefined;
  if (options.command === "summarize-projects") return summarizeRepoProjectAudits(projectAudits);
  if (options.command === "rank-projects") return rankRepoProjectCandidates(projectAudits);
  if (options.command === "plan-projects") return generateRepoProjectTestPlan(projectAudits);
  return projectAudits;
}

function renderMarkdownReport(audit) {
  const lines = [];

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

function renderMarkdownDetection(detection) {
  const lines = [];

  lines.push("# Project Detection");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Projects: ${detection.summary.projectCount}`);
  lines.push(`- Supported: ${detection.summary.supportedProjectCount}`);
  lines.push(`- Unsupported: ${detection.summary.unsupportedProjectCount}`);
  lines.push("");
  lines.push("## Projects");

  if (detection.projects.length === 0) {
    lines.push("- No project roots detected.");
  } else {
    for (const project of detection.projects) {
      const adapterText = project.adapterIds.length > 0 ? project.adapterIds.join(", ") : "none available";
      lines.push(
        `- ${project.root}: ${formatList(project.languages)} (${project.supported ? "supported" : "unsupported"}; adapters: ${adapterText}; markers: ${project.markerFiles.join(", ")})`
      );
    }
  }

  return lines.join("\n");
}

function renderMarkdownProjectAudits(projectAudits) {
  const lines = [];

  lines.push("# Project Audits");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Projects: ${projectAudits.summary.projectCount}`);
  lines.push(`- Audited: ${projectAudits.summary.auditedProjectCount}`);
  lines.push(`- Skipped: ${projectAudits.summary.skippedProjectCount}`);
  lines.push("");
  lines.push("## Audited Projects");

  if (projectAudits.audits.length === 0) {
    lines.push("- No supported projects audited.");
  } else {
    for (const project of projectAudits.audits) {
      lines.push(
        `- ${project.projectRoot}: ${project.adapterId} (${project.audit.untestedCandidates.length} untested, ${project.audit.coveredButRisky.length} covered but risky, ${project.audit.risks.length} risks)`
      );
    }
  }

  lines.push("");
  lines.push("## Skipped Projects");

  if (projectAudits.skippedProjects.length === 0) {
    lines.push("- No projects skipped.");
  } else {
    for (const project of projectAudits.skippedProjects) {
      lines.push(`- ${project.projectRoot}: ${project.reason} (${formatList(project.languages)})`);
    }
  }

  return lines.join("\n");
}

function renderMarkdownProjectAuditSummary(summary) {
  const lines = [];

  lines.push("# Project Audit Summary");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Projects: ${summary.summary.projectCount}`);
  lines.push(`- Audited: ${summary.summary.auditedProjectCount}`);
  lines.push(`- Unsupported: ${summary.summary.unsupportedProjectCount}`);
  lines.push(`- Untested candidates: ${summary.summary.untestedCandidateCount}`);
  lines.push(`- Covered but risky: ${summary.summary.coveredButRiskyCount}`);
  lines.push(`- Skipped targets: ${summary.summary.skippedTargetCount}`);
  lines.push(`- Risks: ${summary.summary.riskCount}`);
  lines.push("");
  lines.push("## Projects");

  if (summary.projects.length === 0) {
    lines.push("- No audited projects.");
  } else {
    for (const project of summary.projects) {
      lines.push(
        `- ${project.projectRoot}: ${project.adapterId}, ${project.confidence} confidence, ${project.untestedCandidateCount} untested, top candidates: ${formatList(project.topCandidateIds)}`
      );
    }
  }

  lines.push("");
  lines.push("## Unsupported Projects");

  if (summary.unsupportedProjects.length === 0) {
    lines.push("- No unsupported projects.");
  } else {
    for (const project of summary.unsupportedProjects) {
      lines.push(`- ${project.projectRoot}: ${project.reason} (${formatList(project.languages)})`);
    }
  }

  return lines.join("\n");
}

function renderMarkdownProjectCandidateRanking(ranking) {
  const lines = [];

  lines.push("# Project Candidate Ranking");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Projects: ${ranking.summary.projectCount}`);
  lines.push(`- Audited: ${ranking.summary.auditedProjectCount}`);
  lines.push(`- Unsupported: ${ranking.summary.unsupportedProjectCount}`);
  lines.push(`- Candidates: ${ranking.summary.candidateCount}`);
  lines.push("");
  lines.push("## Candidates");

  if (ranking.candidates.length === 0) {
    lines.push("- No project candidates ranked.");
  } else {
    for (const candidate of ranking.candidates) {
      const rationale = candidate.rationale.map(trimTrailingPeriod).join(". ");
      lines.push(
        `- ${candidate.projectRoot}: ${candidate.target} [${candidate.projectTargetId}] (${candidate.category}, ${candidate.testLevel}, priority ${candidate.priority}, risk reduction ${candidate.riskReductionScore}/10, maintenance ${candidate.maintenanceCost}/10). ${rationale}.`
      );
    }
  }

  lines.push("");
  lines.push("## Unsupported Projects");

  if (ranking.unsupportedProjects.length === 0) {
    lines.push("- No unsupported projects.");
  } else {
    for (const project of ranking.unsupportedProjects) {
      lines.push(`- ${project.projectRoot}: ${project.reason} (${formatList(project.languages)})`);
    }
  }

  return lines.join("\n");
}

function renderMarkdownProjectTestPlan(plan) {
  const lines = [];

  lines.push("# Project Test Plan");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Projects: ${plan.summary.projectCount}`);
  lines.push(`- Planned: ${plan.summary.plannedProjectCount}`);
  lines.push(`- Unsupported: ${plan.summary.unsupportedProjectCount}`);
  lines.push(`- Add tests: ${plan.summary.addTestCount}`);
  lines.push(`- Extend tests: ${plan.summary.extendTestCount}`);
  lines.push(`- Deferred: ${plan.summary.deferredCount}`);
  lines.push("");
  lines.push("## Items");

  if (plan.items.length === 0) {
    lines.push("- No project plan items generated.");
  } else {
    for (const item of plan.items) {
      const rationale = item.rationale.map(trimTrailingPeriod).join(". ");
      lines.push(
        `- ${item.projectRoot}: ${item.action}: ${item.target} [${item.projectItemId}] (${item.testLevel}, priority ${item.priority}, risk reduction ${item.riskReductionScore}/10, maintenance ${item.maintenanceCost}/10). ${rationale}.`
      );
    }
  }

  lines.push("");
  lines.push("## Unsupported Projects");

  if (plan.unsupportedProjects.length === 0) {
    lines.push("- No unsupported projects.");
  } else {
    for (const project of plan.unsupportedProjects) {
      lines.push(`- ${project.projectRoot}: ${project.reason} (${formatList(project.languages)})`);
    }
  }

  return lines.join("\n");
}

function renderMarkdownPlan(plan) {
  const lines = [];

  lines.push("# Test Plan");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Confidence: ${plan.summary.confidence}`);
  lines.push(`- Verification command: ${plan.summary.verificationCommand ?? "none detected"}`);
  lines.push(`- Add tests: ${plan.summary.addTestCount}`);
  lines.push(`- Extend tests: ${plan.summary.extendTestCount}`);
  lines.push(`- Deferred: ${plan.summary.deferredCount}`);
  lines.push("");
  lines.push("## Blockers");

  if (plan.blockers.length === 0) {
    lines.push("- None detected.");
  } else {
    for (const blocker of plan.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  lines.push("");
  lines.push("## Items");

  if (plan.items.length === 0) {
    lines.push("- No plan items generated.");
  } else {
    for (const item of plan.items) {
      const existingTests =
        item.existingTestPaths.length > 0 ? ` Existing tests: ${item.existingTestPaths.join(", ")}.` : "";
      const rationale = item.rationale.map(trimTrailingPeriod).join(". ");
      lines.push(
        `- ${item.action}: ${item.target} [${item.id}] (${item.testLevel}, priority ${item.priority}, risk reduction ${item.riskReductionScore}/10, maintenance ${item.maintenanceCost}/10). ${rationale}.${existingTests}`
      );
    }
  }

  return lines.join("\n");
}

function renderMarkdownExplanation(explanation) {
  const lines = [];

  lines.push("# Target Explanation");
  lines.push("");
  lines.push(`- Target: ${explanation.target}`);
  lines.push(`- Target ID: ${explanation.targetId}`);
  lines.push(`- Path: ${explanation.path}`);
  lines.push(`- Category: ${explanation.category}`);
  lines.push(`- Kind: ${explanation.kind}`);
  lines.push(`- Recommendation: ${explanation.recommendation}`);
  lines.push(`- Test level: ${explanation.testLevel}`);
  lines.push(`- Risk: ${explanation.risk}`);
  lines.push(`- Testability: ${explanation.testability}`);
  lines.push(`- Risk reduction: ${explanation.riskReductionScore}/10`);
  lines.push(`- Maintenance: ${explanation.maintenanceCost}/10`);
  lines.push(`- Signals: ${formatList(explanation.signals)}`);
  lines.push(`- Existing tests: ${formatList(explanation.existingTestPaths)}`);
  lines.push("");
  lines.push("## Rationale");

  for (const reason of explanation.rationale) {
    lines.push(`- ${reason}`);
  }

  return lines.join("\n");
}

function renderMarkdownRanking(ranking) {
  const lines = [];

  lines.push("# Candidate Ranking");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Confidence: ${ranking.summary.confidence}`);
  lines.push(`- Candidates: ${ranking.summary.candidateCount}`);
  lines.push(`- Blockers: ${ranking.summary.blockerCount}`);
  lines.push(`- Verification command: ${ranking.summary.verificationCommand ?? "none detected"}`);
  lines.push("");
  lines.push("## Blockers");

  if (ranking.blockers.length === 0) {
    lines.push("- None detected.");
  } else {
    for (const blocker of ranking.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  lines.push("");
  lines.push("## Candidates");

  if (ranking.candidates.length === 0) {
    lines.push("- No test candidates ranked.");
  } else {
    for (const candidate of ranking.candidates) {
      const existingTests =
        candidate.existingTestPaths.length > 0 ? ` Existing tests: ${candidate.existingTestPaths.join(", ")}.` : "";
      const rationale = candidate.rationale.map(trimTrailingPeriod).join(". ");
      lines.push(
        `- ${candidate.target} [${candidate.targetId}] (${candidate.category}, ${candidate.testLevel}, priority ${candidate.priority}, risk reduction ${candidate.riskReductionScore}/10, maintenance ${candidate.maintenanceCost}/10). ${rationale}.${existingTests}`
      );
    }
  }

  return lines.join("\n");
}

function formatList(values) {
  return values.length > 0 ? values.join(", ") : "none detected";
}

function trimTrailingPeriod(value) {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}

function formatTarget(target) {
  const existingTests =
    target.existingTestPaths.length > 0 ? `; existing tests: ${target.existingTestPaths.join(", ")}` : "";

  return `- ${target.name}: ${target.recommendedTestLevel} test for ${target.kind} (risk reduction ${target.riskReductionScore}/10, maintenance ${target.maintenanceCost}/10; ${target.reasons.join("; ")}${existingTests})`;
}

function formatSkippedTarget(target) {
  const preferredPath = target.preferredCoveragePath ? ` Preferred path: ${target.preferredCoveragePath}` : "";

  return `- ${target.name}: ${target.reason} (risk reduction ${target.riskReductionScore}/10, maintenance ${target.maintenanceCost}/10).${preferredPath}`;
}
