import {
  analyzeRepoProjectTestPlacement,
  analyzeRepoTestPlacement,
  analyzeRepository,
  auditRepoProjects,
  auditRepo,
  collectRepoProjectFindings,
  collectRepoProjectStats,
  detectRepoProjects,
  explainAuditTarget,
  generateTestPlan,
  generateRepoProjectTestPlan,
  getAuditGraph,
  getPlanExecutionHints,
  getProjectDetectionRules,
  rankRepoProjectCandidates,
  rankAuditTestCandidates,
  summarizeRepoProjectAudits
} from "../core/tool-api.js";
import { getAdapterRegistry } from "../core/adapter-registry.js";
import { createGenerationDeferredResult } from "../core/generation-deferred.js";
import { McpToolError } from "./errors.js";

const readOnlyAnnotations = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
});

const toolTitles = Object.freeze({
  analyze_repository: "Analyze Repository",
  list_adapters: "List Adapters",
  list_project_detection_rules: "List Project Detection Rules",
  detect_projects: "Detect Projects",
  audit_projects: "Audit Projects",
  summarize_project_audits: "Summarize Project Audits",
  rank_project_candidates: "Rank Project Test Candidates",
  generate_project_test_plan: "Generate Project Test Plan",
  collect_project_findings: "Collect Project Findings",
  analyze_project_test_placement: "Analyze Project Test Placement",
  collect_project_stats: "Collect Project Stats",
  audit_repo: "Audit Repository",
  get_audit_graph: "Get Audit Graph",
  generate_test_plan: "Generate Test Plan",
  get_plan_execution_hints: "Get Plan Execution Hints",
  explain_target: "Explain Audit Target",
  rank_test_candidates: "Rank Test Candidates",
  analyze_test_placement: "Analyze Test Placement",
  generate_selected_test: "Generate Selected Test (Deferred)"
});

