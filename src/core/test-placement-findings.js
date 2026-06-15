const ALLOWED_ACTIONS = new Set(["move", "split", "keep"]);

export function createTestPlacementFindings(findings = []) {
  if (!Array.isArray(findings)) {
    throw new Error("Test placement findings must be an array.");
  }

  return {
    schemaVersion: "test-placement-findings/v1",
    findings: findings.map(normalizeFinding)
  };
}

function normalizeFinding(finding) {
  const normalized = {
    id: requireString(finding, "id"),
    testFile: requireString(finding, "testFile"),
    currentOwner: requireString(finding, "currentOwner"),
    suggestedOwner: requireString(finding, "suggestedOwner"),
    action: requireAction(finding?.action),
    reason: requireString(finding, "reason"),
    evidence: requireEvidence(finding?.evidence)
  };

  return normalized;
}

function requireString(value, key) {
  if (typeof value?.[key] !== "string" || value[key].length === 0) {
    throw new Error(`Test placement finding ${key} must be a non-empty string.`);
  }

  return value[key];
}

function requireAction(action) {
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error("Test placement finding action must be one of: move, split, keep.");
  }

  return action;
}

function requireEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new Error("Test placement finding evidence must be a non-empty array.");
  }

  for (const item of evidence) {
    if (typeof item !== "string" || item.length === 0) {
      throw new Error("Test placement finding evidence items must be non-empty strings.");
    }
  }

  return [...evidence];
}
