Repo Test Architect `0.3.0` is the third public alpha. It expands the audit-first adapter portfolio while keeping every support claim bounded by checked-in evidence. Native test generation remains deferred.

## Highlights

- adds supported, explicitly bounded adapters for Go, Rust, C#, Ruby, PHP, and Elixir, bringing the portfolio to ten supported ecosystems
- validates every supported adapter against three exact-commit public repositories: 30 pinned cases and 210 of 210 reviewed scorecard areas passing
- adds adapter-specific ownership, command, callable, and assertion evidence discovered through repeated live-repository audits
- cuts the measured Swift Package Index Server audit median from 14,443 ms to 725 ms and the Django median from 3,823 ms to 2,129 ms without changing their canonical audit artifacts
- extracts byte-preserving shared repository traversal and adds a bounded, non-shipping executor evaluation to make the next product decision evidence-led
- sharpens the README around what the project is, what it is not, and how repository maintainers can use its audit and ranked plan

## Compatibility

There are no intentional breaks to the `0.2.x` CLI commands, MCP tool names, or existing versioned artifact schemas. “Supported” remains a bounded alpha claim defined separately for each adapter; dynamic build graphs and unproven runtime behavior stay explicit limitations.

## Verification

- 1,361 tests across 105 suites
- all ten adapter coverage, generated performance, and implementation-coverage gates
- 30 exact public repository pins with deterministic semantic and performance measurements
- 210 of 210 reviewed validation scorecard areas passing
- exact release commit passed the complete local release gate and manually dispatched Linux, Windows, and macOS release matrix
- clean npm-registry install loaded all ten adapters and initialized MCP as `0.3.0`

Install with:

```sh
npm install --global repo-test-architect@0.3.0
```

- npm: https://www.npmjs.com/package/repo-test-architect/v/0.3.0
- Official MCP Registry: https://registry.modelcontextprotocol.io/?search=io.github.RepoAssay%2Frepo-test-architect
- Full changes: https://github.com/RepoAssay/repo-test-architect/compare/v0.2.0...v0.3.0
