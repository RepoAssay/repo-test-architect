# JavaScript/TypeScript Alpha Support

This matrix is the acceptance boundary for the JavaScript/TypeScript private alpha. It describes conventions the adapter detects and tests today; it is not a claim that every repository using a named tool will be interpreted perfectly.

## Supported Common Patterns

| Area | Alpha support | Evidence used |
| --- | --- | --- |
| Unit and integration runners | Vitest, Jest, Node test runner, Mocha, AVA, and Bun test | dependencies, owned config files, runner imports, package scripts, recognized test filenames, and bounded static discovery fields |
| Browser E2E runners | Playwright and Cypress | dependencies, owned `playwright.config.*` or `cypress.config.*`, static discovery fields, `*.spec.*`, and `*.cy.*` files |
| Test libraries | React Testing Library and Supertest | package dependencies plus source and test structure |
| Package managers | npm, pnpm, Yarn, and Bun, including statically owned workspace packages | local or owning-workspace `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, legacy `bun.lockb`, `packageManager`, `workspaces`, and bounded `pnpm-workspace.yaml` package patterns |
| Source roots | `src/`, `source/`, `lib/`, and declared root package entrypoints | JavaScript, JSX, TypeScript, TSX, CJS/CTS, and ESM/MTS extensions plus `main`, `module`, `exports`, and `bin` paths |
| Test locations | `test/`, `tests/`, `__tests__/`, colocated tests, and statically configured custom paths | directory/filename conventions plus bounded runner discovery patterns |
| Test names | `*.test.*`, `*.spec.*`, Cypress `*.cy.*`, and Bun `*_test.*`/`*_spec.*` | JavaScript, JSX, TypeScript, and TSX variants including CJS/ESM extensions |
| Module relationships | relative runtime imports, one-hop ES module barrels, package entrypoints and exports, tsconfig paths, and bounded transitive imports | static import/require/export analysis with module-format, referenced-symbol, call, and assertion usage where detectable |
| Repository shapes | single packages, detected package/workspace boundaries, and owned nested test harnesses | nested production packages are audited independently; `test/`, `tests/`, and `__tests__/` harness packages remain with their owner |

Recognized package scripts—including common unit and E2E names—take priority over inferred commands. The adapter emits package-manager-native script commands such as `npm run test`, `pnpm run test:e2e`, `yarn test`, or `bun run test`. When no usable script exists, it can infer the conventional runner command for a detected framework.

When a detected package is audited from inside a workspace, package-script ownership can come from the nearest ancestor that statically includes the package. The bounded reader accepts `package.json` workspace arrays, compatible `workspaces.packages` arrays, and simple `pnpm-workspace.yaml` `packages` lists with literal paths, `*`, `**`, `?`, and `!` exclusions. Local lockfiles or a local `packageManager` field take precedence; otherwise the child inherits only the owning workspace's manager evidence. An unrelated sibling does not inherit it. Multiple inherited lockfile managers without an explicit `packageManager` produce an ambiguity blocker instead of a guessed package-script command. Root-only scripts are not inherited into a child package.

Runner configuration follows the same ownership boundary. A conventionally named config is auto-discovered only at the package root or inside an owned `test/`, `tests/`, or `__tests__/` harness. A child package can use a config elsewhere in its package, or inherit one from its owning workspace, only when its own package script selects the file with the runner's `--config` option (`--config-file` for Cypress). The selected ancestor path must remain inside that owning workspace. Ambient workspace-root configs, configs in arbitrary fixture folders, and ancestor configs referenced by an unrelated sibling are not inherited.

The static reader recognizes string discovery patterns from Vitest `test.include`/`test.exclude`, Jest `testMatch`, Playwright `testDir`/`testMatch`/`testIgnore`, Cypress `e2e` or `component` `specPattern`/`excludeSpecPattern`, AVA `files`, and Mocha `spec`. It supports literal paths, `*`, `**`, `?`, and simple comma-separated brace alternatives. Matching configured files become test evidence candidates and are reported as configured custom locations; the adapter still requires a static source relationship before claiming coverage.

Module evidence is resolved inside the audited package boundary. Explicit `.mjs`/`.mts` and `.cjs`/`.cts` paths remain distinct, while `.js` to `.ts` and `.mjs` to `.mts` source substitutions cover common compiled layouts. Self-package `exports` honor bounded ordered `import`, `require`, `node`, and `default` conditions for the matching static import form; root exports take precedence over legacy entrypoint inference. Exact and single-wildcard subpaths remain supported. One-hop ES module barrels do not credit `default` or type-only members through `export *`, do not credit ambiguous names supplied by multiple star exports, and let an explicit named re-export resolve that ambiguity. Type-only imports and test-file re-exports are not runtime coverage evidence. `tsconfig` wildcard target arrays preserve declared fallback order instead of leaking evidence from a later matching target.

These boundaries follow Node's [package entrypoint and conditional exports](https://nodejs.org/api/packages.html#package-entry-points) and [mandatory ES module extension](https://nodejs.org/api/esm.html#mandatory-file-extensions) rules, plus TypeScript's [module-resolution](https://www.typescriptlang.org/docs/handbook/modules/reference) and [`paths`](https://www.typescriptlang.org/tsconfig/paths.html) behavior.

The added conventions follow the documented Playwright test command and configuration model, Cypress configuration and run command, and Bun test naming and lockfile conventions:

- [Playwright running tests](https://playwright.dev/docs/running-tests) and [test configuration](https://playwright.dev/docs/test-configuration)
- [Cypress configuration](https://docs.cypress.io/app/references/configuration) and [command line](https://docs.cypress.io/app/references/command-line)
- [Bun test runner](https://bun.sh/docs/test) and [lockfiles](https://bun.sh/docs/pm/lockfile)
- [Vitest test projects](https://vitest.dev/guide/projects) and [`test.include`](https://vitest.dev/config/include)
- [Jest configuration](https://jestjs.io/docs/configuration)

Workspace command ownership follows the official [npm workspace](https://docs.npmjs.com/misc/workspaces/), [pnpm workspace](https://pnpm.io/pnpm-workspace_yaml) and [`pnpm run`](https://pnpm.io/cli/run), [Yarn workspace](https://yarnpkg.com/features/workspaces) and [`yarn run`](https://yarnpkg.com/cli/run), [Bun workspace](https://bun.sh/guides/install/workspaces), and Node [`packageManager`](https://nodejs.org/docs/latest-v20.x/api/packages.html#packagemanager) boundaries.

## Evidence Boundary

Recognition of a test framework is separate from evidence that a test covers a source module.

- A runtime direct import, declared package import, path alias, unambiguous barrel reference, or bounded dependency can connect a test to source.
- A conventional unit-test filename can provide weaker naming evidence.
- Playwright and Cypress filenames alone do not count as module coverage. When either runner is present, filename-only evidence is suppressed across the repository because browser tests often use locally extended fixtures. The adapter requires a static source relationship before crediting one to a module.
- Existing test evidence means “review this tested target for missing behavior,” not “coverage is complete.”

## Known Alpha Gaps

The adapter reports blockers or conservative findings rather than guessing when it encounters patterns outside this matrix. Known gaps include:

- custom runners such as Jasmine, Tape, uvu, and repository-specific harnesses
- computed runner configuration, imported/merged configuration, regex discovery fields, advanced glob syntax, and inheritance not explicitly selected by an owned package script
- workspace declarations that require YAML anchors, brace/extglob evaluation, catalogs as ownership, custom package-directory remapping, or opaque monorepo orchestration
- runtime-only module loading, generated import maps, and relationships established only through browser navigation or network calls
- package `imports` (`#...`), custom export conditions, CommonJS re-export barrels, dynamic imports, and full Node/TypeScript/bundler resolution
- exhaustive assertion semantics, branch coverage, and proof that an imported function is meaningfully exercised
- framework plugins and monorepo orchestration whose effective command differs from the package script or conventional fallback

