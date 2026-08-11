# Distribution And Beta Plan

This plan turns the current public alpha into a discoverable, evidence-backed beta candidate without widening adapter claims merely for promotion. It was prepared on 2026-08-04 against public alpha `0.3.0`.

## Decisions

- Treat beta as a product release stage, not a separate maturity label for each adapter. All ten adapters remain `supported` within their documented bounded matrices.
- Use the Official MCP Registry entry as the canonical machine-readable identity. Community directories should link back to the same GitHub repository, npm package, version, install command, and limitations.
- Prioritize free listings and earned references before paid placement. A paid directory entry is a small acquisition experiment, not release infrastructure.
- Do not add remote hosting or change the local-first stdio architecture only to qualify for a directory.
- Keep native generation visibly deferred. Directory copy must describe deterministic audit, evidence, ranking, planning, placement, and stats rather than generated test code.
- Move to `1.0.0-beta.1` only when the existing release-lifecycle gates are evidenced. Calendar targets remain planning windows, not promotion reasons.

## Current Baseline

The technical adapter-hardening baseline is complete:

- ten supported adapters
- three pinned validation-corpus roles per adapter
- 210 of 210 reviewed scorecard areas passing
- cross-adapter trust review complete
- shared conformance, golden artifacts, model-consistency locks, packaging checks, and generated performance gates present
- `npm run alpha:check` passing on 2026-08-04
- npm package, GitHub release, and Official MCP Registry identity aligned at `0.3.0`

The dated channel-status, GitHub-traffic, npm-download, and paid-placement baseline lives in [Distribution Metrics](distribution-metrics.md). Keep reach, automation-sensitive traffic, and completed external feedback loops visibly separate.

The open beta evidence is administrative and user-facing:

- the current release-blocker-free observation period began with `0.3.0` on 2026-08-02 and cannot satisfy a 14-day clean period before 2026-08-16
- no external-user feedback loops are currently recorded in the repository
- the beta contract-freeze inventory is recorded in [Beta Contract Freeze](beta-contract-freeze.md); it must be reconfirmed at the exact publication commit
- the public demo and directory rollout do not yet have a shared tracking sheet or conversion measure

## Reusable Listing Kit

Use the same facts everywhere so directory pages do not drift.

| Field | Canonical value |
| --- | --- |
| Name | Repo Test Architect |
| One-line description | Local-first MCP server that audits repository test architecture and produces evidence-backed findings, rankings, and test plans. |
| Longer description | Repo Test Architect inspects repositories locally, detects supported projects, maps existing source-to-test evidence, exposes blockers and weak coverage, and produces deterministic repository-native test plans. It supports bounded JavaScript/TypeScript, C#, Elixir, Go, Kotlin/JVM, PHP, Python, Ruby, Rust, and Swift adapters. Its MCP tools are read-only; native test generation is intentionally deferred. |
| Category | Developer tools / testing / code quality |
| Transport | Local stdio |
| Install | `npx --yes repo-test-architect mcp` |
| Runtime | Node.js 20 or newer |
| License | MIT |
| Public contact | `repoassay@gmail.com` |
| Repository | `https://github.com/RepoAssay/repo-test-architect` |
| npm | `https://www.npmjs.com/package/repo-test-architect` |
| Official identity | `io.github.RepoAssay/repo-test-architect` |
| Privacy | Repository source stays local unless the MCP host or another configured tool sends it elsewhere. |
| Maturity | Public alpha `0.3.0`; findings are review input, not automatic change instructions. |

Recommended tags are `testing`, `test-strategy`, `repository-analysis`, `static-analysis`, `code-quality`, `developer-tools`, `local-first`, and `read-only`.

Before each submission, verify the directory-generated install command actually selects the `mcp` package argument. Reject or correct listings that launch the audit CLI instead of the stdio server.

## Directory Rollout

The directory behavior below was checked on 2026-08-04 and should be rechecked immediately before submission.

