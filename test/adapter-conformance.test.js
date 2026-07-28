import { describe, it } from "node:test";
import { assertAdapterConformance } from "./support/adapter-conformance.js";

const cases = [
  {
    adapterId: "csharp",
    fixturePath: "examples/csharp-sdk-xunit-basic",
    expectedMaturity: "experimental",
    expectedProfile: {
      languages: ["csharp"],
      testFrameworks: ["xunit"],
      testCommand: "dotnet test CheckoutRules.Tests.csproj",
      confidence: "high"
    }
  },
  {
    adapterId: "javascript",
    fixturePath: "examples/node-vitest-basic",
    expectedProfile: {
      languages: ["typescript"],
      testFrameworks: ["vitest"],
      testCommand: "npm run test",
      confidence: "high"
    }
  },
  {
    adapterId: "go",
    fixturePath: "examples/go-testing-basic",
    expectedMaturity: "supported",
    expectedProfile: {
      languages: ["go"],
      testFrameworks: ["go-testing"],
      testCommand: "go test ./...",
      confidence: "high"
    }
  },
  {
    adapterId: "kotlin",
    fixturePath: "examples/kotlin-junit-basic",
    expectedProfile: {
      languages: ["java", "kotlin"],
      testFrameworks: ["junit", "kotlin-test"],
      testCommand: "gradle test",
      confidence: "high"
    }
  },
  {
    adapterId: "python",
    fixturePath: "examples/python-pytest-service",
    expectedProfile: {
      languages: ["python"],
      testFrameworks: ["pytest"],
      testCommand: "pytest",
      confidence: "high"
    }
  },
  {
    adapterId: "rust",
    fixturePath: "examples/rust-cargo-basic",
    expectedMaturity: "experimental",
    expectedProfile: {
      languages: ["rust"],
      testFrameworks: ["rust-test"],
      testCommand: "cargo test",
      confidence: "high"
    }
  },
  {
    adapterId: "swift",
    fixturePath: "examples/swift-spm-xctest",
    expectedProfile: {
      languages: ["swift"],
      testFrameworks: ["XCTest"],
      testCommand: "swift test",
      confidence: "high"
    }
  }
];

describe("shared adapter conformance", () => {
  for (const corpusCase of cases) {
    it(`keeps ${corpusCase.adapterId} audit and downstream artifacts aligned`, () => {
      assertAdapterConformance(corpusCase);
    });
  }
});
