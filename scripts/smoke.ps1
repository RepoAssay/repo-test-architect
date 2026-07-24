$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$required = @(
  "package.json",
  "src/cli/index.js",
  "src/mcp/tool-definitions.js",
  "src/mcp/invoke.js",
  "src/mcp/json-rpc.js",
  "src/mcp/responses.js",
  "src/mcp/stdio.js",
  "src/adapters/javascript/audit.js",
  "src/adapters/javascript/audit.ts",
  "src/core/audit-model.ts",
  "src/core/adapter-registry.js",
  "src/core/project-detector.js",
  "src/core/project-auditor.js",
  "src/core/project-audit-summary.js",
  "src/core/project-candidate-ranking.js",
  "src/core/project-test-plan.js",
  "src/core/project-findings.js",
  "src/core/project-test-placement-analysis.js",
  "src/core/project-stats.js",
  "src/core/model-consistency-stats.js",
  "scripts/collect-model-consistency-stats.js",
  "scripts/check-pack-contents.js",
  "scripts/check-bin-entrypoints.js",
  "scripts/check-demo-script.js",
  "scripts/check-installed-package.js",
  "scripts/check-mcp-stdio-smoke.js",
  "scripts/check-smoke.js",
  "scripts/check-release-readiness.js",
  "scripts/support/npm-runner.js",
  "examples/mcp/polyglot-project-audits.args.json",
  "examples/node-vitest-basic/package.json",
  "examples/node-vitest-basic/tsconfig.json",
  "examples/node-vitest-basic/vitest.config.ts",
  "examples/node-vitest-basic/src/deckParser.ts",
  "examples/node-vitest-basic/src/deckParser.test.ts",
  "examples/node-vitest-basic/src/authService.ts",
  "examples/node-vitest-basic/src/userDto.ts",
  "examples/node-no-tests-yet/package.json",
  "examples/node-no-tests-yet/src/paymentParser.ts",
  "examples/node-no-tests-yet/src/paymentClient.ts",
  "examples/node-no-tests-yet/src/paymentResponseDto.ts",
  "examples/node-no-tests-yet/src/config.ts",
  "examples/node-jest-service/package.json",
  "examples/node-jest-service/jest.config.js",
  "examples/node-jest-service/src/invoiceService.ts",
  "examples/node-jest-service/src/invoiceParser.ts",
  "examples/node-jest-service/src/invoiceParser.spec.ts",
  "examples/node-jest-service/src/invoiceDto.ts",
  "examples/node-jest-service/src/constants.ts",
  "examples/express-supertest/package.json",
  "examples/express-supertest/jest.config.js",
  "examples/express-supertest/src/app.ts",
  "examples/express-supertest/src/routes/userRoutes.ts",
  "examples/express-supertest/src/routes/userRoutes.test.ts",
  "examples/express-supertest/src/services/userService.ts",
  "examples/express-supertest/src/models/userDto.ts",
  "examples/react-testing-library/package.json",
  "examples/react-testing-library/vitest.config.ts",
  "examples/react-testing-library/src/components/LoginForm.tsx",
  "examples/react-testing-library/src/components/LoginForm.test.tsx",
  "examples/react-testing-library/src/components/Avatar.tsx",
  "examples/react-testing-library/src/services/sessionService.ts",
  "examples/react-testing-library/src/models/sessionDto.ts",
  "examples/polyglot-workspace/apps/web/package.json",
  "examples/polyglot-workspace/apps/web/src/sessionClient.ts",
  "examples/polyglot-workspace/apps/android/build.gradle.kts",
  "examples/polyglot-workspace/apps/android/src/main/kotlin/CheckoutCalculator.kt",
  "examples/polyglot-workspace/services/api/pyproject.toml",
  "examples/polyglot-workspace/services/api/app.py"
)

foreach ($relative in $required) {
  $path = Join-Path $root $relative
  if (-not (Test-Path $path)) {
    throw "Missing required file: $relative"
  }
}

$adapter = Get-Content (Join-Path $root "src/adapters/javascript/audit.js") -Raw
foreach ($signal in @("vitest", "pure-logic", "auth or permission branches", "testCommand", "existingTestLocations")) {
  if (-not $adapter.Contains($signal)) {
    throw "Missing expected adapter signal: $signal"
  }
}

$mcpTools = Get-Content (Join-Path $root "src/mcp/tool-definitions.js") -Raw
foreach ($tool in @("list_adapters", "list_project_detection_rules", "detect_projects", "audit_projects", "summarize_project_audits", "rank_project_candidates", "generate_project_test_plan", "analyze_project_test_placement", "collect_project_stats", "audit_repo", "get_audit_graph", "generate_test_plan", "get_plan_execution_hints", "explain_target", "rank_test_candidates", "analyze_test_placement", "generate_selected_test")) {
  if (-not $mcpTools.Contains($tool)) {
    throw "Missing expected MCP tool: $tool"
  }
}

$adapterRegistry = Get-Content (Join-Path $root "src/core/adapter-registry.js") -Raw
foreach ($signal in @("ecosystems", "javascript", "typescript")) {
  if (-not $adapterRegistry.Contains($signal)) {
    throw "Missing expected adapter registry signal: $signal"
  }
}

$projectDetector = Get-Content (Join-Path $root "src/core/project-detector.js") -Raw
foreach ($signal in @("Package.swift", "pyproject.toml", "Gemfile", "composer.json", "mix.exs", "go.mod", "Cargo.toml", ".csproj", "pom.xml", "build.gradle.kts", "ecosystem")) {
  if (-not $projectDetector.Contains($signal)) {
    throw "Missing expected project detector signal: $signal"
  }
}

Write-Host "Smoke check passed."
