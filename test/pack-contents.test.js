import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { allowedTopLevelEntries, findLeakedBuildOutputs, requiredFiles } from "../scripts/check-pack-contents.js";

describe("package contents", () => {
  it("keeps npm pack dry-run contents within the runtime allowlist", () => {
    const output = execFileSync(process.execPath, ["scripts/check-pack-contents.js"], {
      encoding: "utf8"
    });

    assert.match(output, /^Pack contents check passed \(\d+ files\)\./);
  });

  it("requires the top-level license file", () => {
    assert.ok(allowedTopLevelEntries.has("LICENSE"));
    assert.ok(requiredFiles.includes("LICENSE"));
    assert.ok(allowedTopLevelEntries.has("server.json"));
    assert.ok(requiredFiles.includes("server.json"));
  });

  it("rejects generated .NET build outputs anywhere in the package", () => {
    assert.deepEqual(
      findLeakedBuildOutputs([
        "examples/csharp-sdk-xunit-basic/bin/Debug/net10.0/project.dll",
        "examples/csharp-sdk-xunit-basic/obj/project.assets.json",
        "src/adapters/csharp/audit.js"
      ]),
      [
        "examples/csharp-sdk-xunit-basic/bin/Debug/net10.0/project.dll",
        "examples/csharp-sdk-xunit-basic/obj/project.assets.json"
      ]
    );
  });

  it("requires check script dependencies needed by packaged release verification", () => {
    assert.ok(requiredFiles.includes("src/diagnostics/diagnostics.js"));
    assert.ok(requiredFiles.includes("src/adapters/go/audit.js"));
    assert.ok(requiredFiles.includes("src/adapters/csharp/audit.js"));
    assert.ok(requiredFiles.includes("src/adapters/csharp/directory-packages-props.js"));
    assert.ok(requiredFiles.includes("src/adapters/elixir/audit.js"));
    assert.ok(requiredFiles.includes("src/adapters/rust/audit.js"));
    assert.ok(requiredFiles.includes("src/adapters/ruby/audit.js"));
    assert.ok(requiredFiles.includes("src/adapters/php/audit.js"));
    assert.ok(requiredFiles.includes("docs/go-alpha-support.md"));
    assert.ok(requiredFiles.includes("docs/csharp-alpha-support.md"));
    assert.ok(requiredFiles.includes("docs/csharp-tdd-validation-report.md"));
    assert.ok(requiredFiles.includes("docs/csharp-sharp-cast-validation-report.md"));
    assert.ok(requiredFiles.includes("docs/csharp-central-packages-validation-report.md"));
    assert.ok(requiredFiles.includes("docs/csharp-multi-target-validation-report.md"));
    assert.ok(requiredFiles.includes("docs/elixir-alpha-support.md"));
    assert.ok(requiredFiles.includes("docs/elixir-jason-validation-report.md"));
    assert.ok(requiredFiles.includes("docs/rust-alpha-support.md"));
    assert.ok(requiredFiles.includes("docs/ruby-alpha-support.md"));
    assert.ok(requiredFiles.includes("docs/php-alpha-support.md"));
    assert.ok(requiredFiles.includes("docs/php-brick-math-validation-report.md"));
    assert.ok(requiredFiles.includes("docs/php-guzzle-validation-report.md"));
    assert.ok(requiredFiles.includes("docs/php-ramsey-uuid-validation-report.md"));
    assert.ok(requiredFiles.includes("docs/ruby-factory-bot-validation-report.md"));
    assert.ok(requiredFiles.includes("docs/ruby-helper-return-validation-report.md"));
    assert.ok(requiredFiles.includes("docs/ruby-rubyzip-validation-report.md"));
    assert.ok(requiredFiles.includes("examples/go-testing-basic/go.mod"));
    assert.ok(requiredFiles.includes("examples/csharp-sdk-xunit-basic/CheckoutRules.Tests.csproj"));
    assert.ok(requiredFiles.includes("examples/csharp-sdk-project-pair/src/CheckoutRules/CheckoutRules.csproj"));
    assert.ok(requiredFiles.includes("examples/csharp-sdk-project-pair/tests/CheckoutRules.Tests/CheckoutRules.Tests.csproj"));
    assert.ok(requiredFiles.includes("examples/csharp-sdk-project-pair/tests/CheckoutRules.Tests/CheckoutServiceTests.cs"));
    assert.ok(requiredFiles.includes("examples/csharp-sdk-unique-pair/Directory.Build.props"));
    assert.ok(requiredFiles.includes("examples/csharp-sdk-unique-pair/Directory.Packages.props"));
    assert.ok(requiredFiles.includes("examples/csharp-sdk-unique-pair/src/Pricing/Pricing.csproj"));
    assert.ok(requiredFiles.includes("examples/csharp-sdk-unique-pair/tests/Pricing.Tests/Pricing.Tests.csproj"));
    assert.ok(requiredFiles.includes("examples/csharp-sdk-unique-pair/tests/Pricing.Tests/PriceCalculatorTests.cs"));
    assert.ok(requiredFiles.includes("examples/go-build-target-basic/go.mod"));
    assert.ok(requiredFiles.includes("examples/go-workspace-basic/go.work"));
    assert.ok(requiredFiles.includes("examples/go-workspace-basic/services/checkout/go.mod"));
    assert.ok(requiredFiles.includes("examples/rust-cargo-basic/Cargo.toml"));
    assert.ok(requiredFiles.includes("examples/rust-cargo-custom-targets/Cargo.toml"));
    assert.ok(requiredFiles.includes("src/adapters/rust/cargo-workspace.js"));
    assert.ok(requiredFiles.includes("docs/rust-ripgrep-validation-report.md"));
    assert.ok(requiredFiles.includes("examples/rust-cargo-workspace-basic/Cargo.toml"));
    assert.ok(requiredFiles.includes("examples/rust-cargo-workspace-basic/services/checkout/Cargo.toml"));
    assert.ok(requiredFiles.includes("examples/ruby-minitest-basic/Gemfile"));
    assert.ok(requiredFiles.includes("examples/ruby-minitest-basic/Gemfile.lock"));
    assert.ok(requiredFiles.includes("examples/php-phpunit-basic/composer.lock"));
    assert.ok(requiredFiles.includes("examples/elixir-mix-exunit-basic/mix.exs"));
    assert.ok(requiredFiles.includes("schemas/diagnostic-event-v1.schema.json"));
    assert.ok(requiredFiles.includes("schemas/doctor-report-v1.schema.json"));
    assert.ok(requiredFiles.includes("schemas/diagnostic-bundle-v1.schema.json"));
    assert.ok(requiredFiles.includes("schemas/validation-corpus-v1.schema.json"));
    assert.ok(requiredFiles.includes("schemas/validation-scorecard-v1.schema.json"));
    assert.ok(requiredFiles.includes("evals/validation-corpus.json"));
    assert.ok(requiredFiles.includes("scripts/check-validation-corpus.js"));
    assert.ok(requiredFiles.includes("scripts/render-validation-scorecard.js"));
    assert.ok(requiredFiles.includes("scripts/check-csharp-performance.js"));
    assert.ok(requiredFiles.includes("scripts/check-elixir-performance.js"));
    assert.ok(requiredFiles.includes("scripts/check-elixir-native-fixture.js"));
    assert.ok(requiredFiles.includes("scripts/check-go-performance.js"));
    assert.ok(requiredFiles.includes("scripts/check-javascript-performance.js"));
    assert.ok(requiredFiles.includes("scripts/check-ruby-performance.js"));
    assert.ok(requiredFiles.includes("scripts/check-ruby-native-fixture.js"));
    assert.ok(requiredFiles.includes("scripts/check-php-performance.js"));
    assert.ok(requiredFiles.includes("scripts/check-php-native-fixture.js"));
    assert.ok(requiredFiles.includes("scripts/check-bin-entrypoints.js"));
    assert.ok(requiredFiles.includes("scripts/check-demo-script.js"));
    assert.ok(requiredFiles.includes("scripts/check-distribution-readiness.js"));
    assert.ok(requiredFiles.includes("scripts/check-installed-package.js"));
    assert.ok(requiredFiles.includes("scripts/check-mcp-stdio-smoke.js"));
    assert.ok(requiredFiles.includes("scripts/check-smoke.js"));
    assert.ok(requiredFiles.includes("scripts/check-release-readiness.js"));
    assert.ok(requiredFiles.includes("scripts/support/npm-runner.js"));
  });
});
