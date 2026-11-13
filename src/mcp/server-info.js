export const mcpServerInfo = Object.freeze({
  name: "repo-test-architect",
  version: "1.3.0"
});

export const mcpServerInstructions = [
  "Start with review_repository for an unfamiliar repository or a general request to review test architecture; it returns a bounded review that fits a model's context.",
  "Use analyze_repository only when the complete bundle with per-target evidence is explicitly needed; it can exceed client limits on large repositories.",
  "Treat blockers, unsupported projects, and failedProjects entries as explicit audit coverage gaps.",
  "Use specialist tools only when the user requests a narrower artifact or supplies an existing audit artifact; pass repoRoot (plus projectRoot for single-project tools) instead of echoing a large artifact back.",
  "Use audit_repo only for an explicitly selected single project root and adapter; it defaults to JavaScript.",
  "Do not reclassify repository facts from raw source when a deterministic artifact already provides them.",
  "generate_selected_test is deferred and does not write test code."
].join(" ");
