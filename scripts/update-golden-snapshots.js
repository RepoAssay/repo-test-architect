import fs from "node:fs";
import path from "node:path";
import { auditJavaScriptRepo } from "../src/adapters/javascript/audit.js";
import { normalizeAuditForSnapshot } from "../test/support/normalize-audit.js";

const fixtures = [
  "node-vitest-basic",
  "node-no-tests-yet",
  "node-jest-service",
  "express-supertest"
];

const expectedDir = path.resolve("evals/expected");
fs.mkdirSync(expectedDir, { recursive: true });

for (const fixture of fixtures) {
  const fixtureRoot = path.resolve("examples", fixture);
  const audit = normalizeAuditForSnapshot(auditJavaScriptRepo(fixtureRoot));
  const outputPath = path.join(expectedDir, `${fixture}.audit.json`);

  fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(`Updated ${path.relative(process.cwd(), outputPath)}`);
}
