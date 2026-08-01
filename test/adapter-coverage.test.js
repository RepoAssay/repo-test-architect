import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adapterCoverageCases,
  coverageThresholdFailures,
  parseAdapterCoverage
} from "../scripts/check-adapter-coverage.js";

describe("adapter coverage regression gate", () => {
  it("locks adapter-owned sources, tests, and minimums", () => {
    assert.deepEqual(adapterCoverageCases, [
      {
        adapterId: "csharp",
        sourcePath: "src/adapters/csharp/audit.js",
        testPath: "test/csharp-audit.test.js",
        thresholds: { lines: 94, branches: 88, functions: 95 }
      },
      {
        adapterId: "javascript",
        sourcePath: "src/adapters/javascript/audit.js",
        testPath: "test/javascript-audit.test.js",
        thresholds: { lines: 94, branches: 87, functions: 95 }
      },
      {
        adapterId: "go",
        sourcePath: "src/adapters/go/audit.js",
        testPath: "test/go-audit.test.js",
        thresholds: { lines: 95, branches: 90, functions: 95 }
      },
      {
        adapterId: "php",
        sourcePath: "src/adapters/php/audit.js",
        testPath: "test/php-audit.test.js",
        thresholds: { lines: 88, branches: 78, functions: 88 }
      },
      {
        adapterId: "python",
        sourcePath: "src/adapters/python/audit.js",
        testPath: "test/python-audit.test.js",
        thresholds: { lines: 95, branches: 85, functions: 95 }
      },
      {
        adapterId: "rust",
        sourcePath: "src/adapters/rust/audit.js",
        testPath: "test/rust-audit.test.js",
        thresholds: { lines: 95, branches: 88, functions: 97 }
      },
      {
        adapterId: "ruby",
        sourcePath: "src/adapters/ruby/audit.js",
        testPath: "test/ruby-audit.test.js",
        thresholds: { lines: 90, branches: 80, functions: 90 }
      },
      {
        adapterId: "kotlin",
        sourcePath: "src/adapters/kotlin/audit.js",
        testPath: "test/kotlin-audit.test.js",
        thresholds: { lines: 94, branches: 92, functions: 97 }
      },
      {
        adapterId: "swift",
        sourcePath: "src/adapters/swift/audit.js",
        testPath: "test/swift-audit.test.js",
        thresholds: { lines: 96, branches: 92, functions: 98 }
      }
    ]);
  });

  it("parses the adapter row from Windows-style coverage output", () => {
    const output = [
      "# file                          | line % | branch % | funcs % | uncovered lines",
      "# src\\adapters\\python\\audit.js |  96.52 |    87.70 |   96.64 | 226-228",
      "# test\\python-audit.test.js     | 100.00 |   100.00 |  100.00 |"
    ].join("\r\n");

    assert.deepEqual(parseAdapterCoverage(output, "./src/adapters/python/audit.js"), {
      lines: 96.52,
      branches: 87.7,
      functions: 96.64
    });
  });

  it("parses hierarchical coverage output from newer Node releases", () => {
    const output = [
      "ℹ file          | line % | branch % | funcs % | uncovered lines",
      "ℹ src           |        |          |         |",
      "ℹ  adapters     |        |          |         |",
      "ℹ   swift       |        |          |         |",
      "ℹ    audit.js   |  97.51 |    93.94 |   99.04 | 100-101"
    ].join("\n");

    assert.deepEqual(parseAdapterCoverage(output, "src/adapters/swift/audit.js"), {
      lines: 97.51,
      branches: 93.94,
      functions: 99.04
    });
  });

  it("rejects missing and invalid adapter coverage rows", () => {
    assert.throws(
      () => parseAdapterCoverage("# test/python-audit.test.js | 100.00 | 100.00 | 100.00 |", "src/adapters/python/audit.js"),
      /does not contain src\/adapters\/python\/audit\.js/
    );
    assert.throws(
      () => parseAdapterCoverage("# src/adapters/python/audit.js | unavailable | 87.70 | 96.64 |", "src/adapters/python/audit.js"),
      /contains invalid metrics/
    );
  });

  it("accepts exact minimums and reports every shortfall", () => {
    const thresholds = { lines: 95, branches: 85, functions: 95 };
    assert.deepEqual(
      coverageThresholdFailures("python", { lines: 95, branches: 85, functions: 95 }, thresholds),
      []
    );
    assert.deepEqual(
      coverageThresholdFailures("python", { lines: 94.99, branches: 84.5, functions: 94 }, thresholds),
      [
        "python: lines coverage 94.99% is below the 95.00% minimum.",
        "python: branches coverage 84.50% is below the 85.00% minimum.",
        "python: functions coverage 94.00% is below the 95.00% minimum."
      ]
    );
  });
});
