Repo Test Architect `1.0.0-beta.1` is the first beta candidate for the audit-first CLI and local MCP server. The candidate freezes the proposed `1.0` contract for review while keeping native test generation deferred.

Publication remains contingent on the beta go/no-go record and exact-commit release checks.

## Highlights

- exposes protocol-standard MCP `outputSchema` contracts for all 19 tools using the exact shipped artifact schemas
- returns MCP artifacts through `structuredContent` while retaining serialized JSON text for existing clients
- clarifies routing, artifact provenance, output behavior, and side effects for the six weakest externally scored tool descriptions
- preserves the deterministic local-only audit, evidence, ranking, planning, placement, findings, execution-hint, and stats behavior across ten bounded adapters
- includes the refreshed production dependency lock and current public discovery metadata accumulated since `0.3.0`

## Compatibility

No CLI command, MCP tool, input contract, versioned artifact schema, configuration behavior, or supported adapter boundary is intentionally removed or changed. Standard structured MCP output is additive; clients that consume the existing JSON text content continue to receive it.

The proposed beta contract is recorded in [Beta Contract Freeze](beta-contract-freeze.md). Any compatibility-affecting change after this candidate must be explicit in later beta notes.

## Known Limitations

- findings and plans are deterministic review input, not automatic code changes
- `generate_selected_test` remains intentionally deferred and does not generate or write tests
- adapters support only their documented bounded repository, build, framework, and evidence shapes
- the MCP server is local stdio; remote hosting is not included

## Candidate Verification

- 1,362 local tests across 105 suites, 0 failures
- MCP stdio smoke, distribution preparation, package contents, and npm pack dry-run checks pass
- exact-candidate Linux, Windows, and macOS release matrix remains required before publication
- clean installation from the published beta package remains a post-publication verification step

When published, install the beta explicitly with:

```sh
npm install --global repo-test-architect@beta
```

The npm `latest` tag remains on the recommended public alpha unless the release owners deliberately change it.
