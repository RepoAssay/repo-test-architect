import fs from "node:fs";
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
  reviewRepository,
  summarizeRepoProjectAudits
} from "../core/tool-api.js";
import { MAX_REVIEW_LIMIT } from "../core/repository-review.js";
import { getAdapterRegistry } from "../core/adapter-registry.js";
import { ArtifactValidationError } from "../core/artifact-validation.js";
import { createGenerationDeferredResult } from "../core/generation-deferred.js";
import { InvalidOptionError } from "../core/invalid-option-error.js";
import { McpToolError } from "./errors.js";

// Tool descriptors advertise only the top-level artifact shape; nested contracts live in the
// published schema file, which keeps tools/list small for clients that load every descriptor.
const compactPropertyKeywords = ["type", "const", "enum"];

// Claude Code keeps text results inline up to this many characters when a tool declares it; the bounded
// review is meant to be read directly rather than spilled to a file. Other clients ignore the hint.
const REVIEW_MAX_RESULT_SIZE_CHARS = 200_000;

const readOnlyAnnotations = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
});

const toolTitles = Object.freeze({
  review_repository: "Review Repository",
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
    name: "review_repository",
    description: "Start here for an unfamiliar repository or a general test-architecture review. Detect and audit all project roots once, then return a bounded deterministic review: summary counts, blockers, top findings, the top-ranked candidates and plan items with execution hints, verification commands, and stats. limit caps the ranked lists (default 25) and per-test evidence is reduced to counts, so the result stays small on large monorepos. Use explain_target with repoRoot and projectRoot for one target's evidence, and analyze_repository only when the complete bundle is explicitly needed.",
    outputArtifact: artifact("repository-review/v1", "schemas/repository-review-v1.schema.json"),
    _meta: { "anthropic/maxResultSizeChars": REVIEW_MAX_RESULT_SIZE_CHARS },
    inputSchema: objectSchema({
      ...repositoryScanProperties("before the review"),
      limit: {
        type: "integer",
        minimum: 1,
        maximum: MAX_REVIEW_LIMIT,
        description: "Maximum ranked candidates and plan items to return. Defaults to 25."
      }
    }, ["repoRoot"])
  },
  {
    name: "analyze_repository",
    description: "Return the complete repository-analysis/v1 bundle: every project audit with per-target test evidence plus the derived summary, findings, ranking, plan, execution hints, and stats. The result grows with repository size and can exceed client limits on large monorepos, so prefer review_repository first and use this only when the complete bundle is explicitly needed or the repository is small.",
    outputArtifact: artifact("repository-analysis/v1", "schemas/repository-analysis-v1.schema.json"),
    inputSchema: objectSchema(repositoryScanProperties("before analysis"), ["repoRoot"])
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
    description: "Discover project roots, support status, and matching adapters without auditing source targets. Use this when project boundaries are needed before a specialized workflow; use review_repository for a general review. Reads local repository markers and returns project-detection/v1 without executing tests or writing files.",
    outputArtifact: artifact("project-detection/v1", "schemas/project-detection-v1.schema.json"),
    inputSchema: objectSchema({
      repoRoot: { type: "string", description: "Readable repository directory whose project markers should be inspected." },
      excludeProjectRoots: {
        type: "array",
        description: "Optional exact project roots or subtree patterns such as examples/** to exclude before returning detected projects.",
        items: { type: "string", minLength: 1 }
      }
    }, ["repoRoot"])
  },
  {
    name: "audit_projects",
    description: "Return raw per-project audit artifacts for all detected supported roots, report unsupported roots, and list roots whose adapter failed in failedProjects. Use when a downstream specialist tool needs project-audits/v1; for a general first-pass review, prefer review_repository. The result can be large; specialist tools also accept repoRoot directly, so the artifact rarely needs to be passed back.",
    outputArtifact: artifact("project-audits/v1", "schemas/project-audits-v1.schema.json"),
    inputSchema: objectSchema(repositoryScanProperties("before auditing detected projects"), ["repoRoot"])
  },
  {
    name: "summarize_project_audits",
    description: "Summarize an existing project-audits/v1 artifact. Use only when a compact coverage view is needed separately; review_repository returns a bounded version of this result; pass repoRoot here for the complete artifact.",
    outputArtifact: artifact("project-audit-summary/v1", "schemas/project-audit-summary-v1.schema.json"),
    inputSchema: objectSchema(projectAuditsSourceProperties(), [])
  },
  {
    name: "rank_project_candidates",
    description: "Rank candidates from an existing project-audits/v1 artifact while preserving project identity. review_repository returns a bounded version of this result; pass repoRoot here for the complete artifact.",
    outputArtifact: artifact("project-candidate-ranking/v1", "schemas/project-candidate-ranking-v1.schema.json"),
    inputSchema: objectSchema(projectAuditsSourceProperties(), [])
  },
  {
    name: "generate_project_test_plan",
    description: "Generate a project-aware plan from an existing project-audits/v1 artifact. review_repository returns a bounded version of this result; pass repoRoot here for the complete artifact.",
    outputArtifact: artifact("project-test-plan/v1", "schemas/project-test-plan-v1.schema.json"),
    inputSchema: objectSchema(projectAuditsSourceProperties(), [])
  },
  {
    name: "collect_project_findings",
    description: "Collect concise top findings from an existing project-audits/v1 artifact. review_repository returns a bounded version of this result; pass repoRoot here for the complete artifact.",
    outputArtifact: artifact("project-findings/v1", "schemas/project-findings-v1.schema.json"),
    inputSchema: objectSchema(projectAuditsSourceProperties(), [])
  },
  {
    name: "analyze_project_test_placement",
    description: "Derive advisory test-placement findings across an existing project-audits/v1 artifact while preserving project identity. Use this for multiple audited projects; use analyze_test_placement for one audit/v1 artifact. Does not rescan the repository, execute tests, or create, move, or modify files.",
    outputArtifact: artifact("test-placement-findings/v1", "schemas/test-placement-findings-v1.schema.json"),
    inputSchema: objectSchema(projectAuditsSourceProperties(), [])
  },
  {
    name: "collect_project_stats",
    description: "Aggregate coverage, counts, risk and signal distributions, frameworks, and adapter usage from a project-audits/v1 artifact or, with repoRoot, from a fresh audit. Use this for separate reporting or comparisons; review_repository already includes the same stats. Returns project-stats/v1 without executing tests or writing files.",
    outputArtifact: artifact("project-stats/v1", "schemas/project-stats-v1.schema.json"),
    inputSchema: objectSchema(projectAuditsSourceProperties(), [])
  },
  {
    name: "audit_repo",
    description: "Audit one explicitly selected project root and return audit/v1. Use only when the caller selected a single adapter or project boundary; adapterId defaults to javascript. For an unfamiliar repository or a general review, use review_repository.",
    outputArtifact: artifact("audit/v1", "schemas/audit-v1.schema.json"),
    inputSchema: objectSchema({
      repoRoot: { type: "string", description: "Repository root path." },
      adapterId: { type: "string", description: "Optional adapter id. Defaults to javascript." },
      changedPaths: {
        type: "array",
        description: "Optional repository-relative source paths to limit target selection.",
        items: { type: "string", minLength: 1 }
      },
      goTarget: goTargetSchema()
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
    description: "Create a deterministic plan/v1 for one project, optionally selecting one exact plan item; use generate_project_test_plan for multiple audited projects. Pass an existing audit/v1 artifact, or pass repoRoot plus projectRoot to audit that project deterministically. Does not execute tests or generate or write test code.",
    outputArtifact: artifact("plan/v1", "schemas/plan-v1.schema.json"),
    inputSchema: objectSchema({
      ...auditSourceProperties(),
      itemId: { type: "string", description: "Optional exact plan item id to return; omit it to return the complete deterministic plan." }
    }, [])
  },
  {
    name: "get_plan_execution_hints",
    description: "Derive provider-neutral execution, context, parallel-safety, and repository-reasoning hints from a plan without invoking models or subagents. Pass an existing plan/v1 or project-test-plan/v1 artifact, or pass repoRoot to derive hints for the project-aware plan of that repository.",
    outputArtifact: artifact("plan-execution-hints/v1", "schemas/plan-execution-hints-v1.schema.json"),
    inputSchema: objectSchema({
      plan: { type: "object", description: "A plan/v1 or project-test-plan/v1 artifact. Omit it and pass repoRoot to plan the repository instead." },
      ...repositoryScanProperties("before planning", "Repository root to audit and plan instead of passing plan."),
      itemId: { type: "string", description: "Optional stable plan item or project item id to select." }
    }, [])
  },
  {
    name: "explain_target",
    description: "Explain the evidence, risk, testability, and recommendation for one audited target, including its complete existing-test evidence. Use this after review_repository when one target needs detail: pass repoRoot plus the projectRoot and targetId from the review, or pass an existing audit/v1 artifact. Returns target-explanation/v1 without executing tests or writing files.",
    outputArtifact: artifact("target-explanation/v1", "schemas/target-explanation-v1.schema.json"),
    inputSchema: objectSchema({
      ...auditSourceProperties(),
      targetId: { type: "string", description: "Exact stable id from an audit target in untestedCandidates, coveredButRisky, recommended, or skipped." }
    }, ["targetId"])
  },
  {
    name: "rank_test_candidates",
    description: "Rank testable audit targets of one project by risk reduction and maintenance cost. Pass an existing audit/v1 artifact, or pass repoRoot plus projectRoot to audit that project deterministically.",
    outputArtifact: artifact("candidate-ranking/v1", "schemas/candidate-ranking-v1.schema.json"),
    inputSchema: objectSchema(auditSourceProperties(), [])
  },
  {
    name: "analyze_test_placement",
    description: "Derive advisory test-placement findings for one project; use analyze_project_test_placement for multiple audited projects. Pass an existing audit/v1 artifact, or pass repoRoot plus projectRoot to audit that project deterministically. Does not execute tests or create, move, or modify files.",
    outputArtifact: artifact("test-placement-findings/v1", "schemas/test-placement-findings-v1.schema.json"),
    inputSchema: objectSchema({
      ...auditSourceProperties(),
      owner: { type: "string", description: "Optional owner label for the audited project. Defaults to audit.profile.root." }
    }, [])
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
  outputSchema: compactOutputSchema(loadOutputSchema(tool.outputArtifact.schemaPath), tool.outputArtifact.schemaPath),
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
      case "review_repository":
        return reviewRepository(requireString(args.repoRoot, "repoRoot"), {
          ...repositoryScanOptions(args),
          limit: optionalLimit(args.limit)
        });
      case "analyze_repository":
        return analyzeRepository(requireString(args.repoRoot, "repoRoot"), repositoryScanOptions(args));
      case "list_adapters":
        return getAdapterRegistry();
      case "list_project_detection_rules":
        return getProjectDetectionRules();
      case "detect_projects":
        return detectRepoProjects(requireString(args.repoRoot, "repoRoot"), {
          excludeProjectRoots: optionalStringArray(args.excludeProjectRoots, "excludeProjectRoots")
        });
      case "audit_projects":
        return auditRepoProjects(requireString(args.repoRoot, "repoRoot"), repositoryScanOptions(args));
      case "summarize_project_audits":
        return summarizeRepoProjectAudits(resolveProjectAudits(tool, args));
      case "rank_project_candidates":
        return rankRepoProjectCandidates(resolveProjectAudits(tool, args));
      case "generate_project_test_plan":
        return generateRepoProjectTestPlan(resolveProjectAudits(tool, args));
      case "collect_project_findings":
        return collectRepoProjectFindings(resolveProjectAudits(tool, args));
      case "analyze_project_test_placement":
        return analyzeRepoProjectTestPlacement(resolveProjectAudits(tool, args));
      case "collect_project_stats":
        return collectRepoProjectStats(resolveProjectAudits(tool, args));
      case "audit_repo":
        return auditRepo(requireString(args.repoRoot, "repoRoot"), {
          adapterId: optionalString(args.adapterId, "adapterId"),
          changedPaths: optionalStringArray(args.changedPaths, "changedPaths"),
          goTarget: optionalGoTarget(args.goTarget)
        });
      case "get_audit_graph":
        return getAuditGraph(requireObject(args.audit, "audit"));
      case "generate_test_plan":
        return generateTestPlan(resolveAudit(tool, args), {
          itemId: optionalString(args.itemId, "itemId")
        });
      case "get_plan_execution_hints":
        return getPlanExecutionHints(resolvePlan(tool, args), {
          itemId: optionalString(args.itemId, "itemId")
        });
      case "explain_target":
        return explainAuditTarget(resolveAudit(tool, args), requireString(args.targetId, "targetId"));
      case "rank_test_candidates":
        return rankAuditTestCandidates(resolveAudit(tool, args));
      case "analyze_test_placement":
        return analyzeRepoTestPlacement(resolveAudit(tool, args), {
          owner: optionalString(args.owner, "owner")
        });
      case "generate_selected_test":
        return createGenerationDeferredResult(requireString(args.planItemId, "planItemId"));
      default:
        throw new Error(`Unhandled MCP tool: ${name}`);
    }
  } catch (error) {
    const artifactArgument = savedArtifactArgument(tool);
    if (error instanceof ArtifactValidationError && artifactArgument) {
      throw new McpToolError("invalid-arguments", error.message, {
        toolName: name,
        argument: artifactArgument,
        path: error.path
      });
    }

    if (error instanceof InvalidOptionError) {
      // Option values are never echoed back; name the argument only.
      throw new McpToolError("invalid-arguments", `Invalid ${error.option} argument.`, { toolName: name, argument: error.option });
    }

    if (error instanceof McpToolError && !error.details.toolName) {
      throw new McpToolError(error.kind, error.message, { toolName: name, ...error.details });
    }

    throw error;
  }
}

/**
 * Scan options shared by every tool that detects and audits a repository.
 */
function repositoryScanOptions(args) {
  return {
    changedPaths: optionalStringArray(args.changedPaths, "changedPaths"),
    excludeProjectRoots: optionalStringArray(args.excludeProjectRoots, "excludeProjectRoots"),
    goTarget: optionalGoTarget(args.goTarget)
  };
}

// Arguments that only make sense when the tool scans a repository itself.
const scanOnlyArguments = ["changedPaths", "excludeProjectRoots", "goTarget", "projectRoot"];

/**
 * Artifact-consuming tools accept either the saved artifact or repoRoot. Scanning again is deterministic
 * and cheap, and it spares the client from echoing a large artifact back as an argument.
 */
function resolveArtifactSource(tool, args, artifactArgument, scan) {
  const hasArtifact = args[artifactArgument] !== undefined;
  const hasRepoRoot = args.repoRoot !== undefined;

  if (hasArtifact && hasRepoRoot) {
    throw new McpToolError("invalid-arguments", `Pass either ${artifactArgument} or repoRoot to ${tool.name}, not both.`, {
      toolName: tool.name,
      argument: "repoRoot"
    });
  }

  if (hasArtifact) {
    const scanArgument = scanOnlyArguments.find((key) => args[key] !== undefined);
    if (scanArgument) {
      throw new McpToolError("invalid-arguments", `${scanArgument} applies only when ${tool.name} scans a repository with repoRoot.`, {
        toolName: tool.name,
        argument: scanArgument
      });
    }
    return requireObject(args[artifactArgument], artifactArgument);
  }

  if (!hasRepoRoot) {
    throw new McpToolError("missing-required-argument", `${artifactArgument} or repoRoot is required for ${tool.name}.`, {
      toolName: tool.name,
      argument: artifactArgument
    });
  }

  return scan();
}

function resolveProjectAudits(tool, args) {
  return resolveArtifactSource(tool, args, "projectAudits", () =>
    auditRepoProjects(requireString(args.repoRoot, "repoRoot"), repositoryScanOptions(args)));
}

function resolvePlan(tool, args) {
  return resolveArtifactSource(tool, args, "plan", () =>
    generateRepoProjectTestPlan(auditRepoProjects(requireString(args.repoRoot, "repoRoot"), repositoryScanOptions(args))));
}

function resolveAudit(tool, args) {
  return resolveArtifactSource(tool, args, "audit", () => {
    if (args.projectRoot === undefined) {
      throw new McpToolError("missing-required-argument", `projectRoot is required with repoRoot for ${tool.name}.`, {
        toolName: tool.name,
        argument: "projectRoot"
      });
    }

    const projectRoot = normalizeProjectRoot(requireString(args.projectRoot, "projectRoot"));
    const projectAudits = auditRepoProjects(requireString(args.repoRoot, "repoRoot"), {
      changedPaths: optionalStringArray(args.changedPaths, "changedPaths"),
      goTarget: optionalGoTarget(args.goTarget)
    });
    const entry = projectAudits.audits.find((candidate) => normalizeProjectRoot(candidate.projectRoot) === projectRoot);

    if (!entry) {
      // The value is never echoed; it is repository-controlled text.
      throw new McpToolError(
        "invalid-arguments",
        `projectRoot is not an audited project root under repoRoot for ${tool.name}; it may be unsupported, failed, or not a detected project root.`,
        { toolName: tool.name, argument: "projectRoot" }
      );
    }

    return entry.audit;
  });
}

function normalizeProjectRoot(value) {
  const unified = value.replaceAll("\\", "/").replace(/^(\.\/)+/, "").replace(/\/+$/, "");
  return unified === "" ? "." : unified;
}

function optionalLimit(value) {
  if (value === undefined) return undefined;

  if (!Number.isInteger(value) || value < 1 || value > MAX_REVIEW_LIMIT) {
    throw new McpToolError("invalid-arguments", `limit must be an integer between 1 and ${MAX_REVIEW_LIMIT}.`, { argument: "limit" });
  }

  return value;
}

function savedArtifactArgument(tool) {
  const properties = tool.inputSchema.properties ?? {};
  if (Object.hasOwn(properties, "audit")) return "audit";
  if (Object.hasOwn(properties, "projectAudits")) return "projectAudits";
  if (Object.hasOwn(properties, "plan")) return "plan";
  return undefined;
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

function repositoryScanProperties(excludePhrase, repoRootDescription = "Repository root path.") {
  return {
    repoRoot: { type: "string", description: repoRootDescription },
    changedPaths: changedPathsProperty(),
    excludeProjectRoots: {
      type: "array",
      description: `Optional project roots or subtree patterns such as examples/** to exclude ${excludePhrase}.`,
      items: { type: "string", minLength: 1 }
    },
    goTarget: goTargetSchema()
  };
}

function changedPathsProperty() {
  return {
    type: "array",
    description: "Optional repository-relative source paths to limit target selection.",
    items: { type: "string", minLength: 1 }
  };
}

function projectAuditsSourceProperties() {
  return {
    projectAudits: { type: "object", description: "A project-audits/v1 artifact; or pass repoRoot instead." },
    ...repositoryScanProperties("before auditing", "Repository root to audit instead of passing projectAudits.")
  };
}

function auditSourceProperties() {
  return {
    audit: { type: "object", description: "An audit/v1 artifact; or pass repoRoot plus projectRoot instead." },
    repoRoot: { type: "string", description: "Repository root to audit instead of passing audit; requires projectRoot." },
    projectRoot: { type: "string", description: "Project root relative to repoRoot as detected, such as . or packages/api." },
    changedPaths: changedPathsProperty(),
    goTarget: goTargetSchema()
  };
}

function goTargetSchema() {
  return objectSchema({
    goos: { type: "string", minLength: 1, description: "Explicit GOOS for bounded Go build-constraint evaluation." },
    goarch: { type: "string", minLength: 1, description: "Explicit GOARCH for bounded Go build-constraint evaluation." },
    tags: {
      type: "array",
      description: "Optional custom Go build tags passed to the target-aware verification command.",
      items: { type: "string", minLength: 1 }
    }
  }, ["goos", "goarch"]);
}

function artifact(schemaVersion, schemaPath) {
  return {
    schemaVersion,
    schemaPath
  };
}

function loadOutputSchema(schemaPath) {
  const schemaUrl = new URL(`../../${schemaPath}`, import.meta.url);
  return JSON.parse(fs.readFileSync(schemaUrl, "utf8"));
}

function compactOutputSchema(schema, schemaPath) {
  return {
    type: "object",
    description: `Top-level shape of this artifact. The complete contract is ${schemaPath} in the published package.`,
    required: schema.required,
    additionalProperties: schema.additionalProperties,
    properties: Object.fromEntries(Object.entries(schema.properties).map(([name, property]) => [
      name,
      compactProperty(resolveLocalRef(property, schema))
    ]))
  };
}

function compactProperty(property) {
  return Object.fromEntries(compactPropertyKeywords
    .filter((keyword) => property[keyword] !== undefined)
    .map((keyword) => [keyword, property[keyword]]));
}

function resolveLocalRef(property, schema) {
  if (typeof property.$ref !== "string") return property;
  const match = /^#\/\$defs\/([^/]+)$/.exec(property.$ref);
  const target = match ? schema.$defs?.[match[1]] : undefined;
  if (!target) throw new Error(`Unsupported output schema reference: ${property.$ref}`);
  return target;
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

function optionalGoTarget(value) {
  if (value === undefined) return undefined;
  const target = requireObject(value, "goTarget");
  const unknownKeys = Object.keys(target).filter((key) => !["goos", "goarch", "tags"].includes(key));
  if (unknownKeys.length > 0) {
    throw new McpToolError("invalid-arguments", `Unsupported goTarget option: ${unknownKeys[0]}.`, { argument: "goTarget" });
  }
  return {
    goos: requireString(target.goos, "goTarget.goos"),
    goarch: requireString(target.goarch, "goTarget.goarch"),
    tags: optionalStringArray(target.tags, "goTarget.tags") ?? []
  };
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
