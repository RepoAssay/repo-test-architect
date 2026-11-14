/**
 * Structured audit diagnostics (#312).
 *
 * A profile can carry `diagnostics`, each with a scope that says what the message is about:
 * - "audit": the source or evidence audit itself is bounded or unreliable (severity high when
 *   attribution cannot be trusted, medium when a known bound applies);
 * - "command": no runnable test command could be established, while the audit stands;
 * - "test-infrastructure": the project has no test target, framework or runnable tests at all.
 *
 * `profile.blockers` remains the string projection of the audit and command scopes. Artifacts
 * written before diagnostics existed carry only blocker strings; `resolveAuditDiagnostics`
 * classifies the known historical messages so that findings and confidence treat them the same
 * way, and leaves unknown messages as high-severity audit diagnostics, which is what they were.
 */

export const DIAGNOSTIC_SCOPES = Object.freeze(["audit", "command", "test-infrastructure"]);
export const DIAGNOSTIC_SEVERITIES = Object.freeze(["high", "medium", "low"]);

const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @typedef {{ code: string, scope: "audit" | "command" | "test-infrastructure", severity: "high" | "medium" | "low", message: string }} AuditDiagnostic
 */

/**
 * @param {AuditDiagnostic} diagnostic
 * @returns {AuditDiagnostic}
 */
export function createDiagnostic({ code, scope, severity, message }) {
  if (typeof code !== "string" || !CODE_PATTERN.test(code)) throw new Error(`Diagnostic code must be kebab-case: ${String(code)}`);
  if (!DIAGNOSTIC_SCOPES.includes(scope)) throw new Error(`Diagnostic scope must be one of ${DIAGNOSTIC_SCOPES.join(", ")}: ${String(scope)}`);
  if (!DIAGNOSTIC_SEVERITIES.includes(severity)) throw new Error(`Diagnostic severity must be one of ${DIAGNOSTIC_SEVERITIES.join(", ")}: ${String(severity)}`);
  if (typeof message !== "string" || message.length === 0) throw new Error(`Diagnostic ${code} needs a non-empty message.`);
  return Object.freeze({ code, scope, severity, message });
}

/**
 * The blocker strings a profile exposes for a list of diagnostics: audit and command scopes only,
 * in order, without duplicates. Missing test infrastructure is a coverage gap, not a blocker.
 * @param {AuditDiagnostic[]} diagnostics
 * @returns {string[]}
 */
export function diagnosticsToBlockers(diagnostics) {
  const blockers = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.scope === "test-infrastructure" || blockers.includes(diagnostic.message)) continue;
    blockers.push(diagnostic.message);
  }
  return blockers;
}

/**
 * @param {{ diagnostics?: unknown, blockers?: unknown, testFrameworks?: unknown, existingTestLocations?: unknown }} profile
 * @returns {AuditDiagnostic[]}
 */
export function resolveAuditDiagnostics(profile) {
  const explicit = Array.isArray(profile?.diagnostics)
    ? profile.diagnostics
      .filter((entry) => entry && typeof entry === "object" && DIAGNOSTIC_SCOPES.includes(entry.scope) && typeof entry.message === "string" && entry.message.length > 0)
      .map((entry) => createDiagnostic({
        code: CODE_PATTERN.test(entry.code ?? "") ? entry.code : "unclassified",
        scope: entry.scope,
        severity: DIAGNOSTIC_SEVERITIES.includes(entry.severity) ? entry.severity : "high",
        message: entry.message
      }))
    : [];
  // A blocker string that no diagnostic explains (an artifact written before diagnostics existed, or
  // one edited afterwards) is classified from the known historical messages so that it is never dropped.
  const explained = new Set(explicit.map((diagnostic) => diagnostic.message));
  const blockers = Array.isArray(profile?.blockers)
    ? [...new Set(profile.blockers.filter((entry) => typeof entry === "string" && entry.length > 0 && !explained.has(entry)))]
    : [];
  const context = {
    testFrameworks: Array.isArray(profile?.testFrameworks) ? profile.testFrameworks : [],
    existingTestLocations: Array.isArray(profile?.existingTestLocations) ? profile.existingTestLocations : []
  };
  return [...explicit, ...blockers.map((message) => createDiagnostic({ ...classifyLegacyBlocker(message, context), message }))];
}

