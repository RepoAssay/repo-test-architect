export function toMcpToolResult(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
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
