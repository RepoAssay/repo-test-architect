# Public Readiness

This document records the public-repository launch and current package publication state.

## Public Repository Ready

- audit-first product thesis
- deterministic JavaScript/TypeScript, Python, Swift, and bounded Kotlin/JVM adapter proof points
- polyglot project detection with unsupported-project reporting
- local CLI examples
- local stdio MCP SDK server and dependency-free invoke harness
- fixture-based regression tests
- golden audit and plan snapshots
- model-consistency locked-field scenarios
- package, binary, smoke, eval, and release-readiness checks
- a production dependency audit that blocks release readiness
- a reversible distribution preparation gate and a strict public-publish gate
- contribution, support, and security policies
- product positioning for audit-first differentiation and plausible business paths
- alpha-readiness acceptance gates for local test architecture audit
- protected `master` with the required Linux `pr-gate`
- organization-wide 2FA restricted to secure methods
- secret scanning, push protection, Dependabot security updates, and private vulnerability reporting
- accepted historical commit-email exposure and verified MIT copyright ownership

## Current Public Alpha

The current public-alpha distribution is complete:

- [`repo-test-architect@0.2.0`](https://www.npmjs.com/package/repo-test-architect/v/0.2.0) is published with the `latest` tag
- [`io.github.RepoAssay/repo-test-architect@0.2.0`](https://registry.modelcontextprotocol.io/?search=io.github.RepoAssay%2Frepo-test-architect) is active and latest in the official MCP Registry
- the npm package was installed in a clean environment, where all four adapters loaded and the stdio MCP server initialized as `0.2.0`
- the release passed `npm run release:check`, `npm run distribution:check:publish`, the three-OS pull-request matrix, and the post-merge Linux release check
- [GitHub release `v0.2.0`](https://github.com/RepoAssay/repo-test-architect/releases/tag/v0.2.0) points to the exact npm and Registry release commit

This second public alpha adds the streamlined repository analysis entry point, deeper bounded evidence and ownership across all four adapters, exact-commit live-repository measurements, the human-readable validation scorecard, and complete cross-adapter downstream trust checks. It does not intentionally break the `0.1.x` CLI, MCP tool, or artifact contracts.

The initial npm-only `0.1.0` package exposed a case-sensitivity mismatch in the Registry namespace. Patch `0.1.1` preserves GitHub's exact `RepoAssay` casing and is the first Registry-compatible release.

Native test generation remains deferred, and remote MCP hosting remains out of scope for the public alpha.

## Conduct Reporting

A Code of Conduct is intentionally deferred until the project has a genuine private conduct-reporting channel. GitHub reported-content moderation can cover disruptive GitHub comments, but it does not replace a private contact for incidents that require confidential context.

## Repository Preparation Completed

- GitHub organization and MCP identities use the RepoAssay namespace
- repository and organization descriptions plus repository topics are configured
- repository changes use squash-only merges with protected, up-to-date branches
- stale merged remote branches are removed
- Dependabot alerts, security updates, and grouped monthly version updates are configured
- issue forms route support questions and private vulnerability reports without enabling blank issues
- repository visibility is public and anonymous cloning is verified
- the existing personal commit-email exposure was accepted without rewriting history
- organization-wide 2FA is enabled with secure methods only
- `LICENSE` ownership is verified as Mikael Stenberg
- secret scanning, push protection, and private vulnerability reporting are enabled

## First Public Demo

The first demo should focus on audit quality, not generated test count:

- run a fixture audit
- show why DTOs, constants, generated files, and unsupported projects are skipped
- show a ranked test plan
- show project-level stats
- show remaining risks and blockers
- show whether coverage appears valuable, weak, misplaced, or low-value

Avoid presenting native test generation as available until adapter-specific generation and repair-loop coverage exist.

Use the first demo path in [Demo Script](demo-script.md) so the story stays focused on audit quality.
