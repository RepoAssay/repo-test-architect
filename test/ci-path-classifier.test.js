import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyCiPaths } from "../scripts/classify-ci-paths.js";

describe("CI path classifier", () => {
  it("keeps documentation-only changes on the focused Linux gate", () => {
    assert.deepEqual(classifyCiPaths(["README.md", "docs/distribution.md"]), {
      docsOnly: true,
      release: false,
      windows: false,
      macos: false,
    });
  });

  it("runs alpha validation and Windows coverage for shared runtime changes", () => {
    assert.deepEqual(classifyCiPaths(["src/core/project-auditor.js"]), {
      docsOnly: false,
      release: false,
      windows: true,
      macos: false,
    });
  });

  it("adds macOS coverage for Swift adapter changes", () => {
    assert.deepEqual(classifyCiPaths(["src/adapters/swift/audit.js"]), {
      docsOnly: false,
      release: false,
      windows: true,
      macos: true,
    });
  });

  it("runs the complete cross-platform release policy for workflow changes", () => {
    assert.deepEqual(classifyCiPaths([".github/workflows/ci.yml"]), {
      docsOnly: false,
      release: true,
      windows: true,
      macos: true,
    });
  });

  it("runs release and portability checks for package metadata changes", () => {
    assert.deepEqual(classifyCiPaths(["package-lock.json"]), {
      docsOnly: false,
      release: true,
      windows: true,
      macos: true,
    });
  });

  it("does not spend cross-platform minutes on test-only changes", () => {
    assert.deepEqual(classifyCiPaths(["test/project-auditor.test.js"]), {
      docsOnly: false,
      release: false,
      windows: false,
      macos: false,
    });
  });
});
