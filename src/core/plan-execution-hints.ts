import type { TestPlan, TestPlanItem } from "./test-plan";

export type ExecutionComplexity = "low" | "medium" | "high";
export type RecommendedAgentRole = "implementation" | "repository-reasoning" | "review";
export type ContextScopeMode = "target-only" | "target-and-tests" | "project-boundary";

export interface ProjectTestPlanItem extends TestPlanItem {
  projectId: string;
  projectRoot: string;
  adapterId: string;
  projectItemId: string;
}

export interface ProjectTestPlan {
  schemaVersion: "project-test-plan/v1";
  root: string;
  items: ProjectTestPlanItem[];
}

export interface PlanExecutionHint {
  planItemId: string;
  action: string;
  target: string;
  path: string;
  projectId?: string;
  projectRoot?: string;
  adapterId?: string;
  complexity: ExecutionComplexity;
  contextScope: {
    mode: ContextScopeMode;
    paths: string[];
    includeBuildConfiguration: boolean;
    includeRepositoryInstructions: boolean;
  };
  parallelizable: boolean;
  recommendedAgentRole: RecommendedAgentRole;
  requiresRepositoryReasoning: boolean;
  reasons: string[];
}

export interface PlanExecutionHints {
  schemaVersion: "plan-execution-hints/v1";
  source: {
    schemaVersion: "plan/v1" | "project-test-plan/v1";
    itemCount: number;
    root?: string;
  };
  summary: {
    itemCount: number;
    lowComplexityCount: number;
    mediumComplexityCount: number;
    highComplexityCount: number;
    parallelizableCount: number;
    repositoryReasoningCount: number;
  };
  items: PlanExecutionHint[];
}

type SupportedPlan = TestPlan | ProjectTestPlan;
type NormalizedPlanItem = (TestPlanItem | ProjectTestPlanItem) & {
  planItemId: string;
  contextPath: string;
  contextTestPaths: string[];
};

const PROJECT_BOUNDARY_SIGNALS = new Set([
  "app-integration-dependency",
  "app-wiring",
  "async-or-concurrency",
  "data-access",
  "database-access",
  "database-driver-mongodb",
  "database-driver-mysql",
  "database-driver-postgresql",
  "database-driver-sqlite",
  "database-transaction",
  "django-view",
  "external-boundary",
  "flask-route",
  "http-middleware",
  "http-route",
  "mongodb-aggregation",
  "mongodb-dynamic-filter",
  "raw-sql",
  "vapor-lifecycle",
  "vapor-middleware",
  "vapor-route"
]);

const HIGH_COMPLEXITY_SIGNALS = new Set([
  "async-or-concurrency",
  "database-transaction",
  "mongodb-aggregation",
  "mongodb-dynamic-filter",
  "raw-sql"
]);

export function createPlanExecutionHints(
  plan: SupportedPlan,
  options: { itemId?: string } = {}
): PlanExecutionHints {
  const normalizedItems = normalizePlanItems(plan);
  const selectedItems = filterItems(normalizedItems, options.itemId);
  const items = selectedItems.map(toExecutionHint);

  return {
    schemaVersion: "plan-execution-hints/v1",
    source: {
      schemaVersion: plan.schemaVersion,
      itemCount: normalizedItems.length,
      ...(plan.schemaVersion === "project-test-plan/v1" ? { root: plan.root } : {})
    },
    summary: {
      itemCount: items.length,
      lowComplexityCount: count(items, (item) => item.complexity === "low"),
      mediumComplexityCount: count(items, (item) => item.complexity === "medium"),
      highComplexityCount: count(items, (item) => item.complexity === "high"),
      parallelizableCount: count(items, (item) => item.parallelizable),
      repositoryReasoningCount: count(items, (item) => item.requiresRepositoryReasoning)
    },
    items
  };
}

function normalizePlanItems(plan: SupportedPlan): NormalizedPlanItem[] {
  return plan.items.map((item) => {
    const projectItem = plan.schemaVersion === "project-test-plan/v1"
      ? item as ProjectTestPlanItem
      : undefined;
    const projectRoot = projectItem?.projectRoot;
    return {
      ...item,
      planItemId: projectItem?.projectItemId ?? item.id,
      contextPath: qualifyProjectPath(projectRoot, item.path),
      contextTestPaths: item.existingTestPaths.map((testPath) => qualifyProjectPath(projectRoot, testPath))
    };
  });
}

