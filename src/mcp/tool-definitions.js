import {
  auditRepo,
  explainAuditTarget,
  generateTestPlan,
  getAuditGraph,
  rankAuditTestCandidates
} from "../core/tool-api.js";
import { createGenerationDeferredResult } from "../core/generation-deferred.js";

export const mcpTools = [
  {
    name: "audit_repo",
    description: "Audit a repository and return the deterministic audit graph.",
    inputSchema: objectSchema({
      repoRoot: { type: "string", description: "Repository root path." },
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
    inputSchema: objectSchema({
      audit: { type: "object", description: "An audit/v1 artifact." }
    }, ["audit"])
  },
  {
    name: "generate_test_plan",
    description: "Generate a deterministic test plan from an audit graph.",
    inputSchema: objectSchema({
      audit: { type: "object", description: "An audit/v1 artifact." },
      itemId: { type: "string", description: "Optional stable plan item id to select." }
    }, ["audit"])
  },
  {
    name: "explain_target",
    description: "Explain one audit target by stable target id.",
    inputSchema: objectSchema({
      audit: { type: "object", description: "An audit/v1 artifact." },
      targetId: { type: "string", description: "Stable audit target id." }
    }, ["audit", "targetId"])
  },
  {
    name: "rank_test_candidates",
    description: "Rank testable audit targets by risk reduction and maintenance cost.",
    inputSchema: objectSchema({
      audit: { type: "object", description: "An audit/v1 artifact." }
    }, ["audit"])
  },
  {
    name: "generate_selected_test",
    description: "Return a structured deferred result until native test generation is enabled.",
    inputSchema: objectSchema({
      planItemId: { type: "string", description: "Stable plan item id selected for future generation." }
    }, ["planItemId"])
  }
];

export function callTool(name, args = {}) {
  switch (name) {
    case "audit_repo":
      return auditRepo(requireString(args.repoRoot, "repoRoot"), {
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
      throw new Error(`Unknown MCP tool: ${name}`);
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
