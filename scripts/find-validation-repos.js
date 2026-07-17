#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const validationProfiles = {
  react: {
    description: "React projects with React Testing Library",
    repositoryQuery: "react",
    language: "TypeScript",
    searches: [
      { signal: "react-testing-library", file: "package.json", pattern: /"@testing-library\/react"/ }
    ]
  },
  workspace: {
    description: "JavaScript/TypeScript workspaces and monorepos",
    repositoryQuery: "monorepo",
    language: "TypeScript",
    searches: [
      { signal: "package-workspaces", file: "package.json", pattern: /"workspaces"\s*:/ },
      { signal: "pnpm-workspace", file: "pnpm-workspace.yaml", pattern: /^\s*packages\s*:/m }
    ]
  },
  swift: {
    description: "Swift Package Manager projects",
    repositoryQuery: '"swift package"',
    language: "Swift",
    searches: [
      { signal: "swift-package", file: "Package.swift", pattern: /swift-tools-version/ }
    ]
  },
  gradle: {
    description: "Kotlin/JVM projects with a root Gradle build",
    repositoryQuery: "gradle",
    language: "Kotlin",
    searches: [
      { signal: "gradle-build", file: "build.gradle", pattern: /(?:plugins|dependencies|apply\s+plugin)/i },
      { signal: "gradle-kotlin-build", file: "build.gradle.kts", pattern: /(?:plugins|dependencies)/i }
    ]
  },
  maven: {
    description: "Java/JVM projects with a root Maven build",
    repositoryQuery: "maven",
    language: "Java",
    searches: [
      { signal: "maven-project", file: "pom.xml", pattern: /<project[\s>]/i }
    ]
  }
};

const lockfileNames = new Set([
  "Package.resolved",
  "bun.lock",
  "bun.lockb",
  "gradle.lockfile",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock"
]);

const rootCiNames = new Set([".circleci", ".gitlab-ci.yml", "azure-pipelines.yml", "bitbucket-pipelines.yml"]);
const metadataFields = [
  "fullName",
  "url",
  "isArchived",
  "isFork",
  "isPrivate",
  "stargazersCount",
  "pushedAt",
  "size",
  "language",
  "license",
  "defaultBranch"
].join(",");

if (isMainModule()) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(`Validation repository search failed: ${error.message}`);
    process.exitCode = 1;
  }
}

export async function main(args, dependencies = {}) {
  const options = parseArgs(args);
  const run = dependencies.run ?? runGh;
  const now = dependencies.now ?? new Date();

  if (options.help) {
    console.log(renderHelp());
    return [];
  }

  if (options.listProfiles) {
    console.log(renderProfiles());
    return [];
  }

  run(["--version"]);
  run(["auth", "status"]);

  const candidates = discoverCandidates(options, run).filter((candidate) => candidateMatchesFilters(candidate, options));
  const ranked = rankCandidates(candidates, now).slice(0, options.limit);
  console.log(options.format === "json" ? JSON.stringify(ranked, null, 2) : renderTable(ranked, options));
  return ranked;
}

export function parseArgs(args, now = new Date()) {
  const options = {
    profiles: ["react"],
    limit: 15,
    searchLimit: 25,
    minStars: 50,
    maxSizeMb: 500,
    pushedSince: oneYearAgo(now),
    includeForks: false,
    format: "table",
    help: false,
    listProfiles: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const [name, inlineValue] = arg.split(/=(.*)/s, 2);
    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
      index += 1;
      return value;
    };

    if (name === "--profile") options.profiles = readValue().split(",").filter(Boolean);
    else if (name === "--limit") options.limit = parsePositiveInteger(name, readValue());
    else if (name === "--search-limit") options.searchLimit = parsePositiveInteger(name, readValue());
    else if (name === "--min-stars") options.minStars = parseNonNegativeInteger(name, readValue());
    else if (name === "--max-size-mb") options.maxSizeMb = parsePositiveInteger(name, readValue());
    else if (name === "--pushed-since") options.pushedSince = parseDate(name, readValue());
    else if (name === "--format") options.format = readValue();
    else if (name === "--include-forks") options.includeForks = true;
    else if (name === "--list-profiles") options.listProfiles = true;
    else if (name === "--help" || name === "-h") options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (options.profiles.includes("all")) options.profiles = Object.keys(validationProfiles);
  for (const profile of options.profiles) {
    if (!validationProfiles[profile]) throw new Error(`Unknown profile: ${profile}.`);
  }
  if (!new Set(["table", "json"]).has(options.format)) throw new Error("--format must be table or json.");

  return options;
}

