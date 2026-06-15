# Project Detection

Project detection finds auditable roots before any adapter runs.

The detector is intentionally conservative. It recognizes strong project-root markers, records likely ecosystem and language labels, and then matches supported adapters from those facts. Unsupported projects stay visible in downstream artifacts so the final risk report does not imply the whole repository was audited.

## Marker Rules

| Marker | Ecosystem | Languages | Adapter status |
| --- | --- | --- | --- |
| `package.json` | `javascript` | `javascript`, `typescript` | Supported by `javascript` |
| `pyproject.toml` | `python` | `python` | Detected, unsupported |
| `requirements.txt` | `python` | `python` | Detected, unsupported |
| `Gemfile` | `ruby` | `ruby` | Detected, unsupported |
| `composer.json` | `php` | `php` | Detected, unsupported |
| `mix.exs` | `elixir` | `elixir` | Detected, unsupported |
| `go.mod` | `go` | `go` | Detected, unsupported |
| `Cargo.toml` | `rust` | `rust` | Detected, unsupported |
| `Package.swift` | `swift` | `swift` | Detected, unsupported |
| `*.csproj` | `dotnet` | `csharp` | Detected, unsupported |
| `pom.xml` | `jvm` | `java`, `kotlin` | Detected, unsupported |
| `build.gradle` | `jvm` | `kotlin`, `java` | Detected, unsupported |
| `build.gradle.kts` | `jvm` | `kotlin`, `java` | Detected, unsupported |
| `settings.gradle` | `jvm` | `kotlin`, `java` | Detected, unsupported |
| `settings.gradle.kts` | `jvm` | `kotlin`, `java` | Detected, unsupported |

## Ignored Directories

The detector skips common dependency and build output directories:

- `.git`
- `node_modules`
- `dist`
- `build`
- `coverage`
- `target`
- `bin`
- `obj`

This avoids reporting generated or vendored output as independent projects.

## Output Contract

Detection emits `project-detection/v1` with:

- detected project roots
- absolute project roots
- marker files
- ecosystem labels
- language labels
- matching adapter IDs
- supported or unsupported status

The next layer can audit supported projects and preserve unsupported projects for summary, ranking, planning, and final risk reporting.
