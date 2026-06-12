import fs from "node:fs";
import path from "node:path";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";
import { createTestPlan } from "../src/core/test-plan.js";
import { mcpTools } from "../src/mcp/tool-definitions.js";
import { loadEvalFixtures } from "../test/support/eval-fixtures.js";
import { normalizeAuditForSnapshot, normalizeJsonForSnapshot } from "../test/support/normalize-audit.js";

const expectedDir = path.resolve("evals/expected");
fs.mkdirSync(expectedDir, { recursive: true });

for (const fixture of loadEvalFixtures()) {
  const audit = normalizeAuditForSnapshot(auditJavaScriptRepo(fixture.root));
  const plan = createTestPlan(audit);
  const auditOutputPath = path.join(expectedDir, `${fixture.name}.audit.json`);
  const planOutputPath = path.join(expectedDir, `${fixture.name}.plan.json`);

  fs.writeFileSync(auditOutputPath, `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(planOutputPath, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Updated ${path.relative(process.cwd(), auditOutputPath)}`);
  console.log(`Updated ${path.relative(process.cwd(), planOutputPath)}`);
}

const mcpToolsOutputPath = path.join(expectedDir, "mcp-tools.json");
fs.writeFileSync(mcpToolsOutputPath, `${JSON.stringify(normalizeJsonForSnapshot({ tools: mcpTools }), null, 2)}\n`);
console.log(`Updated ${path.relative(process.cwd(), mcpToolsOutputPath)}`);
