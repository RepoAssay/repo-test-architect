#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createValidationScorecard,
  renderValidationScorecardMarkdown
} from "../src/core/validation-scorecard.js";

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(renderHelp());
    } else {
      const corpus = JSON.parse(fs.readFileSync(path.resolve(options.manifestPath), "utf8"));
      const scorecard = createValidationScorecard(corpus);
      console.log(options.format === "json"
        ? JSON.stringify(scorecard, null, 2)
        : renderValidationScorecardMarkdown(scorecard));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export function parseArgs(args) {
  let format = "markdown";
  let manifestPath = "evals/validation-corpus.json";
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--format") {
      format = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--format=")) {
      format = arg.slice("--format=".length);
      continue;
    }
    if (arg === "--manifest") {
      manifestPath = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--manifest=")) {
      manifestPath = arg.slice("--manifest=".length);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    throw new Error(`Unknown scorecard option: ${arg}`);
  }

  if (!new Set(["markdown", "json"]).has(format)) {
    throw new Error(`Unsupported scorecard format: ${format}`);
  }
  if (manifestPath.length === 0) {
    throw new Error("--manifest requires a file path.");
  }

  return { format, manifestPath, help };
}

function renderHelp() {
  return [
    "Usage: npm run corpus:scorecard -- [options]",
    "",
    "Render review completeness and reviewed pass rate as separate measures.",
    "",
    "Options:",
    "  --format markdown|json   Select human or machine-readable output",
    "  --manifest file          Read a validation-corpus/v1 manifest",
    "  -h, --help               Show this help"
  ].join("\n");
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
