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

  it("resolves described_class from the nearest exact constant-owned RSpec group", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "rspec"\n',
      "lib/catalog/finder.rb": "module Catalog\n  class Finder\n    def self.lookup\n      :found\n    end\n  end\nend\n",
      "lib/catalog/widget.rb": "module Catalog\n  class Widget\n    def initialize(value)\n      @value = value\n    end\n    def render\n      @value\n    end\n  end\nend\n",
      "spec/catalog_behavior_spec.rb": [
        'require_relative "../lib/catalog/finder"',
        'require_relative "../lib/catalog/widget"',
        "RSpec.describe ::Catalog::Finder do",
        '  it("finds") { expect(described_class.lookup).to eq(:found) }',
        "",
        "  describe Catalog::Widget do",
        '    describe "#render" do',
        '      it "renders" do',
        "        widget = described_class.new(:rendered)",
        "        result = widget.render",
        "        expect(result).to eq(:rendered)",
        "      end",
        "    end",
        "  end",
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["lib/catalog/finder.rb", "asserted"],
        ["lib/catalog/widget.rb", "asserted"]
      ]
    );
  });

  it("rejects ambiguous and helper-mediated RSpec described_class identity", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "rspec"\n',
      "lib/aliased.rb": "class Aliased\n  def self.run\n    :ok\n  end\nend\n",
      "lib/derived.rb": "class Derived\n  def self.run\n    :ok\n  end\nend\n",
      "lib/dynamic_group.rb": "class DynamicGroup\n  def self.run\n    :ok\n  end\nend\n",
      "lib/hooked.rb": "class Hooked\n  def self.run\n    :ok\n  end\nend\n",
      "lib/memoized.rb": "class Memoized\n  def initialize; end\n  def run\n    :ok\n  end\nend\n",
      "lib/outer.rb": "class Outer\n  def self.run\n    :outer\n  end\nend\n",
      "lib/parenthesized.rb": "class Parenthesized\n  def self.run\n    :ok\n  end\nend\n",
      "lib/shared.rb": "class Shared\n  def self.run\n    :ok\n  end\nend\n",
      "lib/string_group.rb": "class StringGroup\n  def self.run\n    :ok\n  end\nend\n",
      "spec/described_class_boundaries_spec.rb": [
        'require_relative "../lib/aliased"',
        'require_relative "../lib/derived"',
        'require_relative "../lib/dynamic_group"',
        'require_relative "../lib/hooked"',
        'require_relative "../lib/memoized"',
        'require_relative "../lib/outer"',
        'require_relative "../lib/parenthesized"',
        'require_relative "../lib/shared"',
        'require_relative "../lib/string_group"',
        "target_class = DynamicGroup",
        "SHARED_CLASS = Shared",
        "",
        'RSpec.shared_examples "shared behavior" do',
        '  it("runs") { expect(described_class.run).to eq(:ok) }',
        "end",
        "",
        'RSpec.describe "StringGroup" do',
        "  before { StringGroup }",
        '  it("does not bind a label") { expect(described_class.run).to eq(:ok) }',
        "end",
        "",
        "RSpec.describe target_class do",
        '  it("does not bind a variable") { expect(described_class.run).to eq(:ok) }',
        "end",
        "",
        "RSpec.describe Derived.name do",
        '  it("does not bind a derived value") { expect(described_class.run).to eq(:ok) }',
        "end",
        "",
        "RSpec.describe(Parenthesized) do",
        '  it("does not bind a parenthesized expression") { expect(described_class.run).to eq(:ok) }',
        "end",
        "",
        "RSpec.describe Aliased do",
        '  it "does not follow aliases" do',
        "    klass = described_class",
        "    expect(klass.run).to eq(:ok)",
        "  end",
        "end",
        "",
        "RSpec.describe Hooked do",
        "  before { described_class.run }",
        '  it("ignores hooks") { expect(true).to be(true) }',
        "end",
        "",
        "RSpec.describe Memoized do",
        "  let(:instance) { described_class.new }",
        '  it("does not execute let") { expect(instance.run).to eq(:ok) }',
        "end",
        "",
        "RSpec.describe Outer do",
        '  shared_examples "nested shared behavior" do',
        '    it("does not bind at definition time") { expect(described_class.run).to eq(:outer) }',
        "  end",
        '  it_behaves_like "nested shared behavior"',
        '  it_behaves_like "shared behavior"',
        "  describe Memoized do",
        '    it("uses the nearest owner") { expect(described_class.new).to be_a(Memoized) }',
        "  end",
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);
    const usage = Object.fromEntries(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage ?? "reference-only"])
    );

    assert.deepEqual(usage, {
      "lib/aliased.rb": "reference-only",
      "lib/derived.rb": "reference-only",
      "lib/dynamic_group.rb": "reference-only",
      "lib/hooked.rb": "reference-only",
      "lib/memoized.rb": "asserted",
      "lib/outer.rb": "reference-only",
      "lib/parenthesized.rb": "reference-only",
      "lib/shared.rb": "reference-only",
      "lib/string_group.rb": "reference-only"
    });
  });

  it("tracks exact one-line RSpec let and subject constructor receivers", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "rspec"\n',
      "lib/catalog/client.rb": "module Catalog\n  class Client\n    def initialize(prefix)\n      @prefix = prefix\n    end\n    def fetch\n      @prefix\n    end\n  end\nend\n",
      "lib/catalog/registry.rb": "module Catalog\n  class Registry\n    def initialize; end\n    def get\n      :registered\n    end\n  end\nend\n",
      "lib/catalog/widget.rb": "module Catalog\n  class Widget\n    def initialize; end\n    def render\n      :rendered\n    end\n  end\nend\n",
      "spec/catalog_memoized_spec.rb": [
        'require_relative "../lib/catalog/client"',
        'require_relative "../lib/catalog/registry"',
        'require_relative "../lib/catalog/widget"',
        "RSpec.describe Catalog::Client do",
        "  let(:client) { described_class.new(:cached) }",
        "  subject(:registry) { Catalog::Registry.new }",
        "",
        '  context "with direct memoized receivers" do',
        '    it("calls the let receiver") { expect(client.fetch).to eq(:cached) }',
        '    it "asserts a stable named subject result" do',
        "      result = registry.get",
        "      expect(result).to eq(:registered)",
        "    end",
        "  end",
        "end",
        "",
        "RSpec.describe Catalog::Widget do",
        "  subject { described_class.new }",
        '  it("calls the unnamed subject") { expect(subject.render).to eq(:rendered) }',
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["lib/catalog/client.rb", "asserted"],
        ["lib/catalog/registry.rb", "asserted"],
        ["lib/catalog/widget.rb", "asserted"]
      ]
    );
  });

  it("rejects overridden, shadowed, chained, multiline, and cross-owner RSpec memos", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "rspec"\n',
      "lib/cross_owner.rb": "class CrossOwner\n  def initialize; end\n  def run\n    :cross\n  end\nend\n",
      "lib/dynamic_memo.rb": "class DynamicMemo\n  def initialize; end\n  def run\n    :dynamic\n  end\nend\n",
      "lib/outer_memo.rb": "class OuterMemo\n  def initialize; end\n  def run\n    :outer\n  end\nend\n",
      "lib/rejected_memo.rb": "class RejectedMemo\n  def initialize; end\n  def run\n    :rejected\n  end\nend\n",
      "spec/memoized_boundaries_spec.rb": [
        'require_relative "../lib/cross_owner"',
        'require_relative "../lib/dynamic_memo"',
        'require_relative "../lib/outer_memo"',
        'require_relative "../lib/rejected_memo"',
        "target_class = DynamicMemo",
        "",
        "RSpec.describe target_class do",
        "  let(:dynamic) { described_class.new }",
        '  it("does not resolve a dynamic owner") { expect(dynamic.run).to eq(:dynamic) }',
        "end",
        "",
        "RSpec.describe RejectedMemo do",
        "  let(:aliased) { described_class }",
        "  let(:chained) { described_class.new.run }",
        "  let(:blocked) { described_class.new {} }",
        "  let!(:eager) { described_class.new }",
        "  let(:multiline) do",
        "    described_class.new",
        "  end",
        '  it("rejects a non-constructor alias") { expect(aliased.run).to eq(:rejected) }',
        '  it("rejects a chained constructor") { expect(chained.run).to eq(:rejected) }',
        '  it("rejects a constructor block") { expect(blocked.run).to eq(:rejected) }',
        '  it("rejects eager memoization") { expect(eager.run).to eq(:rejected) }',
        '  it("rejects a multiline memo") { expect(multiline.run).to eq(:rejected) }',
        "end",
        "",
        "RSpec.describe OuterMemo do",
        "  let(:service) { described_class.new }",
        "  let(:shadowed) { described_class.new }",
        "  let(:eager_shadowed) { described_class.new }",
        "  subject { described_class.new }",
        '  context "with an override" do',
        '    let(:service) { double("service", run: :override) }',
        '    it("uses the nearer unknown binding") { expect(service.run).to eq(:override) }',
        "  end",
        '  context "with eager overrides" do',
        '    let!(:eager_shadowed) { double("service", run: :override) }',
        '    subject! { double("subject", run: :override) }',
        '    it("does not inherit through let bang") { expect(eager_shadowed.run).to eq(:override) }',
        '    it("does not inherit through subject bang") { expect(subject.run).to eq(:override) }',
        "  end",
        '  it "rejects a local shadow" do',
        '    shadowed = double("shadowed", run: :local)',
        "    expect(shadowed.run).to eq(:local)",
        "  end",
        "",
        "  describe CrossOwner do",
        '    it("does not inherit outer described_class identity") { expect(service.run).to eq(:cross) }',
        "  end",
        "",
        '  shared_examples "memoized shared behavior" do',
        "    let(:shared_service) { described_class.new }",
        '    it("does not bind shared examples") { expect(shared_service.run).to eq(:outer) }',
        "  end",
        '  it_behaves_like "memoized shared behavior"',
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);
    const usage = Object.fromEntries(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage ?? "reference-only"])
    );

    assert.deepEqual(usage, {
      "lib/cross_owner.rb": "reference-only",
      "lib/dynamic_memo.rb": "reference-only",
      "lib/outer_memo.rb": "reference-only",
      "lib/rejected_memo.rb": "reference-only"
    });
  });

  it("marks a stable result from an exact immutable constructor-local instance call", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "rspec"\n',
      "lib/client.rb": [
        "class Client",
        "  def initialize(value)",
        "    @value = value",
        "  end",
        "",
        "  def fetch",
        "    @value",
        "  end",
        "end",
        ""
      ].join("\n"),
      "spec/client_behavior_spec.rb": [
        'require_relative "../lib/client"',
        "RSpec.describe Client do",
        '  it "fetches" do',
        "    client = Client.new(:ok)",
        "    result = client.fetch",
        "    expect(result).to eq(:ok)",
        "  end",
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "spec/client_behavior_spec.rb",
      kind: "ruby-constant-reference",
      strength: "direct",
      usage: "asserted"
    }]);
  });

  it("tracks exact source-factory and same-group RSpec helper constructor receivers", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "rspec"\n',
      "lib/factory_client.rb": [
        "class FactoryClient",
        "  def self.build(value)",
        "    new(value)",
        "  end",
        "",
        "  def initialize(value)",
        "    @value = value",
        "  end",
        "",
        "  def fetch",
        "    @value",
        "  end",
        "end",
        ""
      ].join("\n"),
      "lib/helper_client.rb": [
        "class HelperClient",
        "  def initialize(value)",
        "    @value = value",
        "  end",
        "",
        "  def fetch",
        "    @value",
        "  end",
        "end",
        ""
      ].join("\n"),
      "lib/named_helper_client.rb": [
        "class NamedHelperClient",
        "  def initialize(value)",
        "    @value = value",
        "  end",
        "",
        "  def fetch",
        "    @value",
        "  end",
        "end",
        ""
      ].join("\n"),
      "lib/scoped_factory_client.rb": [
        "class ScopedFactoryClient",
        "  class << self",
        "    def build(value)",
        "      self.new(value)",
        "    end",
        "  end",
        "",
        "  def initialize(value)",
        "    @value = value",
        "  end",
        "",
        "  def fetch",
        "    @value",
        "  end",
        "end",
        ""
      ].join("\n"),
      "spec/receiver_returns_spec.rb": [
        'require_relative "../lib/factory_client"',
        'require_relative "../lib/helper_client"',
        'require_relative "../lib/named_helper_client"',
        'require_relative "../lib/scoped_factory_client"',
        "RSpec.describe FactoryClient do",
        '  it "uses an exact source factory return" do',
        "    client = described_class.build(:factory)",
        "    result = client.fetch",
        "    expect(result).to eq(:factory)",
        "  end",
        "end",
        "",
        "RSpec.describe NamedHelperClient do",
        "  def build_named_client(value)",
        "    NamedHelperClient.new(value)",
        "  end",
        "",
        '  it "uses an exact named helper return" do',
        "    client = build_named_client(:named)",
        "    result = client.fetch",
        "    expect(result).to eq(:named)",
        "  end",
        "end",
        "",
        "RSpec.describe ScopedFactoryClient do",
        '  it "uses an exact singleton-scope factory return" do',
        "    client = described_class.build(:scoped)",
        "    result = client.fetch",
        "    expect(result).to eq(:scoped)",
        "  end",
        "end",
        "",
        "RSpec.describe HelperClient do",
        "  def build_client(value)",
        "    described_class.new(value)",
        "  end",
        "",
        '  context "with an inherited exact helper" do',
        '    it "uses the helper return" do',
        "      client = build_client(:helper)",
        "      result = client.fetch",
        "      expect(result).to eq(:helper)",
        "    end",
        "  end",
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["lib/factory_client.rb", "asserted"],
        ["lib/helper_client.rb", "asserted"],
        ["lib/named_helper_client.rb", "asserted"],
        ["lib/scoped_factory_client.rb", "asserted"]
      ]
    );
  });

  it("rejects chained, multi-statement, overridden, and cross-owner receiver returns", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "rspec"\n',
      "lib/chained_factory.rb": "class ChainedFactory\n  def self.build\n    new.tap {}\n  end\n  def initialize; end\n  def fetch\n    :chained\n  end\nend\n",
      "lib/cross_owner.rb": "class CrossOwner\n  def initialize; end\n  def fetch\n    :cross\n  end\nend\n",
      "lib/helper_override.rb": "class HelperOverride\n  def initialize; end\n  def fetch\n    :override\n  end\nend\n",
      "lib/multi_statement_factory.rb": "class MultiStatementFactory\n  def self.build\n    client = new\n    client\n  end\n  def initialize; end\n  def fetch\n    :multiple\n  end\nend\n",
      "lib/multi_statement_helper.rb": "class MultiStatementHelper\n  def initialize; end\n  def fetch\n    :multiple\n  end\nend\n",
      "lib/nested_owner.rb": "class NestedOwner\n  def initialize; end\n  def fetch\n    :nested\n  end\nend\n",
      "spec/rejected_receiver_returns_spec.rb": [
        'require_relative "../lib/chained_factory"',
        'require_relative "../lib/cross_owner"',
        'require_relative "../lib/helper_override"',
        'require_relative "../lib/multi_statement_factory"',
        'require_relative "../lib/multi_statement_helper"',
        'require_relative "../lib/nested_owner"',
        "RSpec.describe ChainedFactory do",
        '  it "rejects a chained factory return" do',
        "    client = described_class.build",
        "    result = client.fetch",
        "    expect(result).to eq(:chained)",
        "  end",
        "end",
        "",
        "RSpec.describe MultiStatementFactory do",
        '  it "rejects a multi-statement factory return" do',
        "    client = described_class.build",
        "    result = client.fetch",
        "    expect(result).to eq(:multiple)",
        "  end",
        "end",
        "",
        "RSpec.describe MultiStatementHelper do",
        "  def build_client",
        "    client = described_class.new",
        "    client",
        "  end",
        '  it("rejects helper setup") { client = build_client; expect(client.fetch).to eq(:multiple) }',
        "end",
        "",
        "RSpec.describe HelperOverride do",
        "  def build_client",
        "    described_class.new",
        "  end",
        '  context "with an unknown override" do',
        "    def build_client",
        "      Object.new",
        "    end",
        '    it("rejects the outer identity") { client = build_client; expect(client.fetch).to eq(:override) }',
        "  end",
        "end",
        "",
        "RSpec.describe CrossOwner do",
        "  def build_client",
        "    described_class.new",
        "  end",
        "",
        "  describe NestedOwner do",
        '    it("rejects dynamic nested ownership") { client = build_client; expect(client.fetch).to eq(:nested) }',
        "  end",
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);
    const usage = Object.fromEntries(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage ?? "reference-only"])
    );

    assert.deepEqual(usage, {
      "lib/chained_factory.rb": "called",
      "lib/cross_owner.rb": "reference-only",
      "lib/helper_override.rb": "reference-only",
      "lib/multi_statement_factory.rb": "called",
      "lib/multi_statement_helper.rb": "reference-only",
      "lib/nested_owner.rb": "reference-only"
    });
  });

  it("keeps unstable, indirect, deferred, dynamic, and generated receiver calls at constructor-only usage", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "rspec"\n',
      "lib/attribute_client.rb": "class AttributeClient\n  attr_reader :fetch\n  def initialize\n    @fetch = :ok\n  end\nend\n",
      "lib/deferred_client.rb": "class DeferredClient\n  def initialize; end\n  def fetch\n    :ok\n  end\nend\n",
      "lib/dynamic_client.rb": "class DynamicClient\n  def initialize; end\n  def fetch\n    :ok\n  end\nend\n",
      "lib/factory_client.rb": "class FactoryClient\n  def self.build\n    new.fetch\n  end\n  def initialize; end\n  def fetch\n    :ok\n  end\nend\n",
      "lib/helper_client.rb": "class HelperClient\n  def initialize; end\n  def fetch\n    :ok\n  end\nend\n",
      "lib/overridden_client.rb": "class OverriddenClient\n  def self.new\n    Object.new\n  end\n  def initialize; end\n  def fetch\n    :ok\n  end\nend\n",
      "lib/reassigned_client.rb": "class ReassignedClient\n  def initialize; end\n  def fetch\n    :ok\n  end\nend\n",
      "lib/reassigned_result_client.rb": "class ReassignedResultClient\n  def initialize; end\n  def fetch\n    :ok\n  end\nend\n",
      "lib/shadowed_client.rb": "class ShadowedClient\n  def initialize; end\n  def fetch\n    :ok\n  end\nend\n",
      "lib/shadowed_result_client.rb": "class ShadowedResultClient\n  def initialize; end\n  def fetch\n    :ok\n  end\nend\n",
      "lib/wrapped_client.rb": "class WrappedClient\n  def initialize; end\n  def fetch\n    :ok\n  end\nend\n",
      "spec/receiver_boundaries_spec.rb": [
        'require_relative "../lib/attribute_client"',
        'require_relative "../lib/deferred_client"',
        'require_relative "../lib/dynamic_client"',
        'require_relative "../lib/factory_client"',
        'require_relative "../lib/helper_client"',
        'require_relative "../lib/overridden_client"',
        'require_relative "../lib/reassigned_client"',
        'require_relative "../lib/reassigned_result_client"',
        'require_relative "../lib/shadowed_client"',
        'require_relative "../lib/shadowed_result_client"',
        'require_relative "../lib/wrapped_client"',
        "RSpec.describe ReassignedClient do",
        "  def helper_client",
        "    normalize(HelperClient.new)",
        "  end",
        "",
        '  it "keeps receiver identity bounded" do',
        "    attribute = AttributeClient.new",
        "    expect(attribute.fetch).to eq(:ok)",
        "",
        "    deferred = DeferredClient.new",
        "    callback = -> { deferred.fetch }",
        "    expect(callback.call).to eq(:ok)",
        "",
        "    dynamic = DynamicClient.new",
        "    dynamic_result = dynamic.public_send(:fetch)",
        "    expect(dynamic_result).to eq(:ok)",
        "",
        "    factory = FactoryClient.build",
        "    factory_result = factory.fetch",
        "    expect(factory_result).to eq(:ok)",
        "",
        "    helper = helper_client",
        "    helper_result = helper.fetch",
        "    expect(helper_result).to eq(:ok)",
        "",
        "    overridden = OverriddenClient.new",
        "    overridden_result = overridden.fetch",
        "    expect(overridden_result).to eq(:ok)",
        "",
        "    reassigned = ReassignedClient.new",
        "    reassigned = Object.new",
        "    reassigned_result = reassigned.fetch",
        "    expect(reassigned_result).to eq(:ok)",
        "",
        "    result_client = ReassignedResultClient.new",
        "    unstable_result = result_client.fetch",
        "    unstable_result = :changed",
        "    expect(unstable_result).to eq(:changed)",
        "",
        "    shadowed = ShadowedClient.new",
        "    [Object.new].each { |shadowed| shadowed_result = shadowed.fetch }",
        "    expect(shadowed_result).to eq(:ok)",
        "",
        "    shadowed_result_client = ShadowedResultClient.new",
        "    receiver_result = shadowed_result_client.fetch",
        "    [Object.new].each { |receiver_result| expect(receiver_result).to eq(:ok) }",
        "",
        "    wrapped = normalize(WrappedClient.new)",
        "    wrapped_result = wrapped.fetch",
        "    expect(wrapped_result).to eq(:ok)",
        "  end",
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);
    const usage = Object.fromEntries(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage ?? "reference-only"])
    );

    assert.deepEqual(usage, {
      "lib/attribute_client.rb": "called",
      "lib/deferred_client.rb": "called",
      "lib/dynamic_client.rb": "called",
      "lib/factory_client.rb": "called",
      "lib/helper_client.rb": "reference-only",
      "lib/overridden_client.rb": "called",
      "lib/reassigned_client.rb": "called",
      "lib/reassigned_result_client.rb": "called",
      "lib/shadowed_client.rb": "called",
      "lib/shadowed_result_client.rb": "called",
      "lib/wrapped_client.rb": "called"
    });
  });

  it("follows one exact root RSpec configured helper before bounded source requires", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "rspec"\ngemspec\n',
      ".rspec": "--require spec_helper\n--format documentation\n",
      "archive.gemspec": "Gem::Specification.new {}\n",
      "lib/archive.rb": 'require "archive/client"\n',
      "lib/archive/client.rb": "module Archive\n  class Client\n    def self.fetch\n      :ok\n    end\n  end\nend\n",
      "spec/spec_helper.rb": 'require "archive"\n',
      "spec/archive_behavior_spec.rb": [
        "RSpec.describe Archive::Client do",
        '  it("fetches") { expect(Archive::Client.fetch).to eq(:ok) }',
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(audit.profile.setupSignals, ["Gemfile", ".rspec", "archive.gemspec"]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["lib/archive/client.rb"]);
    assert.deepEqual(audit.coveredButRisky[0].existingTestEvidence, [{
      testPath: "spec/archive_behavior_spec.rb",
      kind: "ruby-constant-reference",
      strength: "referenced",
      usage: "asserted"
    }]);
  });

  it("rejects dynamic, escaping, and non-root RSpec helper configuration", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "rspec"\ngemspec\n',
      ".rspec": '--require "#{helper}"\n--require ../outside\n--require spec/../../helper\n',
      "config/.rspec": "--require spec_helper\n",
      "archive.gemspec": "Gem::Specification.new {}\n",
      "helper.rb": 'require "client"\n',
      "lib/client.rb": "class Client\n  def self.fetch\n    :ok\n  end\nend\n",
      "spec/spec_helper.rb": 'require "client"\n',
      "spec/behavior_spec.rb": [
        "RSpec.describe Client do",
        '  it("fetches") { expect(Client.fetch).to eq(:ok) }',
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(audit.coveredButRisky, []);
    assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["lib/client.rb"]);
  });

  it("follows an exact conventional per-file RSpec spec helper before bounded source requires", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: 'gem "rspec"\ngemspec\n',
      "archive.gemspec": "Gem::Specification.new {}\n",
      "lib/archive.rb": "class Archive\n  def self.fetch\n    :ok\n  end\nend\n",
      "lib/spec_helper.rb": "class Archive\n  def self.fetch\n    :wrong\n  end\nend\n",
      "spec/spec_helper.rb": 'require "archive"\n',
      "spec/archive_behavior_spec.rb": [
        'require "spec_helper"',
        "RSpec.describe Archive do",
        '  it("fetches") { expect(Archive.fetch).to eq(:ok) }',
        "end",
        ""
      ].join("\n"),
      "spec/parenthesized_behavior_spec.rb": [
        "require('spec_helper')",
        "RSpec.describe Archive do",
        '  it("fetches") { expect(Archive.fetch).to eq(:ok) }',
        "end",
        ""
      ].join("\n"),
      "spec/unloaded_behavior_spec.rb": [
        "RSpec.describe Archive do",
        '  it("fetches") { expect(Archive.fetch).to eq(:ok) }',
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);
    const archive = audit.coveredButRisky.find((target) => target.path === "lib/archive.rb");

    assert.deepEqual(archive.existingTestEvidence, [
      {
        testPath: "spec/archive_behavior_spec.rb",
        kind: "ruby-constant-reference",
        strength: "referenced",
        usage: "asserted"
      },
      {
        testPath: "spec/parenthesized_behavior_spec.rb",
        kind: "ruby-constant-reference",
        strength: "referenced",
        usage: "asserted"
      }
    ]);
    assert.deepEqual(audit.coveredButRisky.map((target) => target.path), ["lib/archive.rb"]);
  });

  it("rejects non-conventional per-file spec helper loads", (t) => {
    const shapes = {
      nested: "if ENV['HELPER']\n  require 'spec_helper'\nend\n",
      dynamic: "require helper\n",
      interpolated: 'require "#{helper}"\n',
      alternate: "require 'support/spec_helper'\n",
      explicit_spec_path: "require 'spec/spec_helper'\n",
      missing: "require 'spec_helper'\n"
    };

    for (const [shape, helperLoad] of Object.entries(shapes)) {
      const root = createRubyRepo(t, {
        Gemfile: 'gem "rspec"\ngemspec\n',
        "archive.gemspec": "Gem::Specification.new {}\n",
        "lib/archive.rb": "class Archive\n  def self.fetch\n    :ok\n  end\nend\n",
        ...(shape === "missing" ? {} : { "spec/spec_helper.rb": 'require "archive"\n' }),
        "spec/support/spec_helper.rb": 'require "archive"\n',
        "spec/archive_behavior_spec.rb": [
          helperLoad.trimEnd(),
          "RSpec.describe Archive do",
          '  it("fetches") { expect(Archive.fetch).to eq(:ok) }',
          "end",
          ""
        ].join("\n")
      });

      const audit = auditRubyRepo(root);
      assert.deepEqual(audit.coveredButRisky, [], shape);
      assert.deepEqual(audit.untestedCandidates.map((target) => target.path), ["lib/archive.rb"], shape);
    }

    const minitestRoot = createRubyRepo(t, {
      Gemfile: 'gem "minitest"\n',
      "lib/archive.rb": "class Archive\n  def self.fetch\n    :ok\n  end\nend\n",
      "test/spec_helper.rb": 'require "archive"\n',
      "test/behavior_test.rb": [
        'require "spec_helper"',
        "class ArchiveTest < Minitest::Test",
        "  def test_fetch",
        "    assert_equal :ok, Archive.fetch",
        "  end",
        "end",
        ""
      ].join("\n")
    });

    const minitestAudit = auditRubyRepo(minitestRoot);
    assert.deepEqual(minitestAudit.coveredButRisky, []);
    assert.deepEqual(minitestAudit.untestedCandidates.map((target) => target.path), ["lib/archive.rb"]);
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

  it("owns a complete literal set of named root gemspecs", (t) => {
    const root = createRubyRepo(t, {
      Gemfile: [
        'source "https://rubygems.org"',
        'gemspec name: "catalog-core"',
        "gemspec(name: 'catalog-tools')",
        ""
      ].join("\n"),
      "catalog-core.gemspec": [
        "Gem::Specification.new do |spec|",
        '  spec.name = "catalog-core"',
        '  spec.add_development_dependency "rspec"',
        "end",
        ""
      ].join("\n"),
      "catalog-tools.gemspec": "Gem::Specification.new 'catalog-tools', '1.0.0' do |spec|\nend\n",
      "lib/catalog/core.rb": "module Catalog\n  class Core\n    def self.call\n      :core\n    end\n  end\nend\n",
      "lib/catalog/tools.rb": "module Catalog\n  class Tools\n    def self.call\n      :tools\n    end\n  end\nend\n",
      "spec/catalog_spec.rb": [
        'require "catalog/core"',
        'require "catalog/tools"',
        "RSpec.describe Catalog do",
        '  it("calls both selected gems") { expect([Catalog::Core.call, Catalog::Tools.call]).to eq([:core, :tools]) }',
        "end",
        ""
      ].join("\n")
    });

    const audit = auditRubyRepo(root);

    assert.deepEqual(audit.profile.blockers, []);
    assert.deepEqual(audit.profile.architectures, ["ruby-gem"]);
    assert.deepEqual(audit.profile.setupSignals, [
      "Gemfile",
      "catalog-core.gemspec",
      "catalog-tools.gemspec"
    ]);
    assert.ok(audit.profile.detectedConventions.includes("complete named root gemspec ownership"));
    assert.equal(audit.profile.testCommand, "bundle exec rspec");
    assert.deepEqual(
      audit.coveredButRisky.map((target) => [target.path, target.existingTestEvidence[0].usage]),
      [
        ["lib/catalog/core.rb", "asserted"],
        ["lib/catalog/tools.rb", "asserted"]
      ]
    );
  });

  it("blocks incomplete, duplicate, dynamic, and non-name multi-gemspec ownership", (t) => {
    const shapes = {
      bare: { Gemfile: "gemspec\n" },
      partial: { Gemfile: 'gemspec name: "catalog-core"\n' },
      duplicate: { Gemfile: 'gemspec name: "catalog-core"\ngemspec name: "catalog-core"\n' },
      unknown: { Gemfile: 'gemspec name: "catalog-core"\ngemspec name: "catalog-extra"\n' },
      dynamic: { Gemfile: 'gemspec name: "catalog-core"\ngemspec name: ENV.fetch("TOOLS_GEM")\n' },
      nested: { Gemfile: 'gemspec name: "catalog-core"\nif ENV["TOOLS"]\n  gemspec name: "catalog-tools"\nend\n' },
      hash_rocket: { Gemfile: "gemspec :name => 'catalog-core'\ngemspec :name => 'catalog-tools'\n" },
      dynamic_spec_name: {
        Gemfile: 'gemspec name: "catalog-core"\ngemspec name: "catalog-tools"\n',
        toolsGemspec: "Gem::Specification.new do |spec|\n  spec.name = ENV.fetch('TOOLS_GEM')\nend\n"
      }
    };

    for (const [shape, fixture] of Object.entries(shapes)) {
      const root = createRubyRepo(t, {
        Gemfile: `${fixture.Gemfile}gem "rspec"\n`,
        "catalog-core.gemspec": "Gem::Specification.new do |spec|\n  spec.name = 'catalog-core'\nend\n",
        "catalog-tools.gemspec": fixture.toolsGemspec ?? "Gem::Specification.new 'catalog-tools', '1.0.0' do |spec|\nend\n",
        "lib/catalog.rb": "module Catalog\n  def self.call\n    :ok\n  end\nend\n",
        "spec/behavior_spec.rb": 'RSpec.describe Catalog do\n  it("calls") { expect(Catalog.call).to eq(:ok) }\nend\n'
      });

      const audit = auditRubyRepo(root);
      assert.ok(
        audit.profile.blockers.includes(
          "Multiple root gemspecs require a complete set of exact top-level Gemfile name declarations."
        ),
        shape
      );
      assert.equal(audit.profile.testCommand, undefined, shape);
      assert.deepEqual(audit.profile.architectures, ["ruby-application"], shape);
      assert.deepEqual(audit.coveredButRisky, [], shape);
    }
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
    assert.ok(audit.profile.blockers.includes("Multiple root gemspecs require a complete set of exact top-level Gemfile name declarations."));
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
