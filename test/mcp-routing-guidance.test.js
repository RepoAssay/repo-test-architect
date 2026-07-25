import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mcpServerInstructions } from "../src/mcp/server-info.js";
import { mcpTools } from "../src/mcp/tool-definitions.js";

describe("MCP routing guidance", () => {
  it("makes the complete repository analysis the first and clearest entrypoint", () => {
    const analyze = mcpTools[0];

    assert.equal(analyze.name, "analyze_repository");
    assert.match(analyze.description, /Start here/i);
    assert.match(analyze.description, /unfamiliar repository/i);
    assert.match(analyze.description, /complete/i);
    assert.match(analyze.description, /Prefer this/i);
  });

  it("distinguishes focused artifact tools from repository scanning", () => {
    const auditRepo = mcpTools.find((tool) => tool.name === "audit_repo");
    const graph = mcpTools.find((tool) => tool.name === "get_audit_graph");
    const generation = mcpTools.find((tool) => tool.name === "generate_selected_test");

    assert.match(auditRepo.description, /explicitly selected/i);
    assert.match(auditRepo.description, /defaults to javascript/i);
    assert.match(auditRepo.description, /analyze_repository/i);
    assert.match(graph.description, /existing audit/i);
    assert.match(graph.description, /does not scan/i);
    assert.match(generation.description, /does not generate or write/i);
  });

  it("gives connected models stable server-level workflow instructions", () => {
    assert.match(mcpServerInstructions, /Start with analyze_repository/i);
    assert.match(mcpServerInstructions, /explicit audit coverage gaps/i);
    assert.match(mcpServerInstructions, /single project root/i);
    assert.match(mcpServerInstructions, /Do not reclassify/i);
    assert.match(mcpServerInstructions, /deferred/i);
  });
});
