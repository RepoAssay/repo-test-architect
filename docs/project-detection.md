# Project Detection

Project detection finds auditable roots before any adapter runs.

The detector is intentionally conservative. It recognizes strong project-root markers, records likely ecosystem and language labels, and then matches supported adapters from those facts. Unsupported projects stay visible in downstream artifacts so the final risk report does not imply the whole repository was audited.

## Marker Rules

Inspect the active rules from the CLI:

```powershell
npm run detect-rules
npm run detect-rules:json
```

| Marker | Ecosystem | Languages | Adapter status |
| --- | --- | --- | --- |
| `package.json` | `javascript` | `javascript`, `typescript` | Supported by `javascript` |
| `pyproject.toml` | `python` | `python` | Supported by experimental `python` |
| `requirements.txt` | `python` | `python` | Supported by experimental `python` |
| `Gemfile` | `ruby` | `ruby` | Detected, unsupported |
| `composer.json` | `php` | `php` | Detected, unsupported |
| `mix.exs` | `elixir` | `elixir` | Detected, unsupported |
| `go.mod` | `go` | `go` | Detected, unsupported |
| `Cargo.toml` | `rust` | `rust` | Detected, unsupported |
| `Package.swift` | `swift` | `swift` | Supported by experimental `swift` |
| `*.xcodeproj` | `apple` | `swift`, `objective-c` | Supported by experimental `swift` |
| `*.csproj` | `dotnet` | `csharp` | Detected, unsupported |
| `pom.xml` | `jvm` | `java`, `kotlin` | Supported by experimental `kotlin` |
| `build.gradle` | `jvm` | `kotlin`, `java` | Supported by experimental `kotlin` |
| `build.gradle.kts` | `jvm` | `kotlin`, `java` | Supported by experimental `kotlin` |
| `settings.gradle` | `jvm` | `kotlin`, `java` | Supported by experimental `kotlin` |
| `settings.gradle.kts` | `jvm` | `kotlin`, `java` | Supported by experimental `kotlin` |

## Ignored Directories

The detector skips common dependency and build output directories:

- `.build`
- `.git`
- `.gradle`
- `.swiftpm`
- `.venv`
- `bin`
- `build`
- `coverage`
- `dist`
- `node_modules`
- `obj`
- `target`
- `vendor`

This avoids reporting generated or vendored output as independent projects.

## Output Contract

Detection emits `project-detection/v1` with:

- detected project roots
- absolute project roots
- marker files
- ecosystem labels
- language labels
- matching adapter IDs
- structured adapter matches with matching ecosystem and language evidence
- supported or unsupported status
- support status reason

The next layer can audit supported projects and preserve unsupported projects for summary, ranking, planning, and final risk reporting.
