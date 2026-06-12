import fs from "node:fs";
import path from "node:path";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";
import { createTestPlan } from "../src/core/test-plan.js";
import { loadEvalFixtures } from "../test/support/eval-fixtures.js";
import { normalizeAuditForSnapshot } from "../test/support/normalize-audit.js";

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
