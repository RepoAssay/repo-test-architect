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
- a reversible distribution preparation gate and an intentionally blocked public-publish gate
- contribution, support, and security policies
- product positioning for audit-first differentiation and plausible business paths
- alpha-readiness acceptance gates for local test architecture audit

## Not Ready To Publish

- package remains `private: true`
- GitHub repository remains private
- npm authentication and final name-availability verification are still required
- copyright owner in `LICENSE` still needs explicit verification
- public npm and MCP Registry publication still require separate approval
- native test generation is still deferred
- remote MCP hosting is out of scope for the first release

## Before A Public Repository

- confirm `auditquest/repo-test-architect` should change from private to public
- decide whether issue template contact links should point to support and security docs
- verify the copyright owner before publishing
- run `npm run release:check`
- run `npm run distribution:check:publish` after the approved `private: false` change

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
