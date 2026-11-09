import { McpToolError } from "./errors.js";

export const MAX_RESULT_CHARS_ENV = "REPO_TEST_ARCHITECT_MAX_RESULT_CHARS";
export const DEFAULT_MAX_RESULT_CHARS = 1_000_000;

/**
 * Resolve the serialized tool-result budget in characters.
 * `0` disables the guard. Missing or malformed values fall back to the default.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function resolveMaxResultChars(env = process.env) {
  const raw = env[MAX_RESULT_CHARS_ENV]?.trim();
  if (raw === undefined || raw === "" || !/^\d{1,9}$/.test(raw)) return DEFAULT_MAX_RESULT_CHARS;
  return Number(raw);
}

/**
 * Wrap an artifact as an MCP tool result: compact JSON text plus the same value as structuredContent.
 * Results whose serialized form exceeds the budget are rejected before they reach the transport, because
 * a single oversized stdio message can exhaust or crash MCP clients.
 *
 * @param {object} value
 * @param {{ toolName?: string, maxChars?: number }} [options]
 */
export function toMcpToolResult(value, { toolName, maxChars = resolveMaxResultChars() } = {}) {
  const text = JSON.stringify(value);

  if (maxChars > 0 && text.length > maxChars) {
    throw new McpToolError(
      "result-too-large",
      `Tool result is ${text.length} characters, above the ${maxChars}-character limit. ` +
        "Narrow the scan with excludeProjectRoots or changedPaths, request a smaller artifact, " +
        `or raise ${MAX_RESULT_CHARS_ENV}.`,
      { ...(toolName ? { toolName } : {}), resultChars: text.length, maxResultChars: maxChars }
    );
  }

  return {
    content: [
      {
        type: "text",
        text
      }
    ],
    structuredContent: value
  };
}

export function fromMcpToolResult(result) {
  if (result?.structuredContent && typeof result.structuredContent === "object" && !Array.isArray(result.structuredContent)) {
    return result.structuredContent;
  }

  const text = result?.content?.[0]?.text;

  if (typeof text !== "string") {
    throw new Error("MCP tool result is missing text content.");
  }

  return JSON.parse(text);
}