export function detectManifestSignals(searches, contentsByName) {
  const signals = [];
  const matchedPaths = [];
  for (const search of searches) {
    const content = contentsByName[search.file];
    if (content !== undefined && search.pattern.test(content)) {
      signals.push(search.signal);
      matchedPaths.push(search.file);
    }
  }
  return { signals, matchedPaths };
}

export function inspectRootEntries(entries, workflowEntries = []) {
  const names = new Set(entries.map((entry) => entry.name));
  const lockfiles = [...names].filter((name) => lockfileNames.has(name)).sort();
  const hasCi = workflowEntries.length > 0 || [...names].some((name) => rootCiNames.has(name));
  return { hasCi, lockfiles };
}

export function scoreCandidate(candidate, now = new Date()) {
  let score = Math.min(40, candidate.signals.length * 20);
  score += Math.min(20, Math.log10((candidate.stars ?? 0) + 1) * 5);

  const ageDays = Math.max(0, (now.getTime() - new Date(candidate.pushedAt).getTime()) / 86_400_000);
  if (ageDays <= 90) score += 20;
  else if (ageDays <= 365) score += 12;
  else if (ageDays <= 730) score += 5;

  if (candidate.sizeMb <= 100) score += 10;
  else if (candidate.sizeMb <= 500) score += 5;
  else score -= 10;

  if (candidate.hasCi) score += 15;
  if (candidate.lockfiles?.length > 0) score += 10;
  if (candidate.license) score += 5;
  return Number(score.toFixed(1));
}

export function rankCandidates(candidates, now = new Date()) {
  return candidates
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, now) }))
    .sort((left, right) => right.score - left.score || right.stars - left.stars || left.repo.localeCompare(right.repo));
}

function discoverCandidates(options, run) {
  const candidates = new Map();
  for (const profile of options.profiles) {
    const definition = validationProfiles[profile];
    const args = [
      "search", "repos", definition.repositoryQuery,
      "--visibility", "public",
      "--language", definition.language,
      "--stars", `>=${options.minStars}`,
      "--updated", `>=${options.pushedSince}`,
      "--size", `<=${options.maxSizeMb * 1024}`,
      "--archived=false",
      "--include-forks", options.includeForks ? "true" : "false",
      "--sort", "stars",
      "--limit", String(options.searchLimit),
      "--json", metadataFields
    ];
    const repositories = JSON.parse(run(args));

    for (const metadata of repositories) {
      const existing = candidates.get(metadata.fullName);
      const candidate = existing ?? normalizeMetadata(metadata);
      const inspected = inspectRepositoryRoot(candidate.repo, definition.searches, run);
      if (inspected.signals.length === 0) continue;
      candidate.profiles = [...new Set([...candidate.profiles, profile])].sort();
      candidate.signals = [...new Set([...candidate.signals, ...inspected.signals])].sort();
      candidate.matchedPaths = [...new Set([...candidate.matchedPaths, ...inspected.matchedPaths])].sort();
      candidate.hasCi ||= inspected.hasCi;
      candidate.lockfiles = [...new Set([...candidate.lockfiles, ...inspected.lockfiles])].sort();
      candidates.set(candidate.repo, candidate);
    }
  }
  return [...candidates.values()];
}

