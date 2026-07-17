import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectManifestSignals,
  inspectRootEntries,
  parseArgs,
  rankCandidates,
  scoreCandidate,
  validationProfiles
} from "../scripts/find-validation-repos.js";

const now = new Date("2026-07-17T12:00:00Z");

describe("validation repository finder", () => {
  it("parses profiles and deterministic quality filters", () => {
    assert.deepEqual(parseArgs([
      "--profile", "react,workspace",
      "--limit=8",
      "--min-stars", "100",
      "--max-size-mb", "250",
      "--pushed-since", "2026-01-01",
      "--format", "json"
    ], now), {
      profiles: ["react", "workspace"],
      limit: 8,
      searchLimit: 25,
      minStars: 100,
      maxSizeMb: 250,
      pushedSince: "2026-01-01",
      includeForks: false,
      format: "json",
      help: false,
      listProfiles: false
    });
  });

  it("rejects unknown profiles and malformed values", () => {
    assert.throws(() => parseArgs(["--profile", "rust"], now), /Unknown profile/);
    assert.throws(() => parseArgs(["--limit", "0"], now), /positive integer/);
    assert.throws(() => parseArgs(["--pushed-since", "yesterday"], now), /YYYY-MM-DD/);
  });

  it("requires exact root manifests and their ecosystem markers", () => {
    const searches = [
      { signal: "react-testing-library", file: "package.json", pattern: /"@testing-library\/react"/ },
      { signal: "pnpm-workspace", file: "pnpm-workspace.yaml", pattern: /^\s*packages\s*:/m }
    ];

    assert.deepEqual(detectManifestSignals(searches, {
      "package.json": '{"devDependencies":{"@testing-library/react":"latest"}}',
      "package.json.md": '"@testing-library/react"',
      "pnpm-workspace.yaml": "packages:\n  - packages/*"
    }), {
      signals: ["react-testing-library", "pnpm-workspace"],
      matchedPaths: ["package.json", "pnpm-workspace.yaml"]
    });
  });

  it("defines browser and Bun validation profiles from exact package signals", () => {
    const packageJson = JSON.stringify({
      scripts: { test: "bun test" },
      devDependencies: { "@playwright/test": "latest", cypress: "latest" }
    });

    for (const [profile, expectedSignal] of [
      ["playwright", "playwright-test"],
      ["cypress", "cypress-test"],
      ["bun", "bun-test"]
    ]) {
      assert.deepEqual(detectManifestSignals(validationProfiles[profile].searches, { "package.json": packageJson }), {
        signals: [expectedSignal],
        matchedPaths: ["package.json"]
      });
    }
  });

  it("detects root lockfiles and CI configuration", () => {
    assert.deepEqual(inspectRootEntries([
      { name: ".github", type: "dir" },
      { name: "pnpm-lock.yaml", type: "file" },
      { name: "Package.resolved", type: "file" }
    ], [{ name: "test.yml", type: "file" }]), {
      hasCi: true,
      lockfiles: ["Package.resolved", "pnpm-lock.yaml"]
    });
  });

  it("rewards exact signals, maintenance, CI, lockfiles, and manageable size", () => {
    const strong = {
      signals: ["react-testing-library", "workspace"],
      stars: 5000,
      pushedAt: "2026-07-01T00:00:00Z",
      sizeMb: 80,
      hasCi: true,
      lockfiles: ["pnpm-lock.yaml"],
      license: "mit"
    };
    const weak = {
      signals: ["react-testing-library"],
      stars: 80,
      pushedAt: "2025-01-01T00:00:00Z",
      sizeMb: 700,
      hasCi: false,
      lockfiles: [],
      license: null
    };

    assert.ok(scoreCandidate(strong, now) > scoreCandidate(weak, now));
    assert.equal(rankCandidates([
      { repo: "weak/project", ...weak },
      { repo: "strong/project", ...strong }
    ], now)[0].repo, "strong/project");
  });
});
