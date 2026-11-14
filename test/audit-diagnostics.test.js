import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyLegacyBlocker,
  createDiagnostic,
  diagnosticsToBlockers,
  resolveAuditDiagnostics,
  scoreAuditConfidence
} from "../src/core/audit-diagnostics.js";

describe("audit diagnostics", () => {
  it("validates diagnostic entries", () => {
    const diagnostic = createDiagnostic({ code: "missing-test-target", scope: "test-infrastructure", severity: "medium", message: "No test target." });
    assert.deepEqual(diagnostic, { code: "missing-test-target", scope: "test-infrastructure", severity: "medium", message: "No test target." });
    assert.ok(Object.isFrozen(diagnostic));
    assert.throws(() => createDiagnostic({ code: "Bad Code", scope: "audit", severity: "high", message: "x" }), /kebab-case/);
    assert.throws(() => createDiagnostic({ code: "x", scope: "tests", severity: "high", message: "x" }), /scope/);
    assert.throws(() => createDiagnostic({ code: "x", scope: "audit", severity: "urgent", message: "x" }), /severity/);
    assert.throws(() => createDiagnostic({ code: "x", scope: "audit", severity: "high", message: "" }), /message/);
  });

  it("projects only audit and command scopes into blockers, without duplicates", () => {
    const diagnostics = [
      createDiagnostic({ code: "missing-test-target", scope: "test-infrastructure", severity: "medium", message: "No test target." }),
      createDiagnostic({ code: "ambiguous-xcode-scheme", scope: "command", severity: "medium", message: "Multiple shared Xcode schemes detected." }),
      createDiagnostic({ code: "android-jvm-conventions", scope: "audit", severity: "medium", message: "Android modules are audited with JVM conventions." }),
      createDiagnostic({ code: "ambiguous-xcode-scheme", scope: "command", severity: "medium", message: "Multiple shared Xcode schemes detected." })
    ];
    assert.deepEqual(diagnosticsToBlockers(diagnostics), [
      "Multiple shared Xcode schemes detected.",
      "Android modules are audited with JVM conventions."
    ]);
  });

  it("classifies the known historical blocker messages and keeps unknown ones as audit blockers", () => {
    assert.deepEqual(classifyLegacyBlocker("No supported Swift test framework detected."), { code: "missing-test-framework", scope: "test-infrastructure", severity: "medium" });
    assert.deepEqual(classifyLegacyBlocker("No runnable standard Go test detected."), { code: "missing-tests", scope: "test-infrastructure", severity: "medium" });
    assert.deepEqual(classifyLegacyBlocker("Multiple shared Xcode schemes detected without a unique workspace or project name match: A, B."), { code: "ambiguous-xcode-scheme", scope: "command", severity: "medium" });
    assert.deepEqual(classifyLegacyBlocker("Swift sources import UIKit, which swift test cannot build on macOS; run xcodebuild test."), { code: "host-unavailable-framework", scope: "command", severity: "medium" });
    assert.deepEqual(classifyLegacyBlocker("Android unit and instrumentation source sets are outside the supported JVM module boundary."), { code: "android-jvm-conventions", scope: "audit", severity: "medium" });
    assert.deepEqual(classifyLegacyBlocker("No package.json found, so JavaScript package conventions are uncertain."), { code: "missing-package-manifest", scope: "audit", severity: "medium" });
    assert.deepEqual(classifyLegacyBlocker("Custom Gradle projectDir remaps are outside the supported aggregate ownership boundary: :tokens."), { code: "audit-blocker", scope: "audit", severity: "high" });
  });

  it("resolves diagnostics from a profile, preferring explicit entries and sanitising them", () => {
    const legacy = resolveAuditDiagnostics({ blockers: ["No supported JS test framework detected.", "Weird thing."] });
    assert.deepEqual(legacy.map((diagnostic) => [diagnostic.scope, diagnostic.severity, diagnostic.code]), [
      ["test-infrastructure", "medium", "missing-test-framework"],
      ["audit", "high", "audit-blocker"]
    ]);

    const explicit = resolveAuditDiagnostics({
      blockers: ["Odd entry.", "Edited in afterwards."],
      diagnostics: [
        { code: "missing-test-target", scope: "test-infrastructure", severity: "medium", message: "No test target." },
        { code: "Not Kebab", scope: "audit", severity: "urgent", message: "Odd entry." },
        { scope: "nowhere", message: "Dropped." },
        "not an object"
      ]
    });
    assert.deepEqual(explicit, [
      { code: "missing-test-target", scope: "test-infrastructure", severity: "medium", message: "No test target." },
      { code: "unclassified", scope: "audit", severity: "high", message: "Odd entry." },
      { code: "audit-blocker", scope: "audit", severity: "high", message: "Edited in afterwards." }
    ], "a blocker no diagnostic explains is classified rather than dropped");
    assert.deepEqual(resolveAuditDiagnostics({}), []);
    assert.deepEqual(resolveAuditDiagnostics(undefined), []);
  });

  it("scores confidence from audit-scope diagnostics and recognised test frameworks only", () => {
    const high = createDiagnostic({ code: "a", scope: "audit", severity: "high", message: "a" });
    const medium = createDiagnostic({ code: "b", scope: "audit", severity: "medium", message: "b" });
    const command = createDiagnostic({ code: "c", scope: "command", severity: "medium", message: "c" });
    const infrastructure = createDiagnostic({ code: "d", scope: "test-infrastructure", severity: "medium", message: "d" });
    const withTests = { testFrameworks: ["XCTest"], existingTestLocations: ["Tests"] };

    assert.equal(scoreAuditConfidence({ diagnostics: [high, medium], ...withTests }), "low");
    assert.equal(scoreAuditConfidence({ diagnostics: [medium], ...withTests }), "medium");
    assert.equal(scoreAuditConfidence({ diagnostics: [command, infrastructure], ...withTests }), "high");
    assert.equal(scoreAuditConfidence({ diagnostics: [], ...withTests }), "high");
    assert.equal(scoreAuditConfidence({ diagnostics: [], testFrameworks: ["XCTest"], existingTestLocations: [] }), "medium");
    assert.equal(scoreAuditConfidence({ diagnostics: [infrastructure], testFrameworks: [], existingTestLocations: [] }), "medium");
  });
});
