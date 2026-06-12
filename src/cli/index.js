#!/usr/bin/env node
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { auditJavaScriptRepo } from "../adapters/javascript/audit.js";
import { explainTarget } from "../core/explain-target.js";
import { createTestPlan } from "../core/test-plan.js";

const options = parseArgs(process.argv.slice(2));

if (!["audit", "plan", "explain"].includes(options.command)) {
  console.error("Usage: repo-test-architect <audit|plan|explain> <repo> [--format markdown|json] [--from-audit audit.json] [--item id] [--target id] [--changed] [--changed-since ref]");
  process.exit(1);
}

if (!["markdown", "json"].includes(options.format)) {
  console.error(`Unsupported format: ${options.format}`);
  process.exit(1);
}

if (options.fromAuditPath && !["plan", "explain"].includes(options.command)) {
  console.error("--from-audit is only supported with plan and explain commands.");
  process.exit(1);
}

const repoRoot = path.resolve(process.cwd(), options.repoPath);
const audit = options.fromAuditPath
  ? readAuditJson(options.fromAuditPath)
  : auditJavaScriptRepo(repoRoot, {
      changedPaths: readSelectedChangedPaths(repoRoot, options)
    });
const output = selectOutput(audit, options);

if (options.format === "json") {
  console.log(JSON.stringify(output, null, 2));
} else if (options.command === "plan") {
  console.log(renderMarkdownPlan(output));
} else if (options.command === "explain") {
  console.log(renderMarkdownExplanation(output));
} else {
  console.log(renderMarkdownReport(audit));
}

function parseArgs(args) {
  const [command, ...rest] = args;
  let repoPath = ".";
  let format = "markdown";
  let fromAuditPath;
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

  return { command, repoPath, format, fromAuditPath, itemId, targetId, changedOnly, changedSinceRef };
}

function readAuditJson(auditPath) {
  if (!auditPath) {
    console.error("--from-audit requires a JSON file path.");
    process.exit(1);
  }

  try {
    const audit = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), auditPath), "utf8"));
    validateAuditJson(audit);
    return audit;
  } catch (error) {
    console.error(`Failed to read audit JSON: ${error.message}`);
    process.exit(1);
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

function validateAuditJson(audit) {
  if (audit?.schemaVersion !== "audit/v1") {
    throw new Error("Expected audit schemaVersion audit/v1.");
  }

  if (!audit.profile || typeof audit.profile !== "object") {
    throw new Error("Audit profile is missing.");
  }

  for (const key of ["untestedCandidates", "coveredButRisky", "skipped", "risks"]) {
    if (!Array.isArray(audit[key])) {
      throw new Error(`Audit ${key} must be an array.`);
    }
  }
}

function filterPlan(plan, itemId) {
  if (!itemId) return plan;

  const item = plan.items.find((candidate) => candidate.id === itemId);

  if (!item) {
    console.error(`Plan item not found: ${itemId}`);
    process.exit(1);
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

function selectOutput(audit, options) {
  if (options.command === "plan") return filterPlan(createTestPlan(audit), options.itemId);

  if (options.command === "explain") {
    try {
      return explainTarget(audit, options.targetId);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }

  return audit;
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
