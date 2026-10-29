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
| `--changed` | Limit adapter evidence to staged, unstaged, and untracked working-tree changes under the audited root |
| `--changed-since <ref>` | Limit adapter evidence to files under the audited root changed between the merge base of `<ref>` and `HEAD` |
| `--exclude-project <root-or-glob>` | Exclude a project root or subtree; repeat as needed |
| `--from-project-audits <file>` | Reuse `project-audits/v1` without rescanning |
| `--adapter <id>` | Select an adapter for explicit single-project commands |
| `--goos <value>` | Select `GOOS` for target-aware Go audits; requires `--goarch` |
| `--goarch <value>` | Select `GOARCH` for target-aware Go audits; requires `--goos` |
| `--go-tag <value>` | Add a custom Go build tag; repeat as needed |
| `--help` | Show command-specific help without scanning |

Unknown options fail instead of being silently ignored. Use quoted glob patterns such as `"examples/**"` so the shell does not expand them first.

Go target options apply to `analyze`, `audit-projects`, and direct single-project scans. They cannot be combined with saved audit artifacts because target selection must happen during evidence collection. For example: `repo-test-architect audit ./service --adapter go --goos darwin --goarch arm64 --go-tag integration`.

## Exit Status

| Status | Meaning |
| --- | --- |
| `0` | The command completed |
| `1` | Usage error, invalid saved artifact, or a failure that stopped the run |
| `2` | Partial result: at least one project's adapter failed to audit |

Status `2` applies to every project-aware command, including runs that reuse a saved `project-audits/v1` artifact whose `failedProjects` list is not empty. The partial result is still printed to standard output, so `--format json` output remains a complete, parseable artifact. A warning naming each failed project root with its fixed error summary is written to standard error. The Markdown output of every project-aware command (`analyze`, `audit-projects`, `summarize-projects`, `rank-projects`, `plan-projects`, `hints-projects`, `findings-projects`, `placement-projects`, and `stats-projects`) adds a `Failed to audit` count and a `Failed Projects` section listing each root. Error messages are intentionally not recorded; to see one, rerun the adapter on that root with `repo-test-architect audit <repo>/<projectRoot> --adapter <adapterId>`, which does not contain failures. Invalid options such as an unsupported `--goos`/`--goarch` pair or a reserved `--go-tag` remain usage errors with status `1`. Findings and test gaps never change the exit status. See [Failed Projects](artifact-contract.md#failed-projects) for the recorded fields.

## Metadata and Diagnostics

- `adapters` lists registered adapter capabilities.
- `detect-rules` lists project markers and ignored directories.
- `diagnostic-bundle` renders a sanitized local diagnostics bundle.

The exhaustive fixture, eval, package, and release scripts remain in the collapsed advanced section of the main README.