function normalizeMetadata(metadata) {
  return {
    repo: metadata.fullName,
    url: metadata.url,
    profiles: [],
    signals: [],
    matchedPaths: [],
    stars: metadata.stargazersCount,
    pushedAt: metadata.pushedAt,
    sizeMb: Number(((metadata.size ?? 0) / 1024).toFixed(1)),
    language: metadata.language ?? null,
    license: metadata.license?.key ?? null,
    defaultBranch: metadata.defaultBranch ?? null,
    archived: metadata.isArchived,
    fork: metadata.isFork,
    private: metadata.isPrivate,
    hasCi: false,
    lockfiles: []
  };
}

function inspectRepositoryRoot(repo, searches, run) {
  try {
    const entries = JSON.parse(run(["api", `repos/${repo}/contents`]));
    const entryNames = new Set(entries.map((entry) => entry.name));
    const contentsByName = {};
    for (const file of new Set(searches.map((search) => search.file))) {
      if (!entryNames.has(file)) continue;
      try {
        contentsByName[file] = run([
          "api", `repos/${repo}/contents/${file}`,
          "-H", "Accept: application/vnd.github.raw+json"
        ]);
      } catch {
        // A malformed or oversized manifest should not abort the candidate search.
      }
    }
    const hasGitHubDirectory = entries.some((entry) => entry.name === ".github" && entry.type === "dir");
    let workflows = [];
    if (hasGitHubDirectory) {
      try {
        workflows = JSON.parse(run(["api", `repos/${repo}/contents/.github/workflows`]));
      } catch {
        workflows = [];
      }
    }
    return { ...inspectRootEntries(entries, workflows), ...detectManifestSignals(searches, contentsByName) };
  } catch {
    return { hasCi: false, lockfiles: [], signals: [], matchedPaths: [] };
  }
}

function candidateMatchesFilters(candidate, options) {
  if (candidate.private || candidate.archived || (!options.includeForks && candidate.fork)) return false;
  if (candidate.stars < options.minStars || candidate.sizeMb > options.maxSizeMb) return false;
  return candidate.pushedAt.slice(0, 10) >= options.pushedSince;
}

function renderTable(candidates, options) {
  if (candidates.length === 0) return "No validation repositories matched the filters.";
  const rows = candidates.map((candidate) => [
    candidate.score.toFixed(1),
    candidate.repo,
    String(candidate.stars),
    candidate.pushedAt.slice(0, 10),
    `${candidate.sizeMb} MB`,
    [...candidate.signals, ...(candidate.hasCi ? ["ci"] : []), ...candidate.lockfiles].join(",")
  ]);
  const headers = ["Score", "Repository", "Stars", "Pushed", "Size", "Signals"];
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index].length)));
  const line = (row) => row.map((cell, index) => cell.padEnd(widths[index])).join("  ").trimEnd();
  return [
    `Profiles: ${options.profiles.join(", ")} (public, active, >=${options.minStars} stars, <=${options.maxSizeMb} MB, pushed since ${options.pushedSince})`,
    "",
    line(headers),
    line(widths.map((width) => "-".repeat(width))),
    ...rows.map(line)
  ].join("\n");
}

function renderProfiles() {
  return Object.entries(validationProfiles)
    .map(([name, profile]) => `${name.padEnd(10)} ${profile.description}`)
    .join("\n");
}

function renderHelp() {
  return `Find and rank public repositories for real-world adapter validation.

Usage:
  npm run validation:repos -- [options]

Options:
  --profile <names>       Comma-separated profiles or all (default: react)
  --limit <number>        Results to print (default: 15)
  --search-limit <number> Repository hits per profile (default: 25)
  --min-stars <number>    Minimum stars (default: 50)
  --max-size-mb <number>  Maximum repository size (default: 500)
  --pushed-since <date>   Earliest push date (default: one year ago)
  --include-forks         Include forked repositories
  --format <table|json>   Output format (default: table)
  --list-profiles         List supported search profiles
  --help                  Show this help`;
}

function runGh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `gh ${args[0]} exited with status ${result.status}.`);
  return result.stdout;
}

function parsePositiveInteger(name, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function parseNonNegativeInteger(name, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer.`);
  return parsed;
}

function parseDate(name, value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${name} must use YYYY-MM-DD.`);
  }
  return value;
}

function oneYearAgo(now) {
  const date = new Date(now);
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
