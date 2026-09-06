import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { it } from "node:test";
import { copyTrustFixture } from "./non-code-evidence.js";
import { auditRepoProjects, generateRepoProjectTestPlan, collectRepoProjectStats, rankRepoProjectCandidates, summarizeRepoProjectAudits } from "../../src/core/tool-api.js";

export function testSymlinkOwnership(fixture, auditRepo, metadata) {
  for (const mode of ["source", "test", "dangling", "directory", "metadata"]) {
    it(`does not follow ${mode} symlinks into audit ownership (${fixture})`, { skip: process.platform === "win32" }, (t) => {
      const root = copyTrustFixture(t, fixture);
      const external = copyTrustFixture(t, fixture);
      const baseline = auditRepo(root);
      const source = baseline.recommended[0].path;
      const testPath = baseline.coveredButRisky.flatMap(target => target.existingTestPaths)[0];
      const selected = mode === "metadata" ? metadata : mode === "test" ? testPath : source;
      fs.unlinkSync(path.join(root, selected));
      fs.symlinkSync(mode === "dangling" ? path.join(external, "missing") : mode === "directory" ? external : path.join(external, selected), path.join(root, selected));
      const audit = auditRepo(root);
      if (["source", "dangling", "directory"].includes(mode)) assert.ok(!audit.recommended.some(target => target.path === source));
      if (mode === "test") assert.ok(audit.coveredButRisky.every(target => !target.existingTestPaths.includes(testPath)));
      if (mode === "metadata") assert.notDeepEqual(audit.profile, baseline.profile);
      const projects = auditRepoProjects(root);
      const plan = generateRepoProjectTestPlan(projects);
      if (["source", "dangling", "directory"].includes(mode)) assert.ok(!JSON.stringify(plan).includes(source));
      if (mode === "test") assert.ok(!JSON.stringify(plan).includes(testPath));
      collectRepoProjectStats(projects);
    });
  }
}

export function assertUniqueProjectOwnership(root, physicalPath, ownerRoot, relativePath) {
  const projects = auditRepoProjects(root);
  const matches = projects.audits.flatMap(entry => entry.audit.recommended
    .filter(target => path.posix.join(entry.projectRoot, target.path) === physicalPath)
    .map(target => ({ root: entry.projectRoot, path: target.path })));
  assert.deepEqual(matches, [{ root: ownerRoot, path: relativePath }]);
  // Exercise validated public consumers, not only a direct adapter audit.
  summarizeRepoProjectAudits(projects);
  const ranking = rankRepoProjectCandidates(projects);
  assert.equal(ranking.candidates.filter(item => path.posix.join(item.projectRoot, item.path) === physicalPath).length, 1);
  const plan = generateRepoProjectTestPlan(projects);
  assert.equal(plan.items.filter(item => path.posix.join(item.projectRoot, item.path) === physicalPath).length, 1);
  const stats = collectRepoProjectStats(projects);
  assert.equal(stats.counts.untestedCandidateCount, projects.audits.reduce((sum, entry) => sum + entry.audit.untestedCandidates.length, 0));
}

export function assertNoProjectTestCommand(root) {
  const projects = auditRepoProjects(root);
  assert.ok(projects.audits.length > 0);
  assert.ok(projects.audits.every(entry => entry.audit.profile.testCommand === undefined));
  const plan = generateRepoProjectTestPlan(projects);
  assert.ok(plan.projectPlans.every(entry => entry.plan.summary.verificationCommand === undefined));
}
