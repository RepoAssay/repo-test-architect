#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { auditElixirRepo } from "../src/adapters/elixir/audit.js";

export const elixirPerformanceFixture = {
  sourceCount: 400,
  testCount: 200,
  expectedCoveredCount: 200,
  expectedUntestedCount: 200,
  expectedEvidenceRelationshipCount: 200,
  maxAuditDurationMs: 5000
};

if (isMainModule()) runElixirPerformanceCheck();

export function runElixirPerformanceCheck() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-elixir-performance-"));
  try {
    writeFixture(root);
    const started = performance.now();
    const audit = auditElixirRepo(root);
    const observations = {
      auditDurationMs: Math.round(performance.now() - started),
      coveredCount: audit.coveredButRisky.length,
      untestedCount: audit.untestedCandidates.length,
      evidenceRelationshipCount: audit.coveredButRisky.reduce(
        (total, target) => total + (target.existingTestEvidence?.length ?? 0), 0
      )
    };
    const errors = validateElixirPerformanceObservations(observations);
    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
      return observations;
    }
    console.log(
      `Elixir performance check passed: ${observations.auditDurationMs} ms, ` +
      `${observations.coveredCount} covered, ${observations.untestedCount} untested, ` +
      `${observations.evidenceRelationshipCount} evidence relationships.`
    );
    return observations;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeFixture(root) {
  fs.mkdirSync(path.join(root, "lib", "perf"), { recursive: true });
  fs.mkdirSync(path.join(root, "test", "perf"), { recursive: true });
  fs.writeFileSync(path.join(root, "mix.exs"), `defmodule Perf.MixProject do
  use Mix.Project
  def project, do: [app: :perf, version: "0.1.0", deps: []]
end
`);
  fs.writeFileSync(path.join(root, "test", "test_helper.exs"), "ExUnit.start()\n");
  for (let index = 0; index < elixirPerformanceFixture.sourceCount; index += 1) {
    fs.writeFileSync(path.join(root, "lib", "perf", `feature_${index}.ex`),
      `defmodule Perf.Feature${index} do\n  def transform(value), do: value + ${index}\nend\n`);
  }
  for (let index = 0; index < elixirPerformanceFixture.testCount; index += 1) {
    fs.writeFileSync(path.join(root, "test", "perf", `feature_${index}_test.exs`),
      `defmodule Perf.Feature${index}Test do\n  use ExUnit.Case\n  alias Perf.Feature${index}\n` +
      `  test "transforms" do\n    assert Feature${index}.transform(0) == ${index}\n  end\nend\n`);
  }
}

export function validateElixirPerformanceObservations(observations) {
  const errors = [];
  const expected = elixirPerformanceFixture;
  if (observations.coveredCount !== expected.expectedCoveredCount) {
    errors.push(`Expected ${expected.expectedCoveredCount} covered Elixir targets, got ${observations.coveredCount}.`);
  }
  if (observations.untestedCount !== expected.expectedUntestedCount) {
    errors.push(`Expected ${expected.expectedUntestedCount} untested Elixir targets, got ${observations.untestedCount}.`);
  }
  if (observations.evidenceRelationshipCount !== expected.expectedEvidenceRelationshipCount) {
    errors.push(`Expected ${expected.expectedEvidenceRelationshipCount} Elixir evidence relationships, got ${observations.evidenceRelationshipCount}.`);
  }
  if (observations.auditDurationMs > expected.maxAuditDurationMs) {
    errors.push(`Elixir audit took ${observations.auditDurationMs} ms; the deterministic fixture budget is ${expected.maxAuditDurationMs} ms.`);
  }
  return errors;
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
