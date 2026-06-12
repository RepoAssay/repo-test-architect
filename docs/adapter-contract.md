# Adapter Contract

Adapters translate ecosystem-specific repository signals into the shared audit model.

An adapter should:

- detect package managers, test frameworks, and architecture signals
- classify source files by test value
- recommend a test level only when the repository has enough convention signal
- skip low-value targets with an explicit reason
- return structured audit data before generating any code

An adapter should not:

- invent a new report shape for one language
- generate tests during audit
- recommend UI/component tests without an existing convention signal
- treat coverage growth as the main success metric

The core model lives in `src/core/audit-model.ts`.

Runtime adapter registration lives in `src/core/adapter-registry.js`.

The initial registered adapter is:

- `javascript` for JavaScript and TypeScript repositories