function filterItems(items: NormalizedPlanItem[], itemId?: string): NormalizedPlanItem[] {
  if (itemId === undefined) return items;
  const selected = items.filter((item) => item.planItemId === itemId);
  if (selected.length === 0) throw new Error(`Unknown plan item id: ${itemId}`);
  return selected;
}

function toExecutionHint(item: NormalizedPlanItem): PlanExecutionHint {
  const includeBuildConfiguration = needsBuildConfiguration(item);
  const complexity = classifyComplexity(item, includeBuildConfiguration);
  const requiresRepositoryReasoning =
    item.action !== "defer" &&
    (complexity === "high" || includeBuildConfiguration);
  const parallelizable =
    item.action === "add-test" &&
    item.testLevel === "unit" &&
    complexity === "low" &&
    !includeBuildConfiguration;
  const recommendedAgentRole: RecommendedAgentRole = item.action === "defer"
    ? "review"
    : requiresRepositoryReasoning
      ? "repository-reasoning"
      : "implementation";
  const projectItem = "projectId" in item ? item as ProjectTestPlanItem & NormalizedPlanItem : undefined;

  return {
    planItemId: item.planItemId,
    action: item.action,
    target: item.target,
    path: item.contextPath,
    ...(projectItem ? {
      projectId: projectItem.projectId,
      projectRoot: projectItem.projectRoot,
      adapterId: projectItem.adapterId
    } : {}),
    complexity,
    contextScope: {
      mode: includeBuildConfiguration
        ? "project-boundary"
        : item.contextTestPaths.length > 0
          ? "target-and-tests"
          : "target-only",
      paths: [...new Set([item.contextPath, ...item.contextTestPaths])],
      includeBuildConfiguration,
      includeRepositoryInstructions: true
    },
    parallelizable,
    recommendedAgentRole,
    requiresRepositoryReasoning,
    reasons: executionReasons(item, complexity, includeBuildConfiguration, parallelizable)
  };
}

function needsBuildConfiguration(item: NormalizedPlanItem): boolean {
  return ["integration", "component", "ui"].includes(item.testLevel) ||
    item.sourceSignals.some((signal) => PROJECT_BOUNDARY_SIGNALS.has(signal));
}

function classifyComplexity(item: NormalizedPlanItem, includeBuildConfiguration: boolean): ExecutionComplexity {
  if (item.action === "defer") return "low";
  if (
    ["integration", "ui"].includes(item.testLevel) ||
    item.maintenanceCost >= 7 ||
    item.sourceSignals.some((signal) => HIGH_COMPLEXITY_SIGNALS.has(signal))
  ) return "high";
  if (
    item.action === "extend-test" ||
    item.testLevel === "component" ||
    item.maintenanceCost >= 4 ||
    includeBuildConfiguration
  ) return "medium";
  return "low";
}

function executionReasons(
  item: NormalizedPlanItem,
  complexity: ExecutionComplexity,
  includeBuildConfiguration: boolean,
  parallelizable: boolean
): string[] {
  const reasons = [];
  if (item.action === "defer") {
    reasons.push("The plan already defers direct test implementation; review the recommendation without generating or editing tests.");
  } else if (item.action === "extend-test") {
    reasons.push("Existing tests must be reviewed before extending coverage.");
  } else {
    reasons.push("The plan requests a new test for an independently identified source target.");
  }
  if (includeBuildConfiguration) {
    reasons.push("The test level or source signals cross a project or framework boundary, so build configuration and repository conventions are required.");
  }
  if (complexity === "high") {
    reasons.push("Execution, infrastructure, or maintenance signals make this a high-complexity implementation task.");
  }
  if (parallelizable) {
    reasons.push("The isolated unit-test target has no existing test file or project-boundary signal, so it can be assigned independently.");
  } else if (item.action !== "defer") {
    reasons.push("Keep this item serialized because it extends existing tests or depends on broader project context.");
  }
  return reasons;
}

function qualifyProjectPath(projectRoot: string | undefined, filePath: string): string {
  if (!projectRoot || projectRoot === ".") return filePath;
  return `${projectRoot.replace(/\/+$/g, "")}/${filePath.replace(/^\.?\//, "")}`;
}

function count(items: PlanExecutionHint[], predicate: (item: PlanExecutionHint) => boolean): number {
  return items.filter(predicate).length;
}
