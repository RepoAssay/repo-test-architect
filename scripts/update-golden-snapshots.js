import fs from "node:fs";
import path from "node:path";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";
import { createTestPlan } from "../src/core/test-plan.js";
import { normalizeAuditForSnapshot } from "../test/support/normalize-audit.js";

const fixtures = [
  "node-vitest-basic",
  "node-no-tests-yet",
  "node-jest-service",
  "express-supertest",
  "react-testing-library"
];

const expectedDir = path.resolve("evals/expected");
fs.mkdirSync(expectedDir, { recursive: true });

for (const fixture of fixtures) {
  const fixtureRoot = path.resolve("examples", fixture);
  const audit = normalizeAuditForSnapshot(auditJavaScriptRepo(fixtureRoot));
  const plan = createTestPlan(audit);
  const auditOutputPath = path.join(expectedDir, `${fixture}.audit.json`);
  const planOutputPath = path.join(expectedDir, `${fixture}.plan.json`);

  fs.writeFileSync(auditOutputPath, `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(planOutputPath, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Updated ${path.relative(process.cwd(), auditOutputPath)}`);
  console.log(`Updated ${path.relative(process.cwd(), planOutputPath)}`);
}
