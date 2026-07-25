#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { performance } from "node:perf_hooks";
import {
  createDiagnosticRecorderFromEnv,
  createErrorFingerprint
} from "../diagnostics/diagnostics.js";
import { toSafeMcpError } from "./errors.js";
import { toMcpToolResult } from "./responses.js";
import { mcpServerInfo, mcpServerInstructions } from "./server-info.js";
import { callTool, mcpTools } from "./tool-definitions.js";

const diagnostics = createDiagnosticRecorderFromEnv();

const server = new Server(mcpServerInfo, {
  capabilities: {
    tools: {}
  },
  instructions: mcpServerInstructions
});

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: mcpTools
}));

server.setRequestHandler(CallToolRequestSchema, (request) => {
  const startedAt = performance.now();

  try {
    const result = toMcpToolResult(callTool(request.params.name, request.params.arguments ?? {}));
    diagnostics.recordToolCall({
      toolName: request.params.name,
      status: "success",
      durationMs: performance.now() - startedAt
    });
    return result;
  } catch (error) {
    const safeError = toSafeMcpError(error);
    diagnostics.recordToolCall({
      toolName: request.params.name,
      status: "error",
      durationMs: performance.now() - startedAt,
      errorKind: safeError.data.kind,
      reportId: safeError.data.reportId,
      errorFingerprint: safeError.data.kind === "internal-error" ? createErrorFingerprint(error) : undefined
    });
    throw new McpError(safeError.code, safeError.message, safeError.data);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
