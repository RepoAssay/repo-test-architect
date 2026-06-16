# Security Policy

Repo Test Architect is designed to be local-first.

The audit tools read repository files, package metadata, test files, and eventually local command results. Treat repository contents as sensitive by default.

## Supported Security Posture

- Local stdio MCP is the default deployment target.
- Raw private repository upload is not required for normal use.
- Remote or hosted features should be limited to evals, policy packs, aggregate reporting, or model-consistency comparisons.
- Any future remote feature must separate local repository access from hosted reporting or evaluation features.
- Telemetry must be opt-in and avoid source content by default.

## Reporting a Vulnerability

Until a dedicated security contact exists, open a private report through GitHub security advisories when available.

If private advisories are not available, open a minimal public issue that avoids exploit details and private source content, then request a private follow-up channel.

## What to Report

Please report:

- command execution that escapes the documented local workflow
- unexpected network access or source upload
- exposure of private source content in logs, artifacts, reports, or telemetry
- MCP tool behavior that grants broader file, command, or write access than documented
- package contents that include private, generated, or unintended files

## What Not to Include Publicly

Do not include:

- private repository source
- credentials, tokens, keys, or environment values
- full proprietary audit artifacts
- exploit steps that would enable misuse before a fix exists

Use minimal redacted excerpts where possible.

## Verification

Before release-sensitive changes, run:

```powershell
npm run release:check
```

That includes package contents and binary entrypoint checks.
