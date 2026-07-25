# CLI Reference

`analyze` is the recommended entrypoint for an unfamiliar repository or a general test-architecture review.

```sh
repo-test-architect analyze .
repo-test-architect analyze . --format json
repo-test-architect analyze . --changed
```

It audits all detected project roots once and derives `repository-analysis/v1`, containing the project audits, coverage summary, findings, candidate ranking, test plan, execution hints, stats, and detected verification commands. Markdown is designed for human review; JSON is the complete reusable artifact.

## Everyday Commands

| Command | Use |
| --- | --- |
| `analyze` | Complete repository review; start here |
| `doctor` | Check runtime and local diagnostics readiness |
| `detect` | Inspect project roots and adapter matches |
| `findings-projects` | Read the highest-priority findings only |
| `plan-projects` | Produce the cross-project test plan |
| `stats-projects` | Collect deterministic repository statistics |

## Project-Aware Commands

These commands detect and operate across all project roots:

| Command | Artifact |
| --- | --- |
| `audit-projects` | `project-audits/v1` |
| `summarize-projects` | `project-audit-summary/v1` |
| `rank-projects` | `project-candidate-ranking/v1` |
| `plan-projects` | `project-test-plan/v1` |
| `hints-projects` | `plan-execution-hints/v1` |
| `findings-projects` | `project-findings/v1` |
| `placement-projects` | `test-placement-findings/v1` |
| `stats-projects` | `project-stats/v1` |

`analyze` and every derived project command can reuse a saved project audit instead of scanning again:

```sh
repo-test-architect analyze --from-project-audits ./project-audits.json
```

## Explicit Single-Project Commands

Use these when one project root and, if needed, one adapter have already been selected:

| Command | Use |
| --- | --- |
| `audit` | Produce one `audit/v1` artifact |
| `plan` | Derive one `plan/v1` artifact |
| `hints` | Derive execution hints for one plan |
| `explain` | Explain one stable target ID |
| `rank` | Rank candidates inside one audit |
| `placement` | Analyze placement inside one audit |

`audit` defaults to the JavaScript adapter for compatibility. It is not the general multi-language entrypoint; use `analyze` for that.

## Common Options

| Option | Meaning |
| --- | --- |
| `--format json` | Emit the complete JSON artifact |
| `--changed` | Limit adapter evidence to files changed from the default Git base |
| `--changed-since <ref>` | Limit adapter evidence to files changed since a Git ref |
| `--exclude-project <root-or-glob>` | Exclude a project root or subtree; repeat as needed |
| `--from-project-audits <file>` | Reuse `project-audits/v1` without rescanning |
| `--adapter <id>` | Select an adapter for explicit single-project commands |
| `--help` | Show command-specific help without scanning |

Unknown options fail instead of being silently ignored. Use quoted glob patterns such as `"examples/**"` so the shell does not expand them first.

## Metadata and Diagnostics

- `adapters` lists registered adapter capabilities.
- `detect-rules` lists project markers and ignored directories.
- `diagnostic-bundle` renders a sanitized local diagnostics bundle.

The exhaustive fixture, eval, package, and release scripts remain in the collapsed advanced section of the main README.
