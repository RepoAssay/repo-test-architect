import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { it } from "node:test";
import { auditPythonRepo } from "../src/adapters/python/audit.js";
import { detectProjects } from "../src/core/project-detector.js";
import { createTestPlan } from "../src/core/test-plan.js";
import { analyzeRepository } from "../src/core/tool-api.js";
import { copyTrustFixture } from "./support/non-code-evidence.js";

const fixture = "python-manifest-free-unittest";
const fixtureRoot = path.resolve("examples", fixture);

it("detects a manifest-free unittest project and explains excluded source files", () => {
  const detection = detectProjects(fixtureRoot);
  assert.equal(detection.projects.length, 1);
  assert.equal(detection.projects[0].root, ".");
  assert.deepEqual(detection.projects[0].adapterIds, ["python"]);
  assert.deepEqual(detection.projects[0].markerFiles, ["tests/test_flow.py", "tests/test_localization.py"]);
  const audit = auditPythonRepo(fixtureRoot);
  assert.deepEqual(audit.profile.packageManagers, []);
  assert.equal(audit.profile.testCommand, "python -m unittest discover -s tests");
  assert.equal(createTestPlan(audit).summary.verificationCommand, audit.profile.testCommand);
  assert.ok(audit.coveredButRisky.some((target) => target.path === "retrotext/localization.py"));
  assert.match(audit.skipped.find((target) => target.path === "profiles/game/flow.py").reason, /Outside selected Python source roots: retrotext\/; not assessed/);
  assert.ok(audit.risks.some((risk) => risk.includes("zero tests is not verification")));
  assert.ok(audit.risks.some((risk) => risk.includes("not audit completeness")));
  const analysis = analyzeRepository(fixtureRoot);
  assert.equal(analysis.summary.auditedProjectCount, 1);
  assert.deepEqual(analysis.verificationCommands, [{ command: audit.profile.testCommand, projectCount: 1 }]);
});

it("the suggested command runs tests when default unittest discovery runs zero", (t) => {
  const probe = spawnSync("python3", ["--version"], { encoding: "utf8" });
  if (probe.error?.code === "ENOENT") return t.skip("python3 unavailable");
  assert.equal(probe.status, 0);
  const root = copyTrustFixture(t, fixture);
  const options = { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } };
  const baseline = spawnSync("python3", ["-m", "unittest"], options);
  // Python versions differ on the exit status of empty discovery.
  assert.ok([0, 5].includes(baseline.status), baseline.stderr);
  assert.match(baseline.stderr, /Ran 0 tests/);
  const command = auditPythonRepo(root).profile.testCommand;
  const result = spawnSync("python3", command.split(" ").slice(1), options);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Ran 3 tests/);
  const suffixRoot = copyTrustFixture(t, "python-unittest-service");
  assert.equal(auditPythonRepo(suffixRoot).profile.testCommand, 'python -m unittest discover -s tests -p "*_test.py"');
  const suffixResult = spawnSync("python3", ["-m", "unittest", "discover", "-s", "tests", "-p", "*_test.py"], { ...options, cwd: suffixRoot });
  assert.equal(suffixResult.status, 0, suffixResult.stderr);
  assert.match(suffixResult.stderr, /Ran 1 test/);
});

for (const tool of ["uv", "poetry"]) {
  it(`preserves the ${tool} runner when adding discovery`, (t) => {
    const root = copyTrustFixture(t, fixture);
    fs.writeFileSync(path.join(root, `${tool}.lock`), "");
    assert.equal(auditPythonRepo(root).profile.testCommand, `${tool} run python -m unittest discover -s tests`);
  });
}

it("uses root discovery for packaged tests and blocks multiple non-package roots", (t) => {
  const root = copyTrustFixture(t, fixture);
  fs.writeFileSync(path.join(root, "tests/__init__.py"), "");
  assert.equal(auditPythonRepo(root).profile.testCommand, "python -m unittest discover -s .");
  fs.unlinkSync(path.join(root, "tests/__init__.py"));
  fs.mkdirSync(path.join(root, "test"));
  fs.copyFileSync(path.join(root, "tests/test_flow.py"), path.join(root, "test/test_other.py"));
  const audit = auditPythonRepo(root);
  assert.equal(audit.profile.testCommand, undefined);
  assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("multiple discovery roots")));
  assert.notEqual(audit.profile.confidence, "high");
});

it("does not report a partial command for mixed test filename conventions", (t) => {
  const root = copyTrustFixture(t, fixture);
  fs.renameSync(path.join(root, "tests/test_flow.py"), path.join(root, "tests/flow_test.py"));
  const audit = auditPythonRepo(root);
  assert.equal(audit.profile.testCommand, undefined);
  assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("Mixed unittest filename patterns")));
});

it("does not infer projects from helper scripts or overlap manifest projects", (t) => {
  const root = copyTrustFixture(t, fixture);
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  assert.deepEqual(detectProjects(root).projects[0].adapterIds, ["javascript"]);
  fs.unlinkSync(path.join(root, "package.json"));
  fs.rmSync(path.join(root, "tests"), { recursive: true });
  assert.equal(detectProjects(root).projects.length, 0);
});

it("does not use linked unittest test directories as detection evidence", { skip: process.platform === "win32" }, (t) => {
  const root = copyTrustFixture(t, fixture);
  const external = copyTrustFixture(t, fixture);
  fs.rmSync(path.join(root, "tests"), { recursive: true });
  fs.symlinkSync(path.join(external, "tests"), path.join(root, "tests"));
  assert.equal(detectProjects(root).projects.length, 0);
});
