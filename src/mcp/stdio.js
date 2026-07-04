#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { toJsonRpcErrorData } from "./errors.js";
import { toMcpToolResult } from "./responses.js";
import { callTool, mcpTools } from "./tool-definitions.js";

const TOOL_ERROR_CODE = -32000;

const server = new Server({
  name: "repo-test-architect",
  version: "0.1.0"
}, {
  capabilities: {
    tools: {}
  }
});

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: mcpTools
}));

server.setRequestHandler(CallToolRequestSchema, (request) => {
  try {
    return toMcpToolResult(callTool(request.params.name, request.params.arguments ?? {}));
  } catch (error) {
    throw toMcpError(error);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

function toMcpError(error) {
  return new McpError(
    TOOL_ERROR_CODE,
    error instanceof Error ? error.message : String(error),
    toJsonRpcErrorData(error)
  );
}
