#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { callTool, mcpTools } from "./tool-definitions.js";
import { toMcpToolResult } from "./responses.js";

const [command, toolName, argsJson = "{}"] = process.argv.slice(2);

try {
  if (command === "tools") {
    writeJson({ tools: mcpTools });
  } else if (command === "call") {
    writeJson(callTool(requireToolName(toolName), parseArgsJson(argsJson)));
  } else if (command === "call-envelope") {
    writeJson(toMcpToolResult(callTool(requireToolName(toolName), parseArgsJson(argsJson))));
  } else {
    throw new Error("Usage: repo-test-architect-mcp <tools|call|call-envelope toolName argsJson|@args.json>");
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function requireToolName(value) {
  if (!value) {
    throw new Error("Tool name is required.");
  }

  return value;
}

function parseArgsJson(value) {
  const json = value.startsWith("@") ? readArgsFile(value.slice(1)) : value;

  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid tool args JSON: ${error.message}`);
  }
}

function readArgsFile(filePath) {
  if (!filePath) {
    throw new Error("Tool args file path is required after @.");
  }

  return fs.readFileSync(path.resolve(filePath), "utf8");
}

function writeJson(value) {
  console.log(JSON.stringify(value, null, 2));
}
