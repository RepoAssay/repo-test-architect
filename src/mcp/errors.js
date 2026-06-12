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
      kind: error.kind,
      ...error.details
    };
  }

  return undefined;
}
