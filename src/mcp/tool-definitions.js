import {
  auditRepo,
  detectRepoProjects,
  explainAuditTarget,
  generateTestPlan,
  getAuditGraph,
  rankAuditTestCandidates
} from "../core/tool-api.js";
import { getAdapterRegistry } from "../core/adapter-registry.js";
import { createGenerationDeferredResult } from "../core/generation-deferred.js";
import { McpToolError } from "./errors.js";

export const mcpTools = [
  {
    name: "list_adapters",
    description: "List registered language adapters available to audit repositories.",
    outputArtifact: artifact("adapter-registry/v1", "schemas/adapter-registry-v1.schema.json"),
    inputSchema: objectSchema({}, [])
  },
  {
    name: "detect_projects",
    description: "Detect project roots and matching adapters inside a repository.",
    outputArtifact: artifact("project-detection/v1", "schemas/project-detection-v1.schema.json"),
    inputSchema: objectSchema({
      repoRoot: { type: "string", description: "Repository root path." }
    }, ["repoRoot"])
  },
  {
    name: "audit_repo",
    description: "Audit a repository and return the deterministic audit graph.",
    outputArtifact: artifact("audit/v1", "schemas/audit-v1.schema.json"),
    inputSchema: objectSchema({
      repoRoot: { type: "string", description: "Repository root path." },
      adapterId: { type: "string", description: "Optional adapter id. Defaults to javascript." },
      changedPaths: {
        type: "array",
        description: "Optional repository-relative source paths to limit target selection.",
        items: { type: "string" }
      }
    }, ["repoRoot"])
  },
  {
    name: "get_audit_graph",
    description: "Return a validated audit graph artifact.",
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
    name: "generate_selected_test",
    description: "Return a structured deferred result until native test generation is enabled.",
    outputArtifact: artifact("generation-deferred/v1", "schemas/generation-deferred-v1.schema.json"),
    inputSchema: objectSchema({
      planItemId: { type: "string", description: "Stable plan item id selected for future generation." }
    }, ["planItemId"])
  }
];

export const mcpToolNames = mcpTools.map((tool) => tool.name);

export function callTool(name, args = {}) {
  const tool = mcpTools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new McpToolError("unknown-tool", `Unknown MCP tool: ${name}`, { toolName: name });
  }

  validateToolArgs(tool, args);

  switch (name) {
    case "list_adapters":
      return getAdapterRegistry();
    case "detect_projects":
      return detectRepoProjects(requireString(args.repoRoot, "repoRoot"));
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
    case "explain_target":
      return explainAuditTarget(requireObject(args.audit, "audit"), requireString(args.targetId, "targetId"));
    case "rank_test_candidates":
      return rankAuditTestCandidates(requireObject(args.audit, "audit"));
    case "generate_selected_test":
      return createGenerationDeferredResult(requireString(args.planItemId, "planItemId"));
    default:
      throw new Error(`Unhandled MCP tool: ${name}`);
  }
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

function requireString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value;
}

function optionalString(value, name) {
  if (value === undefined) return undefined;
  return requireString(value, name);
}

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }

  return value;
}

function optionalStringArray(value, name) {
  if (value === undefined) return undefined;

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be an array of strings.`);
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
