# JavaScript/TypeScript Alpha Support

This matrix is the acceptance boundary for the JavaScript/TypeScript private alpha. It describes conventions the adapter detects and tests today; it is not a claim that every repository using a named tool will be interpreted perfectly.

## Supported Common Patterns

| Area | Alpha support | Evidence used |
| --- | --- | --- |
| Unit and integration runners | Vitest, Jest, Node test runner, Mocha, AVA, and Bun test | dependencies, config files, runner imports, package scripts, and recognized test filenames |
| Browser E2E runners | Playwright and Cypress | dependencies, `playwright.config.*`, `cypress.config.*`, `*.spec.*`, and `*.cy.*` files |
| Test libraries | React Testing Library and Supertest | package dependencies plus source and test structure |
| Package managers | npm, pnpm, Yarn, and Bun | `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, and legacy `bun.lockb` |
| Source roots | `src/`, `source/`, `lib/`, and declared root package entrypoints | supported module extensions plus `main`, `module`, `exports`, and `bin` paths |
| Test locations | `test/`, `tests/`, `__tests__/`, colocated tests, and custom recognized test paths | directory and filename conventions |
| Test names | `*.test.*`, `*.spec.*`, Cypress `*.cy.*`, and Bun `*_test.*`/`*_spec.*` | JavaScript, JSX, TypeScript, and TSX variants including CJS/ESM extensions |
| Module relationships | relative imports, one-hop barrels, package entrypoints and exports, tsconfig paths, and bounded transitive imports | static import/export analysis with call and assertion usage where detectable |
| Repository shapes | single packages, detected package/workspace boundaries, and owned nested test harnesses | nested production packages are audited independently; `test/`, `tests/`, and `__tests__/` harness packages remain with their owner |

Recognized package scripts—including common unit and E2E names—take priority over inferred commands. The adapter emits package-manager-native script commands such as `npm run test`, `pnpm run test:e2e`, `yarn test`, or `bun run test`. When no usable script exists, it can infer the conventional runner command for a detected framework.

The added conventions follow the documented Playwright test command and configuration model, Cypress configuration and run command, and Bun test naming and lockfile conventions:

- [Playwright running tests](https://playwright.dev/docs/running-tests) and [test configuration](https://playwright.dev/docs/test-configuration)
- [Cypress configuration](https://docs.cypress.io/app/references/configuration) and [command line](https://docs.cypress.io/app/references/command-line)
- [Bun test runner](https://bun.sh/docs/test) and [lockfiles](https://bun.sh/docs/pm/lockfile)

## Evidence Boundary

Recognition of a test framework is separate from evidence that a test covers a source module.

- A direct import, declared package import, path alias, barrel reference, or bounded dependency can connect a test to source.
- A conventional unit-test filename can provide weaker naming evidence.
- Playwright and Cypress filenames alone do not count as module coverage. When either runner is present, filename-only evidence is suppressed across the repository because browser tests often use locally extended fixtures. The adapter requires a static source relationship before crediting one to a module.
- Existing test evidence means “review this tested target for missing behavior,” not “coverage is complete.”

## Known Alpha Gaps

The adapter reports blockers or conservative findings rather than guessing when it encounters patterns outside this matrix. Known gaps include:

- custom runners such as Jasmine, Tape, uvu, and repository-specific harnesses
- arbitrary test globs and configuration inheritance that cannot be recovered from the recognized files
- runtime-only module loading, generated import maps, and relationships established only through browser navigation or network calls
- exhaustive assertion semantics, branch coverage, and proof that an imported function is meaningfully exercised
- framework plugins and monorepo orchestration whose effective command differs from the package script or conventional fallback

These gaps are candidates for evidence-driven hardening when real repositories show that they are common or materially affect audit trust. Rare repository-specific cases do not block the alpha unless they expose a false high-confidence claim in a supported pattern.

## Validation Depth

The deterministic suite locks framework, command, naming, package-manager, package-entrypoint, nested-harness, and evidence behavior. Checked-in fixtures cover the established Node, Express, and React paths, while public-repository reports exercise larger and older codebases. The pinned [Browser E2E and Bun Audit Report](browser-bun-audit-report.md) covers Playwright MCP, Cypress Terminal Report, and Hono's Bun runtime path.
