import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { auditRubyRepo } from "../src/adapters/ruby/audit.js";

describe("Ruby audit adapter", () => {
  it("audits the conventional Bundler and Minitest fixture", () => {
    const root = path.resolve("examples/ruby-minitest-basic");
    const audit = auditRubyRepo(root);

    assert.deepEqual(audit.profile, {
      root,
      languages: ["ruby"],
      packageManagers: ["bundler"],
      testFrameworks: ["minitest"],
      architectures: ["ruby-gem"],
      testCommand: "bundle exec rake test",
      detectedConventions: ["lib/ source layout", "*_test.rb naming", "Rake::TestTask test command"],
      existingTestLocations: ["test/ Minitest files"],
      setupSignals: ["Gemfile", "Gemfile.lock", "ruby_minitest_basic.gemspec", "Rakefile"],
      confidence: "high",
      blockers: []
    });
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), [
      "lib/ruby_minitest_basic/service.rb"
    ]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), [
      "lib/ruby_minitest_basic/parser.rb"
    ]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "test/parser_test.rb",
      kind: "ruby-constant-reference",
      strength: "direct",
      usage: "asserted"
    }]);
    assert.deepEqual(audit.skipped.map((target) => target.path), [
      "lib/ruby_minitest_basic.rb",
      "lib/ruby_minitest_basic/value.rb"
    ]);
    assert.deepEqual(audit.recommended.map((target) => target.path), [
      "lib/ruby_minitest_basic/parser.rb",
      "lib/ruby_minitest_basic/service.rb"
    ]);
  });

  it("selects exact RSpec ownership and naming evidence", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'source "https://rubygems.org"\ngem "rspec"\n',
      "lib/order_validator.rb": "class OrderValidator\n  def valid?(order)\n    !order.nil?\n  end\nend\n",
      "spec/order_validator_spec.rb": [
        'require_relative "../lib/order_validator"',
        "RSpec.describe OrderValidator do",
        '  it("accepts an order") { expect(subject.valid?(Object.new)).to be(true) }',
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);

    assert.equal(audit.profile.testCommand, "bundle exec rspec");
    assert.deepEqual(audit.profile.testFrameworks, ["rspec"]);
    assert.deepEqual(audit.profile.architectures, ["ruby-application"]);
    assert.equal(audit.profile.confidence, "high");
    assert.deepEqual(audit.coveredButRisky[0].existingTestPaths, ["spec/order_validator_spec.rb"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "spec/order_validator_spec.rb",
      kind: "ruby-constant-reference",
      strength: "direct"
    }]);
  });

  it("follows three exact repository-owned require edges to a uniquely reachable constant", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "minitest"\ngemspec\n',
      "archive.gemspec": "Gem::Specification.new {}\n",
      "lib/archive.rb": 'require "archive/file"\n',
      "lib/archive/file.rb": "module Archive\n  class File\n    def self.open\n      true\n    end\n  end\nend\n",
      "lib/archive/filesystem.rb": "module Archive\n  class File\n    def mounted?\n      true\n    end\n  end\nend\n",
      "test/test_helper.rb": 'require "archive"\n',
      "test/archive_behavior_test.rb": [
        'require_relative "test_helper"',
        "class ArchiveBehaviorTest < Minitest::Test",
        "  def test_open",
        "    assert Archive::File.open",
        "  end",
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["lib/archive/file.rb"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "test/archive_behavior_test.rb",
      kind: "ruby-constant-reference",
      strength: "referenced",
      usage: "asserted"
    }]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["lib/archive/filesystem.rb"]);
  });

  it("rejects constants with multiple reachable owners and non-literal or non-exact references", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "minitest"\ngemspec\n',
      "archive.gemspec": "Gem::Specification.new {}\n",
      "lib/archive.rb": 'require "archive/file"\nrequire "archive/file_extension"\n',
      "lib/archive/file.rb": "module Archive\n  class File\n    def self.open\n      true\n    end\n  end\nend\n",
      "lib/archive/file_extension.rb": "module Archive\n  class File\n    def self.extended\n      true\n    end\n  end\nend\n",
      "lib/archive/parser.rb": "module Archive\n  class Parser\n    def self.parse\n      true\n    end\n  end\nend\n",
      "test/behavior_test.rb": [
        'require "archive"',
        'require "#{component}"',
        '# require "archive/parser"',
        "class BehaviorTest < Minitest::Test",
        "  def test_behavior",
        '    text = "Archive::Parser"',
        "    Archive::File.open",
        "    Other::Archive::Parser",
        "  end",
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), [
      "lib/archive/file.rb",
      "lib/archive/file_extension.rb",
      "lib/archive/parser.rb"
    ]);
  });

  it("accepts an exact relative source require but stops before a fourth require edge", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "minitest"\ngemspec\n',
      "library.gemspec": "Gem::Specification.new {}\n",
      "lib/direct.rb": "class Direct\n  def self.call\n    true\n  end\nend\n",
      "lib/deep.rb": "class Deep\n  def self.call\n    true\n  end\nend\n",
      "test/support/one.rb": 'require_relative "two"\n',
      "test/support/two.rb": 'require_relative "three"\n',
      "test/support/three.rb": 'require "deep"\n',
      "test/behavior_test.rb": [
        'require_relative "../lib/direct"',
        'require_relative "support/one"',
        "class BehaviorTest < Minitest::Test",
        "  def test_behavior",
        "    Direct.call",
        "    Deep.call",
        "  end",
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["lib/direct.rb"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "test/behavior_test.rb",
      kind: "ruby-constant-reference",
      strength: "direct",
      usage: "called"
    }]);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["lib/deep.rb"]);
  });

  it("marks exact singleton calls and stable assertion results inside runnable Minitest bodies", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "minitest"\n',
      "lib/client.rb": [
        "class Client",
        "  class << self",
        "    def fetch",
        "      :ok",
        "    end",
        "  end",
        "end",
        ""
      ].join("\n"),
      "lib/parser.rb": "class Parser\n  def self.parse(value)\n    value\n  end\nend\n",
      "lib/record.rb": "class Record\n  def initialize(value)\n    @value = value\n  end\nend\n",
      "test/usage_test.rb": [
        'require_relative "../lib/client"',
        'require_relative "../lib/parser"',
        'require_relative "../lib/record"',
        "class UsageTest < Minitest::Test",
        "  def setup",
        "    Parser.parse(:setup)",
        "  end",
        "",
        "  def test_usage",
        "    Client.fetch",
        "    result = Parser.parse(:value)",
        "    assert_equal :value, result",
        "    refute_nil Record.new(:value)",
        "  end",
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);
    const evidence = Object.fromEntries(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0]])
    );

    assert.deepEqual(evidence, {
      "lib/client.rb": {
        testPath: "test/usage_test.rb",
        kind: "ruby-constant-reference",
        strength: "direct",
        usage: "called"
      },
      "lib/parser.rb": {
        testPath: "test/usage_test.rb",
        kind: "ruby-constant-reference",
        strength: "direct",
        usage: "asserted"
      },
      "lib/record.rb": {
        testPath: "test/usage_test.rb",
        kind: "ruby-constant-reference",
        strength: "direct",
        usage: "asserted"
      }
    });
  });

  it("recognizes exact RSpec expect usage inside runnable examples", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "rspec"\n',
      "lib/validator.rb": "class Validator\n  def self.valid?(value)\n    !value.nil?\n  end\nend\n",
      "spec/validator_spec.rb": [
        'require_relative "../lib/validator"',
        "RSpec.describe Validator do",
        "  before { Validator.valid?(:setup) }",
        '  it("accepts values") { expect(Validator.valid?(:value)).to be(true) }',
        "",
        '  it "rejects nil" do',
        "    result = Validator.valid?(nil)",
        "    expect(result).to be(false)",
        "  end",
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "spec/validator_spec.rb",
      kind: "ruby-constant-reference",
      strength: "direct",
      usage: "asserted"
    }]);
  });

  it("keeps helper-owned, undeclared, dynamic, and reassigned-result shapes below asserted usage", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "minitest"\n',
      "lib/client.rb": "class Client\n  def fetch\n    :ok\n  end\nend\n",
      "lib/deferred.rb": "class Deferred\n  def self.run\n    :ok\n  end\nend\n",
      "lib/dispatcher.rb": "class Dispatcher\n  def self.call\n    :ok\n  end\nend\n",
      "lib/factory.rb": "module Factory\n  def initialize\n    :ok\n  end\nend\n",
      "lib/parser.rb": [
        "class Parser",
        "  def self.parse(value)",
        "    value",
        "  end",
        "",
        "  def instance_parse(value)",
        "    value",
        "  end",
        "end",
        ""
      ].join("\n"),
      "lib/worker.rb": "class Worker\n  def self.run\n    :ok\n  end\nend\n",
      "lib/wrapped.rb": "class Wrapped\n  def self.call(value)\n    value\n  end\nend\n",
      "test/parser_usage_test.rb": [
        'require_relative "../lib/client"',
        'require_relative "../lib/deferred"',
        'require_relative "../lib/dispatcher"',
        'require_relative "../lib/factory"',
        'require_relative "../lib/parser"',
        'require_relative "../lib/worker"',
        'require_relative "../lib/wrapped"',
        "class ParserUsageTest < Minitest::Test",
        "  def helper",
        "    Parser.parse(:helper)",
        "    Worker.run",
        "  end",
        "",
        "  def test_usage",
        "    Client.fetch",
        "    callback = -> { Deferred.run }",
        "    Dispatcher.public_send(:call)",
        "    Factory.new",
        "    Parser.public_send(:parse, :dynamic)",
        "    Parser.instance_parse(:wrong_owner)",
        "    result = Parser.parse(:value)",
        "    result = :changed",
        "    assert_equal :changed, result",
        "    verify(Parser.parse(:custom_assertion))",
        "    wrapped = normalize(Wrapped.call(:value))",
        "    assert_equal :value, wrapped",
        "  end",
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);
    const evidence = Object.fromEntries(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0]])
    );

    assert.deepEqual(evidence, {
      "lib/client.rb": {
        testPath: "test/parser_usage_test.rb",
        kind: "ruby-constant-reference",
        strength: "direct"
      },
      "lib/deferred.rb": {
        testPath: "test/parser_usage_test.rb",
        kind: "ruby-constant-reference",
        strength: "direct"
      },
      "lib/dispatcher.rb": {
        testPath: "test/parser_usage_test.rb",
        kind: "ruby-constant-reference",
        strength: "direct"
      },
      "lib/factory.rb": {
        testPath: "test/parser_usage_test.rb",
        kind: "ruby-constant-reference",
        strength: "direct"
      },
      "lib/parser.rb": {
        testPath: "test/parser_usage_test.rb",
        kind: "ruby-constant-reference",
        strength: "direct",
        usage: "called"
      },
      "lib/worker.rb": {
        testPath: "test/parser_usage_test.rb",
        kind: "ruby-constant-reference",
        strength: "direct"
      },
      "lib/wrapped.rb": {
        testPath: "test/parser_usage_test.rb",
        kind: "ruby-constant-reference",
        strength: "direct",
        usage: "called"
      }
    });
  });

  it("does not invent a lib load path for bare requires without a bundled root gemspec", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "minitest"\n',
      "lib/parser.rb": "class Parser\n  def self.parse\n    true\n  end\nend\n",
      "test/behavior_test.rb": [
        'require "parser"',
        "class BehaviorTest < Minitest::Test",
        "  def test_behavior",
        "    Parser.parse",
        "  end",
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["lib/parser.rb"]);
  });

  it("accepts a static test dependency from one root gemspec", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: "gemspec\n",
      "library.gemspec": 'Gem::Specification.new do |spec|\n  spec.add_development_dependency "rspec"\nend\n',
      "lib/parser.rb": "class Parser\n  def parse(value)\n    value\n  end\nend\n",
      "spec/parser_spec.rb": "RSpec.describe Parser do\n  it { is_expected.to be_a(Parser) }\nend\n"
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.profile.architectures, ["ruby-gem"]);
    assert.equal(audit.profile.testCommand, "bundle exec rspec");
  });

  it("uses the bounded direct Minitest command without a conventional Rake task", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "minitest"\n',
      Rakefile: "Rake::TestTask.new(:spec) do |task|\nend\n",
      "lib/parser.rb": "class Parser\n  def parse(value)\n    value\n  end\nend\n",
      "test/parser_test.rb": minitestFile("ParserTest")
    });

    const audit = auditRubyRepo(root);

    assert.equal(
      audit.profile.testCommand,
      "bundle exec ruby -Itest -e 'Dir[\"test/**/*_test.rb\"].sort.each { |file| require_relative file }'"
    );
    assert.ok(!audit.profile.detectedConventions.includes("Rake::TestTask test command"));
  });

  it("recognizes the default Minitest::TestTask created by conventional Rakefiles", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "minitest"\n',
      Rakefile: "Minitest::TestTask.create do |task|\n  task.test_globs = 'test/**/*_test.rb'\nend\n",
      "lib/parser.rb": "class Parser\n  def parse(value)\n    value\n  end\nend\n",
      "test/parser_test.rb": minitestFile("ParserTest")
    });

    const audit = auditRubyRepo(root);

    assert.equal(audit.profile.testCommand, "bundle exec rake test");
    assert.ok(audit.profile.detectedConventions.includes("Minitest::TestTask test command"));
  });

  it("blocks mixed frameworks, undeclared runners, Rails, and multiple gemspecs", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "rails"\ngem "minitest"\n',
      "one.gemspec": "Gem::Specification.new {}\n",
      "two.gemspec": "Gem::Specification.new {}\n",
      "config/application.rb": "class Application\nend\n",
      "lib/service.rb": "class Service\n  def call\n    true\n  end\nend\n",
      "test/service_test.rb": minitestFile("ServiceTest"),
      "spec/service_spec.rb": "RSpec.describe Service do\n  it { is_expected.to be_truthy }\nend\n"
    });

    const audit = auditRubyRepo(root);

    assert.equal(audit.profile.testCommand, undefined);
    assert.equal(audit.profile.confidence, "medium");
    assert.deepEqual(audit.profile.testFrameworks, ["minitest", "rspec"]);
    assert.ok(audit.profile.blockers.includes("Mixed Minitest and RSpec execution is outside the first bounded Ruby command matrix."));
    assert.ok(audit.profile.blockers.includes("Multiple root gemspecs require explicit Ruby package ownership."));
    assert.ok(audit.profile.blockers.includes("RSpec must be statically declared in Gemfile, Gemfile.lock, or the root gemspec before command ownership is complete."));
    assert.ok(audit.profile.blockers.includes("Rails application ownership is outside the first conventional Ruby adapter slice."));
  });

  it("keeps absent setup and non-runnable naming visible without guessing a command", (t) => {
    const root = createRubyRepo(t, {
      "test/parser_test.rb": "# class Fake < Minitest::Test\n# def test_fake\n",
      "notes.rb": "puts 'outside lib'\n"
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(audit.profile.packageManagers, []);
    assert.deepEqual(audit.profile.testFrameworks, []);
    assert.equal(audit.profile.confidence, "low");
    assert.equal(audit.profile.testCommand, undefined);
    assert.deepEqual(audit.profile.blockers, [
      "No root Gemfile detected for the bounded Ruby Bundler adapter.",
      "No conventional Ruby source files detected under lib/.",
      "No runnable conventional Minitest or RSpec test detected."
    ]);
    assert.deepEqual(audit.recommended, []);
  });

  it("keeps duplicate basenames, nested Bundler projects, and symlinks outside evidence ownership", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "minitest"\n',
      "lib/api/parser.rb": "class ApiParser\n  def parse\n    true\n  end\nend\n",
      "lib/web/parser.rb": "class WebParser\n  def parse\n    true\n  end\nend\n",
      "test/parser_test.rb": minitestFile("ParserTest"),
      "nested/Gemfile": 'gem "minitest"\n',
      "nested/lib/owned.rb": "class Owned\n  def call\n    true\n  end\nend\n"
    });
    fs.symlinkSync(path.join(root, "lib/api/parser.rb"), path.join(root, "lib/symlink.rb"));

    const audit = auditRubyRepo(root);

    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), [
      "lib/api/parser.rb",
      "lib/web/parser.rb"
    ]);
    assert.deepEqual(audit.coveredButRisky, []);
  });

  it("classifies generated, data, boundary, branching, and deterministic Ruby files", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "minitest"\n',
      "lib/generated.rb": "# Code generated - do not edit\nclass Generated\n  def call\n  end\nend\n",
      "lib/model.rb": "class Model\n  VALUE = 1\nend\n",
      "lib/repository.rb": "class Repository\n  def fetch\n    true\n  end\nend\n",
      "lib/validator.rb": "class Validator\n  def valid?(value)\n    raise 'bad' unless value\n    true\n  end\nend\n",
      "lib/worker.rb": "class Worker\n  def call\n    true\n  end\nend\n",
      "test/worker_test.rb": minitestFile("WorkerTest")
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(audit.skipped.map((target) => target.kind), ["generated-code", "data-model"]);
    assert.equal(audit.untestedCandidates.find((target) => target.path === "lib/repository.rb").recommendedTestLevel, "integration");
    assert.equal(audit.untestedCandidates.find((target) => target.path === "lib/validator.rb").risk, "high");
    assert.equal(audit.coveredButRisky.find((target) => target.path === "lib/worker.rb").risk, "medium");
    assert.equal(audit.risks.length, 2);
  });

  it("filters exact relative, absolute, and Windows-style changed paths", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "minitest"\n',
      "lib/parser.rb": "class Parser\n  def parse\n    true\n  end\nend\n",
      "lib/service.rb": "class Service\n  def call\n    true\n  end\nend\n",
      "test/parser_test.rb": minitestFile("ParserTest")
    });

    assert.deepEqual(auditRubyRepo(root, { changedPaths: ["lib\\parser.rb"] }).recommended.map((target) => target.path), ["lib/parser.rb"]);
    assert.deepEqual(auditRubyRepo(root, { changedPaths: [path.join(root, "lib/service.rb")] }).recommended.map((target) => target.path), ["lib/service.rb"]);
    assert.deepEqual(auditRubyRepo(root, { changedPaths: [] }).recommended, []);
  });
});

function createRubyRepo(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-ruby-audit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return root;
}

function minitestFile(className) {
  return [
    'require "minitest/autorun"',
    `class ${className} < Minitest::Test`,
    "  def test_behavior",
    "    assert true",
    "  end",
    "end",
    ""
  ].join("\n");
}
