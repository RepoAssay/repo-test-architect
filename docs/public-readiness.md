# Public Readiness

This document tracks what can be shown publicly before the project is ready for a first npm release.

## Ready To Show

- audit-first product thesis
- deterministic JavaScript/TypeScript, Python, Swift, and bounded Kotlin/JVM adapter proof points
- polyglot project detection with unsupported-project reporting
- local CLI examples
- local stdio MCP SDK server and dependency-free invoke harness
- fixture-based regression tests
- golden audit and plan snapshots
- model-consistency locked-field scenarios
- package, binary, smoke, eval, and release-readiness checks
- contribution, support, and security policies
- product positioning for audit-first differentiation and plausible business paths
- alpha-readiness acceptance gates for local test architecture audit

## Not Ready To Publish

- package remains `private: true`
- final public repository URL is not configured
- package metadata still needs final repository, homepage, bugs, and keyword decisions
- package manifest declares MIT and the repository includes the matching license file
- native test generation is still deferred
- remote MCP hosting is out of scope for the first release

## Before A Public Repository

- choose the final GitHub repository owner and name
- add the remote URL
- update package metadata with public repository links
- decide whether issue template contact links should point to support and security docs
- verify the copyright owner before publishing
- run `npm run release:check`

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
