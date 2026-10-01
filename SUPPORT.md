# Support

Repo Test Architect is local, audit-first tooling. Useful reports include the command that was run, the repository shape, the expected result, the actual result, and the relevant artifact excerpt.

## Maintenance Expectations

Maintenance is provided as time permits. There is no guaranteed response time, support SLA or feature-delivery schedule. A stable version commits to the documented compatibility policy and supported boundaries; it does not promise that every reported issue or requested feature will be implemented.

Repository analysis runs locally without usage telemetry, so maintainers generally cannot see how people use the package. Share only the minimal evidence you choose to disclose. Focused pull requests are welcome when you need a fix or improvement; follow [Contributing](CONTRIBUTING.md), include regression coverage for behavior changes, and discuss broad changes before investing in them. Contributions remain subject to review and project scope.

## Questions

Use the support question issue form for usage questions about:

- CLI commands
- MCP client setup
- audit artifacts
- adapter behavior
- fixture or model-consistency workflow

Keep examples minimal and avoid private source content.

For MCP runtime failures, run `npm run doctor` first. If local file diagnostics were explicitly enabled, generate a sanitized bundle with `diagnostic-bundle` and inspect it before sharing. Never attach the raw repository, environment, credentials, or proprietary tool arguments.

## Bugs

Use the bug report issue form for incorrect behavior in:

- repository or project detection
- audit classification
- candidate ranking
- test planning
- MCP tool calls
- release-readiness checks

Include the smallest reproducible fixture shape you can share. Prefer redacted artifact excerpts over full private audit output.

## Feature Requests

Use the feature request issue form for new adapters, report fields, MCP tools, evaluation fixtures, model-consistency scenarios, or generation workflow proposals.

Frame requests around the audit decision the tool should improve: what should be detected, what should be recommended, what should be skipped, and why.

## Security

Use the security policy for vulnerability reports, unexpected network access, private source exposure, broader-than-documented MCP permissions, or package contents that include unintended files.

Do not put credentials, private source files, proprietary audit artifacts, or exploit details in public issues.

## Verification

Before reporting a regression, run:

```powershell
npm run release:check
```

If that is too broad for the issue, include the narrower command that reproduces the problem.
