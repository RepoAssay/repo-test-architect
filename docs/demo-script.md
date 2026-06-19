# Demo Script

This is the first public demo path. It should show that the tool makes test strategy decisions before writing tests.

## Message

Repo Test Architect audits a repository, detects existing conventions, ranks useful test targets, skips low-value direct tests, and reports remaining risk.

Do not frame the demo as test generation. Native generation is intentionally deferred until adapter-specific generation rules and repair-loop coverage exist.

## Setup

Run the demo from the repository root with Node 20 or newer:

```powershell
npm run release:check
```

Use the checked-in fixtures so the output is deterministic and safe to share.

To verify the demo command path without running the full release suite, run:

```powershell
npm run demo:check
```

## Single-Project Audit

Show the JavaScript adapter proof point:

```powershell
npm run audit:example
npm run rank:example
npm run plan:example
```

Call out:

- detected package and test framework conventions
- parser, service, and client targets ranked above DTOs and constants
- covered-but-risky code separated from untested candidates
- skipped targets with explicit rationale
- blockers and remaining risk reported instead of hidden

## Polyglot Audit

Show that one repository can contain multiple project shapes:

```powershell
npm run detect:example
npm run audit-projects:example
npm run summarize-projects:example
npm run rank-projects:example
npm run plan-projects:example
npm run stats-projects:example
```

Call out:

- supported JavaScript projects are audited
- unsupported projects still appear with ecosystem and language evidence
- repository-level ranking happens after project detection
- stats summarize coverage without source telemetry

## Placement Analysis

Show that the audit can report misplaced coverage without rewriting files:

```powershell
npm run placement-projects:split-example:json
```

Call out:

- the current owner and suggested owner are both explicit
- integration-level escaped tests become `split` findings instead of automatic moves
- placement findings are advisory until a repair loop can verify old and new test commands

## MCP Surface

Show that the same deterministic operations are exposed through MCP-shaped tools:

```powershell
npm run mcp:tools
npm run mcp:audit-projects:example
npm run mcp:rank-projects:example
npm run mcp:plan-projects:example
npm run mcp:placement-split:example
```

Call out that the current MCP surface is dependency-free stdio and invoke scaffolding. A real SDK transport wrapper is still on the public-readiness list.

## Close

End with:

```powershell
npm run model-consistency:check
npm run release:check
```

The closing point is that audit behavior is locked by fixtures, schemas, golden snapshots, and model-consistency scenarios. The tool is useful before it generates a single test because the audit tells users what should and should not be tested.
