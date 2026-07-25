export const mcpServerInfo = Object.freeze({
  name: "repo-test-architect",
  version: "0.1.1"
});

export const mcpServerInstructions = [
  "Start with analyze_repository for an unfamiliar repository or a general request to review test architecture.",
  "Treat blockers and unsupported projects as explicit audit coverage gaps.",
  "Use specialist tools only when the user requests a narrower artifact or supplies an existing audit artifact.",
  "Use audit_repo only for an explicitly selected single project root and adapter; it defaults to JavaScript.",
  "Do not reclassify repository facts from raw source when a deterministic artifact already provides them.",
  "generate_selected_test is deferred and does not write test code."
].join(" ");
