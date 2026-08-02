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

  it("accepts the exact legacy App.Mixfile project module", () => {
    const root = createRepo({ mixModule: "Sample.Mixfile" });
    const audit = auditElixirRepo(root);
    assert.deepEqual(audit.profile.blockers, []);
    assert.equal(audit.profile.testCommand, "mix test");
  });

  it("accepts a direct ExUnit.start call with static literal options", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "test", "test_helper.exs"), "ExUnit.start(assert_receive_timeout: 200, capture_log: true)\n");
    const staticAudit = auditElixirRepo(root);
    assert.equal(staticAudit.profile.testCommand, "mix test");
    assert.ok(staticAudit.profile.detectedConventions.includes("static ExUnit.start options"));

    fs.writeFileSync(path.join(root, "test", "test_helper.exs"), "ExUnit.start(assert_receive_timeout: timeout())\n");
    const audit = auditElixirRepo(root);
    assert.equal(audit.profile.testCommand, undefined);
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("ExUnit.start")));

    fs.writeFileSync(path.join(root, "test", "test_helper.exs"), `"""
ExUnit.start(assert_receive_timeout: 200)
"""
`);
    assert.equal(auditElixirRepo(root).profile.testCommand, undefined);

    fs.writeFileSync(path.join(root, "test", "test_helper.exs"), `ExUnit.start(assert_receive_timeout: 200)
ExUnit.start(assert_receive_timeout: timeout())
`);
    assert.equal(auditElixirRepo(root).profile.testCommand, undefined);
  });

  it("owns one exact app-prefixed primary module in a flat source file", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "lib", "parser.ex"), `defmodule Sample.ParseError do
  defexception [:message]
end

defmodule Sample.Parser do
  def normalize(x), do: String.trim(x)
end
`);
    fs.rmSync(path.join(root, "lib", "sample", "parser.ex"));
    fs.writeFileSync(path.join(root, "test", "sample", "parser_test.exs"), `defmodule Sample.ParserTest do
  use ExUnit.Case
  alias Sample.Parser
  test "normalizes" do
    assert Parser.normalize(" x ") == "x"
  end
end
`);
    const audit = auditElixirRepo(root);
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["lib/parser.ex"]);
    assert.equal(audit.coveredButRisky[0].name, "Sample.Parser");
  });

  it("owns an exact app-prefixed protocol declaration", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "lib", "sample", "encoder.ex"), `defprotocol Sample.Encoder do
  def encode(value)
end

defimpl Sample.Encoder, for: Any do
  def encode(value), do: inspect(value)
end
`);
    const audit = auditElixirRepo(root);
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.untestedCandidates.some((target) => target.name === "Sample.Encoder"));
  });

  it("preserves acronym casing in conventional module ownership", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "lib", "sample", "json.ex"), "defmodule Sample.JSON do\n  def decode(x), do: x\nend\n");
    fs.writeFileSync(path.join(root, "test", "sample", "json_test.exs"), `defmodule Sample.JSONTest do
  use ExUnit.Case
  alias Sample.JSON
  test "decodes" do
    assert JSON.decode("x") == "x"
  end
end
`);
    const audit = auditElixirRepo(root);
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.coveredButRisky.some((target) => target.name === "Sample.JSON"));
    assert.ok(audit.profile.detectedConventions.includes("case-normalized source module ownership"));
  });

  it("owns one exact terminal singular protocol from a plural source path", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "lib", "sample", "exceptions.ex"), `defprotocol Sample.Exception do
  def status(value)
end

defmodule Sample.BadRequestError do
  defexception [:message]
end
`);
    fs.writeFileSync(path.join(root, "test", "sample", "exceptions_test.exs"), `defmodule Sample.ExceptionTest do
  use ExUnit.Case
  test "keeps protocol ownership exact" do
    assert Sample.Exception.status(:value) == 400
  end
end
`);
    const audit = auditElixirRepo(root);
    assert.deepEqual(audit.profile.blockers, []);
    assert.ok(audit.coveredButRisky.some((target) => target.name === "Sample.Exception"));
    assert.ok(audit.profile.detectedConventions.includes("terminal plural source ownership"));
  });

  it("blocks acronym and terminal plural ownership collisions", () => {
    const acronymRoot = createRepo();
    fs.writeFileSync(path.join(acronymRoot, "lib", "sample", "json.ex"), `defmodule Sample.JSON do
end
defmodule Sample.Json do
end
`);
    const acronymAudit = auditElixirRepo(acronymRoot);
    assert.equal(acronymAudit.profile.testCommand, undefined);
    assert.ok(acronymAudit.profile.blockers.some((blocker) => blocker.includes("matching its conventional lib path")));

    const pluralRoot = createRepo();
    fs.writeFileSync(path.join(pluralRoot, "lib", "sample", "exceptions.ex"), `defprotocol Sample.Exception do
  def status(value)
end
defmodule Sample.Exceptions do
end
`);
    const pluralAudit = auditElixirRepo(pluralRoot);
    assert.equal(pluralAudit.profile.testCommand, undefined);
    assert.ok(pluralAudit.profile.blockers.some((blocker) => blocker.includes("matching its conventional lib path")));
  });

  it("recognizes one app-owned primary test module while ignoring nested fixture modules", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "test", "sample", "parser_test.exs"), `defmodule Sample.NormalizerTest do
  use ExUnit.Case
  alias Sample.Parser

  defmodule Fixture do
    def value, do: " x "
  end

  test "normalizes" do
    assert Parser.normalize(Fixture.value()) == "x"
  end
end
`);
    const audit = auditElixirRepo(root);
    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["lib/sample/parser.ex"]);
  });

  it("resolves exact grouped aliases without weakening collisions", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "lib", "sample", "notifier.ex"), "defmodule Sample.Notifier do\n  def deliver(x), do: x\nend\n");
    fs.writeFileSync(path.join(root, "test", "sample", "parser_test.exs"), `defmodule Sample.ParserTest do
  use ExUnit.Case
  alias Sample.{Notifier, Parser}
  alias Other.Notifier
  test "normalizes" do
    assert Parser.normalize(" x ") == "x"
    Notifier.deliver("x")
  end
end
`);
    const audit = auditElixirRepo(root);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.name), ["Sample.Parser"]);
    assert.equal(audit.coveredButRisky[0].existingTestEvidence[0].kind, "elixir-module-reference");
    assert.ok(audit.untestedCandidates.some((target) => target.name === "Sample.Notifier"));
  });

  it("does not claim direct evidence from nested support modules outside test bodies", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "test", "sample", "parser_test.exs"), `defmodule Sample.ParserTest do
  use ExUnit.Case

  defmodule Support do
    def normalize(value), do: Sample.Parser.normalize(value)
  end

  test "keeps support calls separate" do
    assert Support.normalize(" x ") == "x"
  end
end
`);
    const evidence = auditElixirRepo(root).coveredButRisky[0].existingTestEvidence;
    assert.deepEqual(evidence, [{
      testPath: "test/sample/parser_test.exs",
      kind: "filename-convention",
      strength: "naming"
    }]);
  });

  it("retains asserted evidence inside nested test control flow", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "test", "sample", "parser_test.exs"), `defmodule Sample.ParserTest do
  use ExUnit.Case
  alias Sample.Parser

  test "normalizes conditionally" do
    if true do
      assert Parser.normalize(" x ") == "x"
    end
  end
end
`);
    assert.equal(auditElixirRepo(root).coveredButRisky[0].existingTestEvidence[0].usage, "asserted");
  });

  it("blocks source modules that do not match conventional ownership", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "lib", "sample", "parser.ex"), "defmodule Other.Parser do\n  def normalize(x), do: x\nend\n");
    const audit = auditElixirRepo(root);
    assert.equal(audit.profile.testCommand, undefined);
    assert.deepEqual(audit.coveredButRisky, []);
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("matching its conventional lib path")));
  });

  it("blocks duplicate module ownership and withholds ambiguous evidence", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "lib", "parser.ex"), "defmodule Sample.Parser do\n  def normalize(x), do: x\nend\n");
    const audit = auditElixirRepo(root);
    assert.equal(audit.profile.testCommand, undefined);
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("resolve to one conventional source file")));
    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["lib/parser.ex", "lib/sample/parser.ex"]);
  });

  it("requires one conventional runnable ExUnit test module", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "test", "sample", "parser_test.exs"), "defmodule WrongTest do\n  use ExUnit.Case\n  test \"x\" do\n    assert true\n  end\nend\n");
    const audit = auditElixirRepo(root);
    assert.deepEqual(audit.profile.testFrameworks, []);
    assert.equal(audit.profile.testCommand, undefined);
    assert.ok(audit.profile.blockers.some((blocker) => blocker.includes("No runnable conventional ExUnit")));
  });

  it("rejects multiple app-owned primary test modules", () => {
    const root = createRepo();
    fs.writeFileSync(path.join(root, "test", "sample", "parser_test.exs"), `defmodule Sample.ParserTest do
  use ExUnit.Case
  test "one" do
    assert Sample.Parser.normalize(" x ") == "x"
  end
end

defmodule Sample.OtherTest do
  test "two" do
    assert true
  end
end
`);
    const audit = auditElixirRepo(root);
    assert.equal(audit.profile.testCommand, undefined);
    assert.deepEqual(audit.profile.testFrameworks, []);
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
