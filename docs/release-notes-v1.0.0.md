# Repo Test Architect 1.0.0

Status: prepared for stable publication. npm, Official MCP Registry and GitHub publication must be verified before this version is described as published.

## Stable Contract

The first stable release covers the documented CLI commands, 19 MCP tools, configuration behavior and versioned artifact schemas. Ten adapters are supported within their published matrices: JavaScript/TypeScript, Python, Swift, Kotlin/JVM, Go, C#, Rust, Ruby, PHP and Elixir. Dart/Flutter remains experimental. Analysis is local and advisory; static evidence does not prove that tests pass or establish runtime coverage. Native test generation remains deferred.

After 1.0, compatible correctness/security fixes use patch releases, compatible additions use minor releases, and public contract breaks require a major release with migration guidance. Adapter limits remain explicit; stable does not promise arbitrary build evaluation or complete dynamic-language analysis.

## Changes Since Beta.2

- Fix project detection and discovery for manifest-free Python unittest repositories, including accurate discovery scope reporting (#280).
- Update production dependencies: Hono 4.13.0 to 4.13.7, ip-address 10.4.0 to 10.7.2, MCP SDK 1.30.0 to 1.30.1, yaml 2.9.0 to 2.9.1, and fast-uri 3.1.7 to 3.1.8 (#278, #281, #282).
- Align npm, MCP server information, diagnostics and Registry metadata at 1.0.0 and promote the stable channel after verification.

The beta line also introduced experimental Dart/Flutter auditing and cross-adapter ownership, lexical-evidence and command-safety repairs. Users upgrading from the prior npm default 0.3.0 should review the [beta.1](release-notes-v1.0.0-beta.1.md) and [beta.2](release-notes-v1.0.0-beta.2.md) notes. Corrected findings and withheld commands can change audit results without changing artifact schemas.

## Installation And Upgrade

After publication, Node.js 20 or newer is required:

```sh
npx --yes repo-test-architect@1.0.0 doctor
npx --yes repo-test-architect@1.0.0 analyze .
npm install --global repo-test-architect@1.0.0
```

For MCP clients, use `npx --yes repo-test-architect@1.0.0 mcp`. Existing unversioned installs follow npm `latest`; clients pinned to a beta version or `@beta` must change their package argument to receive stable. CLI binary names and existing client configuration structure are unchanged.

## Promotion And Verification

The [October 1 decision](decision-log.md#accelerate-stable-100-promotion) approves direct stable promotion without a separate RC. Maintainer validation is the accepted evidence basis. The package has users, but their workflows are largely unknown by design: repository analysis stays local without usage telemetry. Formal feedback loops are not established, and elapsed beta time is not represented as a clean period after the recent fixes.

Before publication, run the full local release and strict distribution checks and the manually dispatched Linux, Windows and macOS release matrix on the exact release commit. Verify clean installation and upgrade, CLI and MCP startup, official publisher manifest validation, and matching registry identities. Record final results in the publication ledger. No publication or final validation is claimed by this preparation document.

## Maintenance And Contributions

Maintenance is provided as time permits, with no guaranteed response time or feature schedule. Focused community PRs are welcome; include a minimal reproduction and regression coverage for behavior changes. Proposed changes remain subject to review and the documented scope. See [Contributing](../CONTRIBUTING.md) and [Support](../SUPPORT.md).
