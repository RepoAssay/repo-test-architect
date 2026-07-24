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

/**
 * @typedef {"low" | "medium" | "high"} ExecutionComplexity
 * @typedef {"implementation" | "repository-reasoning" | "review"} RecommendedAgentRole
 * @typedef {"target-only" | "target-and-tests" | "project-boundary"} ContextScopeMode
 *
 * @typedef {object} PlanExecutionHint
 * @property {string} planItemId
 * @property {string} action
 * @property {string} target
 * @property {string} path
 * @property {string} [projectId]
 * @property {string} [projectRoot]
 * @property {string} [adapterId]
 * @property {ExecutionComplexity} complexity
 * @property {{ mode: ContextScopeMode, paths: string[], includeBuildConfiguration: boolean, includeRepositoryInstructions: boolean }} contextScope
 * @property {boolean} parallelizable
 * @property {RecommendedAgentRole} recommendedAgentRole
 * @property {boolean} requiresRepositoryReasoning
 * @property {string[]} reasons
 *
 * @typedef {object} PlanExecutionHints
 * @property {"plan-execution-hints/v1"} schemaVersion
 * @property {{ schemaVersion: "plan/v1" | "project-test-plan/v1", itemCount: number, root?: string }} source
 * @property {{ itemCount: number, lowComplexityCount: number, mediumComplexityCount: number, highComplexityCount: number, parallelizableCount: number, repositoryReasoningCount: number }} summary
 * @property {PlanExecutionHint[]} items
 */

/**
 * @param {object} plan
 * @param {{ itemId?: string }} [options]
 * @returns {PlanExecutionHints}
 */
export function createPlanExecutionHints(plan, options = {}) {
  validateSupportedPlan(plan);
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

function validateSupportedPlan(plan) {
  if (!["plan/v1", "project-test-plan/v1"].includes(plan?.schemaVersion)) {
    throw new Error("Expected plan schemaVersion plan/v1 or project-test-plan/v1.");
  }
  if (!Array.isArray(plan.items)) {
    throw new Error("Plan items must be an array.");
  }
  if (plan.schemaVersion === "project-test-plan/v1" && (typeof plan.root !== "string" || plan.root.length === 0)) {
    throw new Error("Project plan root must be a non-empty string.");
  }
}

function normalizePlanItems(plan) {
  return plan.items.map((item) => {
    validatePlanItem(item, plan.schemaVersion);
    const projectRoot = plan.schemaVersion === "project-test-plan/v1" ? item.projectRoot : undefined;

    return {
      ...item,
      planItemId: plan.schemaVersion === "project-test-plan/v1" ? item.projectItemId : item.id,
      contextPath: qualifyProjectPath(projectRoot, item.path),
      contextTestPaths: item.existingTestPaths.map((testPath) => qualifyProjectPath(projectRoot, testPath))
    };
  });
}

function validatePlanItem(item, schemaVersion) {
  const requiredStrings = ["id", "action", "target", "path", "testLevel"];
  if (schemaVersion === "project-test-plan/v1") {
    requiredStrings.push("projectId", "projectRoot", "adapterId", "projectItemId");
  }
  for (const key of requiredStrings) {
    if (typeof item?.[key] !== "string" || item[key].length === 0) {
      throw new Error(`Plan item ${key} must be a non-empty string.`);
    }
  }
  if (!["add-test", "extend-test", "defer"].includes(item.action)) {
    throw new Error("Plan item action must be add-test, extend-test, or defer.");
  }
  if (!["unit", "integration", "component", "ui", "none"].includes(item.testLevel)) {
    throw new Error("Plan item testLevel must be unit, integration, component, ui, or none.");
  }
  if (!Number.isInteger(item.maintenanceCost) || item.maintenanceCost < 0 || item.maintenanceCost > 10) {
    throw new Error("Plan item maintenanceCost must be an integer from 0 to 10.");
  }
  if (!Array.isArray(item.sourceSignals) || item.sourceSignals.some((signal) => typeof signal !== "string")) {
    throw new Error("Plan item sourceSignals must be an array of strings.");
  }
  if (!Array.isArray(item.existingTestPaths) || item.existingTestPaths.some((testPath) => typeof testPath !== "string")) {
    throw new Error("Plan item existingTestPaths must be an array of strings.");
  }
}

function filterItems(items, itemId) {
  if (itemId === undefined) return items;
  if (typeof itemId !== "string" || itemId.length === 0) {
    throw new Error("itemId must be a non-empty string.");
  }
  const selected = items.filter((item) => item.planItemId === itemId);
  if (selected.length === 0) {
    throw new Error(`Unknown plan item id: ${itemId}`);
  }
  return selected;
}

function toExecutionHint(item) {
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
  const recommendedAgentRole = item.action === "defer"
    ? "review"
    : requiresRepositoryReasoning
      ? "repository-reasoning"
      : "implementation";
  const contextPaths = [...new Set([item.contextPath, ...item.contextTestPaths])];
  const contextMode = includeBuildConfiguration
    ? "project-boundary"
    : item.contextTestPaths.length > 0
      ? "target-and-tests"
      : "target-only";

  return {
    planItemId: item.planItemId,
    action: item.action,
    target: item.target,
    path: item.contextPath,
    ...(item.projectId ? {
      projectId: item.projectId,
      projectRoot: item.projectRoot,
      adapterId: item.adapterId
    } : {}),
    complexity,
    contextScope: {
      mode: contextMode,
      paths: contextPaths,
      includeBuildConfiguration,
      includeRepositoryInstructions: true
    },
    parallelizable,
    recommendedAgentRole,
    requiresRepositoryReasoning,
    reasons: executionReasons(item, complexity, includeBuildConfiguration, parallelizable)
  };
}

function needsBuildConfiguration(item) {
  return ["integration", "component", "ui"].includes(item.testLevel) ||
    item.sourceSignals.some((signal) => PROJECT_BOUNDARY_SIGNALS.has(signal));
}

function classifyComplexity(item, includeBuildConfiguration) {
  if (item.action === "defer") return "low";
  if (
    ["integration", "ui"].includes(item.testLevel) ||
    item.maintenanceCost >= 7 ||
    item.sourceSignals.some((signal) => HIGH_COMPLEXITY_SIGNALS.has(signal))
  ) {
    return "high";
  }
  if (
    item.action === "extend-test" ||
    item.testLevel === "component" ||
    item.maintenanceCost >= 4 ||
    includeBuildConfiguration
  ) {
    return "medium";
  }
  return "low";
}

function executionReasons(item, complexity, includeBuildConfiguration, parallelizable) {
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

function qualifyProjectPath(projectRoot, filePath) {
  if (!projectRoot || projectRoot === ".") return filePath;
  return `${projectRoot.replace(/\/+$/g, "")}/${filePath.replace(/^\.?\//, "")}`;
}

function count(items, predicate) {
  return items.filter(predicate).length;
}
