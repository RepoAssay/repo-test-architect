export const validationScorecardAreas = Object.freeze([
  "detection",
  "ownership",
  "command",
  "evidence",
  "ranking",
  "stability",
  "performance"
]);

const scoreStatuses = new Set(["pass", "fail", "pending"]);

export function createValidationScorecard(corpus) {
  if (corpus?.schemaVersion !== "validation-corpus/v1") {
    throw new Error("Validation scorecards require a validation-corpus/v1 artifact.");
  }
  if (!Array.isArray(corpus.adapters)) {
    throw new Error("Validation scorecards require an adapters array.");
  }

  const adapters = corpus.adapters.map((adapter) => createAdapterScorecard(adapter));
  const cases = adapters.flatMap((adapter) => adapter.cases);

  return {
    schemaVersion: "validation-scorecard/v1",
    source: {
      schemaVersion: corpus.schemaVersion
    },
    summary: summarizeCases(cases),
    adapters
  };
}

export function renderValidationScorecardMarkdown(scorecard) {
  if (scorecard?.schemaVersion !== "validation-scorecard/v1") {
    throw new Error("Markdown rendering requires a validation-scorecard/v1 artifact.");
  }

  const lines = [
    "# Validation Corpus Scorecard",
    "",
    "This reports validation review status, not repository quality.",
    "",
    "## Overall",
    "",
    ...renderSummary(scorecard.summary),
    ""
  ];

  for (const adapter of scorecard.adapters) {
    lines.push(
      `## ${formatAdapterLabel(adapter.adapterId)}`,
      "",
      ...renderSummary(adapter.summary),
      "",
      `| Case | Review completeness | Reviewed pass rate | ${validationScorecardAreas.map(formatLabel).join(" | ")} |`,
      `| --- | ---: | ---: | ${validationScorecardAreas.map(() => "---").join(" | ")} |`
    );

    for (const entry of adapter.cases) {
      const states = entry.areas.map((area) => area.status.toUpperCase()).join(" | ");
      lines.push(
        `| [${entry.id}](${entry.reportPath}) | ${formatReviewCompleteness(entry.summary.reviewCompleteness)} | ${formatReviewedPassRate(entry.summary.reviewedPassRate)} | ${states} |`
      );
    }
    lines.push("");
  }

  lines.push(
    "`PENDING` areas are not included in the reviewed pass-rate denominator. A partially reviewed case can therefore have a 100% reviewed pass rate without being 100% reviewed."
  );

  return lines.join("\n");
}

function createAdapterScorecard(adapter) {
  if (typeof adapter?.adapterId !== "string" || adapter.adapterId.length === 0) {
    throw new Error("Every validation scorecard adapter requires an adapterId.");
  }
  if (!Array.isArray(adapter.cases)) {
    throw new Error(`Validation scorecard adapter ${adapter.adapterId} requires a cases array.`);
  }

  const cases = adapter.cases.map((entry) => createCaseScorecard(adapter.adapterId, entry));
  return {
    adapterId: adapter.adapterId,
    summary: summarizeCases(cases),
    cases
  };
}

function createCaseScorecard(adapterId, entry) {
  if (typeof entry?.id !== "string" || entry.id.length === 0) {
    throw new Error(`Validation scorecard adapter ${adapterId} contains a case without an id.`);
  }

  const areas = validationScorecardAreas.map((area) => {
    const status = entry.scorecard?.[area];
    if (!scoreStatuses.has(status)) {
      throw new Error(`${entry.id} scorecard.${area} must be pass, fail, or pending.`);
    }
    return { area, status };
  });

  return {
    id: entry.id,
    role: entry.role,
    repository: {
      url: entry.repository?.url,
      commit: entry.repository?.commit,
      projectRoot: entry.repository?.projectRoot
    },
    reportPath: entry.reportPath,
    summary: summarizeAreas(areas),
    areas
  };
}

function summarizeCases(cases) {
  const areas = cases.flatMap((entry) => entry.areas);
  return {
    caseCount: cases.length,
    ...summarizeAreas(areas)
  };
}

function summarizeAreas(areas) {
  const states = { pass: 0, fail: 0, pending: 0 };
  for (const area of areas) states[area.status] += 1;
  const reviewedAreas = states.pass + states.fail;

  return {
    reviewCompleteness: {
      reviewedAreas,
      totalAreas: areas.length
    },
    reviewedPassRate: {
      passedAreas: states.pass,
      reviewedAreas
    },
    states
  };
}

function renderSummary(summary) {
  return [
    `- Review completeness: ${formatReviewCompleteness(summary.reviewCompleteness)}`,
    `- Reviewed pass rate: ${formatReviewedPassRate(summary.reviewedPassRate)}`,
    `- Area states: ${summary.states.pass} pass, ${summary.states.fail} fail, ${summary.states.pending} pending`
  ];
}

function formatReviewCompleteness(review) {
  return `${review.reviewedAreas}/${review.totalAreas} areas reviewed (${formatPercent(review.reviewedAreas, review.totalAreas)})`;
}

function formatReviewedPassRate(passRate) {
  if (passRate.reviewedAreas === 0) return "not available (0 reviewed areas)";
  return `${passRate.passedAreas}/${passRate.reviewedAreas} reviewed checks pass (${formatPercent(passRate.passedAreas, passRate.reviewedAreas)})`;
}

function formatPercent(numerator, denominator) {
  if (denominator === 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatLabel(value) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAdapterLabel(adapterId) {
  return {
    javascript: "JavaScript/TypeScript",
    kotlin: "Kotlin/JVM",
    python: "Python",
    swift: "Swift"
  }[adapterId] ?? formatLabel(adapterId);
}