| Priority | Channel | Current path | Action | Completion evidence |
| --- | --- | --- | --- | --- |
| Canonical | [Official MCP Registry](https://registry.modelcontextprotocol.io/?search=io.github.RepoAssay%2Frepo-test-architect) | Already published from `server.json` | Maintain version parity on releases; do not resubmit `0.3.0`. | Active version, package identity, and install arguments match the release. |
| P0 | [PulseMCP](https://www.pulsemcp.com/submit) | Ingests the Official MCP Registry daily and processes entries weekly | Wait through 2026-08-09, search for the canonical identity, then email the listed address only if absent or inaccurate. | Public page URL and a checked install/repository link. |
| Decision | [Glama](https://glama.ai/mcp/servers) | GitHub sign-in works, but the current add-server flow requests a payment card | Do not add a card solely for a directory listing. Revisit only after confirming the billing terms or finding a registry-ingestion/claim path that does not create a paid hosting relationship. | Explicit no-cost path or an owner-approved billing decision, followed by a public page with correct `npx` arguments. |
| P0 | [mcpservers.org](https://mcpservers.org/submit) | Submitted on 2026-08-04 through the free browser form; review promised within 12 hours | Watch `repoassay@gmail.com` for the review result. After approval, verify the public page, description, category, repository link, and install guidance. | Approval email plus public page with correct copy and links. |
| P1 | [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers/blob/main/CONTRIBUTING.md) | Repository pull request following category and alphabetical-order rules; its current automation requests a Glama score badge for new entries | Keep the listing change isolated and ask whether the Official MCP Registry publication is sufficient when Glama requests billing details. Draft [PR #11509](https://github.com/punkpeye/awesome-mcp-servers/pull/11509) records the exact entry and prerequisite question. | Merged pull request, or a documented Glama prerequisite decision if maintainers require the badge. |
| Active experiment | [mcp.so](https://mcp.so/submit?type=server) | USD 39 paid submission created on 2026-08-04; public listing URL not yet verified | Finalize the profile with the correct `npx --yes repo-test-architect mcp` configuration, canonical description and tags, npm website URL, MCP client-config docs URL, and accurate overview. Record listing-live day, day 7, day 14, and day 30 results in [Distribution Metrics](distribution-metrics.md). | Public listing URL, visible paid benefits, correct install path, referral evidence, and 30-day acquisition result. |
| Deferred | [Smithery](https://smithery.ai/docs/build/publish) | Current publication paths require a public Streamable HTTP endpoint or a local MCPB bundle | Revisit only if Repo Test Architect independently chooses remote hosting or MCPB packaging. Do not build either solely for discovery. | Separate architecture decision and compatible distributable. |

Avoid copying the project into every available directory. Add another channel only when it offers a distinct audience, client integration, or measurable referral path. Record the submission date, page URL, owner, status, and next review date for every channel.

## Today's Administrative Slice

This is a useful one-day sequence because it produces durable assets before any form submission:

1. Complete: approve the reusable listing copy and use `repoassay@gmail.com` as the public contact email.
2. Create a lightweight tracking sheet with `channel`, `submittedAt`, `listingUrl`, `status`, `cost`, `trackingUrl`, `visits`, `installs or starts`, `feedbackLoops`, and `nextReviewAt`.
3. Check whether PulseMCP has already ingested the Official Registry entry; otherwise set the 2026-08-09 follow-up.
4. Complete: submit the free mcpservers.org listing through its browser form. Review is pending; Glama remains pending because its current flow requests a card.
5. Follow draft awesome-mcp-servers PR #11509 and resolve whether its Glama badge request is a hard prerequisite.
6. Complete: defer Smithery and approve the USD 39 mcp.so experiment. Finish the listing metadata and begin monitoring when its public URL is live.
7. Run the demo script, capture one pinned-repository audit, and use the same tracking link in the listing pages and launch post where links are allowed.
8. Invite the first three alpha users with a specific feedback request and repository consent boundary.

External submissions, emails, paid purchases, and public posts require owner confirmation at the point of action.

## Beta Promotion Model

### Product-Wide Gates

Use the normative gates in [Release Lifecycle](release-lifecycle.md). The working evidence checklist is:

- [x] All ten adapters meet the hardening definition of done at their documented boundaries.
- [x] Cross-adapter trust review is complete.
- [ ] No unresolved release-blocking correctness or security issue.
- [ ] Three external users complete feedback loops across at least six real repositories, or comparable evidence is explicitly accepted in the decision log.
- [ ] The current alpha completes a 14-day clean period; for `0.3.0`, the earliest unaccelerated date is 2026-08-16.
- [x] CLI commands, MCP tool names, artifact schemas, configuration behavior, and supported adapter boundaries have a recorded candidate freeze review.
- [ ] Installation and MCP startup are repeated from the published package on Linux, macOS, and Windows at the exact beta candidate.
- [ ] `npm run alpha:check`, `npm run release:check`, and path-appropriate operating-system checks pass at the exact candidate commit.
- [ ] Beta release notes state the frozen contract, bounded adapter promises, known limitations, upgrade path, and deferred generation.

### External Feedback Loop

A feedback loop is complete when one external user:

1. installs the public package without maintainer intervention
2. runs the CLI or MCP flow on a repository they are authorized to inspect
3. reviews at least one detected project, verification command, source-to-test relationship, blocker, and ranked finding
4. reports useful, misleading, missing, or confusing behavior
5. receives a documented disposition: fixed with regression coverage, clarified in docs, confirmed inside the supported boundary, or explicitly deferred

Do not collect repository contents. Record only consented metadata: anonymous user ID, adapter, broad project shape, package version, operating system, client, outcome, issue link, and disposition.

A balanced minimum cohort would cover at least one polyglot repository, at least two of the broad/high-maintenance adapters, at least one bounded newer adapter, and all three major operating-system paths across the cohort. Six repositories are the lifecycle minimum, not a reason to stop collecting useful evidence.

## Adapter Stewardship Through Beta

All adapters share the same supported-alpha evidence contract, but they should not receive identical beta work. Promotion work is risk-based:

| Adapter group | Adapters | Beta preparation | Widening policy |
| --- | --- | --- | --- |
| Broad and high-maintenance | JavaScript/TypeScript, Swift, Python | Seek at least one external feedback repository per adapter where practical; protect workspace/package ownership, framework command accuracy, evidence strength, and interactive latency. | Only for a demonstrated false claim or repeated request with bounded positive and negative cases. |
| Build-graph sensitive | Kotlin/JVM, C#/.NET | Pressure the documented Gradle/Maven/MSBuild boundary and make unsupported graphs block rather than guess. Include at least one in the minimum external cohort. | No arbitrary build evaluation or platform expansion during contract freeze. |
| Static bounded systems | Go, Rust | Validate workspace/module ownership, target selection, and exact evidence on user repositories; keep inference-light exclusions visible. | Add receiver, trait, macro, feature, or build behavior only from exact repository pressure. |
| Dynamic bounded systems | Ruby, PHP, Elixir | Validate command/setup blockers, DSL/framework boundaries, and conservative fallback evidence. Include at least one newer bounded adapter in the minimum cohort. | Rails, Pest, Phoenix/Ecto, macros, and deeper helper flow remain evidence-triggered slices. |

Every beta-impacting adapter change must keep the established routine: observed repository shape, written boundary, positive and negative fixtures, smallest evidence change, golden/model locks where externally meaningful, support-matrix update, and exact release gates.

## Working Timeline

| Window | Outcome |
| --- | --- |
| 2026-08-04 through 2026-08-09 | Listing kit approved; free directory submissions made; Pulse ingestion checked; first demo and user invitations prepared. |
| 2026-08-10 through 2026-08-16 | First external runs reviewed; blocker ledger maintained; `0.3.0` reaches the earliest 14-day clean date if no blocker appears. |
| Mid-August through mid-September | Complete at least three-user/six-repository evidence, fix only regression-backed trust problems, and run the contract inventory. |
| Mid/late September | Decide whether evidence supports beta. Record a go/no-go in the decision log; do not promote solely because the planning window arrived. |
| Late September or October | If every gate passes, cut `1.0.0-beta.1` under `beta` and optionally `next`, leaving `latest` on the recommended alpha until deliberately changed. |

## Weekly Review

Review these measures weekly during the discovery and beta-preparation period:

- valid public listing count and incorrect/stale listing count
- listing referral visits, npm package page visits where available, and successful install/start reports
- external users, repositories, adapters, clients, and operating systems represented
- completed feedback loops and median time to disposition
- release-blocking defects, false high-confidence claims, and incorrect verification commands
- unsupported adapter/framework requests, grouped by concrete repository shape
- days since the last release-blocking correctness or security regression

Stars, raw directory impressions, and downloads can provide context, but they do not replace successful use or adapter-specific feedback.

## Beta Go/No-Go Record

At the promotion review, add one decision-log entry containing:

- exact candidate commit and package version
- links to the release-gate runs
- clean-period start and end
- external cohort totals and represented adapters/operating systems, without repository contents
- resolved and deferred feedback
- frozen public contracts
- current supported matrices and explicit exclusions
- remaining known risks
- owner approval or the concrete reason to remain in alpha
