import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditElixirRepo } from "../src/adapters/elixir/audit.js";

describe("Elixir adapter", () => {
  it("audits the bounded Mix and ExUnit fixture", () => {
    const audit = auditElixirRepo(path.resolve("examples/elixir-mix-exunit-basic"));

    assert.deepEqual(audit.profile.languages, ["elixir"]);
    assert.deepEqual(audit.profile.packageManagers, ["mix"]);
    assert.deepEqual(audit.profile.testFrameworks, ["exunit"]);
    assert.deepEqual(audit.profile.architectures, ["mix-app"]);
    assert.equal(audit.profile.testCommand, "mix test");
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["lib/sample/parser.ex"]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["lib/sample/notifier.ex"]);
    assert.deepEqual(audit.skipped.map((target) => target.path), ["lib/sample/defaults.ex"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "test/sample/parser_test.exs",
      kind: "elixir-module-reference",
      strength: "direct",
      usage: "asserted"
    }]);
  });

  it("recognizes fully qualified direct calls", () => {
    const root = createRepo();
    writeTest(root, "assert Sample.Parser.normalize(\" x \") == \"x\"");
    const evidence = auditElixirRepo(root).coveredButRisky[0].existingTestEvidence;
    assert.deepEqual(evidence, [{
      testPath: "test/sample/parser_test.exs",
      kind: "elixir-module-reference",
      strength: "direct",
      usage: "asserted"
    }]);
  });

  it("records a non-asserted aliased call as called evidence", () => {
    const root = createRepo();
    writeTest(root, "Parser.normalize(\" x \")");
    assert.equal(auditElixirRepo(root).coveredButRisky[0].existingTestEvidence[0].usage, "called");
  });

  it("withholds the command when ExUnit.start is absent or only commented", () => {
    for (const helper of ["", "# ExUnit.start()\n\"ExUnit.start()\""]) {
      const root = createRepo();
      fs.writeFileSync(path.join(root, "test", "test_helper.exs"), helper);
      const audit = auditElixirRepo(root);
      assert.equal(audit.profile.testCommand, undefined);
      assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("ExUnit.start")));
    }
  });

  it("blocks umbrellas and ambiguous Mix ownership", () => {
    const umbrella = createRepo({ project: "[app: :sample, apps_path: \"apps\"]" });
    const ambiguous = createRepo({ mixModule: "Other.MixProject" });
    assert.ok(auditElixirRepo(umbrella).profile.blockers.some((blocker) => blocker.includes("umbrella")));
    assert.ok(auditElixirRepo(ambiguous).profile.blockers.some((blocker) => blocker.includes("matching MixProject")));
  });

  it("blocks source modules that do not match conventional ownership", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "lib", "sample", "parser.ex"), "defmodule Other.Parser do\n  def normalize(x), do: x\nend\n");
    const audit = auditElixirRepo(root);
    assert.equal(audit.profile.testCommand, undefined);
    assert.deepEqual(audit.coveredButRisky, []);
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("matching its conventional lib path")));
  });

  it("requires one conventional runnable ExUnit test module", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "test", "sample", "parser_test.exs"), "defmodule WrongTest do\n  use ExUnit.Case\n  test \"x\" do\n    assert true\n  end\nend\n");
    const audit = auditElixirRepo(root);
    assert.deepEqual(audit.profile.testFrameworks, []);
    assert.equal(audit.profile.testCommand, undefined);
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("No runnable conventional ExUnit")));
  });

  it("does not treat comments, strings, or ambiguous aliases as module evidence", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "test", "sample", "parser_test.exs"), `defmodule Sample.ParserTest do
  use ExUnit.Case
  alias Sample.Parser
  alias Other.Parser
  test "does not prove ownership" do
    # Parser.normalize("x")
    assert "Sample.Parser.normalize(x)" != ""
  end
end
`);
    const audit = auditElixirRepo(root);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "test/sample/parser_test.exs",
      kind: "filename-convention",
      strength: "naming"
    }]);
  });

  it("ignores nested Mix roots and generated directories", () => {
    const root = createRepo();
    for (const directory of ["nested", "deps/external", "_build/dev/lib/generated"]) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
      fs.writeFileSync(path.join(root, directory, "mix.exs"), "defmodule Nested.MixProject do end\n");
      fs.writeFileSync(path.join(root, directory, "ignored.ex"), "defmodule Wrong do\n  def bad, do: :bad\nend\n");
    }
    assert.deepEqual(auditElixirRepo(root).profile.blockers, []);
  });

  it("normalizes changed paths and scopes candidates", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "lib", "sample", "notifier.ex"), "defmodule Sample.Notifier do\n  def deliver(x), do: x\nend\n");
    const audit = auditElixirRepo(root, { changedPaths: [path.join(root, "lib", "sample", "notifier.ex")] });
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["lib/sample/notifier.ex"]);
    assert.deepEqual(audit.coveredButRisky, []);
  });
});

function createRepo({ mixModule = "Sample.MixProject", project = "[app: :sample]" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-elixir-"));
  fs.mkdirSync(path.join(root, "lib", "sample"), { recursive: true });
  fs.mkdirSync(path.join(root, "test", "sample"), { recursive: true });
  fs.writeFileSync(path.join(root, "mix.exs"), `defmodule ${mixModule} do
  use Mix.Project
  def project, do: ${project}
end
`);
  fs.writeFileSync(path.join(root, "lib", "sample", "parser.ex"), "defmodule Sample.Parser do\n  def normalize(x), do: String.trim(x)\nend\n");
  fs.writeFileSync(path.join(root, "test", "test_helper.exs"), "ExUnit.start()\n");
  writeTest(root, "assert Parser.normalize(\" x \") == \"x\"");
  return root;
}

function writeTest(root, body) {
  fs.writeFileSync(path.join(root, "test", "sample", "parser_test.exs"), `defmodule Sample.ParserTest do
  use ExUnit.Case, async: true
  alias Sample.Parser
  test "normalizes" do
    ${body}
  end
end
`);
}
