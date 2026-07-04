export const mcpToolErrorKinds = [
  "unknown-tool",
  "invalid-arguments",
  "missing-required-argument",
  "unsupported-argument"
];

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
