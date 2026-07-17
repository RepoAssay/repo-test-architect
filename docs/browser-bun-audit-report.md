# Browser E2E and Bun Audit Report

This report validates the Playwright, Cypress, and Bun alpha paths against maintained public repositories selected by the deterministic validation-repository finder. The probes were cloned locally and audited without uploading source or running repository test suites.

## Probe Set

| Repository | Pinned commit | Primary signal | Audit time |
| --- | --- | --- | --- |
| [`microsoft/playwright-mcp`](https://github.com/microsoft/playwright-mcp) | [`55679f5`](https://github.com/microsoft/playwright-mcp/commit/55679f5f3d4b4f3e2534ec0ce2fc5683ba2eaf3f) | Playwright config, dependency, and specs | 0.06s |
| [`archfz/cypress-terminal-report`](https://github.com/archfz/cypress-terminal-report) | [`b66713f`](https://github.com/archfz/cypress-terminal-report/commit/b66713fd88ebaf200cfe60dd4bf205e8c1030e37) | Cypress dependency with a nested test harness | 0.13s |
| [`honojs/hono`](https://github.com/honojs/hono) | [`c285f9a`](https://github.com/honojs/hono/commit/c285f9a498623fe0d2992b31c77b3738c0c0a54d) | Bun lockfile, scripts, config, and native runner imports | 7.96s |

Times are local wall-clock observations on the audit command and are included only to catch order-of-magnitude regressions.

## Playwright MCP

Profile result:

- high confidence with Playwright, `npm run test`, `playwright.config.ts`, and `tests/*.spec.ts`
- one untested candidate (`cli.js`), no covered-but-risky candidates, and one skipped root entrypoint (`index.js`)
- no blockers

What the probe exposed:

- the package ships declared `exports` and `bin` entrypoints at the repository root rather than under `src/`, `source/`, or `lib/`
- specs import a locally extended fixture instead of importing `@playwright/test` in every file
- filename matching initially treated `tests/cli.spec.ts` as evidence for `cli.js`, even though there was no static source relationship

Hardening result:

- declared `main`, `module`, `exports`, and `bin` JavaScript entrypoints can now become audit candidates outside conventional source roots
- Playwright or Cypress presence suppresses filename-only module evidence across the repository; direct imports, package imports, aliases, barrels, and bounded dependencies remain eligible
- the CLI remains untested in the static graph, which is the honest result: the Playwright suite exercises it through a spawned process rather than a source import

## Cypress Terminal Report

Profile result:

- high confidence with Cypress, nested `test/cypress.config.js`, `*.spec` and `*.cy` conventions, and `test/` as an existing test location
- inferred command `npx cypress run --config-file test/cypress.config.js`
- 19 untested candidates, two covered-but-risky candidates, 11 skipped targets, and no blockers
- direct evidence connects `test/specs/utils.spec.ts` to `src/utils.ts`; one bounded dependency connects the same test to `src/jsonPrune.ts`

What the probe exposed:

- the repository uses `test/package.json` as an owned test harness, not as an independent production workspace
- the original package-boundary rule excluded the entire harness from the root audit
- Cypress config and support files import plugin installation code, but treating setup files as tests would overstate behavioral coverage

Hardening result:

- nested package roots immediately under `test/`, `tests/`, or `__tests__/` remain in their owning package audit
- nested Playwright and Cypress config paths are recognized and included in fallback commands
- runner config and Cypress support files are excluded from test evidence
- most Cypress-driven plugin behavior remains conservatively untested because browser setup and command execution establish runtime coverage that the static import graph cannot prove

## Hono Bun Runtime

Profile result:

- high confidence with Bun package management, Bun native tests, Vitest, `bunfig.toml`, and `bun run test`
- one untested candidate, 100 covered-but-risky candidates, 85 skipped targets, and no blockers
- the evidence graph remains stable at 820 bounded-dependency, 183 direct-relative-import, 57 filename-convention, and 39 referenced-relative-reexport links

What the probe confirmed:

- `bun.lock`, `bunfig.toml`, `bun:test` imports, and Bun-native package scripts occur together in a large TypeScript repository
- adding Bun recognition does not disturb the existing source-to-test evidence graph or the remaining service-worker finding
- package-manager-native command selection avoids emitting an npm command for a Bun-owned repository

## Remaining Boundary

These probes validate recognition and conservative evidence behavior, not browser execution coverage. Playwright and Cypress tests often reach the product through processes, pages, routes, and support hooks; the alpha intentionally leaves those source modules uncredited unless a static relationship exists. Future work should add runtime or configuration-aware evidence as a separate, weaker provenance kind instead of silently upgrading browser reachability to direct module coverage.
