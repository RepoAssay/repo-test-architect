# Release Lifecycle

This policy defines how Repo Test Architect moves from public alpha through beta, release candidate, and `1.0.0`, and how versions are published afterward.

Dates are planning targets, not promises. Readiness evidence controls promotion. The release owners may move a target earlier when the gates are already satisfied and the available usage evidence is strong, or move it later whenever more hardening is useful. An accelerated stage transition should record its rationale in the [Decision Log](decision-log.md); delaying a release requires no exception.

## Current Planning Windows

| Stage | Version line and npm tag | Planning window | Default observation period |
| --- | --- | --- | --- |
| Public alpha | `0.x`, published as `latest` while it is the only public line | July 2026 through at least mid/late September 2026 | About eight weeks from the first public release |
| Beta | `1.0.0-beta.N`, published under `beta` and optionally `next` | Start in late September or October 2026 | At least six weeks of beta use |
| Release candidate | `1.0.0-rc.N`, published under `rc` and `next` | November or December 2026 if beta gates pass | At least seven clean days for the final candidate |
| Stable | `1.0.0`, promoted to `latest` | November or December 2026 at the earliest | No calendar deadline; every stable gate must pass |

The observation periods are defaults rather than contractual waiting periods. The release owners can shorten one when equivalent evidence already exists, but should document why the smaller window still gives enough confidence. A release-blocking correctness or security defect resets the clean period for the affected beta or release candidate.

## Versioning And Compatibility

The existing `0.x` releases remain the public-alpha line; they are not renamed retroactively. During alpha:

- patch versions contain compatible fixes and small improvements
- minor versions may change unstable contracts, but every intentional break must be called out in release notes with migration guidance
- supported behavior remains bounded by the checked-in adapter support matrices

Beta targets the `1.0.0` contract. From `1.0.0-beta.1` onward, the CLI commands, MCP tool names, versioned artifact schemas, configuration behavior, and documented support promises are compatibility-frozen unless a change prevents a misleading or unsafe stable release. Any beta break must be explicit in release notes.

After `1.0.0`, Repo Test Architect follows semantic versioning:

- patch releases fix compatible correctness, security, packaging, or documentation defects
- minor releases add compatible features or expand supported adapter boundaries
- major releases may change public contracts and require migration guidance

The npm `latest` tag always identifies the recommended default install. Prerelease builds use their stage tag until the release owners deliberately promote a stable version.

## Promotion Gates

### Public Alpha To Beta

Beta begins when:

- all eight supported adapters meet the [Adapter Hardening Plan](adapter-hardening-plan.md) definition of done, including the cross-adapter trust review
- there are no unresolved release-blocking false ownership, verification-command, or high-confidence coverage claims inside a documented supported boundary
- at least three external users have completed feedback loops across at least six real repositories, or the release owners record comparable public-alpha evidence in the decision log
- the current alpha has completed a default 14-day period without a release-blocking correctness or security regression
- `npm run alpha:check`, `npm run release:check`, and the path-appropriate operating-system checks pass
- remaining limitations are visible in the support matrices rather than implied as supported

### Beta To Release Candidate

A release candidate is cut when:

- the `1.0` CLI, MCP, schema, configuration, and adapter-support contracts are frozen
- installation, upgrade, diagnostics, local CLI, and local MCP flows have been exercised from the published beta package
- beta feedback has no unresolved release blocker
- the manually dispatched Linux, Windows, and macOS release matrix passes on the exact candidate commit
- package and npm metadata agree on the candidate version and identity, with matching MCP Registry metadata when that prerelease channel is distributed there
- no additional feature is required for `1.0`; unfinished work is explicitly deferred

### Release Candidate To 1.0

`1.0.0` is released when:

- the final release candidate has remained free of release-blocking defects for the default seven-day clean period
- only blocker fixes, with regression coverage, landed after the first release candidate
- the complete [Release Checklist](release-checklist.md) passes against the exact release commit
- clean npm installation, CLI startup, MCP startup, and Registry identity are verified
- public documentation accurately describes supported behavior, limitations, compatibility, and upgrade expectations
- the release owners explicitly approve promotion of the tested commit

Every blocker fix creates a new release candidate and restarts its clean period unless the release owners document equivalent evidence for an accelerated promotion.

## Publication Cadence

Releases group useful changes; they do not mirror every merged pull request.

| Phase | Normal cadence | Publish sooner when |
| --- | --- | --- |
| Alpha | A coherent release roughly every one or two weeks | a supported-boundary correctness, security, installation, or packaging defect materially affects users |
| Beta | Roughly every two or three weeks | a beta blocker is fixed and the new build is needed for validation |
| Release candidate | Only after blocker fixes or final release verification changes | a new candidate is required to restart clean validation |
| Stable | Patches as needed; compatible feature releases roughly every four to eight weeks | a security or severe correctness fix is ready and verified |

A public version is justified when it contains at least one user-visible fix or capability, changes a documented contract or support boundary, or is needed to correct distribution or security behavior. Documentation-only, test-only, and internal refactoring changes normally accumulate until the next useful release.

## Release Decision

Before publishing any version:

1. identify the exact commit and intended version
2. summarize user-visible changes and any compatibility impact
3. run the verification required by the [Release Checklist](release-checklist.md)
4. confirm the intended npm tag and whether that version is also intended for MCP Registry distribution
5. publish npm first, verify a clean registry install, then publish matching MCP Registry metadata when applicable
6. create the GitHub release from the same commit and record any known limitations

Urgent releases may bypass the normal cadence, but never the exact-commit verification, identity checks, or regression coverage appropriate to the fix.

## Changing This Policy

The release owners may revise dates, gates, evidence thresholds, or cadence as the product and user base develop. Material changes should update this document and the decision log in the same pull request so public expectations and project decisions remain aligned.
