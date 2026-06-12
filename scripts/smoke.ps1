$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$required = @(
  "package.json",
  "src/cli/index.js",
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
  "examples/express-supertest/src/models/userDto.ts"
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

Write-Host "Smoke check passed."
