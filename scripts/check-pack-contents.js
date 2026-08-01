#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNpmInvocation } from "./support/npm-runner.js";

export const allowedTopLevelEntries = new Set([
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "server.json",
  "docs",
  "evals",
  "examples",
  "package.json",
  "schemas",
  "scripts",
  "src"
]);

export const requiredFiles = [
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "server.json",
  "package.json",
  "src/cli/package-entry.js",
  "src/cli/index.js",
  "src/mcp/stdio.js",
  "src/mcp/invoke.js",
  "src/mcp/server-info.js",
  "src/mcp/tool-definitions.js",
  "src/diagnostics/diagnostics.js",
  "src/adapters/csharp/audit.js",
  "src/adapters/csharp/directory-packages-props.js",
  "src/adapters/go/audit.js",
  "src/adapters/rust/audit.js",
  "src/adapters/rust/cargo-workspace.js",
  "src/adapters/ruby/audit.js",
  "src/adapters/php/audit.js",
  "docs/go-alpha-support.md",
  "docs/csharp-alpha-support.md",
  "docs/csharp-tdd-validation-report.md",
  "docs/csharp-sharp-cast-validation-report.md",
  "docs/csharp-central-packages-validation-report.md",
  "docs/csharp-multi-target-validation-report.md",
  "docs/rust-alpha-support.md",
  "docs/rust-ripgrep-validation-report.md",
  "docs/ruby-alpha-support.md",
  "docs/php-alpha-support.md",
  "docs/php-brick-math-validation-report.md",
  "docs/php-guzzle-validation-report.md",
  "docs/php-ramsey-uuid-validation-report.md",
  "docs/ruby-factory-bot-validation-report.md",
  "docs/ruby-faraday-validation-report.md",
  "docs/ruby-helper-return-validation-report.md",
  "docs/ruby-rubyzip-validation-report.md",
  "examples/go-testing-basic/go.mod",
  "examples/csharp-sdk-xunit-basic/CheckoutRules.Tests.csproj",
  "examples/csharp-sdk-project-pair/src/CheckoutRules/CheckoutRules.csproj",
  "examples/csharp-sdk-project-pair/tests/CheckoutRules.Tests/CheckoutRules.Tests.csproj",
  "examples/csharp-sdk-project-pair/tests/CheckoutRules.Tests/CheckoutServiceTests.cs",
  "examples/csharp-sdk-unique-pair/Directory.Build.props",
  "examples/csharp-sdk-unique-pair/Directory.Packages.props",
  "examples/csharp-sdk-unique-pair/src/Pricing/Pricing.csproj",
  "examples/csharp-sdk-unique-pair/tests/Pricing.Tests/Pricing.Tests.csproj",
  "examples/csharp-sdk-unique-pair/tests/Pricing.Tests/PriceCalculatorTests.cs",
  "examples/go-build-target-basic/go.mod",
  "examples/go-workspace-basic/go.work",
  "examples/go-workspace-basic/services/checkout/go.mod",
  "examples/rust-cargo-basic/Cargo.toml",
  "examples/rust-cargo-custom-targets/Cargo.toml",
  "examples/rust-cargo-workspace-basic/Cargo.toml",
  "examples/rust-cargo-workspace-basic/services/checkout/Cargo.toml",
  "examples/ruby-minitest-basic/Gemfile",
  "examples/ruby-minitest-basic/Gemfile.lock",
  "examples/php-phpunit-basic/composer.json",
  "examples/php-phpunit-basic/composer.lock",
  "examples/php-phpunit-basic/phpunit.xml.dist",
  "examples/php-phpunit-basic/src/Parser.php",
  "examples/php-phpunit-basic/tests/ParserTest.php",
  "schemas/audit-v1.schema.json",
  "schemas/diagnostic-event-v1.schema.json",
  "schemas/doctor-report-v1.schema.json",
  "schemas/diagnostic-bundle-v1.schema.json",
  "schemas/plan-execution-hints-v1.schema.json",
  "schemas/project-findings-v1.schema.json",
  "schemas/project-stats-v1.schema.json",
  "schemas/model-consistency-stats-v1.schema.json",
  "schemas/validation-corpus-v1.schema.json",
  "schemas/validation-scorecard-v1.schema.json",
  "evals/validation-corpus.json",
  "scripts/check-validation-corpus.js",
  "scripts/render-validation-scorecard.js",
  "scripts/check-csharp-performance.js",
  "scripts/check-go-performance.js",
  "scripts/check-javascript-performance.js",
  "scripts/check-ruby-performance.js",
  "scripts/check-ruby-native-fixture.js",
  "scripts/check-php-performance.js",
  "scripts/check-php-native-fixture.js",
  "scripts/check-pack-contents.js",
  "scripts/check-bin-entrypoints.js",
  "scripts/check-demo-script.js",
  "scripts/check-distribution-readiness.js",
  "scripts/check-installed-package.js",
  "scripts/check-mcp-stdio-smoke.js",
  "scripts/check-smoke.js",
  "scripts/check-release-readiness.js",
  "scripts/support/npm-runner.js"
];

if (isMainModule()) {
  runPackContentsCheck();
}

export function runPackContentsCheck() {
  const npm = resolveNpmInvocation();
  const output = execFileSync(npm.command, [...npm.args, "pack", "--dry-run", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const [pack] = JSON.parse(output);
  const paths = pack.files.map((file) => normalizePath(file.path));
  const topLevelEntries = new Set(paths.map((filePath) => filePath.split("/")[0]));
  const unexpectedTopLevelEntries = [...topLevelEntries].filter((entry) => !allowedTopLevelEntries.has(entry)).sort();
  const missingRequiredFiles = requiredFiles.filter((filePath) => !paths.includes(filePath));
  const leakedTestFiles = paths.filter((filePath) => filePath === "test" || filePath.startsWith("test/")).sort();
  const leakedBuildOutputs = findLeakedBuildOutputs(paths);

  if (unexpectedTopLevelEntries.length > 0 || missingRequiredFiles.length > 0 || leakedTestFiles.length > 0 || leakedBuildOutputs.length > 0) {
    if (unexpectedTopLevelEntries.length > 0) {
      console.error(`Unexpected packed top-level entries: ${unexpectedTopLevelEntries.join(", ")}`);
    }

    if (missingRequiredFiles.length > 0) {
      console.error(`Missing required packed files: ${missingRequiredFiles.join(", ")}`);
    }

    if (leakedTestFiles.length > 0) {
      console.error(`Test files should not be packed: ${leakedTestFiles.join(", ")}`);
    }

    if (leakedBuildOutputs.length > 0) {
      console.error(`Generated build outputs should not be packed: ${leakedBuildOutputs.join(", ")}`);
    }

    process.exit(1);
  }

  console.log(`Pack contents check passed (${paths.length} files).`);
}

export function findLeakedBuildOutputs(paths) {
  return paths.filter((filePath) => /(?:^|\/)(?:bin|obj)\//.test(normalizePath(filePath))).sort();
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