These gaps are candidates for evidence-driven hardening when real repositories show that they are common or materially affect audit trust. Rare repository-specific cases do not block the alpha unless they expose a false high-confidence claim in a supported pattern.

## Validation Depth

The deterministic suite locks framework, command, naming, package-manager, statically declared workspace ownership, package-entrypoint, nested-harness, configured test discovery, and evidence behavior. Workspace tests cover npm, pnpm, Yarn, and Bun inheritance, an unrelated-sibling near miss, conflicting-lockfile blocking, explicit `packageManager` resolution, and the project-audit flow. Runner-config tests cover static custom locations for Vitest, Jest, Playwright, Cypress, AVA, and Mocha; explicit owning-workspace inheritance; ambient and unowned ancestor near misses; fixture-config isolation; and the project-audit flow. Module-boundary tests cover conditional import/require exports, `.mjs`/`.cjs` separation, `.mts`/`.cts` source ownership, ambiguous/default/type-only star exports, explicit re-export precedence, type-only direct imports, ordered alias fallbacks, and the project-audit flow. Checked-in fixtures cover the established Node, Express, and React paths, while public-repository reports exercise larger and older codebases. The pinned [Browser E2E and Bun Audit Report](browser-bun-audit-report.md) covers Playwright MCP, Cypress Terminal Report, and Hono's Bun runtime path.
