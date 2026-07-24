import { randomUUID } from "node:crypto";

export const mcpToolErrorKinds = [
  "internal-error",
  "unknown-tool",
  "invalid-arguments",
  "missing-required-argument",
  "unsupported-argument"
];

export const INTERNAL_ERROR_CODE = -32603;
export const TOOL_ERROR_CODE = -32000;

export class McpToolError extends Error {
  constructor(kind, message, details = {}) {
    super(message);
    this.name = "McpToolError";
    this.kind = kind;
    this.details = details;
  }
}

export function toJsonRpcErrorData(error) {
  if (error instanceof McpToolError) {
    return {
      ...error.details,
      kind: error.kind
    };
  }

  return undefined;
}

export function toSafeMcpError(error, {
  createReportId = () => `report-${randomUUID()}`
} = {}) {
  if (error instanceof McpToolError) {
    return {
      code: TOOL_ERROR_CODE,
      message: error.message,
      data: toJsonRpcErrorData(error)
    };
  }

  return {
    code: INTERNAL_ERROR_CODE,
    message: "Internal server error.",
    data: {
      kind: "internal-error",
      reportId: createReportId()
    }
  };
}
