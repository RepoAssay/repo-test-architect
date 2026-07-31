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
      kind: "filename-convention",
      strength: "naming"
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
        'require "order_validator"',
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
