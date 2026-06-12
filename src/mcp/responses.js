export function toMcpToolResult(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

export function fromMcpToolResult(result) {
  const text = result?.content?.[0]?.text;

  if (typeof text !== "string") {
    throw new Error("MCP tool result is missing text content.");
  }

  return JSON.parse(text);
}
