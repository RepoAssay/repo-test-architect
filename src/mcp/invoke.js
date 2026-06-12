#!/usr/bin/env node
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
    throw new Error("Usage: repo-test-architect-mcp <tools|call|call-envelope toolName argsJson>");
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
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid tool args JSON: ${error.message}`);
  }
}

function writeJson(value) {
  console.log(JSON.stringify(value, null, 2));
}
