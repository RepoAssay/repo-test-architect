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
  "examples/react-testing-library/src/models/sessionDto.ts"
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
foreach ($tool in @("audit_repo", "get_audit_graph", "generate_test_plan", "explain_target", "rank_test_candidates")) {
  if (-not $mcpTools.Contains($tool)) {
    throw "Missing expected MCP tool: $tool"
  }
}

Write-Host "Smoke check passed."
