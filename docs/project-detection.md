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
| `pyproject.toml` | `python` | `python` | Supported by `python` |
| `requirements.txt` | `python` | `python` | Supported by `python` |
| `Gemfile` | `ruby` | `ruby` | Detected, unsupported |
| `composer.json` | `php` | `php` | Detected, unsupported |
| `mix.exs` | `elixir` | `elixir` | Detected, unsupported |
| `go.mod` | `go` | `go` | Experimental bounded `go` adapter |
| `Cargo.toml` | `rust` | `rust` | Detected, unsupported |
| `Package.swift` | `swift` | `swift` | Supported by `swift` |
| `MODULE.bazel` | `bazel` | `swift` | Supported by `swift` when Swift rules and sources are present |
| `WORKSPACE` | `bazel` | `swift` | Supported by `swift` when Swift rules and sources are present |
| `WORKSPACE.bazel` | `bazel` | `swift` | Supported by `swift` when Swift rules and sources are present |
| `*.xcodeproj` | `apple` | `swift`, `objective-c` | Supported by `swift` |
| `*.xcworkspace` | `apple` | `swift`, `objective-c` | Supported by `swift` |
| `*.csproj` | `dotnet` | `csharp` | Detected, unsupported |
| `pom.xml` | `jvm` | `java`, `kotlin` | Supported by bounded `kotlin` |
| `build.gradle` | `jvm` | `kotlin`, `java` | Supported by bounded `kotlin` |
| `build.gradle.kts` | `jvm` | `kotlin`, `java` | Supported by bounded `kotlin` |
| `settings.gradle` | `jvm` | `kotlin`, `java` | Supported by bounded `kotlin` |
| `settings.gradle.kts` | `jvm` | `kotlin`, `java` | Supported by bounded `kotlin` |

## Ignored Directories

The detector skips common dependency and build output directories:

- `.build`
- `.git`
- `.gradle`
- `.swiftpm`
- `.venv`
- `__fixtures__`
- `bin`
- `build`
- `coverage`
- `dist`
- `fixtures`
- `node_modules`
- `obj`
- `target`
- `vendor`

This avoids reporting generated, vendored, or nested dependency-fixture output as independent projects. A fixture directory audited as the repository root still detects its own root marker; only nested traversal is skipped.

Conventionally included Gradle modules collapse into the settings-owning aggregate only when the complete root declaration is literal and repository-contained, every declared path has a conventional child build file, and nested settings do not expand undeclared paths. Computed or unsafe includes, missing child builds, custom `projectDir` remaps, and unowned nested settings make collapse all-or-nothing, leaving child build roots separately visible. Composite builds remain separate because `includeBuild(...)` does not transfer project ownership to the audited aggregate.

Conventionally declared Maven `<module>` paths with direct child POMs collapse into the POM-owning reactor project. Collapse proceeds from parent to child and stops at an already collapsed intermediate reactor, so an unowned nested reactor child remains visible as a separate project instead of disappearing into a root audit that does not expand nested ownership. Profile-activated modules, property-expanded paths, directory escapes, and plugin configuration `<modules>` also remain separate because the root POM does not statically prove their ownership.

Go workspaces do not collapse into one aggregate project. Every `go.mod` remains an independently detected root. The Go adapter then checks the nearest ancestor `go.work`: literal repository-contained members retain module-local `go test ./...`, while omitted modules or incomplete `use` graphs lose the command and receive an ownership blocker.

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
