import { toMcpToolResult } from "./responses.js";
import { callTool, mcpTools } from "./tool-definitions.js";
import { toJsonRpcErrorData } from "./errors.js";

export function handleJsonRpcMessage(message) {
  if (!Array.isArray(message)) {
    return handleJsonRpcRequest(message);
  }

  if (message.length === 0) {
    return errorResponse(undefined, -32600, "Invalid Request");
  }

  const responses = message
    .map((request) => handleJsonRpcRequest(request))
    .filter(Boolean);

  return responses.length > 0 ? responses : undefined;
}

export function handleJsonRpcRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return errorResponse(undefined, -32600, "Invalid Request");
  }

  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return errorResponse(request.id, -32600, "Invalid Request");
  }

  try {
    if (request.method === "initialize") {
      return successResponse(request.id, {
        protocolVersion: request.params?.protocolVersion ?? "local-dev",
        serverInfo: {
          name: "repo-test-architect",
          version: "0.1.0"
        },
        capabilities: {
          tools: {}
        }
      });
    }

    if (request.method === "tools/list") {
      return successResponse(request.id, { tools: mcpTools });
    }

    if (request.method === "tools/call") {
      const params = request.params ?? {};
      const result = toMcpToolResult(callTool(params.name, params.arguments ?? {}));
      return successResponse(request.id, result);
    }

    if (request.id === undefined) return undefined;
    return errorResponse(request.id, -32601, `Method not found: ${request.method}`);
  } catch (error) {
    if (request.id === undefined) return undefined;
    return errorResponse(request.id, -32000, error.message, toJsonRpcErrorData(error));
  }
}

function successResponse(id, result) {
  if (id === undefined) return undefined;

  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function errorResponse(id, code, message, data) {
  const response = {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message
    }
  };

  if (data) response.error.data = data;

  return response;
}