const toolDefinitions = [
  {
    name: "analyze_repository",
    description: "Start here for an unfamiliar repository or a general test-architecture review. Detect and audit all project roots once, then return the complete deterministic summary, blockers, findings, ranking, plan, execution hints, verification commands, and stats. Prefer this over audit_repo unless one project root and adapter were explicitly selected.",
    outputArtifact: artifact("repository-analysis/v1", "schemas/repository-analysis-v1.schema.json"),
    inputSchema: objectSchema({
      repoRoot: { type: "string", description: "Repository root path." },
      changedPaths: {
        type: "array",
        description: "Optional repository-relative source paths to limit target selection inside detected projects.",
        items: { type: "string", minLength: 1 }
      },
      excludeProjectRoots: {
        type: "array",
        description: "Optional exact project roots or subtree patterns such as examples/** to exclude before analysis.",
        items: { type: "string", minLength: 1 }
      }
    }, ["repoRoot"])
  },
  {
    name: "list_adapters",
    description: "List registered language adapters available to audit repositories.",
    outputArtifact: artifact("adapter-registry/v1", "schemas/adapter-registry-v1.schema.json"),
    inputSchema: objectSchema({}, [])
  },
  {
    name: "list_project_detection_rules",
    description: "List deterministic project marker rules and ignored directories used during project detection.",
    outputArtifact: artifact("project-detection-rules/v1", "schemas/project-detection-rules-v1.schema.json"),
    inputSchema: objectSchema({}, [])
  },
  {
    name: "detect_projects",
    description: "Detect project roots and matching adapters inside a repository.",
    outputArtifact: artifact("project-detection/v1", "schemas/project-detection-v1.schema.json"),
    inputSchema: objectSchema({
      repoRoot: { type: "string", description: "Repository root path." },
      excludeProjectRoots: {
        type: "array",
        description: "Optional exact project roots or subtree patterns such as examples/** to exclude before returning detected projects.",
        items: { type: "string", minLength: 1 }
      }
    }, ["repoRoot"])
  },
  {
    name: "audit_projects",
    description: "Return raw per-project audit artifacts for all detected supported roots and report unsupported roots. Use when a downstream specialist tool needs project-audits/v1; for a complete first-pass review, prefer analyze_repository.",
    outputArtifact: artifact("project-audits/v1", "schemas/project-audits-v1.schema.json"),
    inputSchema: objectSchema({
      repoRoot: { type: "string", description: "Repository root path." },
      changedPaths: {
        type: "array",
        description: "Optional repository-relative source paths to limit target selection inside detected projects.",
        items: { type: "string", minLength: 1 }
      },
      excludeProjectRoots: {
        type: "array",
        description: "Optional exact project roots or subtree patterns such as examples/** to exclude before auditing detected projects.",
        items: { type: "string", minLength: 1 }
      }
    }, ["repoRoot"])
  },
  {
    name: "summarize_project_audits",
    description: "Summarize an existing project-audits/v1 artifact. Use only when a compact coverage view is needed separately; analyze_repository already includes this result.",
    outputArtifact: artifact("project-audit-summary/v1", "schemas/project-audit-summary-v1.schema.json"),
    inputSchema: objectSchema({
      projectAudits: { type: "object", description: "A project-audits/v1 artifact." }
    }, ["projectAudits"])
  },
  {
    name: "rank_project_candidates",
    description: "Rank candidates from an existing project-audits/v1 artifact while preserving project identity. analyze_repository already includes this result.",
    outputArtifact: artifact("project-candidate-ranking/v1", "schemas/project-candidate-ranking-v1.schema.json"),
    inputSchema: objectSchema({
      projectAudits: { type: "object", description: "A project-audits/v1 artifact." }
    }, ["projectAudits"])
  },
  {
    name: "generate_project_test_plan",
    description: "Generate a project-aware plan from an existing project-audits/v1 artifact. analyze_repository already includes this result.",
    outputArtifact: artifact("project-test-plan/v1", "schemas/project-test-plan-v1.schema.json"),
    inputSchema: objectSchema({
      projectAudits: { type: "object", description: "A project-audits/v1 artifact." }
    }, ["projectAudits"])
  },
  {
    name: "collect_project_findings",
    description: "Collect concise top findings from an existing project-audits/v1 artifact. analyze_repository already includes this result.",
    outputArtifact: artifact("project-findings/v1", "schemas/project-findings-v1.schema.json"),
    inputSchema: objectSchema({
      projectAudits: { type: "object", description: "A project-audits/v1 artifact." }
    }, ["projectAudits"])
  },
  {
    name: "analyze_project_test_placement",
    description: "Analyze project-aware test placement from a project-audits artifact.",
    outputArtifact: artifact("test-placement-findings/v1", "schemas/test-placement-findings-v1.schema.json"),
    inputSchema: objectSchema({
      projectAudits: { type: "object", description: "A project-audits/v1 artifact." }
    }, ["projectAudits"])
  },
  {
    name: "collect_project_stats",
    description: "Collect local deterministic project audit stats for coverage, counts, risk and signal distributions, framework distribution, and adapter usage.",
    outputArtifact: artifact("project-stats/v1", "schemas/project-stats-v1.schema.json"),
    inputSchema: objectSchema({
      projectAudits: { type: "object", description: "A project-audits/v1 artifact." }
    }, ["projectAudits"])
  },
  {
    name: "audit_repo",
    description: "Audit one explicitly selected project root and return audit/v1. Use only when the caller selected a single adapter or project boundary; adapterId defaults to javascript. For an unfamiliar or complete repository review, use analyze_repository.",
    outputArtifact: artifact("audit/v1", "schemas/audit-v1.schema.json"),
    inputSchema: objectSchema({
      repoRoot: { type: "string", description: "Repository root path." },
      adapterId: { type: "string", description: "Optional adapter id. Defaults to javascript." },
      changedPaths: {
        type: "array",
        description: "Optional repository-relative source paths to limit target selection.",
        items: { type: "string", minLength: 1 }
      }
    }, ["repoRoot"])
  },
  {
    name: "get_audit_graph",
    description: "Validate and return an existing audit/v1 artifact unchanged; this does not scan a repository. Use audit_repo or analyze_repository for repository discovery.",
    outputArtifact: artifact("audit/v1", "schemas/audit-v1.schema.json"),
    inputSchema: objectSchema({
      audit: { type: "object", description: "An audit/v1 artifact." }
    }, ["audit"])
  },
  {
    name: "generate_test_plan",
    description: "Generate a deterministic test plan from an audit graph.",
    outputArtifact: artifact("plan/v1", "schemas/plan-v1.schema.json"),
    inputSchema: objectSchema({
      audit: { type: "object", description: "An audit/v1 artifact." },
      itemId: { type: "string", description: "Optional stable plan item id to select." }
    }, ["audit"])
  },
  {
    name: "get_plan_execution_hints",
    description: "Derive provider-neutral execution, context, parallel-safety, and repository-reasoning hints from a plan without invoking models or subagents.",
    outputArtifact: artifact("plan-execution-hints/v1", "schemas/plan-execution-hints-v1.schema.json"),
    inputSchema: objectSchema({
      plan: { type: "object", description: "A plan/v1 or project-test-plan/v1 artifact." },
      itemId: { type: "string", description: "Optional stable plan item or project item id to select." }
    }, ["plan"])
  },
  {
    name: "explain_target",
    description: "Explain one audit target by stable target id.",
    outputArtifact: artifact("target-explanation/v1", "schemas/target-explanation-v1.schema.json"),
    inputSchema: objectSchema({
      audit: { type: "object", description: "An audit/v1 artifact." },
      targetId: { type: "string", description: "Stable audit target id." }
    }, ["audit", "targetId"])
  },
  {
    name: "rank_test_candidates",
    description: "Rank testable audit targets by risk reduction and maintenance cost.",
    outputArtifact: artifact("candidate-ranking/v1", "schemas/candidate-ranking-v1.schema.json"),
    inputSchema: objectSchema({
      audit: { type: "object", description: "An audit/v1 artifact." }
    }, ["audit"])
  },
  {
    name: "analyze_test_placement",
    description: "Analyze existing test placement from an audit graph and return advisory placement findings.",
    outputArtifact: artifact("test-placement-findings/v1", "schemas/test-placement-findings-v1.schema.json"),
    inputSchema: objectSchema({
      audit: { type: "object", description: "An audit/v1 artifact." },
      owner: { type: "string", description: "Optional owner label for the audited project. Defaults to audit.profile.root." }
    }, ["audit"])
  },
  {
    name: "generate_selected_test",
    description: "Return a structured deferred result. This tool does not generate or write test code while native generation remains disabled.",
    outputArtifact: artifact("generation-deferred/v1", "schemas/generation-deferred-v1.schema.json"),
    inputSchema: objectSchema({
      planItemId: { type: "string", description: "Stable plan item id selected for future generation." }
    }, ["planItemId"])
  }
];