// Known historical blocker messages, matched exactly or by prefix. Two kinds depend on the profile:
// a "framework" message means missing infrastructure only when the project has no test files at all
// (with tests present it bounds the evidence audit), and a "command" message withholds the command
// when a framework or tests exist and means missing infrastructure otherwise. Anything unknown stays
// what it always was: a high-severity audit blocker.
const LEGACY_EXACT = new Map([
  ["No supported JS test framework detected.", { kind: "framework" }],
  ["No runnable test command detected from package scripts or framework config.", { kind: "command" }],
  ["No supported JVM test framework detected.", { kind: "framework" }],
  ["No runnable JVM test command detected from Gradle or Maven markers.", { kind: "command" }],
  ["No supported Swift test framework detected.", { kind: "framework" }],
  ["No runnable Swift test command detected from Package.swift or Xcode project/workspace markers.", { kind: "command" }],
  ["No supported Python test framework detected.", { kind: "framework" }],
  ["No runnable Python test command detected from project markers.", { kind: "command" }],
  ["No declared package:test or SDK flutter_test dependency was found.", { kind: "framework" }],
  // C# reports this only for a project that is already a test project, so it bounds the audit.
  ["No supported xUnit, NUnit, or MSTest package reference detected.", { code: "missing-test-framework", scope: "audit", severity: "medium" }],
  ["No runnable attributed C# tests detected.", { code: "missing-tests", scope: "test-infrastructure", severity: "medium" }],
  ["No runnable conventional ExUnit *_test.exs module was detected.", { code: "missing-tests", scope: "test-infrastructure", severity: "medium" }],
  ["No runnable standard Go test detected.", { code: "missing-tests", scope: "test-infrastructure", severity: "medium" }],
  ["No runnable conventional PHPUnit *Test.php class was detected under the owned test roots.", { code: "missing-tests", scope: "test-infrastructure", severity: "medium" }],
  ["No runnable conventional Minitest or RSpec test detected.", { code: "missing-tests", scope: "test-infrastructure", severity: "medium" }],
  ["No runnable built-in Rust #[test] detected.", { code: "missing-tests", scope: "test-infrastructure", severity: "medium" }],
  ["No conventional test/*_test.dart entrypoint with main() and test registration was found.", { code: "missing-tests", scope: "test-infrastructure", severity: "medium" }],
  ["No owned Dart source files were found under lib/ or bin/.", { code: "missing-source-set", scope: "audit", severity: "high" }],
  ["No package.json found, so JavaScript package conventions are uncertain.", { code: "missing-package-manifest", scope: "audit", severity: "medium" }]
]);

const LEGACY_PREFIXES = [
  ["Multiple shared Xcode schemes", { code: "ambiguous-xcode-scheme", scope: "command", severity: "medium" }],

  ["No shared Xcode scheme declares a test action", { code: "no-testable-xcode-scheme", scope: "command", severity: "medium" }],
  ["Selected Xcode scheme", { code: "invalid-xcode-scheme-selection", scope: "command", severity: "medium" }],
  ["Multiple Xcode workspaces detected", { code: "ambiguous-xcode-container", scope: "command", severity: "medium" }],
  ["Multiple Xcode projects detected", { code: "ambiguous-xcode-container", scope: "command", severity: "medium" }],
  ["Multiple Xcode test plans detected", { code: "ambiguous-xcode-test-plan", scope: "command", severity: "medium" }],
  ["Swift sources import ", { code: "host-unavailable-framework", scope: "command", severity: "medium" }],
  ["Multiple package managers detected", { code: "ambiguous-package-manager", scope: "command", severity: "medium" }],
  ["Multiple runnable JVM test commands detected", { code: "competing-test-commands", scope: "command", severity: "medium" }],
  ["Multiple runnable Python test commands detected", { code: "competing-test-commands", scope: "command", severity: "medium" }],
  ["Android modules are audited with JVM conventions:", { code: "android-jvm-conventions", scope: "audit", severity: "medium" }],
  ["Android unit and instrumentation source sets are outside", { code: "android-jvm-conventions", scope: "audit", severity: "medium" }]
];

/**
 * @param {string} message
 * @param {{ testFrameworks?: string[], existingTestLocations?: string[] }} [context] the profile's recognised frameworks and test locations; without it a framework or command message is read as missing infrastructure
 * @returns {{ code: string, scope: "audit" | "command" | "test-infrastructure", severity: "high" | "medium" | "low" }}
 */
export function classifyLegacyBlocker(message, context = {}) {
  const hasFrameworks = (context.testFrameworks?.length ?? 0) > 0;
  const hasTests = (context.existingTestLocations?.length ?? 0) > 0;
  const exact = LEGACY_EXACT.get(message);
  if (exact?.kind === "framework") {
    return hasTests
      ? { code: "missing-test-framework", scope: "audit", severity: "medium" }
      : { code: "missing-test-framework", scope: "test-infrastructure", severity: "medium" };
  }
  if (exact?.kind === "command") {
    return hasFrameworks || hasTests
      ? { code: "missing-test-command", scope: "command", severity: "medium" }
      : { code: "missing-test-command", scope: "test-infrastructure", severity: "medium" };
  }
  if (exact) return exact;
  for (const [prefix, classification] of LEGACY_PREFIXES) {
    if (message.startsWith(prefix)) return classification;
  }
  return { code: "audit-blocker", scope: "audit", severity: "high" };
}

/**
 * Confidence in the source and evidence audit. Only audit-scope diagnostics lower it: a
 * high-severity one means attribution cannot be trusted, a medium one means a known bound applies.
 * A withheld command or missing test infrastructure does not change it; with no recognised test
 * framework nothing has exercised the evidence rules, which caps confidence at medium.
 * @param {{ diagnostics: AuditDiagnostic[], testFrameworks: string[], existingTestLocations: string[] }} input
 * @returns {"high" | "medium" | "low"}
 */
export function scoreAuditConfidence({ diagnostics, testFrameworks, existingTestLocations }) {
  const auditDiagnostics = diagnostics.filter((diagnostic) => diagnostic.scope === "audit");
  if (auditDiagnostics.some((diagnostic) => diagnostic.severity === "high")) return "low";
  if (auditDiagnostics.length > 0) return "medium";
  if (testFrameworks.length > 0 && existingTestLocations.length > 0) return "high";
  return "medium";
}
