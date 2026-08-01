#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const adapterCoverageCases = [
  {
    adapterId: "csharp",
    sourcePath: "src/adapters/csharp/audit.js",
    testPath: "test/csharp-audit.test.js",
    thresholds: { lines: 94, branches: 88, functions: 95 }
  },
  {
    adapterId: "javascript",
    sourcePath: "src/adapters/javascript/audit.js",
    testPath: "test/javascript-audit.test.js",
    thresholds: { lines: 94, branches: 87, functions: 95 }
  },
  {
    adapterId: "go",
    sourcePath: "src/adapters/go/audit.js",
    testPath: "test/go-audit.test.js",
    thresholds: { lines: 95, branches: 90, functions: 95 }
  },
  {
    adapterId: "php",
    sourcePath: "src/adapters/php/audit.js",
    testPath: "test/php-audit.test.js",
    thresholds: { lines: 88, branches: 78, functions: 88 }
  },
  {
    adapterId: "python",
    sourcePath: "src/adapters/python/audit.js",
    testPath: "test/python-audit.test.js",
    thresholds: { lines: 95, branches: 85, functions: 95 }
  },
  {
    adapterId: "rust",
    sourcePath: "src/adapters/rust/audit.js",
    testPath: "test/rust-audit.test.js",
    thresholds: { lines: 95, branches: 88, functions: 97 }
  },
  {
    adapterId: "ruby",
    sourcePath: "src/adapters/ruby/audit.js",
    testPath: "test/ruby-audit.test.js",
    thresholds: { lines: 90, branches: 80, functions: 90 }
  },
  {
    adapterId: "kotlin",
    sourcePath: "src/adapters/kotlin/audit.js",
    testPath: "test/kotlin-audit.test.js",
    thresholds: { lines: 94, branches: 92, functions: 97 }
  },
  {
    adapterId: "swift",
    sourcePath: "src/adapters/swift/audit.js",
    testPath: "test/swift-audit.test.js",
    thresholds: { lines: 96, branches: 92, functions: 98 }
  }
];

if (isMainModule()) {
  runAdapterCoverageCheck();
}

export function runAdapterCoverageCheck() {
  const failures = [];

  for (const coverageCase of adapterCoverageCases) {
    const result = spawnSync(
      process.execPath,
      ["--experimental-test-coverage", "--test", coverageCase.testPath],
      {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024
      }
    );

    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      failures.push(`${coverageCase.adapterId}: adapter tests exited with status ${result.status}.`);
      continue;
    }

    let coverage;
    try {
      coverage = parseAdapterCoverage(result.stdout, coverageCase.sourcePath);
    } catch (error) {
      failures.push(`${coverageCase.adapterId}: ${error.message}`);
      continue;
    }

    const caseFailures = coverageThresholdFailures(
      coverageCase.adapterId,
      coverage,
      coverageCase.thresholds
    );
    failures.push(...caseFailures);

    console.log(
      `${coverageCase.adapterId}: lines ${formatPercent(coverage.lines)}, ` +
      `branches ${formatPercent(coverage.branches)}, functions ${formatPercent(coverage.functions)}`
    );
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
    return false;
  }

  console.log("Adapter coverage check passed.");
  return true;
}

export function parseAdapterCoverage(output, sourcePath) {
  const normalizedSourcePath = normalizeCoveragePath(sourcePath);
  const hierarchy = [];

  for (const line of output.split(/\r?\n/)) {
    const reportLine = line.replace(/^\s*(?:#|ℹ)\s?/u, "");
    const rawFields = reportLine.split("|");
    if (rawFields.length < 4) continue;

    const rawLabel = rawFields[0].replace(/\s+$/, "");
    const label = rawLabel.trimStart();
    const fields = rawFields.map((field) => field.trim());
    const indent = rawLabel.length - label.length;
    const hasMetrics = fields.slice(1, 4).some(Boolean);

    if (!hasMetrics && label && !label.startsWith("-")) {
      hierarchy[indent] = label;
      hierarchy.length = indent + 1;
      continue;
    }

    const hierarchicalPath = [...hierarchy.slice(0, indent), label].join("/");
    const reportedPath = normalizeCoveragePath(label.includes("/") || label.includes("\\") ? label : hierarchicalPath);
    if (reportedPath !== normalizedSourcePath) continue;

    const coverage = {
      lines: Number(fields[1]),
      branches: Number(fields[2]),
      functions: Number(fields[3])
    };
    if (Object.values(coverage).some((value) => !Number.isFinite(value))) {
      throw new Error(`Coverage report for ${sourcePath} contains invalid metrics.`);
    }
    return coverage;
  }

  throw new Error(`Coverage report does not contain ${sourcePath}.`);
}

export function coverageThresholdFailures(adapterId, coverage, thresholds) {
  const failures = [];
  for (const metric of ["lines", "branches", "functions"]) {
    if (coverage[metric] < thresholds[metric]) {
      failures.push(
        `${adapterId}: ${metric} coverage ${formatPercent(coverage[metric])} ` +
        `is below the ${formatPercent(thresholds[metric])} minimum.`
      );
    }
  }
  return failures;
}

function normalizeCoveragePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function formatPercent(value) {
  return `${Number(value).toFixed(2)}%`;
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