export const mcpTools = toolDefinitions.map((tool) => ({
  ...tool,
  title: requireToolTitle(tool.name),
  annotations: { ...readOnlyAnnotations }
}));

export const mcpToolNames = mcpTools.map((tool) => tool.name);

export function callTool(name, args = {}) {
  const tool = mcpTools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new McpToolError("unknown-tool", "Unknown MCP tool.", {
      toolName: isSafeToolName(name) ? name : "invalid-tool-name"
    });
  }

  validateToolArgs(tool, args);

  try {
    switch (name) {
      case "analyze_repository":
        return analyzeRepository(requireString(args.repoRoot, "repoRoot"), {
          changedPaths: optionalStringArray(args.changedPaths, "changedPaths"),
          excludeProjectRoots: optionalStringArray(args.excludeProjectRoots, "excludeProjectRoots")
        });
      case "list_adapters":
        return getAdapterRegistry();
      case "list_project_detection_rules":
        return getProjectDetectionRules();
      case "detect_projects":
        return detectRepoProjects(requireString(args.repoRoot, "repoRoot"), {
          excludeProjectRoots: optionalStringArray(args.excludeProjectRoots, "excludeProjectRoots")
        });
      case "audit_projects":
        return auditRepoProjects(requireString(args.repoRoot, "repoRoot"), {
          changedPaths: optionalStringArray(args.changedPaths, "changedPaths"),
          excludeProjectRoots: optionalStringArray(args.excludeProjectRoots, "excludeProjectRoots")
        });
      case "summarize_project_audits":
        return summarizeRepoProjectAudits(requireObject(args.projectAudits, "projectAudits"));
      case "rank_project_candidates":
        return rankRepoProjectCandidates(requireObject(args.projectAudits, "projectAudits"));
      case "generate_project_test_plan":
        return generateRepoProjectTestPlan(requireObject(args.projectAudits, "projectAudits"));
      case "collect_project_findings":
        return collectRepoProjectFindings(requireObject(args.projectAudits, "projectAudits"));
      case "analyze_project_test_placement":
        return analyzeRepoProjectTestPlacement(requireObject(args.projectAudits, "projectAudits"));
      case "collect_project_stats":
        return collectRepoProjectStats(requireObject(args.projectAudits, "projectAudits"));
      case "audit_repo":
        return auditRepo(requireString(args.repoRoot, "repoRoot"), {
          adapterId: optionalString(args.adapterId, "adapterId"),
          changedPaths: optionalStringArray(args.changedPaths, "changedPaths")
        });
      case "get_audit_graph":
        return getAuditGraph(requireObject(args.audit, "audit"));
      case "generate_test_plan":
        return generateTestPlan(requireObject(args.audit, "audit"), {
          itemId: optionalString(args.itemId, "itemId")
        });
      case "get_plan_execution_hints":
        return getPlanExecutionHints(requireObject(args.plan, "plan"), {
          itemId: optionalString(args.itemId, "itemId")
        });
      case "explain_target":
        return explainAuditTarget(requireObject(args.audit, "audit"), requireString(args.targetId, "targetId"));
      case "rank_test_candidates":
        return rankAuditTestCandidates(requireObject(args.audit, "audit"));
      case "analyze_test_placement":
        return analyzeRepoTestPlacement(requireObject(args.audit, "audit"), {
          owner: optionalString(args.owner, "owner")
        });
      case "generate_selected_test":
        return createGenerationDeferredResult(requireString(args.planItemId, "planItemId"));
      default:
        throw new Error(`Unhandled MCP tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpToolError && !error.details.toolName) {
      throw new McpToolError(error.kind, error.message, { toolName: name, ...error.details });
    }

    throw error;
  }
}

function isSafeToolName(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value);
}

function objectSchema(properties, required) {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties
  };
}

function artifact(schemaVersion, schemaPath) {
  return {
    schemaVersion,
    schemaPath
  };
}

function requireToolTitle(name) {
  const title = toolTitles[name];

  if (!title) {
    throw new Error(`Missing MCP tool title for ${name}.`);
  }

  return title;
}

function requireString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new McpToolError("invalid-arguments", `${name} must be a non-empty string.`, { argument: name });
  }

  return value;
}

function optionalString(value, name) {
  if (value === undefined) return undefined;
  return requireString(value, name);
}

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new McpToolError("invalid-arguments", `${name} must be an object.`, { argument: name });
  }

  return value;
}

function optionalStringArray(value, name) {
  if (value === undefined) return undefined;

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new McpToolError("invalid-arguments", `${name} must be an array of non-empty strings.`, { argument: name });
  }

  return value;
}

function validateToolArgs(tool, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new McpToolError("invalid-arguments", `${tool.name} arguments must be an object.`, { toolName: tool.name });
  }

  const allowed = new Set(Object.keys(tool.inputSchema.properties ?? {}));

  for (const key of tool.inputSchema.required ?? []) {
    if (!Object.hasOwn(args, key)) {
      throw new McpToolError("missing-required-argument", `${key} is required for ${tool.name}.`, {
        toolName: tool.name,
        argument: key
      });
    }
  }

  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) {
      throw new McpToolError("unsupported-argument", `${key} is not a supported argument for ${tool.name}.`, {
        toolName: tool.name,
        argument: key
      });
    }
  }
}
