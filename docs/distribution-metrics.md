# Distribution Metrics

This ledger records discoverability, distribution, and external-use evidence for Repo Test Architect. The initial baseline was captured on 2026-08-04 before the new community-directory listings were verified publicly live.

Metrics are evidence with different meanings. npm downloads, GitHub clones, directory impressions, stars, and completed user feedback loops must remain separate. None is a substitute for another, and automated traffic must not be presented as adoption.

## Channel Status Snapshot

| Channel | Status on 2026-08-04 | Cost | Next evidence |
| --- | --- | ---: | --- |
| [npm](https://www.npmjs.com/package/repo-test-architect) | `repo-test-architect@0.3.0` is `latest`; first public package published 2026-07-24 and current version published 2026-08-02. | Free | Fixed-window downloads and clean-install reports. |
| [Official MCP Registry](https://registry.modelcontextprotocol.io/?search=io.github.RepoAssay%2Frepo-test-architect) | `io.github.RepoAssay/repo-test-architect@0.3.0` is the canonical Registry identity. | Free | Version and install-argument parity at each release. |
| [GitHub release](https://github.com/RepoAssay/repo-test-architect/releases/tag/v0.3.0) | `v0.3.0` public alpha published 2026-08-02. | Free | Release traffic and exact-commit verification. |
| [mcpservers.org](https://mcpservers.org/submit) | Free submission completed 2026-08-04; review pending with a stated 12-hour review window. | USD 0 | Approval email, public URL, correct description/category/link, and any install instructions. |
| [mcp.so](https://mcp.so/submit?type=server) | Paid submission created 2026-08-04. Profile metadata is being finalized; public listing URL is not yet verified. | USD 39 one time | Public URL, verified badge and placement, correct `mcp` launch argument, GitHub referrer traffic, and 30-day outcome. |
| [awesome-mcp-servers PR #11509](https://github.com/punkpeye/awesome-mcp-servers/pull/11509) | Draft PR is valid and merge-clean but labeled `missing-glama`; repository automation requests a Glama score badge. | Free | Maintainer decision or a no-card Glama path; do not add billing details solely to clear the label. |
| [Glama](https://glama.ai/mcp/servers) | GitHub sign-in completed; current add-server flow requests a payment card, so submission is paused. | Not authorized | Explicit no-cost listing path or separate owner-approved hosting/billing decision. |
| [PulseMCP](https://www.pulsemcp.com/submit) | No manual submission required yet; it states that Official MCP Registry entries are ingested daily and processed weekly. | Free | Search after 2026-08-09; email only if missing or inaccurate. |
| [Smithery](https://smithery.ai/docs/build/publish) | Deferred because the current product has neither a public Streamable HTTP endpoint nor an MCPB bundle. | None | Independent remote-hosting or MCPB decision. |

## RepoAssay Baseline

### GitHub Repository

The GitHub traffic API returned a 14-day series from 2026-07-21 through 2026-08-03:

| Measure | Total | Unique |
| --- | ---: | ---: |
| Repository views | 81 | 9 |
| Repository clones | 1,598 | 368 |

Top reported referrers in that window were:

| Referrer | Views | Unique visitors |
| --- | ---: | ---: |
| `github.com` | 19 | 3 |
| `linkedin.com` | 7 | 5 |
| `com.linkedin.android` | 1 | 1 |

Public repository counters at capture time were zero stars, zero forks, zero watchers, and zero issues.

Clone operations are especially automation-sensitive. Release checks, CI, dependency scanners, registry crawlers, maintainer work, and repeated clones can all increase the count. The 368 unique-cloner value must not be described as 368 users.

### npm

The npm downloads API reported:

| Fixed window | Downloads |
| --- | ---: |
| 2026-07-24 through 2026-08-04 | 680 |
| 2026-07-29 through 2026-08-04 | 230 |

These are package downloads, not verified people or successful MCP starts. Maintainer release verification, CI, clean-install checks, bots, caches, and directory inspection can contribute.

### External-Use Evidence

At baseline:

- recorded external users: 0
- recorded external repositories: 0
- completed external feedback loops: 0
- issue-backed adapter requests: 0

These values are the beta evidence that matters most. Directory publication should help create qualified feedback opportunities, but impressions or downloads do not satisfy the external-user gate by themselves.

## Day-Seven Snapshot — 2026-08-11

This snapshot was captured on 2026-08-11. GitHub traffic is complete through 2026-08-10. npm's 2026-08-10 value had not finalized and was excluded from the complete-window comparison, so the npm comparison is complete through 2026-08-09.

### Publication Channels

| Channel | Observed status | Measurable evidence |
| --- | --- | --- |
| [npm](https://www.npmjs.com/package/repo-test-architect) | `0.3.0` remains `latest`; package metadata remains aligned with the 2026-08-02 release. | 792 downloads from first publication through 2026-08-09; see the fixed-window comparison below. |
| [Official MCP Registry](https://registry.modelcontextprotocol.io/?search=io.github.RepoAssay%2Frepo-test-architect) | `0.3.0` is active and marked latest. Its npm package is `repo-test-architect@0.3.0`, stdio is selected, and the positional package argument is `mcp`. | Canonical identity and install metadata remain correct; the Registry does not expose usage in this record. |
| [GitHub release](https://github.com/RepoAssay/repo-test-architect/releases/tag/v0.3.0) | `v0.3.0` remains public. | No attached release assets, so there is no release-asset download counter. |
| [mcp.so](https://mcp.so/servers/repo-test-architect) | Public, correctly categorized under Developer Tools, with the correct repository, npm, documentation, and `npx --yes repo-test-architect mcp` configuration. The rendered page visibly shows Verified and Featured badges. | 628 listing views, 0 recorded installs, 0 ratings, and no `mcp.so` GitHub referrer. |
| [mcpservers.org](https://mcpservers.org/servers/repoassay/repo-test-architect) | Public with the correct repository, description, and repository-sourced documentation. Exact-name search finds the listing. | No listing-native usage counter is exposed and no `mcpservers.org` GitHub referrer appears. |
| [Glama](https://glama.ai/mcp/servers/RepoAssay/repo-test-architect) | Public and claimed. The schema page exposes all 19 tools; the score page gives quality tier A, with 19 of 19 tools scored at an average 4/5 and a 3.3/5 minimum. | The visible listing reports 241 weekly. That closely matches npm's 240 downloads for 2026-07-29 through 2026-08-04, so treat it as an npm-derived weekly counter rather than independent Glama usage. No `glama.ai` GitHub referrer appears. Glama's older public summary API still returns an empty `tools` array even though the current schema and score pages expose all 19 tools; treat the rendered pages as the current validation evidence. |
| [PulseMCP](https://www.pulsemcp.com/servers) | Not independently verified. Direct automated search is blocked and no public indexed result for Repo Test Architect was found on 2026-08-11. | No public page URL or referral evidence captured. |
| [awesome-mcp-servers PR #11509](https://github.com/punkpeye/awesome-mcp-servers/pull/11509) | Excluded from this outcome evaluation. The submission is technically ready but awaits upstream maintainer review in a large backlog. | Pending external merge; neither success nor failure. |
| [Smithery](https://smithery.ai/docs/build/publish) | Still deliberately deferred. | Not evaluated as a publication channel. |

The owner-supplied LinkedIn post metric was 161 impressions. LinkedIn impressions are exposure rather than unique reach and remain separate from GitHub's unique-referrer count.

### GitHub Repository

The current rolling 14-day traffic window is 2026-07-28 through 2026-08-10:

| Measure | 2026-08-04 baseline window | Current window | Change |
| --- | ---: | ---: | ---: |
| Repository views | 81 | 73 | -8 (-9.9%) |
| Unique repository viewers | 9 | 8 | -1 (-11.1%) |
| Repository clones | 1,598 | 1,011 | -587 (-36.7%) |
| Unique repository cloners | 368 | 314 | -54 (-14.7%) |

The two rolling windows overlap and are not a cohort comparison. The clone decline mainly reflects the high release, CI, registry, and scanner activity from late July and 2026-08-01 through 2026-08-02 rolling out of the window. It is not evidence of lost users.

For the exact 2026-08-04 through 2026-08-10 directory-observation window, GitHub recorded 30 repository views and 87 clones. GitHub does not expose distinct-user totals for an arbitrary subwindow; daily unique counts cannot be added because the same person may appear on several days.

Current rolling referrers are:

| Referrer | Views | Unique visitors |
| --- | ---: | ---: |
| `linkedin.com` | 12 | 3 |
| `github.com` | 6 | 1 |

LinkedIn views rose from 7 to 12 while unique LinkedIn visitors fell from 5 to 3 and the prior mobile-app referrer disappeared. This supports repeat exposure but does not demonstrate broader unique reach. No community directory appears in GitHub's current popular-referrer report.

Public counters remain zero stars, zero forks, zero watchers, zero open issues, and zero open pull requests.

### npm

The original 2026-08-04 baseline remains the capture-time evidence: 680 downloads from 2026-07-24 through the partial 2026-08-04 day and 230 from 2026-07-29 through that partial day. After 2026-08-04 finalized, those same historical queries became 690 and 240 respectively. Preserve the originally observed values and record the ten late-reported 2026-08-04 downloads separately rather than rewriting the baseline.

Through the latest complete date, npm reported:

| Fixed window | Downloads |
| --- | ---: |
| 2026-07-24 through 2026-08-09 | 792 |
| Late-finalized 2026-08-04 plus 2026-08-05 through 2026-08-09 | 112 |
| 2026-08-05 through 2026-08-09 | 102 |

The five complete post-listing days were:

| Day | Downloads |
| --- | ---: |
| 2026-08-05 | 25 |
| 2026-08-06 | 14 |
| 2026-08-07 | 23 |
| 2026-08-08 | 14 |
| 2026-08-09 | 26 |

That is a 20.4-download daily average. The comparable pre-listing non-release days from 2026-07-29 through 2026-08-03 averaged 19.0 after excluding the `0.3.0` release spike of 135 downloads on 2026-08-02. The current evidence therefore shows a stable download floor, not a clear directory-driven increase. Downloads remain automation-sensitive and do not prove successful MCP starts or distinct users.

### External-Use Evidence

No new attributable external-use evidence was recorded in the repository by this snapshot:

- recorded external users: 0
- recorded external repositories: 0
- completed external feedback loops: 0
- issue-backed adapter requests: 0

The publication rollout has produced real directory exposure—most visibly 628 mcp.so listing views—and continued npm activity. It has not yet produced a measured conversion to an install, repository visit attributed to a directory, issue, star, or completed feedback loop.

## Pre-release Snapshot — 2026-09-06

Captured on 2026-09-06 using the authenticated GitHub traffic API and npm downloads API. [Machine-readable capture](metrics/2026-09-06.json) preserves the daily series, reported counters, referrers, popular paths, and npm tags. Previous snapshots remain unchanged.

### npm

| Fixed window | Downloads reported |
| --- | ---: |
| First publication, 2026-07-24 through 2026-09-05 | 1,390 |
| Trailing 30 calendar days, 2026-08-07 through 2026-09-05 | 661 |
| Prior week, 2026-08-23 through 2026-08-29 | 141 |
| Latest week, 2026-08-30 through 2026-09-05 | 76 |
| Since baseline day, 2026-08-05 through 2026-09-05 | 700 |

The latest reported week is down 65 downloads (46.1%) from the preceding week. The API returns entries through September 5, including zero on September 3 and low counts on September 4–5; reporting completeness cannot be independently confirmed, so these are capture-time values subject to late revisions. Downloads cannot identify unique people, successful MCP starts, or alpha-versus-beta usage. [npm daily source](https://api.npmjs.org/downloads/range/2026-07-24:2026-09-05/repo-test-architect).

Live npm metadata reports `latest: 0.3.0` and `beta: 1.0.0-beta.1`. No stable version is published. [Package metadata](https://registry.npmjs.org/repo-test-architect).

### GitHub

The reported 14-day window is August 23 through September 5:

| Measure | Total | Unique |
| --- | ---: | ---: |
| Repository views | 18 | 6 |
| Repository clones | 74 | 32 |
| LinkedIn referrer views | 7 | 2 |
| Glama referrer views | 4 | 1 |

Public counters are 0 stars, 1 fork, and 0 subscribers. The repository API's `open_issues_count: 3` comprises three open pull requests and zero open issues: two Dependabot dependency updates and [PR #271](https://github.com/RepoAssay/repo-test-architect/pull/271), an external documentation-link correction. That contribution is community activity, not a confirmed product-use feedback loop. [Repository](https://github.com/RepoAssay/repo-test-architect).

Glama now appears as a measured referral source: four views from one unique visitor, versus no directory referrals in the August 11 snapshot. This establishes referral traffic only. The GitHub clone and viewer totals remain automation-sensitive; daily unique counts are not summed into arbitrary-window users.

### Directory and external-use evidence

The [mcp.so listing](https://mcp.so/servers/repo-test-architect) remains public with Verified and Featured labels and beta install instructions. Its fetched page exposes no current views/install counter; the historical 628 views must not be carried forward as a current measurement. The [Glama listing](https://glama.ai/mcp/servers/RepoAssay/repo-test-architect) is public; its previously used API endpoint now returns HTTP 401, so no current listing-native usage number is recorded. Neither directory's display substitutes for npm or successful-start metrics.

No new attributable successful starts, external repository audits, or completed product feedback loops were established by this refresh. The ledger therefore still has 0 recorded external users, 0 recorded external repositories, 0 completed feedback loops, and 0 issue-backed adapter requests. The external pull request and fork remain separate evidence. Other directory/Registry statuses above are historical snapshots, not reverified September 6 claims.

The usage record is now current, but these counters alone do not establish stable-release readiness. The [release checklist](release-checklist.md) and the documented Dart support boundary still govern the release review.

## mcp.so Paid-Placement Baseline

The mcp.so submission page displayed the following self-reported site-level marketing metrics on 2026-08-04:

| Claim | Displayed value |
| --- | ---: |
| Domain Rating | 72 |
| Backlinks | 57.16K |
| Dofollow share of backlinks | 46% |
| Referring domains | 2.58K |
| Dofollow share of referring domains | 77% |
| Unique visitors, trailing 12 months | 2.2M |
| Pageviews, trailing 12 months | 6M |
| Monthly active users | 266K |
| Displayed monthly-active-user change | +11.2% |

These are mcp.so's site-level claims, not Repo Test Architect impressions, listing views, clicks, or conversions. Keep them labeled as self-reported and do not use them as the outcome of the USD 39 experiment.

The paid-placement outcome should instead record:

- public listing URL and date first observed live
- whether the verified badge, dofollow link, and featured/priority treatment are visible
- listing views or clicks when mcp.so exposes them
- `mcp.so` in GitHub's referring-sites report
- npm downloads in fixed pre- and post-listing windows
- qualified contacts, successful starts, external repositories, and completed feedback loops attributable to the listing
- cost per qualified contact and cost per completed feedback loop

## Measurement Routine

GitHub retains traffic detail for a limited rolling window, so capture this ledger weekly while directory promotion is active.

For each weekly snapshot:

1. record the timestamp and every live directory URL
2. save GitHub views, clones, popular referrers, stars, forks, watchers, and issues
3. query npm downloads using explicit date ranges rather than only a moving `last-week` label
4. record directory-native listing views, clicks, saves, or installs when available
5. record external users, authorized repositories, clients, operating systems, adapters, outcomes, and feedback dispositions without repository contents
6. distinguish observed attribution from inference; an npm increase after publication is correlation unless a user or referrer identifies the channel

Recommended comparison points are listing-live day, day 7, day 14, and day 30. Preserve the initial 2026-08-04 baseline even if later measurements reveal that some traffic was automated.
